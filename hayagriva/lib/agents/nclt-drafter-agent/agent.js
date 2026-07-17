const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../core/llm-client');
const { query } = require('../../core/rag');

class NcltDrafterAgent {
    constructor() {
        this.name = 'NcltDrafterAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[NCLT Drafter Agent] Generating legal brief query: "${userMessage}"`);
        
        // 1. Query RAG for petition parameters and evidence details
        let dbContext = '';
        try {
            const searchResults = await query(caseDir, `legal petition synopsis date chronology corporate debtor grounds prayers NCLT application ${userMessage}`);
            if (searchResults && searchResults.results && searchResults.results.length > 0) {
                dbContext = 'Relevant Legal Brief Context:\n';
                searchResults.results.slice(0, 4).forEach((res, idx) => {
                    dbContext += `\n[Reference ${idx + 1}] (Source: ${res.id})\n${res.text}\n`;
                });
            }
        } catch (e) {
            console.error(`[NCLT Drafter Agent] RAG context retrieval failed:`, e.message);
        }

        // Load case variables dictionary
        let dictData = '';
        try {
            const dictPath = path.join(caseDir, 'concepts', 'case_kv_dictionary.json');
            if (fs.existsSync(dictPath)) {
                dictData = `\nCase Variables Registry:\n${fs.readFileSync(dictPath, 'utf8')}\n`;
            }
        } catch (e) {
            console.error(`[NCLT Drafter Agent] Failed to read case dictionary:`, e.message);
        }

        // 2. Build message log
        const messages = [
            { role: 'system', content: this.instructions }
        ];

        history.forEach(h => {
            messages.push({ role: h.role, content: h.content });
        });

        let content = userMessage;
        if (dbContext || dictData) {
            content = `[Context Information]\n${dbContext}${dictData}\n\n[User Message]\n${userMessage}`;
        }
        messages.push({ role: 'user', content });

        return await getChatResponse(messages, { caseDir });
    }
}

module.exports = NcltDrafterAgent;
