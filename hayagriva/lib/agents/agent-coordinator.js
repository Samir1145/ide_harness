const { getChatResponse } = require('../core/llm-client');
const AdvisorAgent = require('./advisor-agent/agent');
const FormsAgent = require('./forms-agent/agent');
const DocumentAgent = require('./document-agent/agent');

class AgentCoordinator {
    constructor() {
        this.advisor = new AdvisorAgent();
        this.forms = new FormsAgent();
        this.document = new DocumentAgent();
    }

    async classifyIntent(message) {
        const prompt = `You are a query classifier for HAYAGRIVA. Categorize the user prompt into exactly one of three categories:
1. "advisor" — for law questions, insolvency codes, regulations, or board rules search.
2. "forms" — for reviewing MCA compliance fields, auditing math equations, or checking dates.
3. "document" — for drafting board resolutions, corporate report templates, minutes, or contract templates.

Output ONLY the category name in lowercase (either "advisor", "forms", or "document"). Do not add explanations or formatting.

Prompt: "${message}"`;

        try {
            const response = await getChatResponse([
                { role: 'system', content: 'You are a precise classifier. Return only advisor, forms, or document.' },
                { role: 'user', content: prompt }
            ]);
            const cleaned = (response || '').trim().toLowerCase();
            console.log(`[Agent Coordinator] Classified query intent as: "${cleaned}"`);
            if (['advisor', 'forms', 'document'].includes(cleaned)) {
                return cleaned;
            }
        } catch (e) {
            console.error('[Agent Coordinator] Classification failed:', e.message);
        }
        return 'advisor'; // Fallback
    }

    async run(caseDir, userMessage, history = []) {
        const intent = await this.classifyIntent(userMessage);

        if (intent === 'forms') {
            return await this.forms.run(caseDir, userMessage, history);
        } else if (intent === 'document') {
            return await this.document.run(caseDir, userMessage, history);
        } else {
            return await this.advisor.run(caseDir, userMessage, history);
        }
    }
}

module.exports = new AgentCoordinator();
