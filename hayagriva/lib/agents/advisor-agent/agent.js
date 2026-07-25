const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../core/llm-client');
const { retrieveContexts, replaceCitations } = require('../../core/rag');
const { formatContextBlock } = require('../skills/rag-retrieve');
const { vaultLookup, formatVaultBlock } = require('../skills/vault-lookup');
const { extractEntities } = require('../skills/entity-extract');
const { writeMultiKV } = require('../skills/kv-write');
const { appendToMarkdown } = require('../skills/md-append');

class AdvisorAgent {
    constructor() {
        this.name = 'AdvisorAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Advisor Agent] Analyzing query: "${userMessage}"`);
        
        // 1. Case RAG retrieval
        let contexts = [];
        let dbContext = '';
        try {
            contexts = await retrieveContexts(caseDir, userMessage);
            if (contexts && contexts.length > 0) {
                dbContext = formatContextBlock(contexts.slice(0, 4), 'Relevant Case Documents');
            }
        } catch (e) {
            console.error(`[Advisor Agent] Case RAG query failed:`, e.message);
        }

        // 2. Law Vault lookup via skill (trigger detection + keyword fallback)
        let vaultContext = '';
        try {
            const laws = await vaultLookup(userMessage, 3);
            vaultContext = formatVaultBlock(laws);
        } catch (e) {
            console.error(`[Advisor Agent] Law Vault query failed:`, e.message);
        }

        // 3. Entity extraction → write-back to KV dictionary (context enrichment loop)
        if (contexts.length > 0) {
            try {
                const combinedText = contexts.slice(0, 2).map(c => c.content).join('\n\n');
                const entities = await extractEntities(combinedText, caseDir);

                const kvPairs = {};
                if (entities.parties && entities.parties.length > 0) {
                    kvPairs['discovered_parties'] = entities.parties.join(', ');
                }
                if (entities.dates && entities.dates.length > 0) {
                    kvPairs['discovered_dates'] = entities.dates.map(d => d.raw).join(', ');
                }
                if (entities.amounts && entities.amounts.length > 0) {
                    kvPairs['discovered_amounts'] = entities.amounts.map(a => a.raw).join(', ');
                }
                if (Object.keys(kvPairs).length > 0) {
                    writeMultiKV(caseDir, kvPairs, contexts[0].docName, this.name);
                }
            } catch (e) {
                console.error(`[Advisor Agent] Entity extraction / write-back failed:`, e.message);
            }
        }

        // 4. Build prompt
        const messages = [{ role: 'system', content: this.instructions }];
        history.forEach(h => messages.push({ role: h.role, content: h.content }));

        const contextsToInject = [];
        if (vaultContext) contextsToInject.push(vaultContext);
        if (dbContext) contextsToInject.push(dbContext);

        let content = userMessage;
        if (contextsToInject.length > 0) {
            content = `[Context Information]\n${contextsToInject.join('\n\n')}\n\n[User Message]\n${userMessage}`;
        }
        messages.push({ role: 'user', content });

        // 5. Call LLM
        const answer = await getChatResponse(messages, { caseDir });
        const final = replaceCitations(answer, contexts);

        // 6. Write-back: append Q&A finding to case_facts.md
        try {
            const shortQ = userMessage.length > 80 ? userMessage.substring(0, 80) + '...' : userMessage;
            const shortA = final.length > 200 ? final.substring(0, 200) + '...' : final;
            appendToMarkdown(caseDir, 'case_facts.md', '## Advisor Agent Findings',
                `**Q:** ${shortQ}\n**A:** ${shortA}`, this.name);
        } catch (e) { /* non-fatal */ }

        return final;
    }
}

module.exports = AdvisorAgent;
