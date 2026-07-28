const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../../../../lib/core/llm-client');
const { query } = require('../../../../../lib/core/rag');

class LitigationTrackerAgent {
    constructor() {
        this.name = 'LitigationTrackerAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Litigation Agent] Processing litigation queries: "${userMessage}"`);
        
        // 1. Query RAG for lawsuits, court notices, disputed claims
        let dbContext = '';
        try {
            const searchResults = await query(caseDir, `lawsuits dispute court NCLT NCLAT appeal pending litigation claim ${userMessage}`);
            if (searchResults && searchResults.results && searchResults.results.length > 0) {
                dbContext = 'Relevant Litigation Contexts:\n';
                searchResults.results.slice(0, 4).forEach((res, idx) => {
                    dbContext += `\n[Reference ${idx + 1}] (Source: ${res.id})\n${res.text}\n`;
                });
            }
        } catch (e) {
            console.error(`[Litigation Agent] RAG litigation search failed:`, e.message);
        }

        // Load litigation checklist logs if available
        let litigationLogs = '';
        try {
            const listPath = path.join(caseDir, 'concepts', 'litigation_tracker.json');
            if (fs.existsSync(listPath)) {
                litigationLogs = `\nActive Litigation Registry:\n${fs.readFileSync(listPath, 'utf8')}\n`;
            }
        } catch (e) {
            console.error(`[Litigation Agent] Failed to read litigation logs:`, e.message);
        }

        // 2. Build message log
        const messages = [
            { role: 'system', content: this.instructions }
        ];

        history.forEach(h => {
            messages.push({ role: h.role, content: h.content });
        });

        let content = userMessage;
        if (dbContext || litigationLogs) {
            content = `[Context Information]\n${dbContext}${litigationLogs}\n\n[User Message]\n${userMessage}`;
        }
        messages.push({ role: 'user', content });

        return await getChatResponse(messages, { caseDir });
    }
}

module.exports = LitigationTrackerAgent;
