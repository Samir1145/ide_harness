const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../core/llm-client');
const { ragRetrieve, formatContextBlock } = require('../skills/rag-retrieve');
const { vaultLookup, formatVaultBlock } = require('../skills/vault-lookup');
const { readAllKV } = require('../skills/kv-write');

class ComplianceAgent {
    constructor() {
        this.name = 'ComplianceAgent';
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Compliance Agent] Auditing resolution plan compliance...`);

        // 1. RAG retrieval for resolution plan details
        const planQueries = [
            'resolution plan section 30 mandatory contents upfront payment',
            'section 29A eligibility declaration affidavit disqualification',
            'operational creditors payment liquidation value priority',
            'implementation schedule supervision monitoring committee',
        ];

        let planChunks = [];
        for (const q of planQueries) {
            const chunks = await ragRetrieve(caseDir, q, 2);
            planChunks = planChunks.concat(chunks);
        }

        // 2. Vault lookup for Section 29A & Section 30(2) laws
        const laws = await vaultLookup('Section 29A Section 30 mandatory contents resolution plan IBC', 3);
        const vaultBlock = formatVaultBlock(laws);

        const kv = readAllKV(caseDir);
        const kvBlock = Object.keys(kv).length > 0
            ? `Case Metadata:\n${Object.entries(kv).map(([k,v]) => `- ${k}: ${v}`).join('\n')}`
            : '';

        const messages = [
            {
                role: 'system',
                content: `You are HAYAGRIVA, a resolution plan compliance auditor.
Audit the resolution plan against IBC Section 29A (eligibility) and Section 30(2) (statutory mandatory contents).
Provide a structured compliance matrix:
- Sec 30(2)(a) Operational Creditor Dues: PASS/FAIL/REVIEW
- Sec 30(2)(b) Dissenting Financial Creditors Dues: PASS/FAIL/REVIEW
- Sec 30(2)(c) Insolvency Resolution Process Costs: PASS/FAIL/REVIEW
- Sec 30(2)(d) Management & Control: PASS/FAIL/REVIEW
- Sec 30(2)(e) Implementation & Supervision: PASS/FAIL/REVIEW
- Sec 29A Eligibility Verification: PASS/FAIL/REVIEW`
            }
        ];
        history.forEach(h => messages.push({ role: h.role, content: h.content }));
        messages.push({
            role: 'user',
            content: `${vaultBlock}\n\n${formatContextBlock(planChunks.slice(0, 4), 'Resolution Plan Excerpts')}\n\n${kvBlock}\n\n[User Instruction]\n${userMessage}`
        });

        return await getChatResponse(messages, { caseDir });
    }
}

module.exports = ComplianceAgent;
