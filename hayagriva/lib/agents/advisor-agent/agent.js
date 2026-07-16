const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../core/llm-client');
const { retrieveContexts, replaceCitations } = require('../../core/rag');
const { resolveTrigger, searchLaws } = require('../../utils/vault-loader');

class AdvisorAgent {
    constructor() {
        this.name = 'AdvisorAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Advisor Agent] Analyzing query: "${userMessage}"`);
        
        // 1. Perform Case RAG retrieval to get case document contexts
        let dbContext = '';
        let contexts = [];
        try {
            contexts = await retrieveContexts(caseDir, userMessage);
            if (contexts && contexts.length > 0) {
                dbContext = 'Relevant Case Documents:\n';
                contexts.slice(0, 4).forEach((ctx, idx) => {
                    dbContext += `\n[Reference [source:${idx}]] (Source: ${ctx.docName} | Section/Page: ${ctx.title})\n${ctx.content}\n`;
                });
            }
        } catch (e) {
            console.error(`[Advisor Agent] Case database query failed:`, e.message);
        }

        // 2. Perform Law Vault lookup to query statutory codifications (e.g. IBC, Companies Act)
        let vaultContext = '';
        try {
            let trigger = null;
            const ibcMatch = userMessage.match(/(?:sec(?:tion)?\.?\s*|s)(\d+[a-z]?)(?:\s+of\s+ibc)?/i);
            const coMatch = userMessage.match(/(?:sec(?:tion)?\.?\s*|s)(\d+[a-z]?)\s+of\s+companies\s+act/i);
            
            if (coMatch) {
                trigger = `co/sec ${coMatch[1]}`;
            } else if (ibcMatch) {
                trigger = `ibc/sec ${ibcMatch[1]}`;
            } else {
                const generalMatch = userMessage.match(/(?:sec(?:tion)?\.?\s*|s)(\d+[a-z]?)/i);
                if (generalMatch) {
                    trigger = `ibc/sec ${generalMatch[1]}`;
                }
            }
            
            let matchedLaws = [];
            if (trigger) {
                console.log(`[Advisor Agent] Detected direct law trigger: "${trigger}"`);
                matchedLaws = await resolveTrigger(trigger, 3);
            }
            
            if (matchedLaws.length === 0) {
                console.log(`[Advisor Agent] Falling back to keyword search in Law Vault...`);
                matchedLaws = await searchLaws(userMessage, 3);
            }
            
            if (matchedLaws && matchedLaws.length > 0) {
                vaultContext = 'Relevant Law Vault Provisions:\n';
                matchedLaws.forEach((law, idx) => {
                    vaultContext += `\n[Law Reference ${idx + 1}] (Section: ${law.title} | ID: ${law.id})\n${law.text}\n`;
                });
            }
        } catch (vaultErr) {
            console.error(`[Advisor Agent] Law Vault query failed:`, vaultErr.message);
        }

        // 3. Build message log
        const messages = [
            { role: 'system', content: this.instructions }
        ];

        // Add history
        history.forEach(h => {
            messages.push({ role: h.role, content: h.content });
        });

        // Add active user turn with injected contexts
        let content = userMessage;
        const contextsToInject = [];
        if (vaultContext) contextsToInject.push(vaultContext);
        if (dbContext) contextsToInject.push(dbContext);
        
        if (contextsToInject.length > 0) {
            content = `[Context Information]\n${contextsToInject.join('\n\n')}\n\n[User Message]\n${userMessage}`;
        }
        messages.push({ role: 'user', content });

        // 4. Call LLM
        const answer = await getChatResponse(messages);
        return replaceCitations(answer, contexts);
    }
}

module.exports = AdvisorAgent;
