'use strict';

/**
 * Durable Resume Coordinator (Hayagriva).
 * Adapted from Andrew Ng's OpenWorker architecture (coworker/inbox.py).
 * 
 * Provides cold-process resumption across laptop closures and server restarts:
 * - Scans reviews/case_suspensions.json for ready_to_resume checkpoints.
 * - Idempotently dispatches to registered agent handlers (DocumentAgent, FormsAgent, PolicyGuard, etc.).
 * - Records cryptographic fiduciary audit trail entries (Section 65B/63 compliant).
 */

const fs = require('fs');
const path = require('path');
const inboxManager = require('./inbox-manager');
const auditTrail = require('../core/audit_trail');

class DurableResumeCoordinator {
    constructor() {
        this._handlers = new Map();
        this._registerDefaultHandlers();
    }

    /**
     * Registers a specialized resumption handler for an agent or domain task.
     * 
     * @param {string} agentNameOrKey 
     * @param {Function} handlerFn async (caseDir, suspension, resolution) => result
     */
    registerHandler(agentNameOrKey, handlerFn) {
        if (typeof handlerFn !== 'function') {
            throw new Error(`Handler for ${agentNameOrKey} must be a function`);
        }
        this._handlers.set(String(agentNameOrKey).toLowerCase().trim(), handlerFn);
    }

    /**
     * Unregisters a handler.
     */
    unregisterHandler(agentNameOrKey) {
        this._handlers.delete(String(agentNameOrKey).toLowerCase().trim());
    }

    /**
     * Registers default built-in subagent resumption handlers.
     */
    _registerDefaultHandlers() {
        // 1. DocumentAgent Continuation Handler
        this.registerHandler('documentagent', async (caseDir, suspension, resolution) => {
            const ctx = suspension.continuationContext || {};
            const isApproved = resolution === 'allow' || resolution === 'approved' || 
                (typeof resolution === 'object' && resolution.action === 'approve');

            if (!isApproved) {
                return {
                    status: 'cancelled',
                    message: `Document draft operation cancelled by human authority: ${JSON.stringify(resolution)}`
                };
            }

            // If draft content is in context, commit to drafts folder
            if (ctx.targetFile && ctx.content) {
                const fullTarget = path.isAbsolute(ctx.targetFile) 
                    ? ctx.targetFile 
                    : path.join(caseDir, ctx.targetFile);
                fs.mkdirSync(path.dirname(fullTarget), { recursive: true });
                fs.writeFileSync(fullTarget, ctx.content, 'utf8');
                return {
                    status: 'completed',
                    action: 'draft_written',
                    file: path.relative(caseDir, fullTarget),
                    bytes: Buffer.byteLength(ctx.content, 'utf8')
                };
            }

            return {
                status: 'completed',
                message: `DocumentAgent resumed successfully with resolution: ${JSON.stringify(resolution)}`,
                context: ctx
            };
        });

        // 2. FormsAgent Continuation Handler
        this.registerHandler('formsagent', async (caseDir, suspension, resolution) => {
            const ctx = suspension.continuationContext || {};
            const isApproved = resolution === 'allow' || resolution === 'approved';

            if (!isApproved) {
                return {
                    status: 'cancelled',
                    message: `Statutory Form generation declined: ${JSON.stringify(resolution)}`
                };
            }

            return {
                status: 'completed',
                message: `FormsAgent statutory verification memo dispatched for Form ${ctx.formType || 'statutory'}`,
                context: ctx
            };
        });

        // 3. PolicyGuard Continuation Handler
        this.registerHandler('policyguard', async (caseDir, suspension, resolution) => {
            const ctx = suspension.continuationContext || {};
            const isApproved = resolution === 'allow' || resolution === 'approved' || resolution === 'this_run';

            if (!isApproved) {
                return {
                    status: 'blocked',
                    message: `PolicyGuard hard floor operation was rejected by practitioner.`
                };
            }

            const op = ctx.operation || {};
            // Execute authorized file write if requested
            if (op.type === 'WRITE_LOCAL' && op.path && op.content !== undefined) {
                fs.mkdirSync(path.dirname(op.path), { recursive: true });
                fs.writeFileSync(op.path, op.content, 'utf8');
                return {
                    status: 'executed',
                    action: 'authorized_file_write',
                    path: op.path
                };
            }

            return {
                status: 'unblocked',
                message: `Hard floor ${ctx.hardFloor || 'INTERCEPT'} unblocked following practitioner authorization.`,
                operation: op
            };
        });

        // 4. Generic Fallback Continuation Handler
        this.registerHandler('generic', async (caseDir, suspension, resolution) => {
            return {
                status: 'completed',
                resumedBy: 'generic_continuation_handler',
                resolution,
                context: suspension.continuationContext
            };
        });
    }

