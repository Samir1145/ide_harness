const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../../../../lib/core/llm-client');
const { ragRetrieve, formatContextBlock } = require('../../../../../lib/agents/skills/rag-retrieve');
const { extractEntities, extractAmounts } = require('../../../../../lib/agents/skills/entity-extract');
const { writeCaseKV, readAllKV } = require('../../../../../lib/agents/skills/kv-write');
const { appendTableRow } = require('../../../../../lib/agents/skills/md-append');

class ClaimsVerificationAgent {
    constructor() {
        this.name = 'ClaimsVerificationAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Claims Verification Agent] Running verification...`);

        // 1. Load existing claims_registry.md for known claims
        let registryData = '';
        const registryPath = path.join(caseDir, 'claims_registry.md');
        if (fs.existsSync(registryPath)) {
            registryData = fs.readFileSync(registryPath, 'utf8');
        }

        // 2. RAG retrieval for claim-related document chunks
        const claimsQueries = [
            'claim amount outstanding dues financial creditor',
            'claim amount operational creditor invoice',
            'total debt exposure loan outstanding',
            'principal interest penal interest calculation',
            'claim verification resolution professional'
        ];

        let allChunks = [];
        for (const q of claimsQueries) {
            const chunks = await ragRetrieve(caseDir, q, 2);
            allChunks = allChunks.concat(chunks);
        }

        // Deduplicate chunks by docName + title
        const seen = new Set();
        allChunks = allChunks.filter(c => {
            const k = `${c.docName}::${c.title}`;
            if (seen.has(k)) return false;
            seen.add(k); return true;
        });

        // 3. Entity extraction across all retrieved chunks
        const verifiedClaims = [];
        const discrepancies = [];
        const kv = readAllKV(caseDir);

        for (const chunk of allChunks.slice(0, 6)) {
            try {
                const entities = await extractEntities(chunk.content, caseDir);
                const amounts = entities.amounts || [];
                const parties = entities.parties || [];

                for (const amount of amounts) {
                    // Cross-reference against KV dictionary known values
                    const knownTotal = kv['total_claim_amount'];
                    const isMismatch = knownTotal && !chunk.content.includes(knownTotal);

                    const claim = {
                        creditor: parties[0] || 'Unknown',
                        amount: amount.raw,
                        source: chunk.docName,
                        section: chunk.title,
                        verified: !isMismatch,
                        flag: isMismatch ? '⚠️ MISMATCH' : '✅ VERIFIED'
                    };

                    if (isMismatch) discrepancies.push(claim);
                    else verifiedClaims.push(claim);

                    // Write-back each claim row to claims_registry.md
                    appendTableRow(
                        caseDir,
                        'claims_registry.md',
                        ['Creditor', 'Amount', 'Source', 'Status'],
                        [claim.creditor, claim.amount, claim.source, claim.flag],
                        this.name
                    );
                }
            } catch (e) { /* non-fatal per chunk */ }
        }

        // 4. Write summary to KV
        if (verifiedClaims.length > 0) {
            writeCaseKV(caseDir, 'claims_verified_count', String(verifiedClaims.length), 'ClaimsAgent', this.name);
        }
        if (discrepancies.length > 0) {
            writeCaseKV(caseDir, 'claims_discrepancy_count', String(discrepancies.length), 'ClaimsAgent', this.name);
        }

        // 5. Build LLM context for summary response
        const contextBlock = formatContextBlock(allChunks.slice(0, 4), 'Retrieved Claim Documents');
        const summaryBlock = `[Claims Verification Summary]
- Chunks analysed: ${allChunks.length}
- Claims verified: ${verifiedClaims.length}
- Discrepancies flagged: ${discrepancies.length}
${discrepancies.length > 0 ? '\n[Discrepancies]\n' + discrepancies.map(d => `- ${d.creditor}: ${d.amount} (${d.source})`).join('\n') : ''}
${registryData ? '\n[Existing Claims Registry]\n' + registryData.substring(0, 400) : ''}`;

        const messages = [{ role: 'system', content: this.instructions }];
        history.forEach(h => messages.push({ role: h.role, content: h.content }));
        messages.push({ role: 'user', content: `${summaryBlock}\n\n${contextBlock}\n\n[User Message]\n${userMessage}` });

        return await getChatResponse(messages, { caseDir });
    }
}

module.exports = ClaimsVerificationAgent;
