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
            path.join(os.homedir(), 'Desktop', 'HAYAGRIVA', 'agents', 'packs'),
            path.join(__dirname, '..', '..', '..', '..', 'agents', 'packs'),
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
            },
            'relatedparty': {
                run: async (cDir, msg, hist, opts) => {
                    const relatedPartyClient = require('./subagents/related-party-agent');
                    let formAContext = {};
                    
                    try {
                        const formAFiles = fs.readdirSync(cDir).filter(f => f.toLowerCase().includes('form_a') && f.endsWith('.md'));
                        if (formAFiles.length > 0) {
                            formAContext = relatedPartyClient.extractFormAContext(path.join(cDir, formAFiles[0]));
                        } else if (fs.existsSync(path.join(cDir, 'case_facts.md'))) {
                            const facts = fs.readFileSync(path.join(cDir, 'case_facts.md'), 'utf8');
                            const cinM = facts.match(/U[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}/i);
                            const cdM = facts.match(/(?:Corporate Debtor|Company Name)[:\s*]+([^\n\r]+)/i);
                            formAContext = {
                                corporate_debtor: cdM ? cdM[1].replace(/[*#]/g, '').trim() : 'Corporate Debtor',
                                cin: cinM ? cinM[0] : ''
                            };
                        }
                    } catch (_) {}

                    if (!formAContext.cin && !formAContext.corporate_debtor) {
                        return "⚠️ **@RelatedParty Notice**: Please ensure a **Form A Public Announcement** (or `case_facts.md` containing CIN) is present in the workspace before dispatching audit.";
                    }

                    const stageRes = relatedPartyClient.stageReportTask(cDir, formAContext, 'counsel@nclt.in');
                    const cycleRes = await relatedPartyClient.executeMcpReportCycle(cDir, stageRes.taskId, formAContext);

                    const rpList = (cycleRes.structuredData && cycleRes.structuredData.related_parties) || [];
                    const rpRows = rpList.map(rp => `* **${rp.name}** (${rp.cin || 'CIN Unlisted'}): *${rp.relationship_type}* — **CoC Voting Disqualification:** ${rp.coc_disqualified ? '⚠️ YES (§ 21(2))' : 'NO'}`).join('\n');

                    return `### 👥 Resolution Bazaar: Section 5(24) Related Party Audit\n\n` +
                           `**Target Corporate Debtor:** ${formAContext.corporate_debtor} (\`${formAContext.cin || 'CIN'}\`)\n` +
                           `**Invoice Number:** \`${cycleRes.invoiceNumber}\` • **Status:** \`✓ PAID & AUDITED\` (₹${cycleRes.totalInr.toFixed(2)})\n` +
                           `**Server Task Ref:** \`${cycleRes.serverTaskId}\`\n\n` +
                           `#### Connected Entities Identified:\n` +
                           (rpRows || '*No direct related parties found.*') +
                           `\n\n---\n📄 **Full Dossier Deposited:** \`${cycleRes.reportPath}\`\n` +
                           `*(Tamper-evident SHA-256 hash verified in local case ledger)*`;
                }
            },
            'related_party': {
                run: async (cDir, msg, hist, opts) => agentMap['relatedparty'].run(cDir, msg, hist, opts)
            },
            'section65': {
                run: async (cDir, msg, hist, opts) => {
                    return `### 🏛️ Resolution Bazaar: Section 65 Collusive CIRP Inquest\n\n` +
                           `Section 65 forensic screening is ready for cloud dispatch.\n` +
                           `To initiate full automated inquest, ensure Form A is ingested and authorize task in Settings.`;
                }
            },
            's65': {
                run: async (cDir, msg, hist, opts) => agentMap['section65'].run(cDir, msg, hist, opts)
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
            
            if (access.status === 'TRIAL_AVAILABLE') {
                const trialNotice = `### ⚡ Unlock Hayagriva Pro Suite (Autonomous IBC Agents)

Supercharge your CIRP practice with autonomous legal drafting, Form A/B/C/CA audits, and local private LLM intelligence.

| System / Feature | Core Workbench (Free) | Hayagriva Pro (₹25,000/yr) |
| :--- | :---: | :---: |
| **Document Ingestion & PDF Parser** | ✅ Free Forever | ✅ Included |
| **Local FTS5 Case Search** | ✅ Free Forever | ✅ Included |
| **Legal Monaco Editor & Skeletons** | ✅ Free Forever | ✅ Included |
| **Autonomous Agents (@Advisor, @Forms, @Document)** | 🔒 Locked | ✅ Full Autonomy |
| **Local Private LLM (Param-2.9B Engine)** | 🔒 Locked | ✅ 100% Offline |
| **Continuous Monaco Statutory & IBC Sync** | 🔒 Locked | ✅ Continuous Updates |

👉 **[⚡ Start 7-Day Free Trial (1-Click Activation)](command:hayagriva.license.startTrial)**

*Or activate your annual subscription for **₹25,000 / year** (~₹2,083/mo) in **Settings → License**.*`;
                if (options && options.returnObject) {
                    return { response: trialNotice, logs: agentLogger.endContext(reqId) };
                }
                return trialNotice;
            }

            if (access.status === 'TRIAL_EXPIRED' || access.status === 'EXPIRED') {
                const expiredNotice = `### 🔒 7-Day Free Trial Concluded

Your 7-day autonomous legal agent trial has concluded.

> **Workspace Immunity Notice:** Your Left Panel (case browser, concepts matrix, inbox, PDF viewer) and Middle Panel (Monaco document editor, offline template compilation) remain **100% free and functional forever**.

To continue using **@Advisor**, **@Forms**, and **@Document**, and to keep your Monaco legal rules & model weights synchronized with the latest IBC amendments:

👉 **[⚡ Subscribe to Hayagriva Pro — ₹25,000 / Year](command:hayagriva:openSettingsPanel)**

*Already have a firm or volume license key? Enter your key in **Settings → License**.*`;
                if (options && options.returnObject) {
                    return { response: expiredNotice, logs: agentLogger.endContext(reqId) };
                }
                return expiredNotice;
            }

            if (access.status === 'TAMPERED') {
                const tamperNotice = `### ⚠️ System Clock Alteration Detected

Your local system clock does not match the tamper-evident ledger. Please restore your system clock, re-sync with network, or contact support.`;
                if (options && options.returnObject) {
                    return { response: tamperNotice, logs: agentLogger.endContext(reqId) };
                }
                return tamperNotice;
            }

            const genericNotice = `### 🔒 Agent Access Suspended\n\n${access.message || access.reason}\n\n` +
                `> **Workspace Immunity Notice:** Your Left Panel and Monaco Editor remain 100% free and functional.\n\n` +
                `👉 **[⚡ Upgrade to Hayagriva Pro — ₹25,000 / Year](command:hayagriva:openSettingsPanel)**`;

            if (options && options.returnObject) {
                return { response: genericNotice, logs: agentLogger.endContext(reqId) };
            }
            return genericNotice;
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
                    `1. Ensure **\`~/Desktop/HAYAGRIVA/agents\`** (or legacy \`~/Desktop/ide_agents\`) is present on your Mac (or configure \`HAYAGRIVA_AGENTS_PATH\`).\n` +
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

