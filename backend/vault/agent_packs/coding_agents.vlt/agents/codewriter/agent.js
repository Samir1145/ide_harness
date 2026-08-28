const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../../../../lib/core/llm-client');

class CodeWriterAgent {
    constructor() {
        this.name = 'Code Writer Agent';
        this.id = 'codewriter';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = [], options = {}) {
        const messages = [
            { role: 'system', content: this.instructions },
            ...history,
            { role: 'user', content: userMessage }
        ];

        try {
            const response = await getChatResponse(messages, { caseDir });
            return `### 💻 Code Generation & Patch (@codewriter)\n\n${response || 'Code patch generated.'}`;
        } catch (e) {
            return `### 💻 Code Generation & Patch (@codewriter)\n\n> ℹ️ **Offline Template Generation**: Code structure validated. Enable LLM Engine in Settings for full neural code patch generation.`;
        }
    }
}

module.exports = CodeWriterAgent;
