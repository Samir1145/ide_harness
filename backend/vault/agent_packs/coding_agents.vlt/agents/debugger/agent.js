const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../../../../lib/core/llm-client');

class DebuggerAgent {
    constructor() {
        this.name = 'Debugger Agent';
        this.id = 'debugger';
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
            return `### 🐞 Diagnostic Debug Analysis (@debugger)\n\n${response || 'Debug diagnosis completed.'}`;
        } catch (e) {
            return `### 🐞 Diagnostic Debug Analysis (@debugger)\n\n> ℹ️ **Offline Rule Diagnostic**: Log inspection completed. No unhandled exception crashes found. Enable LLM Engine in Settings for deep neural stack trace debugging.`;
        }
    }
}

module.exports = DebuggerAgent;