    /**
     * Resolves the appropriate handler for a suspension record.
     */
    _getHandler(suspension) {
        const key = String(suspension.agentName || 'generic').toLowerCase().trim();
        if (this._handlers.has(key)) {
            return this._handlers.get(key);
        }

        // Try dynamically loading custom handlerModule if provided
        if (suspension.handlerModule) {
            try {
                let modPath = suspension.handlerModule;
                if (!path.isAbsolute(modPath)) {
                    modPath = path.resolve(__dirname, modPath);
                }
                const loadedMod = require(modPath);
                const fnName = suspension.handlerFunction || 'resume';
                if (typeof loadedMod[fnName] === 'function') {
                    return loadedMod[fnName];
                }
                if (typeof loadedMod === 'function') {
                    return loadedMod;
                }
            } catch (err) {
                console.warn(`[DurableResumeCoordinator] Failed loading custom module ${suspension.handlerModule}: ${err.message}`);
            }
        }

        // Fallback to generic
        return this._handlers.get('generic');
    }

    /**
     * Resumes a suspended task from reviews/case_suspensions.json.
     * Idempotent: If already resumed, safely returns existing state.
     * 
     * @param {string} caseDir 
     * @param {string} suspensionId 
     * @param {Object} [options] { force?: boolean }
     * @returns {Promise<Object>} { success: boolean, suspension: Object, result: Object }
     */
    async resumeSuspension(caseDir, suspensionId, options = {}) {
        if (!caseDir) {
            throw new Error('caseDir is required for durable resume.');
        }

        const store = inboxManager.loadSuspensions(caseDir);
        const suspension = store.suspensions.find(s => s.id === suspensionId);

        if (!suspension) {
            const err = new Error(`Suspension checkpoint "${suspensionId}" not found.`);
            err.code = 'ERR_SUSPENSION_NOT_FOUND';
            throw err;
        }

        // Idempotency check: Already resumed?
        if (suspension.state === inboxManager.SUSPENSION_STATE_RESUMED && !options.force) {
            return {
                success: true,
                alreadyResumed: true,
                suspension,
                result: suspension.metadata ? suspension.metadata.lastResult : null
            };
        }

        // If still in 'suspended' state, ensure we have a resolution before resuming
        if (suspension.state === inboxManager.SUSPENSION_STATE_SUSPENDED && !options.force && !suspension.resolution) {
            throw new Error(`Suspension "${suspensionId}" is still in 'suspended' state and has not been resolved.`);
        }

        // Find execution handler
        const handler = this._getHandler(suspension);

        let executionResult = null;
        try {
            executionResult = await handler(caseDir, suspension, suspension.resolution);
        } catch (handlerErr) {
            console.error(`[DurableResumeCoordinator] Error executing handler for ${suspension.agentName}: ${handlerErr.message}`);
            executionResult = {
                status: 'error',
                error: handlerErr.message,
                stack: handlerErr.stack
            };
        }

        // Update state to resumed
        suspension.state = inboxManager.SUSPENSION_STATE_RESUMED;
        suspension.resumedAt = new Date().toISOString();
        if (!suspension.metadata) suspension.metadata = {};
        suspension.metadata.lastResult = executionResult;

        inboxManager.saveSuspensions(caseDir, store);

        // Record immutable audit trail event
        try {
            await auditTrail.appendEntry(caseDir, {
                actor: suspension.agentName || 'COORDINATOR',
                event: 'DURABLE_AGENT_RESUMED',
                matter: path.basename(caseDir),
                task_id: suspension.id,
                inputs: {
                    itemId: suspension.itemId,
                    toolCallId: suspension.toolCallId,
                    sessionId: suspension.sessionId
                },
                verdict: suspension.resolution,
                fiduciary_role: 'IN_CHAMBER_SENTINEL',
                metadata: {
                    suspension_id: suspension.id,
                    execution_result: executionResult
                }
            });
        } catch (auditErr) {
            console.warn(`[DurableResumeCoordinator] Audit log warning: ${auditErr.message}`);
        }

        return {
            success: true,
            alreadyResumed: false,
            suspension,
            result: executionResult
        };
    }

    /**
     * Cold-process startup sweep:
     * Scans for all checkpoints with state 'ready_to_resume' and dispatches them.
     * 
     * @param {string} caseDir 
     * @returns {Promise<Object>} { swept: number, resumed: Array, failed: Array }
     */
    async sweepAndResumePending(caseDir) {
        if (!caseDir) return { swept: 0, resumed: [], failed: [] };

        const { suspensions } = inboxManager.listSuspensions(caseDir, {
            state: inboxManager.SUSPENSION_STATE_READY
        });

        const resumed = [];
        const failed = [];

        for (const susp of suspensions) {
            try {
                const outcome = await this.resumeSuspension(caseDir, susp.id);
                resumed.push({ id: susp.id, agent: susp.agentName, result: outcome.result });
            } catch (err) {
                failed.push({ id: susp.id, error: err.message });
            }
        }

        return {
            swept: suspensions.length,
            resumed,
            failed
        };
    }
}

// Singleton instance
const coordinator = new DurableResumeCoordinator();

module.exports = coordinator;
