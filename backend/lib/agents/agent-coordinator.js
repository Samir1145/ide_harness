const fs = require('fs');
const path = require('path');
const Module = require('module');
const { getChatResponse } = require('../core/llm-client');
const agentLogger = require('./agent-logger');
const BankAnalyzerSubAgent = require('./subagents/bank-analyzer');

// Dynamically resolve engine libraries for decoupled/symlinked agent packs
const origResolveFilename = Module._resolveFilename;
const engineBackendLib = path.resolve(__dirname, '..');
Module._resolveFilename = function(request, parent, isMain, options) {
    if (parent && parent.filename && (parent.filename.includes('agent_packs') || parent.filename.includes('ide_agents') || parent.filename.includes('haya_agents') || parent.filename.includes('.vlt')) && request.includes('/lib/')) {
        const match = request.match(/(?:^|\/)lib\/(.+)$/);
        if (match) {
            const candidate = path.join(engineBackendLib, match[1]);
            if (fs.existsSync(candidate) || fs.existsSync(candidate + '.js') || fs.existsSync(candidate + '/index.js')) {
                return origResolveFilename.call(this, candidate, parent, isMain, options);
            }
        }
    }
    return origResolveFilename.call(this, request, parent, isMain, options);
};

class AgentCoordinator {
    constructor() {
        // Dynamic Vault Agent Packs Registry (.vlt)
        this.vaultAgents = {};
        this.loadVaultPacks();
        this.bankAnalyzer = new BankAnalyzerSubAgent();
    }

