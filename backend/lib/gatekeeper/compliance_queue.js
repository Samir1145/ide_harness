'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Resolves the path to compliance_queue.json within a matter directory.
 * @param {string} matterDir
 * @returns {string}
 */
function resolveQueuePath(matterDir) {
  if (!matterDir) {
    throw new Error('[ComplianceQueue] matterDir is required');
  }
  const rootQueue = path.join(matterDir, 'compliance_queue.json');
  const dossierDir = path.join(matterDir, '01_dossier');
  const dossierQueue = path.join(dossierDir, 'compliance_queue.json');

  if (fs.existsSync(dossierQueue)) {
    return dossierQueue;
  }
  if (fs.existsSync(rootQueue)) {
    return rootQueue;
  }
  if (fs.existsSync(dossierDir)) {
    return dossierQueue;
  }
  return rootQueue;
}

/**
 * Reads the queue file for a given matter. Returns { matter_path, items: [] }
 * @param {string} matterDir
 * @returns {Object}
 */
function readQueue(matterDir) {
  const filePath = resolveQueuePath(matterDir);
  if (!fs.existsSync(filePath)) {
    return {
      matter_path: matterDir,
      last_updated: new Date().toISOString(),
      items: []
    };
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    let mutated = false;
    if (Array.isArray(data.items)) {
      const { getReportById } = require('../config/report_catalog_loader');
      for (const item of data.items) {
        if (!item.execution_tier) {
          const cat = getReportById(item.report_id);
          item.execution_tier = (cat && cat.execution_tier) ? cat.execution_tier : (item.report_id === 'REPORT_06' ? 'LOCAL' : 'GLOBAL');
          item.target_agent = item.target_agent || (item.execution_tier === 'LOCAL' ? '@document' : 'LEXAI');
          mutated = true;
        } else if (item.report_id === 'REPORT_06' && item.execution_tier !== 'LOCAL') {
          item.execution_tier = 'LOCAL';
          item.target_agent = '@document';
          mutated = true;
        }
        if (!item.summary_scope && item.subject) {
          item.summary_scope = item.subject.length > 70 ? item.subject.substring(0, 67) + '...' : item.subject;
          mutated = true;
        }
      }
    }
    if (mutated) {
      saveQueue(matterDir, data);
    }
    return data;
  } catch (err) {
    console.warn(`[ComplianceQueue] Warning reading ${filePath}:`, err.message);
    return { matter_path: matterDir, last_updated: new Date().toISOString(), items: [] };
  }
}

/**
 * Saves queue data to disk.
 * @param {string} matterDir
 * @param {Object} queueData
 */
function saveQueue(matterDir, queueData) {
  const filePath = resolveQueuePath(matterDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  queueData.last_updated = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(queueData, null, 2), 'utf8');
}

/**
 * Enqueue a new statutory report requisition into the compliance queue.
 * Idempotent: will not duplicate if an item with identical report_id and subject is already pending.
 *
 * @param {string} matterDir - Absolute path to matter directory
 * @param {Object} taskData
 * @param {string} taskData.report_id - e.g. "REPORT_11"
 * @param {string} taskData.report_code - e.g. "RBZ-SEC29A-ELIGIBILITY-11"
 * @param {string} taskData.title - Clean report title
 * @param {string} taskData.subject - Subject name / identifier
 * @param {string} taskData.statutory_trigger - Regulatory requirement / rationale
 * @param {string} taskData.statutory_citation - Regulation / section
 * @param {Object} taskData.required_inputs - Payload parameters (CIN, DINs, etc.)
 * @returns {Object} { task_id, status, is_new }
 */
