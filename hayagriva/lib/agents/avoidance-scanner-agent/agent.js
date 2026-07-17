const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../core/llm-client');
const { query } = require('../../core/rag');

class AvoidanceScannerAgent {
    constructor() {
        this.name = 'AvoidanceScannerAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Avoidance Scanner Agent] Scanning ledgers query: "${userMessage}"`);
        
        // 1. Query RAG for related party disclosures, ledgers, transfers
        let dbContext = '';
        try {
            const searchResults = await query(caseDir, `related parties transfers transactions ledgers cashbook avoidance undervalue preference fraud ${userMessage}`);
            if (searchResults && searchResults.results && searchResults.results.length > 0) {
                dbContext = 'Relevant Financial Transactions Context:\n';
                searchResults.results.slice(0, 4).forEach((res, idx) => {
                    dbContext += `\n[Reference ${idx + 1}] (Source: ${res.id})\n${res.text}\n`;
                });
            }
        } catch (e) {
            console.error(`[Avoidance Scanner Agent] RAG transactions query failed:`, e.message);
        }

        // Load avoidance records from case folder if available
        let avoidanceData = '';
        try {
            const ledgerPath = path.join(caseDir, 'concepts', 'avoidance_transactions.json');
            if (fs.existsSync(ledgerPath)) {
                avoidanceData = `\nActive Avoidance Candidates Log:\n${fs.readFileSync(ledgerPath, 'utf8')}\n`;
            }
        } catch (e) {
            console.error(`[Avoidance Scanner Agent] Failed to read avoidance records:`, e.message);
        }

        // 2. Build message log
        const messages = [
            { role: 'system', content: this.instructions }
        ];

        history.forEach(h => {
            messages.push({ role: h.role, content: h.content });
        });

        let content = userMessage;
        if (dbContext || avoidanceData) {
            content = `[Context Information]\n${dbContext}${avoidanceData}\n\n[User Message]\n${userMessage}`;
        }
        messages.push({ role: 'user', content });

        return await getChatResponse(messages, { caseDir });
    }
}

module.exports = AvoidanceScannerAgent;
