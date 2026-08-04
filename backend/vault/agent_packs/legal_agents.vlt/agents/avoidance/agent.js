const fs = require('fs');
const path = require('path');
const { getConceptsDir } = require('../../../../../lib/pipeline/common/helper');
const { getChatResponse } = require('../../../../../lib/core/llm-client');
const { ragRetrieve, formatContextBlock } = require('../../../../../lib/agents/skills/rag-retrieve');
const { extractEntities, extractDates } = require('../../../../../lib/agents/skills/entity-extract');
const { writeCaseKV } = require('../../../../../lib/agents/skills/kv-write');
const { appendTableRow } = require('../../../../../lib/agents/skills/md-append');
const { vaultLookup } = require('../../../../../lib/agents/skills/vault-lookup');
const { buildLiteFallback } = require('../../../../../lib/agents/skills/lite-fallback');

// IBC lookback windows (in months from insolvency commencement date)
const IBC_LOOKBACK = {
    sec43_related_party: 24,   // Sec 43: Preferential — 2 yrs for related party
    sec43_others:        12,   // Sec 43: Preferential — 1 yr for others
    sec45_undervalue:    24,   // Sec 45: Undervalued transaction — 2 yrs
    sec46_undervalue_rp: 24,   // Sec 46: Undervalued — related party — 2 yrs
    sec49_extortionate:  Infinity, // Sec 49: Extortionate credit — any time
    sec66_fraudulent:    Infinity, // Sec 66: Fraudulent trading — any time
};

function monthsBetween(d1, d2) {
    return (d2 - d1) / (1000 * 60 * 60 * 24 * 30.44);
}

function parseFlexDate(str) {
    if (!str) return null;
    const d = new Date(str);
    return isNaN(d) ? null : d;
}

