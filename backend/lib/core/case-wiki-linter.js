'use strict';

const fs = require('fs');
const path = require('path');
const { getWikiDir } = require('../pipeline/common/helper');
const { parseMarkdownWithFrontmatter } = require('../utils/okf');
const { parseMarkdownTable } = require('../utils/table-sync');
const { getDb } = require('./sqlite-store');
const inboxManager = require('../agents/inbox-manager');

/**
 * Loads the case KV dictionary from reviews/case_kv_dictionary.json.
 */
function loadCaseKvDictionary(caseDir) {
    const dictPath = path.join(caseDir, 'reviews', 'case_kv_dictionary.json');
    if (fs.existsSync(dictPath)) {
        try {
            return JSON.parse(fs.readFileSync(dictPath, 'utf8'));
        } catch (_) {}
    }
    return {};
}

/**
 * Saves updates to reviews/case_kv_dictionary.json.
 */
function saveCaseKvDictionary(caseDir, dictionary) {
    const dictPath = path.join(caseDir, 'reviews', 'case_kv_dictionary.json');
    fs.mkdirSync(path.dirname(dictPath), { recursive: true });
    fs.writeFileSync(dictPath, JSON.stringify(dictionary, null, 2), 'utf8');
}

/**
 * Normalizes creditor/party names for cross-register fuzzy comparison.
 */
