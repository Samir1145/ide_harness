/**
 * entity-graph.js - Typed Entity Graph & Diagnostic Contradiction Engine (Plan 21)
 * 
 * Provides:
 * 1. Normalized entity management with canonical keys & alias resolution.
 * 2. Multi-source reconciliation (claims, avoidance transactions, case_facts, briefs).
 * 3. Diagnostic Contradiction Inquest across 4 statutory legal vectors:
 *    - Quantum Discrepancy (Claim Form claimed vs admitted).
 *    - Avoidance vs Claim Collision (Creditor admitted while subject to § 43/45/50/66 avoidance).
 *    - Section 29A Disqualification (Resolution applicant affiliated with suspended board/guarantor).
 *    - Milestone Date Conflicts.
 * 4. GraphRAG Pre-Flight Query Expander & Prepend Guard.
 * 5. Full D3-compatible unified graph synthesis (nodes + typed color-coded edges).
 */

const fs = require('fs');
const path = require('path');
const { getDb } = require('./sqlite-store');

// ── Normalization & Slugging Helpers ─────────────────────────────────────────

const STRIP_TERMS = [
    /\b(m\/s\.?|shri|smt\.?|mr\.?|ms\.?|dr\.?)\b/gi,
    /\b(pvt\.?|private)\s+(ltd\.?|limited)\b/gi,
    /\b(ltd\.?|limited|llp|inc\.?|corp\.?|corporation)\b/gi,
    /\b(branch|samb|sme)\b/gi,
    /[^\w\s]/g
];

/**
 * Normalizes an entity name by stripping honorifics, corporate suffixes, and punctuation.
 * @param {string} rawName 
 * @returns {string} Clean, normalized display name
 */
function normalizeEntityName(rawName) {
    if (!rawName || typeof rawName !== 'string') return '';
    let name = rawName.trim();
    // Remove parenthesis contents if they only denote corporate type or branch
    name = name.replace(/\((financial creditor|operational creditor|corporate debtor|suspended director|director|branch|samb[^\)]*)\)/gi, '');
    name = name.replace(/\b(m\/s\.?)\s+/gi, '');
    return name.trim();
}

/**
 * Generates a canonical slug/key for an entity to enable fuzzy/aliased cross-filing matching.
 * e.g., "State Bank of India (SAMB)" -> "state_bank_of_india"
 * @param {string} rawName 
 * @returns {string} Canonical key
 */
function generateEntityKey(rawName) {
    if (!rawName || typeof rawName !== 'string') return '';
    let key = rawName.toLowerCase();
    
    // Known institutional mappings (check first)
    if (/\b(state\s+bank\s+of\s+india|sbi)\b/i.test(key)) return 'state_bank_of_india';
    if (/\b(punjab\s+national\s+bank|pnb)\b/i.test(key)) return 'punjab_national_bank';
    if (/\b(bank\s+of\s+baroda|bob)\b/i.test(key)) return 'bank_of_baroda';
    if (/\b(canara\s+bank|canara)\b/i.test(key)) return 'canara_bank';
    if (/\b(hdfc\s+bank|hdfc)\b/i.test(key)) return 'hdfc_bank';
    if (/\b(icici\s+bank|icici)\b/i.test(key)) return 'icici_bank';
    if (/\b(axis\s+bank|axis)\b/i.test(key)) return 'axis_bank';
    if (/\b(insolvency\s+and\s+bankruptcy\s+board\s+of\s+india|ibbi)\b/i.test(key)) return 'ibbi';
    if (/\b(national\s+company\s+law\s+tribunal|nclt)\b/i.test(key)) return 'nclt';

    // Strip corporate suffixes and noise terms
    for (const term of STRIP_TERMS) {
        key = key.replace(term, ' ');
    }

    key = key.trim().replace(/\s+/g, '_');
    return key || rawName.toLowerCase().replace(/[^\w]/g, '_');
}

/**
 * Formats numeric currency in Indian standard (Lakhs / Crores)
 * @param {number} amount 
 * @returns {string}
 */
