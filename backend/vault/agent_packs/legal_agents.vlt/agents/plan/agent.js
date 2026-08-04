const fs = require('fs');
const path = require('path');
const { getConceptsDir } = require('../../../../../lib/pipeline/common/helper');
const { getChatResponse } = require('../../../../../lib/core/llm-client');
const { query } = require('../../../../../lib/core/rag');
const { buildLiteFallback } = require('../../../../../lib/agents/skills/lite-fallback');

class ResolutionPlanEvaluatorAgent {
    constructor() {
        this.name = 'ResolutionPlanEvaluatorAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Plan Evaluator Agent] Auditing plan query: "${userMessage}"`);
        
        // 1. Query plan document sections and waterfall payouts
        let dbContext = '';
        try {
            const searchResults = await query(caseDir, `resolution plan payment priority operational creditors dissenters CIRP costs ${userMessage}`);
            if (searchResults && searchResults.results && searchResults.results.length > 0) {
                dbContext = 'Relevant Resolution Plan Content:\n';
                searchResults.results.slice(0, 4).forEach((res, idx) => {
                    dbContext += `\n[Reference ${idx + 1}] (Source: ${res.id})\n${res.text}\n`;
                });
            }
        } catch (e) {
            console.error(`[Plan Evaluator Agent] RAG context search failed:`, e.message);
        }

        // Load asset liquidation values and claims registry
        let valuationData = '';
        try {
            const registryPath = path.join(getConceptsDir(caseDir), 'claims_registry.json');
            if (fs.existsSync(registryPath)) {
                valuationData = `\nAdmitted Claims Reference:\n${fs.readFileSync(registryPath, 'utf8')}\n`;
            }
        } catch (e) {
            console.error(`[Plan Evaluator Agent] Failed to read claims registry:`, e.message);
        }

        // 2. Build message log
        const messages = [
            { role: 'system', content: this.instructions }
        ];

        history.forEach(h => {
            messages.push({ role: h.role, content: h.content });
        });

        let content = userMessage;
        if (dbContext || valuationData) {
            content = `[Context Information]\n${dbContext}${valuationData}\n\n[User Message]\n${userMessage}`;
        }
        messages.push({ role: 'user', content });

        try {
            return await getChatResponse(messages, { caseDir });
        } catch (e) {
            if (e.code === 'LITE_MODE' || e.code === 'CONTEXT_EXCEEDED') {
                return buildLiteFallback({
                    caseDir, agentName: 'Resolution Plan', agentIcon: '📑',
                    userMessage, contexts: contexts || [], writeBack: true
                });
            }
            throw e;
        }
    }
}

module.exports = ResolutionPlanEvaluatorAgent;