function normalizePartyName(name) {
    if (!name || typeof name !== 'string') return '';
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\b(limited|ltd|pvt|private|bank|corporation|corp|inc|llp|co)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Helper to extract value from KV dictionary item (supports { value } or string).
 */
function getKvValue(item) {
    if (!item) return '';
    if (typeof item === 'object' && item.value !== undefined) {
        return String(item.value).trim();
    }
    return String(item).trim();
}

/**
 * Executes a full chamber lint audit pass across the active case workspace.
 * 
 * @param {string} caseDir - Absolute path to active case directory
 * @param {Object} [options] - Configuration options { autoPostToInbox?: boolean, rules?: string[] }
 * @returns {Promise<Object>} Structured audit report
 */
async function auditCaseWiki(caseDir, options = {}) {
    if (!caseDir || !fs.existsSync(caseDir)) {
        throw new Error(`Invalid case directory: ${caseDir}`);
    }

    const caseName = path.basename(caseDir);
    const wikiDir = getWikiDir(caseDir);
    const autoPostToInbox = options.autoPostToInbox !== false;
    const requestedRules = Array.isArray(options.rules) ? new Set(options.rules) : null;
    const isRuleEnabled = (ruleId) => !requestedRules || requestedRules.has(ruleId);

    const issues = [];
    const stats = {
        filesAudited: 0,
        claimsEvaluated: 0,
        avoidanceTxsEvaluated: 0,
        wikilinksChecked: 0,
        rulesExecuted: 0,
        issuesFound: 0
    };

    let db;
    try {
        db = getDb(caseDir);
    } catch (_) {}

    const kvDict = loadCaseKvDictionary(caseDir);

    // ─── RULE 1: Cross-Register Claim vs. Avoidance Discrepancy ──────────────
    if (isRuleEnabled('RULE_AVOIDANCE_CLAIM_OFFSET')) {
        stats.rulesExecuted++;
        let claims = [];
        let avoidanceTxs = [];

        // Fetch claims from SQLite or Markdown table
        if (db) {
            try {
                claims = db.prepare('SELECT * FROM claims').all() || [];
            } catch (_) {}
        }
        if (claims.length === 0) {
            const claimsPath = path.join(caseDir, 'claims_registry.md');
            if (fs.existsSync(claimsPath)) {
                claims = parseMarkdownTable(fs.readFileSync(claimsPath, 'utf8')) || [];
            }
        }

        // Fetch avoidance transactions from SQLite or Markdown table
        if (db) {
            try {
                avoidanceTxs = db.prepare('SELECT * FROM avoidance_transactions').all() || [];
            } catch (_) {}
        }
        if (avoidanceTxs.length === 0) {
            const avoidancePath = path.join(caseDir, 'avoidance_ledger.md');
            if (fs.existsSync(avoidancePath)) {
                avoidanceTxs = parseMarkdownTable(fs.readFileSync(avoidancePath, 'utf8')) || [];
            }
        }

        stats.claimsEvaluated = claims.length;
        stats.avoidanceTxsEvaluated = avoidanceTxs.length;

        // Group avoidance transactions by normalized party name
        const avoidanceByParty = new Map();
        for (const tx of avoidanceTxs) {
            const party = tx.credited_party || tx.debited_account || '';
            const norm = normalizePartyName(party);
            if (norm) {
                const existing = avoidanceByParty.get(norm) || { rawParty: party, totalAmount: 0, sections: new Set(), notes: [] };
                existing.totalAmount += Number(tx.amount) || 0;
                if (tx.applicable_section) existing.sections.add(tx.applicable_section);
                if (tx.forensic_notes) existing.notes.push(tx.forensic_notes);
                avoidanceByParty.set(norm, existing);
            }
        }

        // Compare each admitted claim against avoidance transactions
        for (const claim of claims) {
            const credName = claim.creditor || '';
            const normCred = normalizePartyName(credName);
            if (!normCred) continue;

            const avoidanceMatch = avoidanceByParty.get(normCred);
            if (avoidanceMatch && avoidanceMatch.totalAmount > 0) {
                const admittedAmt = Number(claim.admitted_amount) || 0;
                const reason = (claim.rejection_reason || '') + ' ' + (claim.status || '');
                const hasAvoidanceReserve = /(?:avoidance|preference|section 43|section 45|section 66|reserve|sub-judice|escrow)/i.test(reason);

                if (!hasAvoidanceReserve) {
                    const sectionsStr = Array.from(avoidanceMatch.sections).join(', ') || 'Section 43';
                    const issueId = `lint_avoidance_offset_${normCred}_${Math.round(avoidanceMatch.totalAmount)}`;
                    issues.push({
                        id: issueId,
                        ruleId: 'RULE_AVOIDANCE_CLAIM_OFFSET',
                        severity: 'HIGH',
                        category: 'CONTRADICTION',
                        title: `Unadjusted Avoidance Exposure: ${credName}`,
                        description: `Creditor "${credName}" has an admitted claim of ₹${admittedAmt.toLocaleString('en-IN')} in claims_registry.md, but is named in avoidance_ledger.md with ₹${avoidanceMatch.totalAmount.toLocaleString('en-IN')} in potential avoidance exposure (${sectionsStr}). No sub-judice reserve or offset note is recorded.`,
                        evidence: {
                            creditor: credName,
                            admittedAmount: admittedAmt,
                            avoidanceAmount: avoidanceMatch.totalAmount,
                            sections: sectionsStr,
                            avoidanceParty: avoidanceMatch.rawParty
                        },
                        options: [
                            'Add Avoidance Note to Claim',
                            'Adjust Admitted Amount',
                            'Dismiss'
                        ]
                    });
                }
            }
        }
    }

    // ─── RULE 2: Derivable Blank Facts Inquest ───────────────────────────────
    if (isRuleEnabled('RULE_DERIVABLE_BLANK_FACTS')) {
        stats.rulesExecuted++;
        const ESSENTIAL_KEYS = [
            { key: 'corporate_debtor', label: 'Corporate Debtor Name', regex: /(?:in the matter of|corporate debtor|re:?)\s*[:\-]?\s*([A-Z][A-Za-z0-9\s.,&-]+(?:Limited|Ltd|Pvt\.?\s*Ltd))/i },
            { key: 'cirp_commencement_date', label: 'CIRP Commencement Date', regex: /(?:admitted on|commencement date|date of admission|order dated)\s*[:\-]?\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i },
            { key: 'insolvency_resolution_professional', label: 'IRP / RP Name', regex: /(?:interim resolution professional|irp|resolution professional|rp)\s*[:\-]?\s*(?:mr\.?|ms\.?|shri)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i },
            { key: 'nclt_bench', label: 'NCLT Bench', regex: /(?:national company law tribunal|nclt)[,\s]+([A-Za-z\s]+Bench)/i }
        ];

        for (const target of ESSENTIAL_KEYS) {
            const currentVal = getKvValue(kvDict[target.key]);
            if (!currentVal || currentVal.toLowerCase() === 'tbd' || currentVal.toLowerCase() === 'null') {
                let detectedValue = null;
                let sourceDoc = null;
                let snippet = null;

                if (db) {
                    try {
                        const rows = db.prepare('SELECT filename, content FROM fts_chunks LIMIT 100').all();
                        for (const row of rows) {
                            const match = target.regex.exec(row.content);
                            if (match && match[1]) {
                                detectedValue = match[1].trim();
                                sourceDoc = row.filename;
                                snippet = row.content.substring(Math.max(0, match.index - 50), Math.min(row.content.length, match.index + 120)).trim();
                                break;
                            }
                        }
                    } catch (_) {}
                }

                if (detectedValue) {
                    const issueId = `lint_derivable_fact_${target.key}`;
                    issues.push({
                        id: issueId,
                        ruleId: 'RULE_DERIVABLE_BLANK_FACTS',
                        severity: 'MEDIUM',
                        category: 'DERIVABLE_FACT',
                        title: `Derivable Fact Available: ${target.label}`,
                        description: `Field "${target.key}" is currently blank in case facts, but was detected in "${sourceDoc}" as "${detectedValue}".`,
                        evidence: {
                            key: target.key,
                            label: target.label,
                            detectedValue,
                            sourceDocument: sourceDoc,
                            snippet
                        },
                        options: [
                            'Accept & Populate Key',
                            'Dismiss'
                        ]
                    });
                }
            }
        }
    }

    // ─── RULE 3: CIRP Statutory Milestone Compliance ─────────────────────────
    if (isRuleEnabled('RULE_CIRP_MILESTONE_LAG')) {
        stats.rulesExecuted++;
        const commDateVal = getKvValue(kvDict['cirp_commencement_date']);
        if (commDateVal) {
            const parsedDate = new Date(commDateVal);
            if (!isNaN(parsedDate.getTime())) {
                const now = Date.now();
                const daysElapsed = Math.floor((now - parsedDate.getTime()) / (1000 * 60 * 60 * 24));

                const MILESTONES = [
                    { name: 'Public Announcement (Form A)', deadline: 3, reg: 'Reg 6', filePattern: /form[_\s-]?a/i, contentPattern: /public announcement|form a/i },
                    { name: 'Claims Submission Deadline', deadline: 14, reg: 'Sec 15', filePattern: /claims_registry/i, contentPattern: /claims registry|form b|form c/i },
                    { name: 'First CoC Meeting', deadline: 30, reg: 'Sec 22', filePattern: /coc[_\s-]?1|1st[_\s-]?coc/i, contentPattern: /first meeting of committee|1st coc/i },
                    { name: 'Invitation for EoI (Form G)', deadline: 75, reg: 'Reg 36A', filePattern: /form[_\s-]?g/i, contentPattern: /form g|invitation for expression of interest/i },
                    { name: 'Normal CIRP Period (180 Days)', deadline: 180, reg: 'Sec 12(1)', filePattern: /extension|resolution_plan/i, contentPattern: /extension of cirp|resolution plan/i }
                ];

                for (const m of MILESTONES) {
                    if (daysElapsed >= m.deadline) {
                        // Check if evidence exists in caseDir files or FTS content
                        let evidenceFound = false;
                        try {
                            const files = fs.readdirSync(caseDir);
                            evidenceFound = files.some(f => m.filePattern.test(f));
                            if (!evidenceFound && fs.existsSync(path.join(caseDir, 'raw'))) {
                                const rawFiles = fs.readdirSync(path.join(caseDir, 'raw'));
                                evidenceFound = rawFiles.some(f => m.filePattern.test(f));
                            }
                            if (!evidenceFound && db) {
                                const match = db.prepare('SELECT filename FROM fts_chunks WHERE content LIKE ? LIMIT 1').get(`%${m.name.split(' ')[0]}%`);
                                if (match) evidenceFound = true;
                            }
                        } catch (_) {}

                        if (!evidenceFound) {
                            const issueId = `lint_milestone_lag_${m.deadline}`;
                            issues.push({
                                id: issueId,
                                ruleId: 'RULE_CIRP_MILESTONE_LAG',
                                severity: 'HIGH',
                                category: 'STATUTORY_GAP',
                                title: `Statutory Milestone Overdue: ${m.name}`,
                                description: `CIRP is at Day T+${daysElapsed}. Regulation ${m.reg} mandates "${m.name}" by Day T+${m.deadline}, but no filing, draft, or notice was detected in the matter workspace.`,
                                evidence: {
                                    milestone: m.name,
                                    deadlineDays: m.deadline,
                                    daysElapsed,
                                    statutoryRef: m.reg
                                },
                                options: [
                                    'Trigger Drafter Subagent',
                                    'Mark Filed Offline',
                                    'Dismiss'
                                ]
                            });
                        }
                    }
                }
            }
        }
    }

    // ─── RULE 4: Broken Chamber Wikilinks & Cross-References ──────────────────
    if (isRuleEnabled('RULE_BROKEN_WIKILINKS') && wikiDir && fs.existsSync(wikiDir)) {
        stats.rulesExecuted++;
        const scanDir = (dir) => {
            const list = [];
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    list.push(...scanDir(full));
                } else if (entry.name.endsWith('.md')) {
                    list.push(full);
                }
            }
            return list;
        };

        const wikiFiles = scanDir(wikiDir);
        stats.filesAudited += wikiFiles.length;

        const wikiLinkRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;

        for (const file of wikiFiles) {
            try {
                const text = fs.readFileSync(file, 'utf8');
                let match;
                while ((match = wikiLinkRegex.exec(text)) !== null) {
                    stats.wikilinksChecked++;
                    const target = match[1].trim();
                    if (!target) continue;

                    let exists = false;
                    const possibleTargets = [
                        path.join(wikiDir, `${target}.md`),
                        path.join(wikiDir, target),
                        path.join(caseDir, target),
                        path.join(caseDir, 'raw', target)
                    ];

                    for (const p of possibleTargets) {
                        if (fs.existsSync(p)) {
                            exists = true;
                            break;
                        }
                    }

                    if (!exists) {
                        const relSource = path.relative(caseDir, file).replace(/\\/g, '/');
                        const issueId = `lint_broken_link_${path.parse(file).name}_${target.replace(/[^a-z0-9]/gi, '_')}`;
                        issues.push({
                            id: issueId,
                            ruleId: 'RULE_BROKEN_WIKILINKS',
                            severity: 'LOW',
                            category: 'BROKEN_LINK',
                            title: `Broken Link in ${path.basename(file)}: [[${target}]]`,
                            description: `Document "${relSource}" references "[[${target}]]", but no matching wiki page or document exists in the workspace.`,
                            evidence: {
                                sourceFile: relSource,
                                targetLink: target
                            },
                            options: [
                                'Create Stub Page',
                                'Dismiss'
                            ]
                        });
                    }
                }
            } catch (_) {}
        }
    }

    // ─── RULE 5: Orphan Documents & Unindexed Knowledge ──────────────────────
    if (isRuleEnabled('RULE_ORPHAN_KNOWLEDGE')) {
        stats.rulesExecuted++;
        const primaryDocs = [];
        try {
            const rootFiles = fs.readdirSync(caseDir, { withFileTypes: true });
            for (const f of rootFiles) {
                if (f.isFile() && /\.(pdf|docx|xlsx|doc|xls)$/i.test(f.name)) {
                    primaryDocs.push(f.name);
                }
            }
        } catch (_) {}

        for (const doc of primaryDocs) {
            const stem = path.parse(doc).name;
            const sourceSummaryPath = path.join(wikiDir || '', 'sources', `${stem}.md`);
            const hasSourceSummary = fs.existsSync(sourceSummaryPath);

            let hasMentions = hasSourceSummary;
            if (!hasMentions && db) {
                try {
                    const row = db.prepare('SELECT id FROM fts_chunks WHERE content LIKE ? LIMIT 1').get(`%${stem}%`);
                    if (row) hasMentions = true;
                } catch (_) {}
            }

            if (!hasMentions) {
                const issueId = `lint_orphan_doc_${stem.replace(/[^a-z0-9]/gi, '_')}`;
                issues.push({
                    id: issueId,
                    ruleId: 'RULE_ORPHAN_KNOWLEDGE',
                    severity: 'LOW',
                    category: 'ORPHAN_DOC',
                    title: `Unreferenced Document: ${doc}`,
                    description: `Primary file "${doc}" was ingested but has no source summary in wiki/sources/ and is unreferenced in any claim registers or case facts.`,
                    evidence: {
                        docName: doc,
                        stem
                    },
                    options: [
                        'Generate Source Summary',
                        'Dismiss'
                    ]
                });
            }
        }
    }

    stats.issuesFound = issues.length;

    // ─── Post Issues to Case Action Inbox ────────────────────────────────────
    let inboxItemsCreated = 0;
    if (autoPostToInbox && issues.length > 0) {
        for (const issue of issues) {
            try {
                inboxManager.createItem(caseDir, {
                    id: issue.id,
                    toolCallId: issue.id,
                    kind: issue.category === 'CONTRADICTION' || issue.category === 'STATUTORY_GAP' ? 'approval' : 'question',
                    title: issue.title,
                    body: issue.description,
                    options: issue.options,
                    data: issue.evidence,
                    metadata: {
                        ruleId: issue.ruleId,
                        category: issue.category,
                        severity: issue.severity
                    }
                });
                inboxItemsCreated++;
            } catch (err) {
                console.warn(`[CaseWikiLinter] Note creating inbox item ${issue.id}: ${err.message}`);
            }
        }
    }

    return {
        success: true,
        caseName,
        auditTimestamp: new Date().toISOString(),
        stats,
        issues,
        inboxItemsCreated
    };
}

