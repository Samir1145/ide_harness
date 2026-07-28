const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../../../../lib/core/llm-client');
const { retrieveContexts, replaceCitations } = require('../../../../../lib/core/rag');
const { formatContextBlock } = require('../../../../../lib/agents/skills/rag-retrieve');
const { vaultLookup, formatVaultBlock } = require('../../../../../lib/agents/skills/vault-lookup');
const { appendToMarkdown } = require('../../../../../lib/agents/skills/md-append');

class CoCCoordinatorAgent {
    constructor() {
        this.name = 'CoCCoordinatorAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    /**
     * Calculates voting shares from a list of financial creditors.
     * Excludes related parties (isRelatedParty === true).
     */
    calculateVotingShares(creditors = []) {
        const unrelatedCreditors = creditors.filter(c => !c.isRelatedParty);
        const totalUnrelatedDebt = unrelatedCreditors.reduce((sum, c) => sum + (c.admittedAmount || 0), 0);

        return creditors.map(c => {
            if (c.isRelatedParty || totalUnrelatedDebt === 0) {
                return { ...c, votingShare: 0, votingStatus: 'Excluded (Related Party)' };
            }
            const share = ((c.admittedAmount || 0) / totalUnrelatedDebt) * 100;
            return {
                ...c,
                votingShare: parseFloat(share.toFixed(2)),
                votingStatus: 'Eligible'
            };
        });
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[CoC Coordinator Agent] Processing request: "${userMessage}"`);

        // 1. Retrieve case context (claims, CoC files)
        let contexts = [];
        let dbContext = '';
        try {
            contexts = await retrieveContexts(caseDir, userMessage);
            if (contexts && contexts.length > 0) {
                dbContext = formatContextBlock(contexts.slice(0, 4), 'Relevant Case Claims & CoC Documents');
            }
        } catch (e) {
            console.error(`[CoC Coordinator] RAG retrieval error:`, e.message);
        }

        // 2. Law Vault lookup for IBC Section 21 / 24 / 25A
        let vaultContext = '';
        try {
            const laws = await vaultLookup('Committee of Creditors voting share Section 21 Section 24', 3);
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

        // 4. Generate response
        let answer = '';
        try {
            answer = await getChatResponse(messages, { caseDir });
        } catch (e) {
            if (e.code === 'LITE_MODE') {
                answer = `### 📋 CoC Governance Summary (Lite Mode)\n\n` +
                         `*LLM Engine is offline. Basic CoC template structure below:*\n\n` +
                         `#### CoC Voting Share Formula\n` +
                         `$$\\text{Voting Share}_i = \\left( \\frac{\\text{Admitted Debt}_i}{\\sum \\text{Unrelated Debt}} \\right) \\times 100\\%$$\n\n` +
                         `> **Statutory Rule (Sec 21(2))**: Related party financial creditors have **0% voting share**.\n\n` +
                         `To generate full notices, ballots, and voting summaries, start the LLM engine in Settings.`;
            } else {
                throw e;
            }
        }

        const final = replaceCitations(answer, contexts);

        // 5. Append finding to drafts/coc_governance_summary.md
        try {
            appendToMarkdown(caseDir, 'drafts/coc_governance_summary.md', '## CoC Coordinator Output',
                `### Query: ${userMessage}\n\n${final}`, this.name);
        } catch (_) {}

        return final;
    }
}

module.exports = CoCCoordinatorAgent;