    loadVaultPacks() {
        try {
            const packsDir = path.join(__dirname, '..', '..', 'vault', 'agent_packs');
            if (!fs.existsSync(packsDir)) return;

            const packEntries = fs.readdirSync(packsDir);
            for (const packName of packEntries) {
                const packPath = path.join(packsDir, packName);
                const pluginPath = path.join(packPath, 'plugin.json');
                const manifestPath = path.join(packPath, 'manifest.json');
                
                const targetFile = fs.existsSync(pluginPath) ? pluginPath : (fs.existsSync(manifestPath) ? manifestPath : null);
                if (targetFile) {
                    try {
                        const manifest = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
                        if (Array.isArray(manifest.agents)) {
                            for (const agentDef of manifest.agents) {
                                const agentFilePath = path.join(packPath, 'agents', agentDef.id, 'agent.js');
                                if (fs.existsSync(agentFilePath)) {
                                    const AgentClass = require(agentFilePath);
                                    const instance = new AgentClass();
                                    instance.pluginMeta = agentDef;
                                    const { resolveAgentPrompt } = require('./prompt-resolver');
                                    instance.getPrompt = (variant = 'default') => resolveAgentPrompt(instance, null, variant);
                                    instance.getPromptForCase = (caseDir, variant = 'default') => resolveAgentPrompt(instance, caseDir, variant);
                                    const tag = (agentDef.tag || agentDef.id).toLowerCase();
                                    this.vaultAgents[tag] = instance;
                                    this.vaultAgents[tag.replace(/_/g, '-')] = instance;
                                    this.vaultAgents[tag.replace(/-/g, '_')] = instance;
                                    if (Array.isArray(agentDef.aliases)) {
                                        for (const alias of agentDef.aliases) {
                                            const cleanAlias = alias.toLowerCase();
                                            this.vaultAgents[cleanAlias] = instance;
                                            this.vaultAgents[cleanAlias.replace(/_/g, '-')] = instance;
                                            this.vaultAgents[cleanAlias.replace(/-/g, '_')] = instance;
                                        }
                                    }
                                    console.log(`[AgentCoordinator] Loaded Vault Agent: @${tag} (${manifest.id || manifest.packId})`);
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

Output ONLY the category name in lowercase. If the query asks to analyze bank statements, cash flows, or bank accounts, output "bank_analyzer". Do not add explanations.

Prompt: "${message}"`;

        try {
            const response = await getChatResponse([
                { role: 'system', content: 'You are a precise classifier. Return only: advisor, forms, or document.' },
                { role: 'user', content: prompt }
            ], { caseDir });
            const cleaned = (response || '').trim().toLowerCase();
            if (['advisor', 'forms', 'document', 'bank_analyzer'].includes(cleaned)) return cleaned;
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
            ...this.vaultAgents,
            'bank_analyzer': this.bankAnalyzer,
            'bank-analyzer': this.bankAnalyzer,
            'bank_forensic': this.bankAnalyzer,
            'cashflow_agent': this.bankAnalyzer
        };

        const { orchestratorRegistry } = require('./orchestrator-coordinator');
        const { resolvePromptVariables, buildMemoryContext } = require('./skills/memory-injector');
        let target = (targetAgentName || '').trim().toLowerCase().replace(/^@/, '');
        if (!target) {
            const atMatch = userMessage.trim().match(/^@([a-zA-Z0-9_\-]+)/);
            if (atMatch) {
                target = atMatch[1].toLowerCase();
            }
        }
        const reqId = (options && options.requestId) || `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        agentLogger.startContext(reqId);
        agentLogger.log(reqId, 'AgentCoordinator', 'INIT', `Received query: "${userMessage}"`);

        // Gate Right-Panel Agentic Execution via Tamper-Resistant License Manager
        const { checkAgentAccess, recordAgentTurn } = require('../core/license-manager');
        const access = checkAgentAccess(caseDir);
        if (!access.allowed) {
            agentLogger.log(reqId, 'AgentCoordinator', 'LICENSE_GATED', `Agent access denied: ${access.reason}`);
            const title = access.status === 'TAMPERED' ? '⚠️ System Clock Alteration Detected' : '🔒 Agentic Assistance Lease Expired';
            const advice = access.status === 'TAMPERED'
                ? 'Your local system clock does not match the tamper-evident ledger. Re-sync with Resolution Bazaar or contact support.'
                : (access.message || 'Your agentic lease for autonomous drafting has reached its limit.');

            const fallbackNotice = `### ${title}\n\n${advice}\n\n` +
                `> **Workspace Immunity Notice:** Your Left Panel (case browser, concepts matrix, inbox, ledger) and Middle Panel (Monaco document editor, PDF horizontally-fitted previewer, local RAG search) remain **100% functional and unlocked**.\n\n` +
                `To activate or renew autonomous agent drafting, open **Settings → License** or visit the [Resolution Bazaar Billing Portal](http://127.0.0.1:8000/portal/billing).`;

            if (options && options.returnObject) {
                return { response: fallbackNotice, logs: agentLogger.endContext(reqId) };
            }
            return fallbackNotice;
        }

        const hrStart = process.hrtime.bigint();

        // Track 2: Dynamic Template Resolution & Memory Context Injection
        const enrichedMessage = resolvePromptVariables(caseDir, userMessage, options.activeFile);
        let memoryContext = '';
        try {
            memoryContext = await buildMemoryContext(caseDir, enrichedMessage);
            if (memoryContext) {
                agentLogger.log(reqId, 'AgentCoordinator', 'MEMORY', `Injected dynamic memory from case wiki and concepts.`);
            }
        } catch (_) {}

        const agentOptions = {
            ...options,
            requestId: reqId,
            mode: options.mode,
            memoryContext
        };

        let result = '';
        try {
            // Level 1 Domain Manager Check
            const domainManager = orchestratorRegistry.getManager(target);
            if (domainManager) {
                agentLogger.log(reqId, 'AgentCoordinator', 'ORCHESTRATE', `Routing to Level 1 Domain Manager: "@${target}"`);
                const pipelineRes = await domainManager.runPipeline(caseDir, enrichedMessage, agentOptions);
                result = `### 🏛️ [Domain Manager] @${target}\n\n**Module:** ${domainManager.alignedModule}\n**Pipeline Status:** \`${pipelineRes.pipelineState}\`\n\n${pipelineRes.summary}\n\n- **Left Pane (Workspace Explorer):** ${pipelineRes.details.leftPane}\n- **Middle Pane (Monaco Editor):** ${pipelineRes.details.middlePane}`;
            } else if (target && agentMap[target]) {
                agentLogger.log(reqId, 'AgentCoordinator', 'CLASSIFY', `Direct routing → agent: "${target}"`);
                result = await agentMap[target].run(caseDir, enrichedMessage, history, agentOptions);
            } else {
                if (target && !agentMap[target]) {
                    agentLogger.log(reqId, 'AgentCoordinator', 'CLASSIFY', `Unknown agent "${target}", falling back to intent classification.`);
                }
                const intent = await this.classifyIntent(caseDir, enrichedMessage);
                agentLogger.log(reqId, 'AgentCoordinator', 'CLASSIFY', `Classified intent: "${intent}"`);
                const matchedAgent = agentMap[intent] || agentMap['advisor'];
                if (matchedAgent) {
                    result = await matchedAgent.run(caseDir, enrichedMessage, history, agentOptions);
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

        try {
            const hrEnd = process.hrtime.bigint();
            const elapsedSecs = Number(hrEnd - hrStart) / 1e9;
            recordAgentTurn(caseDir, elapsedSecs);
        } catch (_) {}

        agentLogger.log(reqId, 'AgentCoordinator', 'COMPLETE', 'Agent execution completed successfully');
        const logs = agentLogger.endContext(reqId);

        if (options && options.returnObject) {
            return { response: result, logs };
        }
        return result;
    }
}

const coordinatorInstance = new AgentCoordinator();
coordinatorInstance.AgentCoordinator = AgentCoordinator;
module.exports = coordinatorInstance;

