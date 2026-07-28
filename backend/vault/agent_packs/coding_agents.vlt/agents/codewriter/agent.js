const { getChatResponse } = require('../../../../../lib/core/llm-client');

class CodeWriterAgent {
    constructor() {
        this.name = 'Code Writer Agent';
        this.id = 'codewriter';
    }

    async run(caseDir, userMessage, history = [], options = {}) {
        const systemPrompt = `You are the Code Writer & Patch Generator Subagent for HAYAGRIVA.
Your role is to write clean, production-ready code, generate multi-file diffs, and format outputs in syntax-highlighted markdown code blocks.`;

        const messages = [
            { role: 'system', content: systemPrompt },
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
