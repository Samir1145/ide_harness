const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../../../../lib/core/llm-client');
const { retrieveContexts, replaceCitations } = require('../../../../../lib/core/rag');
const { formatContextBlock } = require('../../../../../lib/agents/skills/rag-retrieve');
const { vaultLookup, formatVaultBlock } = require('../../../../../lib/agents/skills/vault-lookup');
const { appendToMarkdown } = require('../../../../../lib/agents/skills/md-append');

class PlanEvaluatorAgent {
    constructor() {
        this.name = 'PlanEvaluatorAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Plan Evaluator Agent] Auditing request: "${userMessage}"`);

        // 1. Retrieve Resolution Plan & Claims Context
        let contexts = [];
        let dbContext = '';
        try {
            contexts = await retrieveContexts(caseDir, userMessage);
            if (contexts && contexts.length > 0) {
                dbContext = formatContextBlock(contexts.slice(0, 4), 'Relevant Resolution Plan & Valuation Context');
            }
        } catch (e) {
            console.error(`[Plan Evaluator] RAG retrieval error:`, e.message);
        }

        // 2. Law Vault lookup for Sec 30(2) & Sec 29A
        let vaultContext = '';
        try {
            const laws = await vaultLookup('Section 30(2) Section 29A Form H Regulation 39(4)', 4);
            vaultContext = formatVaultBlock(laws);
        } catch (e) {}

        // 3. Build LLM prompt
        const messages = [{ role: 'system', content: this.instructions }];
        history.forEach(h => messages.push({ role: h.role, content: h.content }));

        const contextsToInject = [];
        if (vaultContext) contextsToInject.push(vaultContext);
        if (dbContext) contextsToInject.push(dbContext);

        let content = userMessage;
        if (contextsToInject.length > 0) {
            content = `[Context Information]\n${contextsToInject.join('\n\n')}\n\n[User Request]\n${userMessage}`;
        }
        messages.push({ role: 'user', content });

        // 4. Generate audit response
        let answer = '';
        try {
            answer = await getChatResponse(messages, { caseDir });
        } catch (e) {
            if (e.code === 'LITE_MODE') {
                answer = `### ⚖️ Resolution Plan Evaluation Matrix (Lite Mode)\n\n` +
                         `*LLM Engine is offline. Basic Section 30(2) & 29A checklist below:*\n\n` +
                         `| Clause | Statutory Parameter | Mandatory Requirement | Status |\n` +
                         `| :--- | :--- | :--- | :---: |\n` +
                         `| **Sec 30(2)(a)** | CIRP Costs | 100% Priority Payment | 🔍 Pending Review |\n` +
                         `| **Sec 30(2)(b)** | Operational Creditors | $\\ge$ Liquidation Value / Resolution Value | 🔍 Pending Review |\n` +
                         `| **Sec 30(2)(c)** | Management | Operations of CD after Approval | 🔍 Pending Review |\n` +
                         `| **Sec 30(2)(d)** | Implementation | Supervision Committee | 🔍 Pending Review |\n` +
                         `| **Sec 29A** | Eligibility | No NPA (>1yr), Disqualified Director, Convictions | 🔍 Pending Affidavit |\n\n` +
                         `To compile full Form H Compliance Certificates and AI audit summaries, start the LLM engine in Settings.`;
            } else {
                throw e;
            }
        }

        const final = replaceCitations(answer, contexts);

        // 5. Append audit result to drafts/form_h_evaluation.md
        try {
            appendToMarkdown(caseDir, 'drafts/form_h_evaluation.md', '## Plan Evaluator Audit Report',
                `### Query: ${userMessage}\n\n${final}`, this.name);
        } catch (_) {}

        return final;
    }
}

module.exports = PlanEvaluatorAgent;