class AvoidanceScannerAgent {
    constructor() {
        this.name = 'AvoidanceScannerAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Avoidance Scanner Agent] Running avoidance scan...`);

        // Load CIRP commencement date from KV (needed for lookback calculations)
        let cirpDate = null;
        const kvPath = path.join(getConceptsDir(caseDir), 'case_kv_dictionary.json');
        if (fs.existsSync(kvPath)) {
            try {
                const kv = JSON.parse(fs.readFileSync(kvPath, 'utf8'));
                const dateStr = kv['date_of_cirp_commencement']?.value || kv['date_of_admission']?.value;
                cirpDate = parseFlexDate(dateStr);
            } catch (e) { /* no kv yet */ }
        }

        // 1. Multi-query RAG sweep for financial transactions
        const avoidanceQueries = [
            'related party transactions transfers payments preferential',
            'undervalue transaction below market consideration',
            'cash payment large amount director shareholder',
            'loan repayment before insolvency commencement preference',
            'fraudulent trading deception creditor defraud',
            'extortionate credit unconscionable terms interest',
            'property transfer encumbrance charge created',
            'dividend paid distribution shareholders before default',
        ];

        let allChunks = [];
        for (const q of avoidanceQueries) {
            const chunks = await ragRetrieve(caseDir, q, 2);
            allChunks = allChunks.concat(chunks);
        }
        // Deduplicate
        const seen = new Set();
        allChunks = allChunks.filter(c => {
            const k = `${c.docName}::${c.title}`;
            if (seen.has(k)) return false;
            seen.add(k); return true;
        });

        // 2. Load existing avoidance ledger
        let existingLedger = '';
        const ledgerPath = path.join(getConceptsDir(caseDir), 'avoidance_transactions.json');
        if (fs.existsSync(ledgerPath)) {
            existingLedger = fs.readFileSync(ledgerPath, 'utf8');
        }

        // 3. Extract entities + flag transactions
        const flagged = [];
        const ibcLaws = await vaultLookup('preferential undervalue avoidance transaction IBC section 43 45 49 66', 2);

        for (const chunk of allChunks.slice(0, 8)) {
            try {
                const entities = await extractEntities(chunk.content, caseDir);
                const dates = entities.dates || [];
                const amounts = entities.amounts || [];

                if (amounts.length === 0) continue; // No financial transaction here

                for (const dateObj of dates) {
                    const txDate = parseFlexDate(dateObj.raw);
                    if (!txDate) continue;

                    const monthsBack = cirpDate ? monthsBetween(txDate, cirpDate) : null;

                    // Determine applicable IBC sections
                    const applicableSections = [];
                    if (monthsBack !== null) {
                        if (monthsBack <= IBC_LOOKBACK.sec43_others)        applicableSections.push('Sec 43 (Preferential)');
                        if (monthsBack <= IBC_LOOKBACK.sec45_undervalue)     applicableSections.push('Sec 45 (Undervalue)');
                    }
                    applicableSections.push('Sec 66 (Fraudulent — check manually)');

                    const flag = {
                        date: dateObj.raw,
                        amounts: amounts.map(a => a.raw).join(', '),
                        parties: (entities.parties || []).join(', '),
                        source: chunk.docName,
                        months_before_cirp: monthsBack !== null ? Math.round(monthsBack) : 'CIRP date unknown',
                        applicable_sections: applicableSections,
                        severity: applicableSections.length > 1 ? '🔴 HIGH' : '🟡 REVIEW',
                    };

                    flagged.push(flag);

                    // Write-back to avoidance_ledger.md
                    appendTableRow(
                        caseDir,
                        'avoidance_ledger.md',
                        ['Date', 'Amount', 'Parties', 'Months Pre-CIRP', 'Sections', 'Severity', 'Source'],
                        [flag.date, flag.amounts, flag.parties || '—', flag.months_before_cirp, applicableSections.join(', '), flag.severity, flag.source],
                        this.name
                    );
                }
            } catch (e) { /* non-fatal per chunk */ }
        }

        // 4. Save flagged transactions as JSON
        if (flagged.length > 0) {
            try {
                fs.writeFileSync(ledgerPath, JSON.stringify(flagged, null, 2), 'utf8');
                writeCaseKV(caseDir, 'avoidance_flags_count', String(flagged.length), 'AvoidanceAgent', this.name);
            } catch (e) { /* non-fatal */ }
        }

        // 5. Build LLM context for narrative summary
        const lawContext = ibcLaws.map((l, i) => `[IBC Provision ${i+1}] ${l.title}\n${l.text}`).join('\n\n');
        const scanSummary = `[Avoidance Scan Summary]
- Documents scanned: ${allChunks.length}
- Transactions flagged: ${flagged.length}
- CIRP commencement date: ${cirpDate ? cirpDate.toDateString() : 'Not found in KV — results are approximate'}

${flagged.slice(0, 5).map((f, i) => `${i+1}. [${f.severity}] ${f.date} — ${f.amounts} — ${f.applicable_sections.join(', ')} (Source: ${f.source})`).join('\n')}
${flagged.length > 5 ? `\n... and ${flagged.length - 5} more. See avoidance_ledger.md` : ''}`;

        const contextBlock = formatContextBlock(allChunks.slice(0, 3), 'Financial Transaction Documents');

        // Build lite-mode pre-block from the fully computed flagged[] table
        const flaggedTable = flagged.length > 0
            ? `#### 🔍 Avoidance Scan Results — ${flagged.length} Transaction(s) Flagged\n\n` +
              `| Date | Amount | Parties | Months Pre-CIRP | Sections | Severity |\n|---|---|---|---|---|---|\n` +
              flagged.slice(0, 8).map(f =>
                  `| ${f.date} | ${f.amounts} | ${f.parties || '—'} | ${f.months_before_cirp} | ${f.applicable_sections.join(', ')} | ${f.severity} |`
              ).join('\n') +
              `\n\n> Full ledger written to \`avoidance_ledger.md\``
            : `> No avoidance transactions flagged in ${allChunks.length} document chunks scanned.`;

        const messages = [{ role: 'system', content: this.instructions }];
        history.forEach(h => messages.push({ role: h.role, content: h.content }));
        messages.push({
            role: 'user',
            content: `${scanSummary}\n\n${lawContext ? 'Relevant IBC Provisions:\n' + lawContext + '\n\n' : ''}${contextBlock}\n\n[User Message]\n${userMessage}`
        });

        try {
            return await getChatResponse(messages, { caseDir });
        } catch (e) {
            if (e.code === 'LITE_MODE' || e.code === 'CONTEXT_EXCEEDED') {
                return buildLiteFallback({
                    caseDir, agentName: 'Avoidance Scanner', agentIcon: '🔍',
                    userMessage, contexts: allChunks.slice(0, 3),
                    vaultText: ibcLaws.map(l => `**${l.title}:** ${(l.text || '').substring(0, 200)}`).join('\n\n'),
                    preBlock: flaggedTable, writeBack: true
                });
            }
            throw e;
        }
    }
}

module.exports = AvoidanceScannerAgent;
