const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GENESIS_PREV_HASH = '0'.repeat(64);

/**
 * Deterministic JSON stringifier to guarantee identical SHA-256 hashes
 * across diverse JS runtimes, operating systems, and property orderings.
 */
function canonicalStringify(obj) {
    if (obj === null || typeof obj !== 'object') {
        return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
        return '[' + obj.map(canonicalStringify).join(',') + ']';
    }
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
}

/**
 * Calculates SHA-256 digest of a local file safely.
 */
function safeFileSha256(filePath) {
    try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const buffer = fs.readFileSync(filePath);
            return 'sha256:' + crypto.createHash('sha256').update(buffer).digest('hex');
        }
    } catch (_) {}
    return null;
}

/**
 * Computes SHA-256 digest of any payload (string, buffer, or object).
 */
function computeDigest(payload) {
    if (typeof payload === 'string' && payload.startsWith('sha256:')) {
        return payload;
    }
    const str = typeof payload === 'string' ? payload : canonicalStringify(payload || {});
    return 'sha256:' + crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

/**
 * Resolves the canonical audit trail path for a given case directory.
 * Prioritizes:
 * 1. <caseDir>/01_dossier/audit_trail.jsonl (if 01_dossier exists)
 * 2. <caseDir>/<caseName>_conversions_haya/audit_trail.jsonl (if conversions exists)
 * 3. <caseDir>/audit_trail.jsonl (fallback)
 */
function resolveAuditTrailPath(caseDir) {
    if (!caseDir || typeof caseDir !== 'string') return null;
    const dossierDir = path.join(caseDir, '01_dossier');
    if (fs.existsSync(dossierDir)) {
        return path.join(dossierDir, 'audit_trail.jsonl');
    }
    const caseName = path.basename(caseDir);
    const convDir = path.join(caseDir, `${caseName}_conversions_haya`);
    if (fs.existsSync(convDir)) {
        return path.join(convDir, 'audit_trail.jsonl');
    }
    return path.join(caseDir, 'audit_trail.jsonl');
}

/**
 * FiduciaryAuditTrail provides an immutable, append-only, SHA-256 hash-chained
 * audit ledger (audit_trail.jsonl) for NCLT and IBBI court compliance.
 *
 * Implements:
 * - Serialized write queues per case to prevent write collisions.
 * - Hash chaining (prev_hash -> curr_hash).
 * - Full tamper detection and chain verification.
 * - Section 65B Indian Evidence Act / Section 63 BSA 2023 certificate generation.
 */
class FiduciaryAuditTrail {
    constructor() {
        this._writeQueues = new Map(); // caseDir -> Promise
    }

    /**
     * Internal helper to enqueue serialized disk write operations per case.
     */
    _enqueueWrite(caseDir, taskFn) {
        const currentQueue = this._writeQueues.get(caseDir) || Promise.resolve();
        const nextQueue = currentQueue.then(async () => {
            try {
                return await taskFn();
            } catch (err) {
                console.error(`[AuditTrail] Write task failed for ${caseDir}:`, err);
                throw err;
            }
        });
        this._writeQueues.set(caseDir, nextQueue.catch(() => {}));
        return nextQueue;
    }

    /**
     * Reads all raw lines from the audit trail file for a case directory.
     */
    _readLines(filePath) {
        if (!fs.existsSync(filePath)) return [];
        const content = fs.readFileSync(filePath, 'utf8');
        return content
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0);
    }

    /**
     * Appends an immutable, cryptographic audit entry to audit_trail.jsonl.
     *
     * @param {string} caseDir - Absolute path to the case directory.
     * @param {Object} data - Audit event payload.
     * @returns {Promise<Object>} The fully signed, chained record written to disk.
     */
    async appendEntry(caseDir, data = {}) {
        return this._enqueueWrite(caseDir, async () => {
            const auditPath = resolveAuditTrailPath(caseDir);
            if (!auditPath) throw new Error(`Invalid caseDir for audit trail: ${caseDir}`);

            const dirName = path.dirname(auditPath);
            if (!fs.existsSync(dirName)) {
                fs.mkdirSync(dirName, { recursive: true });
            }

            const existingLines = this._readLines(auditPath);
            const seq = existingLines.length;

            let prevHash = GENESIS_PREV_HASH;
            if (seq > 0) {
                try {
                    const lastRecord = JSON.parse(existingLines[seq - 1]);
                    prevHash = lastRecord.curr_hash || GENESIS_PREV_HASH;
                } catch (e) {
                    console.warn(`[AuditTrail] Failed to parse previous record at seq ${seq - 1}, using genesis hash.`);
                }
            }

            const timestamp = data.timestamp || new Date().toISOString();
            const matter = data.matter || path.basename(caseDir);
            const actor = data.actor || 'SYSTEM_CHAMBER_AGENT';
            const event = data.event || 'GENERAL_CASE_EVENT';
            const taskId = data.task_id || `task_${Date.now()}`;
            const verdict = data.verdict || 'RECORDED';
            const fiduciaryRole = data.fiduciary_role || 'IN_CHAMBER_SENTINEL';
            const flaggedExceptions = Array.isArray(data.flagged_exceptions) ? data.flagged_exceptions : [];

            // Compute inputs hash if not directly provided
            let inputsHash = data.inputs_hash;
            if (!inputsHash && data.inputs) {
                inputsHash = computeDigest(data.inputs);
            } else if (!inputsHash) {
                inputsHash = computeDigest({ seq, taskId, matter });
            }

            // Normalize and hash generated artifacts
            const artifactsGenerated = [];
            if (Array.isArray(data.artifacts_generated)) {
                for (const item of data.artifacts_generated) {
                    if (typeof item === 'string') {
                        const absPath = path.isAbsolute(item) ? item : path.join(caseDir, item);
                        const fileHash = safeFileSha256(absPath) || computeDigest({ path: item, missing: true });
                        artifactsGenerated.push({ path: item, hash: fileHash });
                    } else if (item && typeof item === 'object') {
                        const itemPath = item.path || 'unknown';
                        const absPath = path.isAbsolute(itemPath) ? itemPath : path.join(caseDir, itemPath);
                        const fileHash = item.hash || safeFileSha256(absPath) || computeDigest(item);
                        artifactsGenerated.push({ path: itemPath, hash: fileHash });
                    }
                }
            }

            const entryId = data.entry_id || `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

            // Build pre-hash record (without curr_hash)
            const preRecord = {
                seq,
                entry_id: entryId,
                timestamp,
                matter,
                actor,
                event,
                task_id: taskId,
                inputs_hash: inputsHash,
                verdict,
                flagged_exceptions: flaggedExceptions,
                artifacts_generated: artifactsGenerated,
                fiduciary_role: fiduciaryRole,
                metadata: data.metadata || {},
                prev_hash: prevHash
            };

            // Compute current SHA-256 hash over canonical pre-record representation
            const canonicalJson = canonicalStringify(preRecord);
            const currHash = crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');

            const finalRecord = {
                ...preRecord,
                curr_hash: currHash
            };

            // Append record atomically as a single JSON line
            fs.appendFileSync(auditPath, JSON.stringify(finalRecord) + '\n', 'utf8');

            return finalRecord;
        });
    }

    /**
     * Verifies the cryptographic integrity of the audit trail file for a case directory.
     * Checks:
     * 1. Monotonic sequence numbering.
     * 2. Hash chaining (prev_hash of entry N equals curr_hash of entry N-1).
     * 3. Recomputed SHA-256 hash match on canonical payload.
     *
     * @param {string} caseDir - Absolute path to the case directory.
     * @returns {Object} Verification summary.
     */
    verifyChain(caseDir) {
        const auditPath = resolveAuditTrailPath(caseDir);
        if (!auditPath || !fs.existsSync(auditPath)) {
            return {
                valid: true,
                total_entries: 0,
                message: 'No audit trail file found for this matter.'
            };
        }

        const lines = this._readLines(auditPath);
        if (lines.length === 0) {
            return {
                valid: true,
                total_entries: 0,
                message: 'Audit trail file is empty.'
            };
        }

        let expectedPrevHash = GENESIS_PREV_HASH;
        let firstTimestamp = null;
        let lastTimestamp = null;
        let headHash = null;

        for (let i = 0; i < lines.length; i++) {
            let record;
            try {
                record = JSON.parse(lines[i]);
            } catch (err) {
                return {
                    valid: false,
                    broken_at_seq: i,
                    reason: `JSON parsing error at line ${i + 1}: ${err.message}`
                };
            }

            if (record.seq !== i) {
                return {
                    valid: false,
                    broken_at_seq: i,
                    reason: `Sequence gap detected: expected seq ${i}, found ${record.seq}`
                };
            }

            if (record.prev_hash !== expectedPrevHash) {
                return {
                    valid: false,
                    broken_at_seq: i,
                    reason: `Hash chain broken: expected prev_hash ${expectedPrevHash}, found ${record.prev_hash}`
                };
            }

            // Recompute SHA-256
            const { curr_hash, ...preRecord } = record;
            const canonicalJson = canonicalStringify(preRecord);
            const calculatedHash = crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');

            if (calculatedHash !== curr_hash) {
                return {
                    valid: false,
                    broken_at_seq: i,
                    reason: `Payload tamper detected at seq ${i}: recomputed hash ${calculatedHash} does not match recorded ${curr_hash}`
                };
            }

            if (i === 0) firstTimestamp = record.timestamp;
            lastTimestamp = record.timestamp;
            expectedPrevHash = curr_hash;
            headHash = curr_hash;
        }

        return {
            valid: true,
            total_entries: lines.length,
            genesis_hash: GENESIS_PREV_HASH,
            head_hash: headHash,
            first_timestamp: firstTimestamp,
            last_timestamp: lastTimestamp,
            audit_file: auditPath,
            message: `Cryptographic hash chain intact across all ${lines.length} entries.`
        };
    }

    /**
     * Reads paginated entries from the audit trail file.
     */
    readEntries(caseDir, options = {}) {
        const auditPath = resolveAuditTrailPath(caseDir);
        if (!auditPath || !fs.existsSync(auditPath)) {
            return { entries: [], total: 0, valid: true };
        }

        const lines = this._readLines(auditPath);
        const limit = Math.max(1, parseInt(options.limit, 10) || 50);
        const offset = Math.max(0, parseInt(options.offset, 10) || 0);
        const actorFilter = options.actor ? String(options.actor).toLowerCase() : null;
        const eventFilter = options.event ? String(options.event).toLowerCase() : null;

        const records = [];
        for (const line of lines) {
            try {
                const r = JSON.parse(line);
                if (actorFilter && !r.actor.toLowerCase().includes(actorFilter)) continue;
                if (eventFilter && !r.event.toLowerCase().includes(eventFilter)) continue;
                records.push(r);
            } catch (_) {}
        }

        const total = records.length;
        const paged = records.slice(offset, offset + limit);

        return {
            entries: paged,
            total,
            limit,
            offset,
            audit_file: auditPath
        };
    }

    /**
     * Generates a formal electronic evidence certificate conforming to
     * Section 65B of the Indian Evidence Act, 1872 / Section 63 of Bharatiya Sakshya Adhiniyam, 2023.
     */
    generateEvidenceCertificate(caseDir, options = {}) {
        const verification = this.verifyChain(caseDir);
        const { entries, total } = this.readEntries(caseDir, { limit: 1000 });
        const matter = options.matter || path.basename(caseDir);
        const ipName = options.ip_name || 'Insolvency Professional';
        const ibbiRegNo = options.ibbi_reg_no || 'IBBI/IPA-001/IP-P00000/2026/00000';
        const dateStr = new Date().toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });

        let md = `# ANNEXURE: STATUTORY CERTIFICATE OF ELECTRONIC EVIDENCE\n`;
        md += `### Under Section 65B of the Indian Evidence Act, 1872 / Section 63 of the Bharatiya Sakshya Adhiniyam, 2023\n\n`;
        md += `**Matter / Corporate Debtor:** ${matter}\n`;
        md += `**Date of Compilation:** ${dateStr}\n`;
        md += `**Custody & Control:** In-Chamber Sovereign Legal Factory (Hayagriva Engine)\n\n`;
        md += `---\n\n`;

        md += `## 1. Statement of Cryptographic Chain Integrity\n\n`;
        if (verification.valid) {
            md += `> **STATUS: VERIFIED & TAMPER-EVIDENT**\n>\n`;
            md += `> - **Total Recorded Entries:** ${verification.total_entries}\n`;
            md += `> - **First Chronological Entry:** ${verification.first_timestamp || 'N/A'}\n`;
            md += `> - **Terminal Entry:** ${verification.last_timestamp || 'N/A'}\n`;
            md += `> - **Genesis Hash:** \`${verification.genesis_hash}\`\n`;
            md += `> - **Terminal Head Hash:** \`${verification.head_hash || 'N/A'}\`\n\n`;
            md += `The electronic records referenced herein were produced in the ordinary course of business using an append-only, SHA-256 hash-chained diagnostic ledger where each subsequent record cryptographically seals the predecessor.\n\n`;
        } else {
            md += `> ⚠️ **STATUS: VERIFICATION WARNING - CHAIN DISCREPANCY DETECTED**\n>\n`;
            md += `> - Broken at Sequence: ${verification.broken_at_seq}\n`;
            md += `> - Reason: ${verification.reason}\n\n`;
        }

        md += `## 2. Chronological Fiduciary Event Ledger\n\n`;
        md += `| Seq | Timestamp | Actor | Event | Verdict | SHA-256 Fingerprint |\n`;
        md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

        for (const r of entries) {
            const shortHash = r.curr_hash ? r.curr_hash.substring(0, 16) + '...' : 'N/A';
            const shortTime = r.timestamp ? r.timestamp.replace('T', ' ').substring(0, 19) : 'N/A';
            md += `| ${r.seq} | ${shortTime} | \`${r.actor}\` | ${r.event} | ${r.verdict} | \`${shortHash}\` |\n`;
        }

        md += `\n---\n\n`;
        md += `## 3. Statutory Declaration\n\n`;
        md += `I, **${ipName}**, registered Insolvency Professional having Registration No. **${ibbiRegNo}**, do hereby solemnly affirm and state as follows:\n\n`;
        md += `1. That I am the Resolution Professional / Interim Resolution Professional in the matter of **${matter}**.\n`;
        md += `2. That the electronic records contained in the audit trail ledger were created and maintained in the ordinary course of the insolvency resolution process under my lawful fiduciary custody and command.\n`;
        md += `3. That throughout the period of record generation, the computing devices and deterministic local algorithms operating within the sovereign in-chamber environment operated properly and without unauthorized external modification.\n`;
        md += `4. That the mathematical digests and hash chains recorded above faithfully reflect the state of all admitted claims, statutory eligibility checks, avoidance inquests, and generated draft filings.\n\n`;
        md += `**Affirmed at:** ____________________\n\n`;
        md += `**Date:** ${dateStr}\n\n\n`;
        md += `_________________________________________\n`;
        md += `**${ipName}**\n`;
        md += `Insolvency Professional\n`;
        md += `Reg. No: ${ibbiRegNo}\n`;

        return md;
    }
}

const auditTrailInstance = new FiduciaryAuditTrail();
module.exports = auditTrailInstance;
module.exports.FiduciaryAuditTrail = FiduciaryAuditTrail;
module.exports.resolveAuditTrailPath = resolveAuditTrailPath;
module.exports.canonicalStringify = canonicalStringify;
module.exports.computeDigest = computeDigest;
module.exports.GENESIS_PREV_HASH = GENESIS_PREV_HASH;