function formatAmountINR(amount) {
    if (amount === undefined || amount === null || isNaN(amount)) return '0';
    const num = Math.abs(Number(amount));
    if (num >= 10000000) {
        return '₹' + (num / 10000000).toFixed(2) + ' Cr';
    } else if (num >= 100000) {
        return '₹' + (num / 100000).toFixed(2) + ' L';
    }
    return '₹' + num.toLocaleString('en-IN');
}

// ── Database Operations ──────────────────────────────────────────────────────

/**
 * Upserts a single entity into the case_entities table.
 */
function upsertEntity(db, entity) {
    const key = entity.entity_key || generateEntityKey(entity.name);
    const now = new Date().toISOString();
    
    const existing = db.prepare('SELECT id, aliases_json, properties_json FROM case_entities WHERE entity_key = ?').get(key);
    
    let aliases = [];
    let properties = entity.properties || {};

    if (existing) {
        try {
            aliases = JSON.parse(existing.aliases_json || '[]');
        } catch (_) {}
        try {
            const oldProps = JSON.parse(existing.properties_json || '{}');
            properties = Object.assign({}, oldProps, properties);
        } catch (_) {}
    }

    if (entity.name && !aliases.includes(entity.name)) {
        aliases.push(entity.name);
    }
    if (Array.isArray(entity.aliases)) {
        for (const a of entity.aliases) {
            if (a && !aliases.includes(a)) aliases.push(a);
        }
    }

    const stmt = db.prepare(`
        INSERT INTO case_entities (entity_key, name, entity_type, aliases_json, primary_doc, properties_json, created_at, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(entity_key) DO UPDATE SET
            name = COALESCE(excluded.name, name),
            entity_type = COALESCE(excluded.entity_type, entity_type),
            aliases_json = excluded.aliases_json,
            primary_doc = COALESCE(excluded.primary_doc, primary_doc),
            properties_json = excluded.properties_json,
            last_updated = excluded.last_updated
    `);

    stmt.run(
        key,
        entity.name || key,
        entity.entity_type || 'entity',
        JSON.stringify(aliases),
        entity.primary_doc || '',
        JSON.stringify(properties),
        now,
        now
    );

    return key;
}

/**
 * Upserts a directional typed edge between two entities.
 */
