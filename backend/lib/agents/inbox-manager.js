'use strict';

/**
 * Case Action Inbox Manager (Hayagriva).
 * Adapted from Andrew Ng's OpenWorker architecture (coworker/inbox.py).
 * 
 * Provides an asynchronous, non-blocking Human-in-the-Loop (HITL) queue:
 * - Persisted store of record: ${caseDir}/reviews/case_inbox.json
 * - Durable suspensions: ${caseDir}/reviews/case_suspensions.json
 * - Visibility Modes: VIS_INLINE (attended chat prompt) vs VIS_INBOX (unattended background queue)
 * - Item Kinds: APPROVAL, QUESTION, PLAN, NOTIFICATION
 * - Item States: PENDING -> RESOLVED (Idempotent / First-responder wins keyed by (session_id, tool_call_id))
 * - Suspension Hook: Enables autonomous subagents to suspend and durably wake across server restarts.
 */

const fs = require('fs');
const path = require('path');

const KIND_APPROVAL = 'approval';
const KIND_QUESTION = 'question';
const KIND_PLAN = 'plan';
const KIND_NOTIFICATION = 'notification';

const STATE_PENDING = 'pending';
const STATE_RESOLVED = 'resolved';

// Visibility Modes (Plan 16 / OpenWorker inbox.py)
const VIS_INLINE = 'inline';   // Attended session: prompts render directly in chat composer
const VIS_INBOX = 'inbox';     // Unattended / background session: parked silently in sidebar drawer
const VIS_ALL = 'all';         // Filter selector

// Durable Suspension States
const SUSPENSION_STATE_SUSPENDED = 'suspended';
const SUSPENSION_STATE_READY = 'ready_to_resume';
const SUSPENSION_STATE_RESUMED = 'resumed';
const SUSPENSION_STATE_CANCELLED = 'cancelled';

// In-memory registry of suspended promises awaiting resolution
// Key: itemId -> { resolve, reject, timer }
const _pendingSuspensions = new Map();

/**
 * Resolves the path to the inbox JSON file for a given case directory.
 */
function getInboxFilePath(caseDir) {
    return path.join(caseDir, 'reviews', 'case_inbox.json');
}

/**
 * Resolves the path to the durable suspensions JSON file for a given case directory.
 */
function getSuspensionsFilePath(caseDir) {
    return path.join(caseDir, 'reviews', 'case_suspensions.json');
}

/**
 * Loads all items from the case inbox file.
 */
function loadInbox(caseDir) {
    if (!caseDir) return { items: [] };
    const filePath = getInboxFilePath(caseDir);
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(raw);
            if (Array.isArray(data.items)) {
                return data;
            }
        }
    } catch (err) {
        console.warn(`[InboxManager] Error loading inbox from ${filePath}: ${err.message}`);
    }
    return { items: [] };
}

/**
 * Saves inbox data to the case inbox file.
 */
function saveInbox(caseDir, data) {
    if (!caseDir) return;
    const filePath = getInboxFilePath(caseDir);
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error(`[InboxManager] Error saving inbox to ${filePath}: ${err.message}`);
        throw err;
    }
}

/**
 * Loads all durable suspensions for a case.
 */
function loadSuspensions(caseDir) {
    if (!caseDir) return { suspensions: [] };
    const filePath = getSuspensionsFilePath(caseDir);
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(raw);
            if (Array.isArray(data.suspensions)) {
                return data;
            }
        }
    } catch (err) {
        console.warn(`[InboxManager] Error loading suspensions from ${filePath}: ${err.message}`);
    }
    return { suspensions: [] };
}

/**
 * Saves durable suspensions to the case file.
 */
function saveSuspensions(caseDir, data) {
    if (!caseDir) return;
    const filePath = getSuspensionsFilePath(caseDir);
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error(`[InboxManager] Error saving suspensions to ${filePath}: ${err.message}`);
        throw err;
    }
}