/**
 * Resolves a specific lint issue with an action.
 * 
 * @param {string} caseDir 
 * @param {Object} params { issueId, action, extra }
 */
async function resolveLintIssue(caseDir, params = {}) {
    const { issueId, action, extra = {} } = params;
    if (!issueId || !action) {
        throw new Error('Both issueId and action are required to resolve a lint issue.');
    }

    let remediationNote = '';

    // 1. Auto-Populate Derivable Key
    if (action === 'Accept & Populate Key' || action === 'ACCEPT_KEY') {
        const key = extra.key || issueId.replace(/^lint_derivable_fact_/, '');
        const val = extra.detectedValue;
        if (key && val) {
            const dict = loadCaseKvDictionary(caseDir);
            dict[key] = {
                value: val,
                source_clause: extra.sourceDocument || 'Inquest Extraction',
                verified_by_user: 1,
                last_updated: new Date().toISOString()
            };
            saveCaseKvDictionary(caseDir, dict);
            remediationNote = `Populated key "${key}" = "${val}" in case facts.`;
        }
    }

    // 2. Add Avoidance Reserve Note to Claims
    else if (action === 'Add Avoidance Note to Claim' || action === 'ADD_AVOIDANCE_NOTE') {
        const creditor = extra.creditor;
        if (creditor) {
            const claimsPath = path.join(caseDir, 'claims_registry.md');
            if (fs.existsSync(claimsPath)) {
                let md = fs.readFileSync(claimsPath, 'utf8');
                const norm = normalizePartyName(creditor);
                const lines = md.split('\n');
                const updatedLines = lines.map(line => {
                    if (normalizePartyName(line).includes(norm)) {
                        return line.replace(/\|$/, ` Sub-judice Section 43/66 avoidance reserve |`);
                    }
                    return line;
                });
                fs.writeFileSync(claimsPath, updatedLines.join('\n'), 'utf8');
                remediationNote = `Added sub-judice avoidance reserve note to creditor "${creditor}".`;
            }
        }
    }

    // 3. Create Stub Wiki Page for Broken Link
    else if (action === 'Create Stub Page' || action === 'CREATE_STUB_PAGE') {
        const targetLink = extra.targetLink;
        if (targetLink) {
            const wikiDir = getWikiDir(caseDir);
            const targetPath = targetLink.endsWith('.md') ? path.join(wikiDir, targetLink) : path.join(wikiDir, `${targetLink}.md`);
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            if (!fs.existsSync(targetPath)) {
                const stub = `# ${path.parse(targetPath).name.replace(/_/g, ' ')}\n\n*Stub page created via Case Wiki Lint remediation.*\n`;
                fs.writeFileSync(targetPath, stub, 'utf8');
                remediationNote = `Created stub wiki page at ${targetPath}.`;
            }
        }
    }

    // 4. Mark Inbox Item as RESOLVED
    try {
        inboxManager.resolveItem(caseDir, issueId, {
            action,
            remediationNote: remediationNote || 'Resolved by user',
            resolvedAt: new Date().toISOString()
        });
    } catch (_) {}

    return {
        success: true,
        issueId,
        action,
        remediationNote: remediationNote || 'Acknowledged and resolved'
    };
}

/**
 * Returns a quick statistical summary of lint issues without posting to inbox.
 */
async function getLintSummary(caseDir) {
    const report = await auditCaseWiki(caseDir, { autoPostToInbox: false });
    const severityCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    const categoryCounts = {};

    for (const issue of report.issues) {
        severityCounts[issue.severity] = (severityCounts[issue.severity] || 0) + 1;
        categoryCounts[issue.category] = (categoryCounts[issue.category] || 0) + 1;
    }

    return {
        success: true,
        stats: report.stats,
        severityCounts,
        categoryCounts,
        sampleIssues: report.issues.slice(0, 5)
    };
}

module.exports = {
    auditCaseWiki,
    resolveLintIssue,
    getLintSummary,
    normalizePartyName
};
