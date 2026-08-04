const fs = require('fs');
const path = require('path');
const { getConceptsDir } = require('../../../../../lib/pipeline/common/helper');
const { getChatResponse } = require('../../../../../lib/core/llm-client');
const { query } = require('../../../../../lib/core/rag');
const { buildLiteFallback } = require('../../../../../lib/agents/skills/lite-fallback');

class ImCompilerAgent {
    constructor() {
        this.name = 'ImCompilerAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[IM Agent] Running compilation query: "${userMessage}"`);
        
        // 1. Get company details and liabilities context
        let dbContext = '';
        try {
            const searchResults = await query(caseDir, `corporate debtor details capital structure shareholding assets liabilities lawsuits ${userMessage}`);
            if (searchResults && searchResults.results && searchResults.results.length > 0) {
                dbContext = 'Relevant Corporate Debtor Information:\n';
                searchResults.results.slice(0, 4).forEach((res, idx) => {
                    dbContext += `\n[Reference ${idx + 1}] (Source: ${res.id})\n${res.text}\n`;
                });
            }
        } catch (e) {
            console.error(`[IM Agent] RAG context retrieval failed:`, e.message);
        }

        // Load case variables dictionary
        let dictData = '';
        try {
            const dictPath = path.join(getConceptsDir(caseDir), 'case_kv_dictionary.json');
            if (fs.existsSync(dictPath)) {
                dictData = `\nCase Variables Registry:\n${fs.readFileSync(dictPath, 'utf8')}\n`;
            }
        } catch (e) {
            console.error(`[IM Agent] Failed to read case dictionary:`, e.message);
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

        try {
            return await getChatResponse(messages, { caseDir });
        } catch (e) {
            if (e.code === 'LITE_MODE' || e.code === 'CONTEXT_EXCEEDED') {
                return buildLiteFallback({
                    caseDir, agentName: 'Insolvency Manager', agentIcon: '🏛️',
                    userMessage, contexts: contexts || [], writeBack: true
                });
            }
            throw e;
        }
    }
}

module.exports = ImCompilerAgent;
