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

// Phase C new OOB agents (loaded lazily so missing files don't break startup)
function safeRequire(p) {
    try { return require(p); } catch(e) { return null; }
}
const TimelineAgent    = safeRequire('./timeline-agent/agent');
const PrecedentAgent   = safeRequire('./precedent-agent/agent');
const StrengthAgent    = safeRequire('./strength-agent/agent');
const EntityGraphAgent = safeRequire('./entity-graph-agent/agent');
const OrderAnalyserAgent = safeRequire('./order-analyser-agent/agent');
const CounterAgent     = safeRequire('./counter-agent/agent');
const ComplianceAgent  = safeRequire('./compliance-agent/agent');
const WitnessAgent     = safeRequire('./witness-agent/agent');
const DepositionAgent  = safeRequire('./deposition-agent/agent');
const ClientUpdateAgent = safeRequire('./client-update-agent/agent');

class AgentCoordinator {
    constructor() {
        this.advisor    = new AdvisorAgent();
        this.forms      = new FormsAgent();
        this.document   = new DocumentAgent();
        this.claims     = new ClaimsVerificationAgent();
        this.im         = new ImCompilerAgent();
        this.plan       = new ResolutionPlanEvaluatorAgent();
        this.avoidance  = new AvoidanceScannerAgent();
        this.nclt       = new NcltDrafterAgent();
        this.litigation = new LitigationTrackerAgent();

        // Phase C OOB agents (instantiated only if module exists)
        if (TimelineAgent)     this.timeline     = new TimelineAgent();
        if (PrecedentAgent)    this.precedent    = new PrecedentAgent();
        if (StrengthAgent)     this.strength     = new StrengthAgent();
        if (EntityGraphAgent)  this.entitygraph  = new EntityGraphAgent();
        if (OrderAnalyserAgent) this.order       = new OrderAnalyserAgent();
        if (CounterAgent)      this.counter      = new CounterAgent();
        if (ComplianceAgent)   this.compliance   = new ComplianceAgent();
        if (WitnessAgent)      this.witness      = new WitnessAgent();
        if (DepositionAgent)   this.deposition   = new DepositionAgent();
        if (ClientUpdateAgent) this.clientupdate = new ClientUpdateAgent();
    }

    /**
     * Classifies user intent into one of the core three agents for auto-routing.
     * Specialist agents (timeline, precedent, etc.) must be explicitly named.
     */
    async classifyIntent(caseDir, message) {
        const prompt = `You are a query classifier for HAYAGRIVA, a legal AI IDE. Categorize the user prompt into exactly one of three categories:
1. "advisor"  — law questions, case facts lookup, IBC/regulations, analysis.
2. "forms"    — MCA/IBBI form filling, compliance fields, math/date auditing.
3. "document" — drafting petitions, replies, board resolutions, legal documents.

Output ONLY the category name in lowercase. Do not add explanations.

Prompt: "${message}"`;

        try {
            const response = await getChatResponse([
                { role: 'system', content: 'You are a precise classifier. Return only: advisor, forms, or document.' },
                { role: 'user', content: prompt }
            ], { caseDir });
            const cleaned = (response || '').trim().toLowerCase();
            if (['advisor', 'forms', 'document'].includes(cleaned)) return cleaned;
        } catch (e) {
            console.error('[Agent Coordinator] Classification failed:', e.message);
        }
        return 'advisor';
    }

    /**
     * Runs the appropriate agent for a user message.
     * @param {string} caseDir
     * @param {string} userMessage
     * @param {Array}  history
     * @param {string} targetAgentName - Explicit agent name (bypasses classification)
     */
    async run(caseDir, userMessage, history = [], targetAgentName = '') {
        const agentMap = {
            // Core agents
            'advisor':    this.advisor,
            'forms':      this.forms,
            'document':   this.document,
            'claims':     this.claims,
            'im':         this.im,
            'plan':       this.plan,
            'avoidance':  this.avoidance,
            'nclt':       this.document,
            'litigation': this.litigation,
            // OOB Phase C agents
            'timeline':    this.timeline,
            'precedent':   this.precedent,
            'strength':    this.strength,
            'entitygraph': this.entitygraph,
            'entity-graph': this.entitygraph,
            'order':       this.order,
            'order-analyser': this.order,
            'counter':     this.counter,
            'compliance':  this.compliance,
            'witness':     this.witness,
            'deposition':  this.deposition,
            'clientupdate': this.clientupdate,
            'client-update': this.clientupdate,
        };

        const target = (targetAgentName || '').trim().toLowerCase();

        if (target && agentMap[target]) {
            console.log(`[Agent Coordinator] Direct routing → agent: "${target}"`);
            return await agentMap[target].run(caseDir, userMessage, history);
        }

        if (target && !agentMap[target]) {
            console.warn(`[Agent Coordinator] Unknown agent "${target}", falling back to classification.`);
        }

        const intent = await this.classifyIntent(caseDir, userMessage);
        console.log(`[Agent Coordinator] Classified intent: "${intent}"`);
        return await agentMap[intent].run(caseDir, userMessage, history);
    }
}

module.exports = new AgentCoordinator();