/**
 * Creates a new actionable item in the case inbox.
 * Supports VIS_INLINE (active chat stream) vs VIS_INBOX (background queue).
 * Idempotently keyed by (sessionId, toolCallId) to eliminate duplicate approval requests.
 * 
 * @param {string} caseDir 
 * @param {Object} payload 
 * @returns {Object} Created or existing item
 */
function createItem(caseDir, payload = {}) {
    const store = loadInbox(caseDir);
    const now = new Date().toISOString();
    const itemId = payload.id || `inbox_item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const sessionId = payload.sessionId || 'default';

    // Anti-duplication by composite natural tuple (sessionId, toolCallId)
    if (payload.toolCallId) {
        const existing = store.items.find(i => 
            i.sessionId === sessionId && 
            i.toolCallId === payload.toolCallId
        );
        if (existing) {
            return existing;
        }
    }

    // Determine visibility mode:
    // If not explicitly provided: attended chat sessions default to VIS_INLINE,
    // unattended/daemon/statutory background jobs default to VIS_INBOX.
    let visibility = payload.visibility;
    if (!visibility) {
        const isAttendedChat = sessionId !== 'default' && 
            sessionId !== 'statutory_sentinel' && 
            sessionId !== 'background' &&
            sessionId !== 'watcher' &&
            !payload.unattended;
        visibility = isAttendedChat ? VIS_INLINE : VIS_INBOX;
    }

    const item = {
        id: itemId,
        caseName: path.basename(caseDir || ''),
        sessionId,
        visibility,
        kind: payload.kind || KIND_APPROVAL,
        title: payload.title || 'Action Required',
        body: payload.body || '',
        riskClass: payload.riskClass || null,
        toolCallId: payload.toolCallId || null,
        idempotencyKey: `${sessionId}::${payload.toolCallId || itemId}`,
        state: STATE_PENDING,
        resolution: null,
        resolvedBy: null,
        createdAt: now,
        resolvedAt: null,
        options: Array.isArray(payload.options) ? payload.options : [],
        data: payload.data && typeof payload.data === 'object' ? payload.data : {},
        metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : (payload.data || {})
    };

    store.items.unshift(item); // Prepend so newest is first
    saveInbox(caseDir, store);

    return item;
}

/**
 * Retrieves a single inbox item by ID.
 */
function getItem(caseDir, itemId) {
    const store = loadInbox(caseDir);
    return store.items.find(i => i.id === itemId) || null;
}

/**
 * Lists inbox items with optional filtering by state, kind, or visibility.
 * 
 * @param {string} caseDir 
 * @param {Object} [filters] { state?: 'pending'|'resolved', kind?: string, visibility?: 'inline'|'inbox'|'all' }
 * @returns {Object} { items: Array, pendingCount: number, totalCount: number, inlineCount: number, inboxCount: number }
 */
function listItems(caseDir, filters = {}) {
    // Auto-sync pending compliance queue items into inbox
    try {
        const { getQueue } = require('../gatekeeper/compliance_queue');
        const qItems = getQueue(caseDir, { status: 'PENDING_REVIEW' });
        const store = loadInbox(caseDir);
        let changed = false;
        for (const q of qItems) {
            if (!store.items.some(i => i.id === q.task_id)) {
                store.items.unshift({
                    id: q.task_id,
                    caseName: path.basename(caseDir || ''),
                    sessionId: 'statutory_sentinel',
                    visibility: VIS_INBOX,
                    kind: KIND_APPROVAL,
                    title: `${q.title} [${q.report_code}]`,
                    body: `${q.statutory_trigger}\n\nSubject: ${q.subject}\nStatutory Mandate: ${q.statutory_citation}`,
                    riskClass: 'EXTERNAL_STATUTORY_DISPATCH',
                    toolCallId: q.task_id,
                    idempotencyKey: `statutory_sentinel::${q.task_id}`,
                    state: STATE_PENDING,
                    createdAt: q.enqueued_at || new Date().toISOString(),
                    resolvedAt: null,
                    resolution: null,
                    resolvedBy: null
                });
                changed = true;
            }
        }
        if (changed) {
            saveInbox(caseDir, store);
        }
    } catch (_) {}

    const store = loadInbox(caseDir);
    let items = store.items;

    const pendingCount = items.filter(i => i.state === STATE_PENDING).length;
    const inlineCount = items.filter(i => i.visibility === VIS_INLINE && i.state === STATE_PENDING).length;
    const inboxCount = items.filter(i => (i.visibility || VIS_INBOX) === VIS_INBOX && i.state === STATE_PENDING).length;

    if (filters.state) {
        items = items.filter(i => i.state === filters.state);
    }
    if (filters.kind) {
        items = items.filter(i => i.kind === filters.kind);
    }
    if (filters.visibility && filters.visibility !== VIS_ALL) {
        items = items.filter(i => (i.visibility || VIS_INBOX) === filters.visibility);
    }

    return {
        items,
        pendingCount,
        inlineCount,
        inboxCount,
        totalCount: store.items.length
    };
}

/**
 * Resolves an item (Idempotent / First-Responder Wins).
 * Keyed on itemId or composite tuple (sessionId, toolCallId).
 * Automatically updates durable suspensions to 'ready_to_resume' and triggers resume if configured.
 * 
 * @param {string} caseDir 
 * @param {string|Object} itemIdOrTuple String ID or { sessionId, toolCallId }
 * @param {string|Object} resolution 'allow' | 'deny' | answer string | JSON payload
 * @param {string} [resolvedBy='lawyer'] 
 * @param {Object} [options] { autoResume?: boolean }
 * @returns {Object} { success: boolean, item: Object, alreadyResolved: boolean, idempotencyKey: string }
 */
function resolveItem(caseDir, itemIdOrTuple, resolution, resolvedBy = 'lawyer', options = {}) {
    const store = loadInbox(caseDir);
    let item = null;

    if (typeof itemIdOrTuple === 'object' && itemIdOrTuple !== null) {
        const { sessionId, toolCallId, itemId } = itemIdOrTuple;
        item = store.items.find(i => 
            (itemId && i.id === itemId) || 
            (sessionId && toolCallId && i.sessionId === sessionId && i.toolCallId === toolCallId) ||
            (toolCallId && i.toolCallId === toolCallId)
        );
    } else {
        const itemId = String(itemIdOrTuple);
        item = store.items.find(i => i.id === itemId || i.toolCallId === itemId);
    }

    if (!item) {
        const err = new Error(`Inbox item "${JSON.stringify(itemIdOrTuple)}" not found.`);
        err.code = 'ERR_INBOX_ITEM_NOT_FOUND';
        throw err;
    }

    const idempotencyKey = item.idempotencyKey || `${item.sessionId || 'default'}::${item.toolCallId || item.id}`;

    if (item.state === STATE_RESOLVED) {
        return {
            success: true,
            item,
            alreadyResolved: true,
            idempotencyKey
        };
    }

    item.state = STATE_RESOLVED;
    item.resolution = typeof resolution === 'object' ? JSON.stringify(resolution) : String(resolution);
    item.resolvedBy = String(resolvedBy);
    item.resolvedAt = new Date().toISOString();

    // If resolved with ephemeral THIS_RUN grant, register in risk-engine
    const isThisRun = resolution === 'this_run' || resolution === 'allow_this_run' ||
        (typeof resolution === 'object' && (resolution.action === 'this_run' || resolution.grant === 'this_run'));
    const meta = item.metadata || item.data || {};
    const toolName = meta.toolName || item.toolName;
    if (isThisRun && toolName) {
        try {
            const { grantRunAllowance } = require('./risk-engine');
            const runId = meta.runId || item.runId || item.sessionId || 'current_run';
            grantRunAllowance(runId, toolName);
        } catch (_) {}
    }

    saveInbox(caseDir, store);

    // Record immutable fiduciary audit trail entry for HITL / Case Inbox resolution
    try {
        const auditTrail = require('../core/audit_trail');
        const isDeny = item.resolution === 'deny' || item.resolution === 'dismissed';
        const eventName = item.kind === KIND_APPROVAL 
            ? (isDeny ? 'HITL_DISMISSAL' : 'HITL_APPROVAL')
            : 'INBOX_ACTION_RESOLVED';
        
        auditTrail.appendEntry(caseDir, {
            actor: item.resolvedBy || 'HUMAN_IP',
            event: eventName,
            matter: path.basename(caseDir),
            task_id: item.id,
            inputs: {
                title: item.title,
                kind: item.kind,
                risk_class: item.riskClass,
                visibility: item.visibility
            },
            verdict: item.resolution,
            fiduciary_role: (item.resolvedBy && !item.resolvedBy.includes('Agent')) ? 'INSOLVENCY_PROFESSIONAL' : 'IN_CHAMBER_SENTINEL',
            metadata: {
                item_id: item.id,
                kind: item.kind,
                idempotency_key: idempotencyKey
            }
        }).catch(err => console.warn(`[InboxManager] Audit trail write error: ${err.message}`));
    } catch (_) {}

    // Wake up any in-memory suspended agent waiting on this item
    if (_pendingSuspensions.has(item.id)) {
        const waiter = _pendingSuspensions.get(item.id);
        clearTimeout(waiter.timer);
        _pendingSuspensions.delete(item.id);
        waiter.resolve({
            itemId: item.id,
            resolution: item.resolution,
            resolvedBy: item.resolvedBy,
            item
        });
    }

    // Update any linked durable suspension in case_suspensions.json
    try {
        const suspStore = loadSuspensions(caseDir);
        const linkedSusp = suspStore.suspensions.find(s => 
            (s.itemId === item.id) || 
            (s.toolCallId && s.toolCallId === item.toolCallId && s.sessionId === item.sessionId)
        );

        if (linkedSusp && linkedSusp.state === SUSPENSION_STATE_SUSPENDED) {
            linkedSusp.state = SUSPENSION_STATE_READY;
            linkedSusp.resolution = item.resolution;
            linkedSusp.resolvedBy = item.resolvedBy;
            linkedSusp.resolvedAt = item.resolvedAt;
            saveSuspensions(caseDir, suspStore);

            // Trigger durable resume if autoResume is not explicitly disabled
            if (options.autoResume !== false) {
                try {
                    const resumeCoordinator = require('./durable-resume-coordinator');
                    resumeCoordinator.resumeSuspension(caseDir, linkedSusp.id)
                        .catch(err => console.warn(`[InboxManager] Durable resume error: ${err.message}`));
                } catch (rErr) {
                    console.warn(`[InboxManager] Failed to trigger durable resume coordinator: ${rErr.message}`);
                }
            }
        }
    } catch (suspErr) {
        console.warn(`[InboxManager] Error syncing durable suspension: ${suspErr.message}`);
    }

    return {
        success: true,
        item,
        alreadyResolved: false,
        idempotencyKey
    };
}

/**
 * Creates an on-disk durable suspension checkpoint in reviews/case_suspensions.json.
 * 
 * @param {string} caseDir 
 * @param {Object} payload 
 * @returns {Object} Created or existing suspension record
 */
function createSuspensionCheckpoint(caseDir, payload = {}) {
    const store = loadSuspensions(caseDir);
    const now = new Date().toISOString();
    const suspensionId = payload.id || `susp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const sessionId = payload.sessionId || 'default';

    // Anti-duplication by (sessionId, toolCallId)
    if (payload.toolCallId) {
        const existing = store.suspensions.find(s => 
            s.sessionId === sessionId && 
            s.toolCallId === payload.toolCallId &&
            s.state !== SUSPENSION_STATE_RESUMED &&
            s.state !== SUSPENSION_STATE_CANCELLED
        );
        if (existing) {
            return existing;
        }
    }

    const record = {
        id: suspensionId,
        itemId: payload.itemId || null,
        sessionId,
        toolCallId: payload.toolCallId || null,
        agentName: payload.agentName || 'GeneralAgent',
        handlerModule: payload.handlerModule || null,
        handlerFunction: payload.handlerFunction || 'resume',
        state: SUSPENSION_STATE_SUSPENDED,
        continuationContext: payload.continuationContext && typeof payload.continuationContext === 'object' 
            ? payload.continuationContext 
            : {},
        resolution: null,
        resolvedBy: null,
        createdAt: now,
        resolvedAt: null,
        resumedAt: null,
        metadata: payload.metadata || {}
    };

    store.suspensions.unshift(record);
    saveSuspensions(caseDir, store);
    return record;
}

