'use strict';

/**
 * Case Action Inbox Manager (Hayagriva).
 * Adapted from Andrew Ng's OpenWorker architecture (coworker/inbox.py).
 * 
 * Provides an asynchronous, non-blocking Human-in-the-Loop (HITL) queue:
 * - Persisted store of record: ${caseDir}/reviews/case_inbox.json
 * - Item Kinds: APPROVAL, QUESTION, PLAN, NOTIFICATION
 * - Item States: PENDING -> RESOLVED (Idempotent / First-responder wins)
 * - Suspension Hook: Enables autonomous agents to suspend and wake when resolved.
 */

const fs = require('fs');
const path = require('path');

const KIND_APPROVAL = 'approval';
const KIND_QUESTION = 'question';
const KIND_PLAN = 'plan';
const KIND_NOTIFICATION = 'notification';

const STATE_PENDING = 'pending';
const STATE_RESOLVED = 'resolved';

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
 * Creates a new actionable item in the case inbox.
 * 
 * @param {string} caseDir 
 * @param {Object} payload 
 * @returns {Object} Created item
 */
function createItem(caseDir, payload = {}) {
    const store = loadInbox(caseDir);
    const now = new Date().toISOString();
    const itemId = payload.id || `inbox_item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Anti-duplication by toolCallId if provided
    if (payload.toolCallId) {
        const existing = store.items.find(i => i.toolCallId === payload.toolCallId && i.state === STATE_PENDING);
        if (existing) {
            return existing;
        }
    }

    const item = {
        id: itemId,
        caseName: path.basename(caseDir || ''),
        sessionId: payload.sessionId || 'default',
        kind: payload.kind || KIND_APPROVAL,
        title: payload.title || 'Action Required',
        body: payload.body || '',
        riskClass: payload.riskClass || null,
        toolCallId: payload.toolCallId || null,
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
 * Lists inbox items with optional filtering.
 * 
 * @param {string} caseDir 
 * @param {Object} [filters] { state?: 'pending'|'resolved', kind?: string }
 * @returns {Object} { items: Array, pendingCount: number, totalCount: number }
 */
function listItems(caseDir, filters = {}) {
    const store = loadInbox(caseDir);
    let items = store.items;

    const pendingCount = items.filter(i => i.state === STATE_PENDING).length;

    if (filters.state) {
        items = items.filter(i => i.state === filters.state);
    }
    if (filters.kind) {
        items = items.filter(i => i.kind === filters.kind);
    }

    return {
        items,
        pendingCount,
        totalCount: store.items.length
    };
}

/**
 * Resolves an item (Idempotent / First-Responder Wins).
 * 
 * @param {string} caseDir 
 * @param {string} itemId 
 * @param {string} resolution 'allow' | 'deny' | answer string
 * @param {string} [resolvedBy='lawyer'] 
 * @returns {Object} { success: boolean, item: Object, alreadyResolved: boolean }
 */
function resolveItem(caseDir, itemId, resolution, resolvedBy = 'lawyer') {
    const store = loadInbox(caseDir);
    const item = store.items.find(i => i.id === itemId);

    if (!item) {
        const err = new Error(`Inbox item "${itemId}" not found.`);
        err.code = 'ERR_INBOX_ITEM_NOT_FOUND';
        throw err;
    }

    if (item.state === STATE_RESOLVED) {
        return {
            success: true,
            item,
            alreadyResolved: true
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
        const { grantRunAllowance } = require('./risk-engine');
        const runId = meta.runId || item.runId || item.sessionId || 'current_run';
        grantRunAllowance(runId, toolName);
    }

    saveInbox(caseDir, store);

    // Wake up any suspended agent waiting on this item
    if (_pendingSuspensions.has(itemId)) {
        const waiter = _pendingSuspensions.get(itemId);
        clearTimeout(waiter.timer);
        _pendingSuspensions.delete(itemId);
        waiter.resolve({
            itemId,
            resolution: item.resolution,
            resolvedBy: item.resolvedBy,
            item
        });
    }

    return {
        success: true,
        item,
        alreadyResolved: false
    };
}

/**
 * Asynchronously suspends the calling agent until the specified item is resolved.
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
    getInboxFilePath,
    loadInbox,
    saveInbox,
    createItem,
    getItem,
    listItems,
    resolveItem,
    suspendUntilResolved,
    getPendingCount
};
