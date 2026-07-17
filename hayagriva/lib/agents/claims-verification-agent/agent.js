const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../core/llm-client');
const { query } = require('../../core/rag');

class ClaimsVerificationAgent {
    constructor() {
        this.name = 'ClaimsVerificationAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Claims Agent] Analyzing query: "${userMessage}"`);
        
        // 1. Perform RAG query on claim files and invoices
        let dbContext = '';
        try {
            const searchResults = await query(caseDir, `claim details amount principal interest invoices bank receipt ${userMessage}`);
            if (searchResults && searchResults.results && searchResults.results.length > 0) {
                dbContext = 'Relevant Claim & Invoice Contexts:\n';
                searchResults.results.slice(0, 4).forEach((res, idx) => {
                    dbContext += `\n[Reference ${idx + 1}] (Source: ${res.id})\n${res.text}\n`;
                });
            }
        } catch (e) {
            console.error(`[Claims Agent] RAG query failed:`, e.message);
        }

        // Load claims registry JSON file if it exists in the case folder
        let registryData = '';
        try {
            const registryPath = path.join(caseDir, 'concepts', 'claims_registry.json');
            if (fs.existsSync(registryPath)) {
                registryData = `\nCurrent Claims Registry State:\n${fs.readFileSync(registryPath, 'utf8')}\n`;
            }
        } catch (e) {
            console.error(`[Claims Agent] Failed to read claims registry:`, e.message);
        }

        // 2. Build message payload
        const messages = [
            { role: 'system', content: this.instructions }
        ];

        history.forEach(h => {
            messages.push({ role: h.role, content: h.content });
        });

        let content = userMessage;
        if (dbContext || registryData) {
            content = `[Context Information]\n${dbContext}${registryData}\n\n[User Message]\n${userMessage}`;
        }
        messages.push({ role: 'user', content });

        return await getChatResponse(messages, { caseDir });
    }
}

module.exports = ClaimsVerificationAgent;
