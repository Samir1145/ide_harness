const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../core/llm-client');
const { query } = require('../../core/rag');

class AdvisorAgent {
    constructor() {
        this.name = 'AdvisorAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Advisor Agent] Analyzing query: "${userMessage}"`);
        
        // 1. Perform RAG retrieval to get legal contexts
        let dbContext = '';
        try {
            const searchResults = await query(caseDir, userMessage);
            if (searchResults && searchResults.results && searchResults.results.length > 0) {
                dbContext = 'Relevant Law Vault Provisions:\n';
                searchResults.results.slice(0, 4).forEach((res, idx) => {
                    dbContext += `\n[Reference ${idx + 1}] (Source: ${res.id})\n${res.text}\n`;
                });
            }
        } catch (e) {
            console.error(`[Advisor Agent] Law database query failed:`, e.message);
        }

        // 2. Build message log
        const messages = [
            { role: 'system', content: this.instructions }
        ];

        // Add history
        history.forEach(h => {
            messages.push({ role: h.role, content: h.content });
        });

        // Add active user turn with injected context
        let content = userMessage;
        if (dbContext) {
            content = `[Context Information]\n${dbContext}\n\n[User Message]\n${userMessage}`;
        }
        messages.push({ role: 'user', content });

        // 3. Call LLM
        return await getChatResponse(messages);
    }
}

module.exports = AdvisorAgent;
