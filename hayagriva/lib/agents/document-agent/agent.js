const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../core/llm-client');
const { draftDocument } = require('../../core/drafting');

class DocumentAgent {
    constructor() {
        this.name = 'DocumentAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Document Agent] Processing task: "${userMessage}"`);

        // Detect target template/format (e.g. directors-report)
        const formatId = userMessage.toLowerCase().includes('directors') ? 'directors-report' : 'directors-report';

        let draftResult = null;
        let context = '';
        try {
            // Trigger the native document drafting compiler
            draftResult = await draftDocument(caseDir, formatId);
            
            context = `[Drafting Engine Execution Result]\n`;
            context += `- Draft saved to: ${draftResult.draftName}\n`;
            context += `- Version archived: v${draftResult.version}\n`;
            context += `- Unresolved placeholders found: ${draftResult.placeholders.length}\n`;
            
            if (draftResult.placeholders.length > 0) {
                context += `Placeholders list:\n`;
                draftResult.placeholders.forEach((p, idx) => {
                    context += `  ${idx + 1}. [${p.content}] on Line ${p.line}\n`;
                });
            }
        } catch (e) {
            console.error(`[Document Agent] Drafting compiler call failed:`, e.message);
            context = `[Drafting Engine Error] Failed to generate draft document: ${e.message}\n`;
        }

        // Build prompt messages
        const messages = [
            { role: 'system', content: this.instructions }
        ];

        history.forEach(h => {
            messages.push({ role: h.role, content: h.content });
        });

        let promptContent = userMessage;
        if (context) {
            promptContent = `${context}\n\n[User Command]\n${userMessage}`;
        }
        messages.push({ role: 'user', content: promptContent });

        // Call the LLM to write a high-level summary and guide the user on the draft layout and placeholders
        return await getChatResponse(messages, { caseDir });
    }
}

module.exports = DocumentAgent;