function enqueueRequisition(matterDir, taskData = {}) {
  const queue = readQueue(matterDir);
  const { report_id, subject = '', required_inputs = {} } = taskData;

  // Check for existing pending task for this report & subject
  const existing = queue.items.find(
    item => item.report_id === report_id && 
            item.subject.toLowerCase() === subject.toLowerCase() &&
            (item.status === 'PENDING_REVIEW' || item.status === 'APPROVED' || item.status === 'DISPATCHED')
  );

  if (existing) {
    return {
      task_id: existing.task_id,
      status: existing.status,
      is_new: false,
      message: `Requisition already exists with status: ${existing.status}`
    };
  }

  const randomHex = crypto.randomBytes(3).toString('hex');
  const taskId = `req_${(report_id || 'task').toLowerCase()}_${Date.now()}_${randomHex}`;

  const executionTier = (taskData.execution_tier || 'GLOBAL').toUpperCase();
  const targetAgent = taskData.target_agent || (executionTier === 'LOCAL' ? '@document' : 'LEXAI');

  const newItem = {
    task_id: taskId,
    report_id: taskData.report_id,
    report_code: taskData.report_code || taskData.report_id,
    title: taskData.title || 'Statutory Compliance Dossier',
    execution_tier: executionTier, // 'LOCAL' (In-Chamber Sovereign AI) or 'GLOBAL' (LexAI Cloud Desk)
    target_agent: targetAgent,
    subject: taskData.subject,
    summary_scope: taskData.summary_scope || taskData.subject,
    statutory_trigger: taskData.statutory_trigger,
    statutory_citation: taskData.statutory_citation,
    required_inputs,
    status: 'PENDING_REVIEW', // PENDING_REVIEW, APPROVED, DISMISSED, DISPATCHED, COMPLETED
    enqueued_at: new Date().toISOString(),
    approved_at: null,
    dispatched_at: null,
    dispatch_mode: null,
    dispatch_result: null
  };

  queue.items.unshift(newItem);
  saveQueue(matterDir, queue);

  // Mirror to Case Action Inbox for unified HITL visibility
  try {
    const inboxManager = require('../agents/inbox-manager');
    inboxManager.createItem(matterDir, {
      id: taskId,
      kind: 'approval',
      title: `[${executionTier}] ${newItem.title} [${newItem.report_code}]`,
      body: `${newItem.statutory_trigger}\n\nSubject: ${newItem.subject}\nStatutory Mandate: ${newItem.statutory_citation}\nExecution Tier: ${executionTier} (${targetAgent})`,
      riskClass: executionTier === 'LOCAL' ? 'LOCAL_AGENT_EXEC' : 'EXTERNAL_STATUTORY_DISPATCH',
      toolCallId: taskId
    });
  } catch (_) {}

  console.log(`[ComplianceQueue] 📋 Enqueued [${executionTier}] task ${taskId} (${newItem.title}) for matter: ${path.basename(matterDir)}`);
  return {
    task_id: taskId,
    status: 'PENDING_REVIEW',
    is_new: true,
    item: newItem
  };
}

/**
 * Returns all items in the matter's compliance queue, optionally filtered by status or execution tier.
 * @param {string} matterDir
 * @param {Object} [filter]
 * @param {string} [filter.status]
 * @param {string} [filter.tier] - 'LOCAL' or 'GLOBAL'
 * @returns {Array}
 */
function getQueue(matterDir, filter = {}) {
  const queue = readQueue(matterDir);
  let items = queue.items || [];
  if (filter.status && filter.status !== 'ALL') {
    const s = filter.status.toUpperCase();
    items = items.filter(it => it.status === s);
  }
  if (filter.tier && filter.tier !== 'ALL') {
    const t = filter.tier.toUpperCase();
    items = items.filter(it => (it.execution_tier || 'GLOBAL').toUpperCase() === t);
  }
  return items;
}

/**
 * Updates status and dispatch details for a task.
 * @param {string} matterDir
 * @param {string} taskId
 * @param {string} newStatus - 'APPROVED', 'DISMISSED', 'DISPATCHED'
 * @param {Object} [details]
 * @returns {Object|null}
 */
function updateTaskStatus(matterDir, taskId, newStatus, details = {}) {
  const queue = readQueue(matterDir);
  const item = queue.items.find(it => it.task_id === taskId);
  if (!item) return null;

  item.status = newStatus.toUpperCase();

  if (item.status === 'APPROVED') {
    item.approved_at = new Date().toISOString();
  } else if (item.status === 'DISPATCHED' || item.status === 'COMPLETED') {
    if (item.status === 'DISPATCHED') item.dispatched_at = new Date().toISOString();
    if (item.status === 'COMPLETED') item.completed_at = new Date().toISOString();
    item.dispatch_mode = details.dispatch_mode || item.dispatch_mode;
    item.dispatch_result = details.dispatch_result || null;
  }

  saveQueue(matterDir, queue);
  return item;
}

/**
 * Retrieve a single task by ID.
 * @param {string} matterDir
 * @param {string} taskId
 * @returns {Object|null}
 */
function getTaskById(matterDir, taskId) {
  const queue = readQueue(matterDir);
  return queue.items.find(it => it.task_id === taskId) || null;
}

module.exports = {
  enqueueRequisition,
  getQueue,
  updateTaskStatus,
  getTaskById,
  resolveQueuePath
};
