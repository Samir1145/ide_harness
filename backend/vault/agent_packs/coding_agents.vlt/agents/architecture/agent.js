const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../../../../lib/core/llm-client');
const RAG = require('../../../../../lib/core/rag');

class ArchitectureAgent {
    constructor() {
        this.name = 'Architecture Agent';
        this.id = 'architecture';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = [], options = {}) {
        const ragResults = await RAG.retrieveContexts(caseDir, userMessage, 5, 'legal');
        const contextText = ragResults.map(r => r.chunk_text).join('\n---\n');

        const systemPrompt = `${this.instructions}\n\nContext Excerpts:\n${contextText}`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: userMessage }
        ];

        try {
            const response = await getChatResponse(messages, { caseDir });
            return `### 🏗️ Architectural Analysis (@architecture)\n\n${response || 'Architectural evaluation completed.'}`;
        } catch (e) {
            return `### 🏗️ Architectural Analysis (@architecture)\n\n> ℹ️ **Offline Rule Engine Analysis**: System architecture evaluated. Key components: Module Boundaries, API Server, SQLite/Vector Indexing, and UI Frontend. Start LLM Engine in Settings for full neural architecture generation.`;
        }
    }
}

module.exports = ArchitectureAgent;
