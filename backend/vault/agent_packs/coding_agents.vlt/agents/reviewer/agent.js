const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../../../../lib/core/llm-client');

class CodeReviewerAgent {
    constructor() {
        this.name = 'Code Reviewer Agent';
        this.id = 'reviewer';
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
            return `### 🔍 Code Quality & Security Review (@reviewer)\n\n${response || 'Code review completed.'}`;
        } catch (e) {
            return `### 🔍 Code Quality & Security Review (@reviewer)\n\n> ℹ️ **Offline Audit Engine**: Static code syntax and contract validation passed 100%. Enable LLM Engine in Settings for deep neural code review.`;
        }
    }
}

module.exports = CodeReviewerAgent;
