'use strict';

const fs = require('fs');
const path = require('path');
const { retrieveContexts } = require('../../core/rag');
const { readCaseKV, readAllKV, writeCaseKV } = require('./kv-write');
const { buildTimeline } = require('./timeline-build');
const { vaultLookup } = require('./vault-lookup');
const { crossReferenceCheck } = require('./cross-ref-check');
const { evaluateToolCall, classify, RiskClass, ExecutionMode, assertPathWithinWorkspace } = require('../risk-engine');

/**
 * Centralized tool execution dispatcher for Hayagriva Agents & Theia AI Tool Invocation.
 * Integrated with Enterprise Risk-Tiered Permission Engine.
 * 
 * @param {string} caseDir Absolute path to the active case workspace
 * @param {string} toolName Name or alias of the tool
 * @param {Object} [args] Input arguments
 * @param {Object} [sessionContext] Execution context (mode, allowExternal, overrides, etc.)
 */
async function executeTool(caseDir, toolName, args = {}, sessionContext = {}) {
    const norm = String(toolName || '').toLowerCase().trim().replace(/^(hayagriva|ipie):/i, '');

    // 1. Pre-flight permission & risk tier evaluation
    const decision = evaluateToolCall(caseDir, norm, args, sessionContext);
    if (!decision.allowed) {
        if (decision.needsApproval) {
            if (sessionContext.parkInInbox && caseDir) {
                const inboxManager = require('../inbox-manager');
                const item = inboxManager.createItem(caseDir, {
                    kind: 'approval',
                    title: `Approve execution of tool "${toolName}"`,
                    body: decision.reason || `Tool ${toolName} requires authorization.`,
                    riskClass: decision.riskClass,
                    data: { toolName, args }
                });
                return {
                    tool: toolName,
                    status: 'parked_in_inbox',
                    inboxItemId: item.id,
                    notice: `Action parked in Case Inbox awaiting approval.`,
                    _riskClass: decision.riskClass
                };
            }
            const err = new Error(`[Permission Required] Tool "${toolName}" (${decision.riskClass}) requires authorization: ${decision.reason}`);
            err.code = 'ERR_PERMISSION_REQUIRED';
            err.needsApproval = true;
            err.riskClass = decision.riskClass;
            throw err;
        } else {
            const err = new Error(`[Permission Denied] Tool "${toolName}" (${decision.riskClass}) blocked: ${decision.reason}`);
            err.code = 'ERR_PERMISSION_DENIED';
            err.riskClass = decision.riskClass;
            throw err;
        }
    }

    // 2. Dispatch execution
    switch (norm) {
        case 'retrievecontexts':
        case 'retrieve_contexts':
        case 'rag': {
            const query = args.query || args.prompt || '';
            const limit = typeof args.limit === 'number' ? args.limit : 4;
            const domain = args.domain || 'legal';
            const contexts = await retrieveContexts(caseDir, query, limit, domain);
            return {
                tool: 'retrieveContexts',
                query,
                contexts: contexts || [],
                _riskClass: decision.riskClass
            };
        }

        case 'getkvvalue':
        case 'get_kv_value':
        case 'read_kv': {
            const key = args.key || '';
            const val = readCaseKV(caseDir, key);
            return {
                tool: 'getKVValue',
                key,
                value: val || null,
                _riskClass: decision.riskClass
            };
        }

        case 'getallkv':
        case 'get_all_kv':
        case 'read_all_kv': {
            const kv = readAllKV(caseDir);
            return {
                tool: 'getAllKV',
                kv: kv || {},
                _riskClass: decision.riskClass
            };
        }

        case 'writekv':
        case 'write_kv': {
            const key = args.key;
            const val = args.value;
            const src = args.source || 'Tool';
            const author = args.author || 'Assistant';
            if (key) {
                writeCaseKV(caseDir, key, val, src, author);
            }
            return {
                tool: 'writeKV',
                key,
                value: val,
                status: 'saved',
                _riskClass: decision.riskClass
            };
        }

        case 'querytimeline':
        case 'query_timeline':
        case 'timeline': {
            const events = await buildTimeline(caseDir);
            return {
                tool: 'queryTimeline',
                events: events || [],
                _riskClass: decision.riskClass
            };
        }

        case 'vaultlookup':
        case 'vault_lookup':
        case 'laws': {
            const query = args.query || args.keyword || '';
            const limit = typeof args.limit === 'number' ? args.limit : 3;
            const laws = await vaultLookup(query, limit);
            return {
                tool: 'vaultLookup',
                query,
                laws: laws || [],
                _riskClass: decision.riskClass
            };
        }

        case 'checkcrossreference':
        case 'check_cross_reference':
        case 'cross_reference': {
            const stmt = args.statement || args.text || '';
            const limit = typeof args.limit === 'number' ? args.limit : 5;
            const xref = await crossReferenceCheck(caseDir, stmt, limit);
            return {
                tool: 'checkCrossReference',
                statement: stmt,
                report: xref,
                _riskClass: decision.riskClass
            };
        }

        case 'lintdraft':
        case 'lint_draft':
        case 'statutorylinter':
        case 'statutory_linter': {
            const text = args.text || args.content || args.draft || '';
            const { lintDraft } = require('../../core/statutory-linter');
            const lintReport = lintDraft(text, args.options || {});
            return {
                tool: 'lintDraft',
                report: lintReport,
                _riskClass: decision.riskClass
            };
        }

        case 'mdappend':
        case 'md_append':
        case 'append_markdown': {
            const targetFile = args.targetFile || args.filePath || args.path || 'notes.md';
            const content = args.content || args.text || '';
            const safePath = assertPathWithinWorkspace(caseDir, targetFile);
            fs.mkdirSync(path.dirname(safePath), { recursive: true });
            fs.appendFileSync(safePath, `\n${content}\n`, 'utf8');
            return {
                tool: 'mdAppend',
                path: safePath,
                bytesWritten: Buffer.byteLength(content, 'utf8'),
                _riskClass: decision.riskClass
            };
        }

        case 'saveartifact':
        case 'save_artifact':
        case 'savedraft':
        case 'save_draft': {
            const targetFile = args.targetFile || args.filePath || args.path || 'draft.md';
            const content = args.content || args.text || '';
            const safePath = assertPathWithinWorkspace(caseDir, targetFile);
            fs.mkdirSync(path.dirname(safePath), { recursive: true });
            fs.writeFileSync(safePath, content, 'utf8');
            return {
                tool: 'saveArtifact',
                path: safePath,
                bytesWritten: Buffer.byteLength(content, 'utf8'),
                _riskClass: decision.riskClass
            };
        }

        case 'exportsc':
        case 'export_sc':
        case 'export_supreme_court': {
            return {
                tool: 'exportSC',
                status: 'ready',
                notice: 'Supreme Court layout compiler ready for invocation',
                _riskClass: decision.riskClass
            };
        }

        case 'mcaportalsubmit':
        case 'mca_portal_submit':
        case 'submit_ipie': {
            return {
                tool: 'mcaPortalSubmit',
                status: 'submitted',
                gatewayRef: `MCA-IPIE-${Date.now()}`,
                _riskClass: decision.riskClass
            };
        }

        case 'schedulewake':
        case 'schedule_wake':
        case 'sleep_until': {
            const wakeScheduler = require('../../daemon/wake-scheduler');
            let fireAt = args.fireAt;
            if (!fireAt && typeof args.days === 'number') {
                fireAt = new Date(Date.now() + (args.days * 86400000)).toISOString();
            } else if (!fireAt && typeof args.hours === 'number') {
                fireAt = new Date(Date.now() + (args.hours * 3600000)).toISOString();
            } else if (!fireAt && typeof args.minutes === 'number') {
                fireAt = new Date(Date.now() + (args.minutes * 60000)).toISOString();
            }
            const wake = wakeScheduler.addTimerWake(caseDir, {
                sessionId: sessionContext.sessionId || 'agent_session',
                fireAt,
                note: args.note || 'Scheduled agent resumption',
                actionPayload: args.payload || {}
            });
            return {
                tool: 'scheduleWake',
                wakeId: wake.id,
                fireAt: wake.fireAt,
                note: wake.note,
                status: 'scheduled',
                _riskClass: decision.riskClass
            };
        }

        default:
            throw new Error(`Unknown tool "${toolName}". Available tools: retrieveContexts, getKVValue, getAllKV, writeKV, queryTimeline, vaultLookup, checkCrossReference, lintDraft, mdAppend, saveArtifact, exportSC, mcaPortalSubmit, scheduleWake.`);
    }
}

module.exports = { executeTool, RiskClass, ExecutionMode, evaluateToolCall, classify };

