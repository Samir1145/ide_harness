const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../core/llm-client');
const agentLogger = require('./agent-logger');

class AgentCoordinator {
    constructor() {
        // Dynamic Vault Agent Packs Registry (.vlt)
        this.vaultAgents = {};
        this.loadVaultPacks();
    }

    loadVaultPacks() {
        try {
            const packsDir = path.join(__dirname, '..', '..', 'vault', 'agent_packs');
            if (!fs.existsSync(packsDir)) return;

            const packEntries = fs.readdirSync(packsDir);
            for (const packName of packEntries) {
                const packPath = path.join(packsDir, packName);
                const manifestPath = path.join(packPath, 'manifest.json');
                if (fs.existsSync(manifestPath)) {
                    try {
                        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                        if (Array.isArray(manifest.agents)) {
                            for (const agentDef of manifest.agents) {
                                const agentFilePath = path.join(packPath, 'agents', agentDef.id, 'agent.js');
                                if (fs.existsSync(agentFilePath)) {
                                    const AgentClass = require(agentFilePath);
                                    const instance = new AgentClass();
                                    const tag = (agentDef.tag || agentDef.id).toLowerCase();
                                    this.vaultAgents[tag] = instance;
                                    console.log(`[AgentCoordinator] Loaded Vault Agent: @${tag} (${manifest.packId})`);
                                }
                            }
                        }
                    } catch (err) {
                        console.warn(`[AgentCoordinator] Failed to load agent pack ${packName}:`, err.message);
                    }
                }
            }
        } catch (e) {
            console.warn('[AgentCoordinator] Vault agent pack loader error:', e.message);
        }
    }

    /**
     * Classifies user intent into one of the core three categories for auto-routing.
     */
    async classifyIntent(caseDir, message) {
        const prompt = `You are a query classifier for HAYAGRIVA, an AI IDE. Categorize the user prompt into exactly one of three categories:
1. "advisor"  — questions, information lookup, analysis.
2. "forms"    — statutory forms, compliance fields, math auditing.
3. "document" — drafting documents, petitions, replies, resolutions.

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
    async run(caseDir, userMessage, history = [], targetAgentName = '', options = {}) {
        const agentMap = {
            // Dynamic Vault .vlt Agent Packs (legal_agents.vlt, coding_agents.vlt, finance_agents.vlt)
            ...this.vaultAgents
        };

        const { orchestratorRegistry } = require('./orchestrator-coordinator');
        const target = (targetAgentName || '').trim().toLowerCase().replace(/^@/, '');
        const reqId = (options && options.requestId) || `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        agentLogger.startContext(reqId);
        agentLogger.log(reqId, 'AgentCoordinator', 'INIT', `Received query: "${userMessage}"`);

        let result = '';
        try {
            // Level 1 Domain Manager Check
            const domainManager = orchestratorRegistry.getManager(target);
            if (domainManager) {
                agentLogger.log(reqId, 'AgentCoordinator', 'ORCHESTRATE', `Routing to Level 1 Domain Manager: "@${target}"`);
                const pipelineRes = await domainManager.runPipeline(caseDir, userMessage, { requestId: reqId });
                result = `### 🏛️ [Domain Manager] @${target}\n\n**Module:** ${domainManager.alignedModule}\n**Pipeline Status:** \`${pipelineRes.pipelineState}\`\n\n${pipelineRes.summary}\n\n- **Left Pane (Workspace Explorer):** ${pipelineRes.details.leftPane}\n- **Middle Pane (Monaco Editor):** ${pipelineRes.details.middlePane}`;
            } else if (target && agentMap[target]) {
                agentLogger.log(reqId, 'AgentCoordinator', 'CLASSIFY', `Direct routing → agent: "${target}"`);
                result = await agentMap[target].run(caseDir, userMessage, history, { requestId: reqId });
            } else {
                if (target && !agentMap[target]) {
                    agentLogger.log(reqId, 'AgentCoordinator', 'CLASSIFY', `Unknown agent "${target}", falling back to intent classification.`);
                }
                const intent = await this.classifyIntent(caseDir, userMessage);
                agentLogger.log(reqId, 'AgentCoordinator', 'CLASSIFY', `Classified intent: "${intent}"`);
                const matchedAgent = agentMap[intent] || agentMap['advisor'];
                if (matchedAgent) {
                    result = await matchedAgent.run(caseDir, userMessage, history, { requestId: reqId });
                } else {
                    result = `Agent @${intent} is currently unavailable. Installed Vault agents: ${Object.keys(agentMap).map(k => '@' + k).join(', ')}`;
                }
            }
        } catch (e) {
            if (e.code === 'LITE_MODE' || e.code === 'CONTEXT_EXCEEDED') {
                // Last-resort safety net: agent forgot to handle LITE_MODE internally
                agentLogger.log(reqId, 'AgentCoordinator', 'LITE_FALLBACK', `Coordinator caught unhandled ${e.code} from agent`);
                result = `> ℹ️ **Lite Mode** — ${e.message}\n\n*Start the LLM engine in **Settings → Mode & Engine** to enable full AI generation.*`;
            } else {
                agentLogger.log(reqId, 'AgentCoordinator', 'ERROR', `Agent threw: ${e.message}`);
                throw e;  // Real errors still propagate
            }
        }

        agentLogger.log(reqId, 'AgentCoordinator', 'COMPLETE', 'Agent execution completed successfully');
        const logs = agentLogger.endContext(reqId);

        if (options && options.returnObject) {
            return { response: result, logs };
        }
        return result;
    }
}

module.exports = new AgentCoordinator();