/**
 * Retrieves a durable suspension record by ID.
 */
function getSuspension(caseDir, suspensionId) {
    const store = loadSuspensions(caseDir);
    return store.suspensions.find(s => s.id === suspensionId) || null;
}

/**
 * Lists all durable suspensions for a case with filtering.
 * 
 * @param {string} caseDir 
 * @param {Object} [filters] { state?: string, agentName?: string, sessionId?: string }
 * @returns {Object} { suspensions: Array, totalCount: number, pendingCount: number }
 */
function listSuspensions(caseDir, filters = {}) {
    const store = loadSuspensions(caseDir);
    let list = store.suspensions;

    if (filters.state) {
        list = list.filter(s => s.state === filters.state);
    }
    if (filters.agentName) {
        list = list.filter(s => s.agentName === filters.agentName);
    }
    if (filters.sessionId) {
        list = list.filter(s => s.sessionId === filters.sessionId);
    }

    const pendingCount = store.suspensions.filter(s => 
        s.state === SUSPENSION_STATE_SUSPENDED || s.state === SUSPENSION_STATE_READY
    ).length;

    return {
        suspensions: list,
        pendingCount,
        totalCount: store.suspensions.length
    };
}

/**
 * Asynchronously suspends the calling agent until the specified item is resolved.
 * (In-memory promise hook for active sessions).
 * 
 * @param {string} caseDir 
 * @param {string} itemId 
 * @param {number} [timeoutMs=300000] Default: 5 minutes
 * @returns {Promise<Object>} Resolves with { itemId, resolution, resolvedBy, item }
 */