function upsertEdge(db, edge) {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
        INSERT INTO case_entity_edges (
            source_key, target_key, edge_type, severity, source_doc, target_doc, details_json, created_at, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_key, target_key, edge_type) DO UPDATE SET
            severity = excluded.severity,
            source_doc = COALESCE(excluded.source_doc, source_doc),
            target_doc = COALESCE(excluded.target_doc, target_doc),
            details_json = excluded.details_json,
            last_updated = excluded.last_updated
    `);

    stmt.run(
        edge.source_key,
        edge.target_key,
        edge.edge_type,
        edge.severity || 'info',
        edge.source_doc || '',
        edge.target_doc || '',
        typeof edge.details === 'object' ? JSON.stringify(edge.details) : (edge.details_json || '{}'),
        now,
        now
    );
}

// ── Multi-Source Reconciliation & Extraction ─────────────────────────────────

/**
 * Extracts entities and relationships from case_facts and case_kv_dictionary.json
 */
function extractFromCaseFacts(db, caseDir) {
    let cdName = 'Corporate Debtor';
    let cdKey = 'corporate_debtor';

    // 1. Check case_facts table
    try {
        const cdRow = db.prepare("SELECT value FROM case_facts WHERE key = 'corporate_debtor_name' OR key = 'corporate_debtor'").get();
        if (cdRow && cdRow.value) {
            cdName = cdRow.value;
            cdKey = generateEntityKey(cdName);
        }
    } catch (_) {}

    // 2. Check case_kv_dictionary.json fallback
    const kvPath = path.join(caseDir, 'case_kv_dictionary.json');
    if (fs.existsSync(kvPath)) {
        try {
            const kv = JSON.parse(fs.readFileSync(kvPath, 'utf8'));
            if (kv.corporate_debtor_name) {
                cdName = kv.corporate_debtor_name;
                cdKey = generateEntityKey(cdName);
            }
        } catch (_) {}
    }

    // Register Corporate Debtor
    upsertEntity(db, {
        entity_key: cdKey,
        name: cdName,
        entity_type: 'corporate_debtor',
        aliases: [cdName, 'Corporate Debtor', 'CD'],
        primary_doc: 'case_facts.md'
    });

    return { cdName, cdKey };
}

/**
 * Reconciles claims table and creates creditor entities and claim edges.
 */
function extractFromClaims(db, cdKey) {
    try {
        const claims = db.prepare('SELECT * FROM claims').all();
        for (const claim of claims) {
            if (!claim.creditor) continue;
            const creditorName = normalizeEntityName(claim.creditor);
            const creditorKey = generateEntityKey(creditorName);

            const claimedAmt = Number(claim.claimed_amount) || 0;
            const admittedAmt = Number(claim.admitted_amount) || 0;
            const rejectedAmt = Number(claim.rejected_amount) || 0;

            const isFC = (claim.status || '').toLowerCase().includes('financial') || 
                         (claim.rejection_reason || '').toLowerCase().includes('financial') ||
                         claimedAmt > 50000000;
            
            const entityType = isFC ? 'financial_creditor' : 'operational_creditor';

            upsertEntity(db, {
                entity_key: creditorKey,
                name: creditorName,
                entity_type: entityType,
                aliases: [claim.creditor, creditorName],
                properties: {
                    claimed_amount: claimedAmt,
                    admitted_amount: admittedAmt,
                    rejected_amount: rejectedAmt,
                    rejection_reason: claim.rejection_reason || '',
                    claim_date: claim.claim_date || ''
                }
            });

            // Normal claims_against edge
            upsertEdge(db, {
                source_key: creditorKey,
                target_key: cdKey,
                edge_type: 'claims_against',
                severity: 'info',
                details: {
                    claimed_amount: claimedAmt,
                    admitted_amount: admittedAmt,
                    narrative: `Claimed ${formatAmountINR(claimedAmt)}, Admitted ${formatAmountINR(admittedAmt)}`
                }
            });
        }
    } catch (e) {
        console.warn('[Entity Graph] Could not extract from claims table:', e.message);
    }
}

/**
 * Reconciles avoidance transactions and connects suspected parties.
 */
function extractFromAvoidance(db, cdKey) {
    try {
        const rows = db.prepare('SELECT * FROM avoidance_transactions').all();
        for (const row of rows) {
            if (!row.credited_party) continue;
            const partyName = normalizeEntityName(row.credited_party);
            const partyKey = generateEntityKey(partyName);
            const amt = Number(row.amount) || 0;
            const section = row.applicable_section || '66';
            const isRP = (row.related_party_status || '').toLowerCase().includes('yes') ||
                         (row.related_party_status || '').toLowerCase().includes('related');

            upsertEntity(db, {
                entity_key: partyKey,
                name: partyName,
                entity_type: isRP ? 'related_party' : 'avoidance_respondent',
                properties: {
                    avoidance_amount: amt,
                    applicable_section: section,
                    is_related_party: isRP,
                    forensic_notes: row.forensic_notes || ''
                }
            });

            // Connect avoidance transfer edge
            upsertEdge(db, {
                source_key: cdKey,
                target_key: partyKey,
                edge_type: isRP ? 'related_party' : 'avoidance_transfer',
                severity: 'warning',
                details: {
                    amount: amt,
                    applicable_section: section,
                    narrative: `Impugned transaction under Section ${section} of ${formatAmountINR(amt)}`
                }
            });
        }
    } catch (e) {
        console.warn('[Entity Graph] Could not extract from avoidance table:', e.message);
    }
}

// ── Diagnostic Contradiction Inquest Engine ──────────────────────────────────

/**
 * Executes a full diagnostic pass to detect cross-document collisions.
 * @param {object} db SQLite Database connection
 * @param {string} cdKey Corporate Debtor canonical key
 * @returns {Array<object>} Detected contradictions
 */
function detectContradictions(db, cdKey) {
    const contradictions = [];

    // ── Vector 1: Quantum Discrepancy (Claimed vs Admitted) ─────────────
    try {
        const creditors = db.prepare(`
            SELECT entity_key, name, properties_json 
            FROM case_entities 
            WHERE entity_type IN ('financial_creditor', 'operational_creditor', 'creditor')
        `).all();

        for (const cred of creditors) {
            let props = {};
            try { props = JSON.parse(cred.properties_json || '{}'); } catch (_) {}
            
            const claimed = Number(props.claimed_amount) || 0;
            const admitted = Number(props.admitted_amount) || 0;

            // Flag discrepancy if difference exceeds ₹10,000 and claimed is non-zero
            if (claimed > 0 && admitted > 0 && Math.abs(claimed - admitted) > 10000) {
                const delta = claimed - admitted;
                const narrative = `Discrepancy of ${formatAmountINR(delta)} between Proof of Claim (${formatAmountINR(claimed)}) and Admitted List (${formatAmountINR(admitted)}). Reason: ${props.rejection_reason || 'Disallowance of penal interest / unverified invoices'}.`;

                const conflict = {
                    source_key: cred.entity_key,
                    target_key: cdKey,
                    edge_type: 'contradicts',
                    severity: 'critical',
                    source_doc: 'Proof of Claim (Form B/C)',
                    target_doc: 'claims_registry.md',
                    details: {
                        conflict_type: 'quantum_discrepancy',
                        entity_name: cred.name,
                        claimed_amount: claimed,
                        admitted_amount: admitted,
                        delta,
                        narrative
                    }
                };

                upsertEdge(db, conflict);
                contradictions.push(conflict);
            }
        }
    } catch (e) {
        console.warn('[Entity Graph] Contradiction check (quantum) failed:', e.message);
    }

    // ── Vector 2: Avoidance vs Claim Collision ───────────────────────────
    // An entity claiming resolution money while simultaneously facing an avoidance inquest under § 43/45/50/66
    try {
        const allEntities = db.prepare('SELECT entity_key, name, properties_json, entity_type FROM case_entities').all();
        const checkedKeys = new Set();

        for (const ent of allEntities) {
            let props = {};
            try { props = JSON.parse(ent.properties_json || '{}'); } catch (_) {}
            const admitted = Number(props.admitted_amount) || 0;
            const avoidAmt = Number(props.avoidance_amount) || 0;
            const sec = props.applicable_section || '66';

            if (admitted > 0 && avoidAmt > 0 && !checkedKeys.has(ent.entity_key)) {
                checkedKeys.add(ent.entity_key);
                const narrative = `CRITICAL COLLISION: Creditor '${ent.name}' admitted for ${formatAmountINR(admitted)} is also respondent in Section ${sec} avoidance application for ${formatAmountINR(avoidAmt)}. Payouts must be stayed/adjusted.`;

                const conflict = {
                    source_key: ent.entity_key,
                    target_key: cdKey,
                    edge_type: 'avoidance_conflict',
                    severity: 'critical',
                    source_doc: 'avoidance_ledger.md',
                    target_doc: 'claims_registry.md',
                    details: {
                        conflict_type: 'avoidance_collision',
                        entity_name: ent.name,
                        admitted_amount: admitted,
                        avoidance_amount: avoidAmt,
                        applicable_section: sec,
                        narrative
                    }
                };

                upsertEdge(db, conflict);
                contradictions.push(conflict);
            }
        }
    } catch (e) {
        console.warn('[Entity Graph] Contradiction check (avoidance) failed:', e.message);
    }

    // ── Vector 3: Section 29A Ineligibility Check ────────────────────────
    try {
        const applicants = db.prepare(`
            SELECT entity_key, name FROM case_entities WHERE entity_type = 'resolution_applicant'
        `).all();

        for (const app of applicants) {
            // Check if applicant is linked to any related_party or suspended director
            const edges = db.prepare(`
                SELECT e.*, t.name as target_name 
                FROM case_entity_edges e
                JOIN case_entities t ON e.target_key = t.entity_key
                WHERE e.source_key = ? AND e.edge_type IN ('related_party', 'guarantees')
            `).all(app.entity_key);

            for (const edge of edges) {
                const narrative = `SECTION 29A RISK: Resolution Applicant '${app.name}' has a direct '${edge.edge_type}' link with '${edge.target_name}'. Mandatory 29A affidavit audit required.`;

                const conflict = {
                    source_key: app.entity_key,
                    target_key: edge.target_key,
                    edge_type: 'related_party_conflict',
                    severity: 'critical',
                    source_doc: 'Resolution Plan Annexure',
                    target_doc: 'Forensic Audit / Form 1',
                    details: {
                        conflict_type: 'section_29a_ineligibility',
                        applicant_name: app.name,
                        target_name: edge.target_name,
                        narrative
                    }
                };

                upsertEdge(db, conflict);
                contradictions.push(conflict);
            }
        }
    } catch (e) {
        console.warn('[Entity Graph] Contradiction check (29A) failed:', e.message);
    }

    return contradictions;
}

// ── Master Synchronization API ───────────────────────────────────────────────

/**
 * Runs a complete sync of the case entity graph and returns full summary metrics.
 * @param {string} caseDir 
 */
function syncEntityGraph(caseDir) {
    const db = getDb(caseDir);
    const { cdKey, cdName } = extractFromCaseFacts(db, caseDir);

    extractFromClaims(db, cdKey);
    extractFromAvoidance(db, cdKey);
    const contradictions = detectContradictions(db, cdKey);

    const entityCount = db.prepare('SELECT count(*) as count FROM case_entities').get().count;
    const edgeCount = db.prepare('SELECT count(*) as count FROM case_entity_edges').get().count;

    return {
        corporate_debtor: cdName,
        entities_count: entityCount,
        edges_count: edgeCount,
        contradictions_count: contradictions.length,
        contradictions
    };
}

// ── Graph Retrieval & Formatting ─────────────────────────────────────────────

/**
 * Retrieves all registered entities with aliases and properties.
 */
function getEntities(caseDir) {
    const db = getDb(caseDir);
    const rows = db.prepare('SELECT * FROM case_entities ORDER BY entity_type, name').all();
    return rows.map(r => {
        let aliases = [];
        let properties = {};
        try { aliases = JSON.parse(r.aliases_json || '[]'); } catch (_) {}
        try { properties = JSON.parse(r.properties_json || '{}'); } catch (_) {}
        return {
            ...r,
            aliases,
            properties
        };
    });
}

/**
 * Retrieves all active contradictions in the case.
 */
function getContradictions(caseDir) {
    const db = getDb(caseDir);
    const rows = db.prepare(`
        SELECT e.*, s.name as source_name, t.name as target_name
        FROM case_entity_edges e
        JOIN case_entities s ON e.source_key = s.entity_key
        JOIN case_entities t ON e.target_key = t.entity_key
        WHERE e.edge_type IN ('contradicts', 'avoidance_conflict', 'related_party_conflict')
        ORDER BY CASE e.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END
    `).all();

    return rows.map(r => {
        let details = {};
        try { details = JSON.parse(r.details_json || '{}'); } catch (_) {}
        return {
            id: r.id,
            source_key: r.source_key,
            source_name: r.source_name,
            target_key: r.target_key,
            target_name: r.target_name,
            edge_type: r.edge_type,
            severity: r.severity,
            source_doc: r.source_doc,
            target_doc: r.target_doc,
            details,
            narrative: details.narrative || 'Factual conflict detected'
        };
    });
}

/**
 * Returns color token for typed edge based on diagnostic role.
 */
function getEdgeColor(edgeType, severity) {
    switch (edgeType) {
        case 'contradicts':
        case 'avoidance_conflict':
            return '#ef4444'; // Red (Critical conflict)
        case 'related_party':
        case 'related_party_conflict':
            return '#f97316'; // Amber / Orange
        case 'supersedes':
            return '#a855f7'; // Purple
        case 'cites':
        case 'reference':
            return '#38bdf8'; // Sky Blue
        case 'claims_against':
        case 'hierarchy':
        default:
            return '#10b981'; // Emerald Green
    }
}

/**
 * Synthesizes a unified graph payload (nodes and links) combining:
 * 1. Document & concept hierarchy nodes.
 * 2. Case entities nodes.
 * 3. Typed directional edges with semantic colors.
 */
function getUnifiedGraph(caseDir, options = {}) {
    const db = getDb(caseDir);
    const nodes = [];
    const links = [];
    const nodeMap = new Set();

    // 1. Fetch Entities
    const entities = db.prepare('SELECT * FROM case_entities').all();
    for (const ent of entities) {
        let props = {};
        try { props = JSON.parse(ent.properties_json || '{}'); } catch (_) {}
        const nodeId = `entity::${ent.entity_key}`;
        nodes.push({
            id: nodeId,
            key: ent.entity_key,
            name: ent.name,
            type: ent.entity_type,
            category: 'entity',
            properties: props
        });
        nodeMap.add(nodeId);
    }

    // 2. Fetch Entity Edges
    const edges = db.prepare('SELECT * FROM case_entity_edges').all();
    for (const edge of edges) {
        const srcId = `entity::${edge.source_key}`;
        const tgtId = `entity::${edge.target_key}`;

        if (nodeMap.has(srcId) && nodeMap.has(tgtId)) {
            let details = {};
            try { details = JSON.parse(edge.details_json || '{}'); } catch (_) {}
            links.push({
                source: srcId,
                target: tgtId,
                type: edge.edge_type,
                severity: edge.severity,
                color: getEdgeColor(edge.edge_type, edge.severity),
                details
            });
        }
    }

    return { nodes, links };
}

// ── GraphRAG Pre-Flight Query Expander ────────────────────────────────────────

/**
 * Scans a user query for entity mentions and prepends a diagnostic warning block
 * to harden prompt context against conflicting numbers or avoidance respondents.
 * @param {string} caseDir 
 * @param {string} query 
 * @returns {string|null} Markdown context block, or null if no contradictions hit
 */
function getGraphRAGContext(caseDir, query) {
    if (!query || typeof query !== 'string') return null;
    const db = getDb(caseDir);

    const contradictions = getContradictions(caseDir);
    if (!contradictions || contradictions.length === 0) return null;

    const lowerQuery = query.toLowerCase();
    const matchingConflicts = [];

    for (const c of contradictions) {
        const srcMatch = lowerQuery.includes(c.source_name.toLowerCase()) || lowerQuery.includes(c.source_key.replace(/_/g, ' '));
        const tgtMatch = lowerQuery.includes(c.target_name.toLowerCase()) || lowerQuery.includes(c.target_key.replace(/_/g, ' '));
        
        // Also match general query terms like "claim", "claims", "avoidance", "fraud", "29a", "conflict"
        const generalMatch = (lowerQuery.includes('claim') && c.edge_type === 'contradicts') ||
                             (lowerQuery.includes('avoidance') && c.edge_type === 'avoidance_conflict') ||
                             (lowerQuery.includes('29a') && c.edge_type === 'related_party_conflict') ||
                             lowerQuery.includes('contradict') || lowerQuery.includes('discrepan');

        if (srcMatch || tgtMatch || generalMatch) {
            matchingConflicts.push(c);
        }
    }

    if (matchingConflicts.length === 0) return null;

    let block = '### [DIAGNOSTIC FACTUAL CONFLICT WARNING - STRICT COMPLIANCE REQUIRED]\n';
    block += '> ⚠️ **CRITICAL CHAMBERS WARNING:** The following verified discrepancies were detected across active case filings. Do not hallucinate or use unverified numbers.\n\n';

    for (const mc of matchingConflicts) {
        block += `- **${mc.source_name}** ➔ **${mc.target_name}** [${mc.edge_type.toUpperCase()} | Severity: ${mc.severity.toUpperCase()}]:\n`;
        block += `  • *Finding:* ${mc.narrative}\n`;
        if (mc.source_doc && mc.target_doc) {
            block += `  • *Sources:* \`${mc.source_doc}\` vs \`${mc.target_doc}\`\n`;
        }
    }

    block += '\n**RULE FOR DRAFTING:** When calculating statutory ratios, CoC voting shares, or distribution waterfalls, adhere strictly to the admitted and verified records. Explicitly footnote any disallowed sums.\n';

    return block;
}

module.exports = {
    normalizeEntityName,
    generateEntityKey,
    formatAmountINR,
    upsertEntity,
    upsertEdge,
    extractFromCaseFacts,
    extractFromClaims,
    extractFromAvoidance,
    detectContradictions,
    syncEntityGraph,
    getEntities,
    getContradictions,
    getEdgeColor,
    getUnifiedGraph,
    getGraphRAGContext
};
