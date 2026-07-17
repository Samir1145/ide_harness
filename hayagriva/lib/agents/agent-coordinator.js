const { getChatResponse } = require('../core/llm-client');
const AdvisorAgent = require('./advisor-agent/agent');
const FormsAgent = require('./forms-agent/agent');
const DocumentAgent = require('./document-agent/agent');
const ClaimsVerificationAgent = require('./claims-verification-agent/agent');
const ImCompilerAgent = require('./im-compiler-agent/agent');
const ResolutionPlanEvaluatorAgent = require('./resolution-plan-evaluator-agent/agent');
const AvoidanceScannerAgent = require('./avoidance-scanner-agent/agent');
const NcltDrafterAgent = require('./nclt-drafter-agent/agent');
const LitigationTrackerAgent = require('./litigation-tracker-agent/agent');

class AgentCoordinator {
    constructor() {
        this.advisor = new AdvisorAgent();
        this.forms = new FormsAgent();
        this.document = new DocumentAgent();
        this.claims = new ClaimsVerificationAgent();
        this.im = new ImCompilerAgent();
        this.plan = new ResolutionPlanEvaluatorAgent();
        this.avoidance = new AvoidanceScannerAgent();
        this.nclt = new NcltDrafterAgent();
        this.litigation = new LitigationTrackerAgent();
    }

    async classifyIntent(caseDir, message) {
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
            ], { caseDir });
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

    async run(caseDir, userMessage, history = [], targetAgentName = '') {
        const agentMap = {
            'advisor': this.advisor,
            'forms': this.forms,
            'document': this.document,
            'claims': this.claims,
            'im': this.im,
            'plan': this.plan,
            'avoidance': this.avoidance,
            'nclt': this.nclt,
            'litigation': this.litigation
        };

        const target = (targetAgentName || '').trim().toLowerCase();
        if (target && agentMap[target]) {
            console.log(`[Agent Coordinator] Direct routing to agent: "${target}"`);
            return await agentMap[target].run(caseDir, userMessage, history);
        }

        const intent = await this.classifyIntent(caseDir, userMessage);
        return await agentMap[intent].run(caseDir, userMessage, history);
    }
}

module.exports = new AgentCoordinator();
