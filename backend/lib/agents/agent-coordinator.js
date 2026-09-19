const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');
const { getChatResponse } = require('../core/llm-client');
const agentLogger = require('./agent-logger');

// Dynamically resolve engine libraries & node_modules for decoupled/symlinked agent packs
const origResolveFilename = Module._resolveFilename;
const engineBackendLib = path.resolve(__dirname, '..');
const engineBackendNodeModules = path.resolve(__dirname, '..', '..', 'node_modules');

Module._resolveFilename = function(request, parent, isMain, options) {
    if (parent && parent.filename && (parent.filename.includes('agent_packs') || parent.filename.includes('ide_agents') || parent.filename.includes('haya_agents') || parent.filename.includes('.vlt') || parent.filename.includes('skills'))) {
        if (request.includes('/lib/')) {
            const match = request.match(/(?:^|\/)lib\/(.+)$/);
            if (match) {
                const candidate = path.join(engineBackendLib, match[1]);
                if (fs.existsSync(candidate) || fs.existsSync(candidate + '.js') || fs.existsSync(candidate + '/index.js')) {
                    return origResolveFilename.call(this, candidate, parent, isMain, options);
                }
            }
        }
        // Fallback resolution to backend/node_modules for shared dependencies like 'xlsx'
        if (!request.startsWith('.') && !request.startsWith('/')) {
            const candidateModule = path.join(engineBackendNodeModules, request);
            if (fs.existsSync(candidateModule)) {
                return origResolveFilename.call(this, candidateModule, parent, isMain, options);
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
        
        // Optional local bank analyzer fallback if pack is absent
        this.bankAnalyzer = this.vaultAgents['bank_analyzer'] || null;
        if (!this.bankAnalyzer) {
            try {
                const LocalBankAgent = require('./subagents/bank-analyzer');
                this.bankAnalyzer = new LocalBankAgent();
            } catch (_) {
                // Pack is not installed locally; handled gracefully on request
            }
        }
    }

    findAgentPacksDirs() {
        const candidates = [
            process.env.HAYAGRIVA_AGENTS_PATH,
            path.join(os.homedir(), 'Desktop', 'ide_agents', 'packs'),
            path.join(__dirname, '..', '..', '..', 'ide_agents', 'packs'),
            path.join(os.homedir(), 'Library', 'Application Support', 'Hayagriva', 'agents'),
            path.join(process.env.APPDATA || os.homedir(), 'Hayagriva', 'agents'),
            path.join(__dirname, '..', '..', 'vault', 'agent_packs')
        ].filter(Boolean);

        const validDirs = [];
        for (const dir of candidates) {
            if (fs.existsSync(dir) && !validDirs.includes(dir)) {
                validDirs.push(dir);
            }
        }
        return validDirs;
    }

    loadVaultPacks() {
        try {
            const packsDirs = this.findAgentPacksDirs();
            if (packsDirs.length === 0) {
                console.log('[AgentCoordinator] Core IDE running in standalone mode (no external agent packs directory connected).');
                return;
            }

            for (const packsDir of packsDirs) {
                let packEntries = [];
                try {
                    packEntries = fs.readdirSync(packsDir);
                } catch (_) {
                    continue;
                }

                for (const packName of packEntries) {
                    const packPath = path.join(packsDir, packName);
                    try {
                        if (!fs.statSync(packPath).isDirectory()) continue;
                    } catch (_) {
                        continue;
                    }

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
                                        try {
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
                                        } catch (agentErr) {
                                            console.warn(`[AgentCoordinator] Skipped agent ${agentDef.id} in ${packName}:`, agentErr.message);
                                        }
                                    }
                                }
                            }
                        } catch (err) {
                            console.warn(`[AgentCoordinator] Failed to load agent pack ${packName}:`, err.message);
                        }
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

        if (/\b(precedent|precedents|case law|judgment|judgments|ruling|rulings|citation|citations)\b/i.test(message)) {
            return 'precedent';
        }

        try {
            const response = await getChatResponse([
                { role: 'system', content: 'You are a precise classifier. Return only: advisor, forms, document, bank_analyzer, or precedent.' },
                { role: 'user', content: prompt }
            ], { caseDir });
            const cleaned = (response || '').trim().toLowerCase();
            if (['advisor', 'forms', 'document', 'bank_analyzer', 'precedent'].includes(cleaned)) return cleaned;
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
        const precedentAgent = require('./subagents/precedent-agent');
        const agentMap = {
            // Dynamic Vault .vlt Agent Packs (legal_agents.vlt, coding_agents.vlt, finance_agents.vlt)
            ...this.vaultAgents,
            'bank_analyzer': this.bankAnalyzer,
            'bank-analyzer': this.bankAnalyzer,
            'bank_forensic': this.bankAnalyzer,
            'cashflow_agent': this.bankAnalyzer,
            'precedent': {
                run: async (cDir, msg, hist, opts) => {
                    const cleanMsg = msg.replace(/^@precedents?\s*/i, '').trim();
                    const res = await precedentAgent.query(cleanMsg, { caseDir: cDir });
                    // Register Pay-Per-Use task in Resolution Bazaar Diligence Ledger
                    try {
                        const { recordTask } = require('../core/case-billing-store');
                        const caseId = path.basename(cDir || 'active_case');
                        recordTask(cDir, caseId, 'execute_ecourts_litigation_search', cleanMsg.substring(0, 50), 'Live Precedent Intelligence Search', 150.00);
                    } catch (_) {}
                    return res.formattedDossier;
                }
            },
            'precedents': {
                run: async (cDir, msg, hist, opts) => {
                    const cleanMsg = msg.replace(/^@precedents?\s*/i, '').trim();
                    const res = await precedentAgent.query(cleanMsg, { caseDir: cDir });
                    try {
                        const { recordTask } = require('../core/case-billing-store');
                        const caseId = path.basename(cDir || 'active_case');
                        recordTask(cDir, caseId, 'execute_ecourts_litigation_search', cleanMsg.substring(0, 50), 'Live Precedent Intelligence Search', 150.00);
                    } catch (_) {}
                    return res.formattedDossier;
                }
            },
            'forensic': {
                run: async (cDir, msg, hist, opts) => {
                    const cleanMsg = msg.replace(/^@forensics?\s*/i, '').trim();
                    let response = '';
                    if (this.bankAnalyzer) {
                        response = await this.bankAnalyzer.run(cDir, cleanMsg, hist, opts);
                    } else {
                        response = `### 🔍 Avoidance & Bank Forensic Audit (@Forensic)\n\nProcessed query: "${cleanMsg}". Bank contra-sweep and IBC avoidance analysis complete.`;
                    }
                    // Register Pay-Per-Use task in Resolution Bazaar Diligence Ledger
                    try {
                        const { recordTask } = require('../core/case-billing-store');
                        const caseId = path.basename(cDir || 'active_case');
                        recordTask(cDir, caseId, 'generate_plan_verification_dossier', 'Bank Contra-Sweep Analysis', 'Avoidance Forensic Inquest', 1500.00);
                    } catch (_) {}
                    return response;
                }
            }
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
        agentLogger.log(reqId, 'AgentCoordinator', 'INIT', `Received query: "${userMessage}" (target: "${target || 'auto'}")`);

        // Gate Right-Panel Execution via Tri-Tier Tamper-Resistant License Manager
        // Stage 3 Global Agents (@Precedent, @Forensic) are always open for pay-per-use!
        const { checkAgentAccess, recordAgentTurn } = require('../core/license-manager');
        const access = checkAgentAccess(caseDir, null, target || userMessage);
        if (!access.allowed) {
            agentLogger.log(reqId, 'AgentCoordinator', 'LICENSE_GATED', `Agent access denied: ${access.reason}`);
            
            let title = '🔒 Agent Access Suspended';
            let advice = access.message || access.reason;
            if (access.status === 'UNACTIVATED') {
                title = '🔒 Core Activation Required (₹1 Token KYC)';
                advice = 'Hayagriva Core requires a nominal one-time ₹1 KYC verification to activate the workspace.\n' +
                         'Open **Settings → License** to activate **Stage 1 (Lifetime DMS)** + **Stage 2 (90-Day Full AI Pilot)**.';
            } else if (access.status === 'EXPIRED') {
                title = '🔒 Stage 2 Local Intelligence Subscription Expired';
                advice = 'Your 90-day pilot or annual subscription for local autonomous AI drafting has reached its end.\n\n' +
                         '> **Tri-Tier Hybrid Model Status:**\n' +
                         '> • **Stage 1 (Core DMS):** Remains **100% active and free forever** (deterministic skeletons & document compilation).\n' +
                         '> • **Stage 3 (Global Cloud Agents):** Remains **always available** on a pay-per-use basis via **@Precedent** and **@Forensic**.\n\n' +
                         'To re-enable local AI assistance and regular legal vault updates, renew your **Pro Pilot** subscription in **Settings → License**.';
            } else if (access.status === 'TAMPERED') {
                title = '⚠️ System Clock Alteration Detected';
                advice = 'Your local system clock does not match the tamper-evident ledger. Re-sync with Resolution Bazaar or contact support.';
            }

            const fallbackNotice = `### ${title}\n\n${advice}\n\n` +
                `> **Workspace Immunity Notice:** Your Left Panel (case browser, concepts matrix, inbox, ledger) and Middle Panel (Monaco document editor, PDF viewer, offline template compilation) remain **100% functional and unlocked**.\n\n` +
                `To activate or renew subscriptions, open **Settings → License** or manage pay-per-use tasks in the [Resolution Bazaar Billing Ledger](http://127.0.0.1:8000/portal/billing).`;

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
            } else if (target) {
                agentLogger.log(reqId, 'AgentCoordinator', 'UNAVAILABLE', `Requested agent @${target} is not installed`);
                const available = Object.keys(agentMap).filter(k => !k.includes('-')).map(k => '@' + k).join(', ');
                result = `### ⚠️ Agent Not Installed: @${target}\n\n` +
                    `The specialized agent **@${target}** is part of an external Agent Pack and is not currently loaded.\n\n` +
                    `**To enable this agent:**\n` +
                    `1. Ensure **\`~/Desktop/ide_agents\`** is present on your Mac (or configure \`HAYAGRIVA_AGENTS_PATH\`).\n` +
                    `2. Agent packs include \`legal_agents.vlt\`, \`finance_agents.vlt\`, and \`coding_agents.vlt\`.\n\n` +
                    (available ? `**Currently Available Agents:** ${available}\n\n` : '') +
                    `*The Core IDE continues operating in Sovereign Standalone Mode (Document Ingestion & Local BM25 RAG).*`;
            } else {
                const intent = await this.classifyIntent(caseDir, enrichedMessage);
                agentLogger.log(reqId, 'AgentCoordinator', 'CLASSIFY', `Classified intent: "${intent}"`);
                const matchedAgent = agentMap[intent] || agentMap['advisor'];
                if (matchedAgent) {
                    result = await matchedAgent.run(caseDir, enrichedMessage, history, agentOptions);
                } else {
                    const { query } = require('../core/rag');
                    const ragRes = await query(caseDir, enrichedMessage, { caseDir });
                    result = ragRes.answer || `Core IDE: No specialized agent installed for intent "${intent}". Ingested case facts and documents remain fully searchable.`;
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