function suspendUntilResolved(caseDir, itemId, timeoutMs = 300000) {
    const existing = getItem(caseDir, itemId);
    if (!existing) {
        return Promise.reject(new Error(`Cannot suspend on non-existent inbox item "${itemId}".`));
    }

    if (existing.state === STATE_RESOLVED) {
        return Promise.resolve({
            itemId,
            resolution: existing.resolution,
            resolvedBy: existing.resolvedBy,
            item: existing
        });
    }

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            _pendingSuspensions.delete(itemId);
            const err = new Error(`Timed out waiting for inbox item "${itemId}" after ${timeoutMs}ms.`);
            err.code = 'ERR_INBOX_TIMEOUT';
            reject(err);
        }, timeoutMs);

        _pendingSuspensions.set(itemId, { resolve, reject, timer });
    });
}

/**
 * Returns count of pending items for a case.
 */
function getPendingCount(caseDir) {
    const store = loadInbox(caseDir);
    return store.items.filter(i => i.state === STATE_PENDING).length;
}

module.exports = {
    KIND_APPROVAL,
    KIND_QUESTION,
    KIND_PLAN,
    KIND_NOTIFICATION,
    STATE_PENDING,
    STATE_RESOLVED,
    VIS_INLINE,
    VIS_INBOX,
    VIS_ALL,
    SUSPENSION_STATE_SUSPENDED,
    SUSPENSION_STATE_READY,
    SUSPENSION_STATE_RESUMED,
    SUSPENSION_STATE_CANCELLED,
    getInboxFilePath,
    getSuspensionsFilePath,
    loadInbox,
    saveInbox,
    loadSuspensions,
    saveSuspensions,
    createItem,
    getItem,
    listItems,
    resolveItem,
    createSuspensionCheckpoint,
    getSuspension,
    listSuspensions,
    suspendUntilResolved,
    getPendingCount
};
