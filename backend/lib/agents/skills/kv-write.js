/**
 * Skill: kv-write.js
 * Writes agent-discovered facts back to the case_kv_dictionary.json,
 * closing the context enrichment loop: Stage 1 indexes → Stage 3 enriches → next turn is smarter.
 */

const fs = require('fs');
const path = require('path');
const { getConceptsDir } = require('../../pipeline/common/helper');

const KV_FILENAME = 'case_kv_dictionary.json';

/**
 * Reads and merges the current KV dictionary from all candidate locations for a case,
 * including reviews/, concepts/, root, and SQLite case_facts table.
 * @param {string} caseDir
 * @returns {Object}
 */
function readKV(caseDir) {
    if (!caseDir) return {};
    const merged = {};

    const candidatePaths = [
        path.join(caseDir, 'reviews', KV_FILENAME),
        path.join(getConceptsDir(caseDir), KV_FILENAME),
        path.join(caseDir, 'concepts', KV_FILENAME),
        path.join(caseDir, KV_FILENAME)
    ];

    for (const kvPath of candidatePaths) {
        if (fs.existsSync(kvPath)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(kvPath, 'utf8'));
                if (parsed && typeof parsed === 'object') {
                    for (const [k, v] of Object.entries(parsed)) {
                        if (!merged[k]) {
                            merged[k] = v;
                        } else {
                            // Protect user-verified values or prioritize richer objects
                            const existingVerified = merged[k] && merged[k].verified_by_user === 1;
                            const newVerified = v && typeof v === 'object' && (v.verified_by_user === 1 || v.modifiedBy === 'user');
                            if (!existingVerified && newVerified) {
                                merged[k] = v;
                            } else if (!existingVerified && typeof v === 'object' && v.value !== undefined) {
                                merged[k] = v;
                            }
                        }
                    }
                }
            } catch (e) {
                console.error(`[Skill:kvWrite] Failed to parse KV dictionary at ${kvPath}:`, e.message);
            }
        }
    }

    // Merge facts from SQLite case_facts table if available
    try {
        const { getDb } = require('../../core/sqlite-store');
        const db = getDb(caseDir);
        const rows = db.prepare('SELECT key, value, filename, source_clause, verified_by_user, last_updated FROM case_facts').all();
        if (Array.isArray(rows)) {
            for (const r of rows) {
                if (r && r.key) {
                    const isUserVerified = r.verified_by_user === 1;
                    if (!merged[r.key] || isUserVerified) {
                        merged[r.key] = {
                            value: r.value,
                            source: `${r.filename || 'SQLite'}: ${r.source_clause || 'case_facts'}`,
                            verified_by_user: r.verified_by_user || 0,
                            updated_at: r.last_updated || new Date().toISOString()
                        };
                    }
                }
            }
        }
    } catch (_) {
        // Non-fatal if SQLite DB is not ready or in-memory
    }

    return merged;
}

/**
 * Writes a single key-value pair to the case KV dictionary across all standard locations
 * and syncs to SQLite case_facts table.
 * Adds metadata: source document, agent that wrote it, timestamp.
 * Respects verified_by_user=1 values (will NOT overwrite user-verified values).
 *
 * @param {string} caseDir  - Active case directory
 * @param {string} key      - The fact key (e.g. 'date_of_default', 'corporate_debtor_name')
 * @param {string} value    - The discovered value
 * @param {string} source   - Source document name or agent name
 * @param {string} agentName - Name of the agent writing this fact
 * @returns {boolean} true if written, false if skipped (user-verified value protected)
 */
function writeCaseKV(caseDir, key, value, source, agentName = 'agent') {
    if (!caseDir || !key || value === undefined || value === null) return false;

    const kv = readKV(caseDir);

    // Protect user-verified values
    if (kv[key] && (kv[key].verified_by_user === 1 || kv[key].modifiedBy === 'user')) {
        console.log(`[Skill:kvWrite] Skipping "${key}" — user-verified value is protected.`);
        return false;
    }

    const now = new Date().toISOString();
    const entry = {
        value,
        originalExtractedValue: value,
        modifiedBy: agentName || 'agent',
        source: source || 'Agent Extraction',
        agent: agentName,
        confidence: 'high',
        lastUpdated: now,
        updated_at: now,
        verified_by_user: 0
    };

    kv[key] = entry;

    const targetPaths = [
        path.join(caseDir, 'reviews', KV_FILENAME),
        path.join(getConceptsDir(caseDir), KV_FILENAME)
    ];

    let written = false;
    for (const kvPath of targetPaths) {
        try {
            fs.mkdirSync(path.dirname(kvPath), { recursive: true });
            fs.writeFileSync(kvPath, JSON.stringify(kv, null, 2), 'utf8');
            written = true;
        } catch (e) {
            console.error(`[Skill:kvWrite] Failed to write KV to ${kvPath}:`, e.message);
        }
    }

    // Sync to SQLite case_facts table
    try {
        const { getDb } = require('../../core/sqlite-store');
        const db = getDb(caseDir);
        const upsert = db.prepare(`
            INSERT INTO case_facts (key, filename, value, source_clause, verified_by_user, last_updated)
            VALUES (?, ?, ?, ?, 0, ?)
            ON CONFLICT(key) DO UPDATE SET
                filename = excluded.filename,
                value = CASE WHEN verified_by_user = 1 THEN case_facts.value ELSE excluded.value END,
                source_clause = excluded.source_clause,
                last_updated = excluded.last_updated
        `);
        upsert.run(
            key,
            source || 'agent_extraction',
            String(value),
            `${agentName}: ${source || 'Agent Discovery'}`,
            now
        );
    } catch (_) {
        // Non-fatal SQLite sync
    }

    if (written) {
        console.log(`[Skill:kvWrite] Written: "${key}" = "${value}" (source: ${source})`);
    }
    return written;
}

/**
 * Writes multiple key-value pairs at once.
 * @param {string} caseDir
 * @param {Object} pairs    - { key: value, ... } or { key: { value, source } }
 * @param {string} source
 * @param {string} agentName
 * @returns {number} count of keys written
 */
function writeMultiKV(caseDir, pairs, source, agentName = 'agent') {
    if (!pairs || typeof pairs !== 'object') return 0;
    let written = 0;
    for (const [key, val] of Object.entries(pairs)) {
        const value = (typeof val === 'object' && val !== null && val.value !== undefined) ? val.value : val;
        const src   = (typeof val === 'object' && val !== null && val.source)             ? val.source : source;
        if (writeCaseKV(caseDir, key, value, src, agentName)) written++;
    }
    return written;
}

/**
 * Reads a specific key from the KV dictionary.
 * @param {string} caseDir
 * @param {string} key
 * @returns {string|null} the value, or null if not found
 */
function readCaseKV(caseDir, key) {
    const kv = readKV(caseDir);
    if (!kv || !kv[key]) return null;
    const entry = kv[key];
    return typeof entry === 'object' && entry !== null && entry.value !== undefined ? entry.value : entry;
}

/**
 * Returns the entire KV dictionary as a flat { key: value } map.
 * @param {string} caseDir
 * @returns {Object}
 */
function readAllKV(caseDir) {
    const kv = readKV(caseDir);
    const flat = {};
    for (const [k, v] of Object.entries(kv)) {
        flat[k] = (typeof v === 'object' && v !== null && v.value !== undefined) ? v.value : v;
    }
    return flat;
}

module.exports = { writeCaseKV, writeMultiKV, readCaseKV, readAllKV };
