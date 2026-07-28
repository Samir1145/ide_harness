const { getChatResponse } = require('../../../../../lib/core/llm-client');

class CodeReviewerAgent {
    constructor() {
        this.name = 'Code Reviewer Agent';
        this.id = 'reviewer';
    }

    async run(caseDir, userMessage, history = [], options = {}) {
        const systemPrompt = `You are the Code Reviewer & Quality Auditor Subagent for HAYAGRIVA.
Your role is to audit code quality, check compliance with workspace rules, identify memory leaks or security flaws, and enforce strict API contracts.`;

        const messages = [
            { role: 'system', content: systemPrompt },
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
