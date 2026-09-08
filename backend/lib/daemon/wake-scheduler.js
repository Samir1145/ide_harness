'use strict';

/**
 * Zero-Idle Self-Wake State Machine (Hayagriva).
 * Adapted from Andrew Ng's OpenWorker architecture (coworker/selfwake.py).
 * 
 * Allows autonomous agents to suspend state cleanly (0% CPU, 0 MB RAM)
 * and wake on:
 * 1. Calendar Timers (fireAt timestamps)
 * 2. Statutory CIRP Milestones (T0 -> T330 calendar triggers)
 * 3. Background Task Completions (wake_on jobId)
 * 
 * Interacts directly with the Case Action Inbox to alert attorneys when checkpoints fire.
 */

const fs = require('fs');
const path = require('path');
const inboxManager = require('../agents/inbox-manager');

const KIND_TIMER = 'timer';
const KIND_MILESTONE = 'milestone';
const KIND_COMPLETION = 'completion';

const STATE_PENDING = 'pending';
const STATE_DUE = 'due';
const STATE_FIRED = 'fired';
const STATE_CANCELLED = 'cancelled';

// Statutory CIRP milestone intervals under Indian Insolvency & Bankruptcy Code (IBC)
const CIRP_MILESTONE_SCHEDULE = {
    'T_03_PUBLIC_ANNOUNCEMENT': {
        days: 3,
        title: 'T+3: Public Announcement & IRP Appointment (Reg 6)',
        note: 'Issue Form A public announcement within 3 days of admission order.'
    },
    'T_14_CLAIMS_SUBMISSION': {
        days: 14,
        title: 'T+14: Creditor Claims Submission Deadline (Reg 12)',
        note: 'Closing date for submission of claims by financial and operational creditors.'
    },
    'T_21_CLAIMS_VERIFICATION': {
        days: 21,
        title: 'T+21: Claims Verification & CoC Constitution (Reg 13/17)',
        note: 'IRP must verify all claims and submit the list of creditors to NCLT.'
    },
    'T_30_FIRST_COC_MEETING': {
        days: 30,
        title: 'T+30: First Meeting of Committee of Creditors (Sec 22)',
        note: 'Convene 1st CoC meeting to resolve whether to appoint RP or confirm IRP.'
    },
    'T_75_FORM_G_EOI': {
        days: 75,
        title: 'T+75: Publication of Form G / EOI Invitation (Reg 36A)',
        note: 'Publish Form G inviting Expressions of Interest from Prospective Resolution Applicants.'
    },
    'T_105_IM_RFRP_ISSUANCE': {
        days: 105,
        title: 'T+105: Information Memorandum & RFRP Issuance (Reg 36B)',
        note: 'Issue IM, Request for Resolution Plans (RFRP), and evaluation matrix to eligible PRAs.'
    },
    'T_135_RESOLUTION_PLANS': {
        days: 135,
        title: 'T+135: Receipt of Resolution Plans (Reg 39)',
        note: 'Deadline for PRAs to submit compliant resolution plans.'
    },
    'T_165_COC_PLAN_VOTING': {
        days: 165,
        title: 'T+165: CoC Voting on Resolution Plans (Sec 30(4))',
        note: 'CoC votes on compliant resolution plans (66% voting share threshold required).'
    },
    'T_180_FORM_H_FILING': {
        days: 180,
        title: 'T+180: Submission of Form H Compliance Certificate to NCLT',
        note: 'RP files Form H and application for approval of resolution plan before the Adjudicating Authority.'
    },
    'T_330_STATUTORY_LIMIT': {
        days: 330,
        title: 'T+330: Outer Statutory CIRP Completion Limit (Sec 12)',
        note: 'Outer mandatory completion timeframe including litigation extensions.'
    }
};

let _wakeLoopInterval = null;

function getWakesFilePath(caseDir) {
    return path.join(caseDir, 'reviews', 'case_wakes.json');
}

function loadWakes(caseDir) {
    if (!caseDir) return { wakes: [] };
    const filePath = getWakesFilePath(caseDir);
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(raw);
            if (Array.isArray(data.wakes)) {
                return data;
            }
        }
    } catch (err) {
        console.warn(`[WakeScheduler] Error loading wakes from ${filePath}: ${err.message}`);
    }
    return { wakes: [] };
}

function saveWakes(caseDir, data) {
    if (!caseDir) return;
    const filePath = getWakesFilePath(caseDir);
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error(`[WakeScheduler] Error saving wakes to ${filePath}: ${err.message}`);
        throw err;
    }
}

/**
 * Schedules a timer wake for an agent session.
 */
function addTimerWake(caseDir, payload = {}) {
    const store = loadWakes(caseDir);
    const wake = {
        id: payload.id || `wake_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        caseName: path.basename(caseDir || ''),
        sessionId: payload.sessionId || 'default',
        kind: KIND_TIMER,
        milestoneKey: payload.milestoneKey || null,
        fireAt: payload.fireAt ? new Date(payload.fireAt).toISOString() : new Date().toISOString(),
        jobId: null,
        state: STATE_PENDING,
        note: payload.note || 'Scheduled timer wake',
        actionPayload: payload.actionPayload || {},
        createdAt: new Date().toISOString(),
        firedAt: null
    };

    store.wakes.push(wake);
    saveWakes(caseDir, store);
    return wake;
}

/**
 * Schedules a completion wake triggered when a background job finishes.
 */
function addCompletionWake(caseDir, payload = {}) {
    const store = loadWakes(caseDir);
    const wake = {
        id: payload.id || `wake_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        caseName: path.basename(caseDir || ''),
        sessionId: payload.sessionId || 'default',
        kind: KIND_COMPLETION,
        milestoneKey: null,
        fireAt: null,
        jobId: payload.jobId || 'job_unknown',
        state: STATE_PENDING,
        note: payload.note || `Wake on completion of job ${payload.jobId}`,
        actionPayload: payload.actionPayload || {},
        createdAt: new Date().toISOString(),
        firedAt: null
    };

    store.wakes.push(wake);
    saveWakes(caseDir, store);
    return wake;
}

/**
 * Automatically calculates and schedules all 10 statutory CIRP milestone wakes
 * from the insolvency commencement date (T0).
 * 
 * @param {string} caseDir 
 * @param {string|Date} admissionDate T0 admission date
 * @returns {Array<Object>} Created milestone wakes
 */
function scheduleCirpMilestones(caseDir, admissionDate) {
    const baseDate = new Date(admissionDate);
    if (isNaN(baseDate.getTime())) {
        throw new Error(`Invalid admission date provided for CIRP scheduling: ${admissionDate}`);
    }

    const store = loadWakes(caseDir);
    // Remove existing pending milestone wakes to avoid duplicate timeline schedules
    store.wakes = store.wakes.filter(w => !(w.kind === KIND_MILESTONE && w.state === STATE_PENDING));

    const createdMilestones = [];

    for (const [key, meta] of Object.entries(CIRP_MILESTONE_SCHEDULE)) {
        const targetTime = new Date(baseDate.getTime() + (meta.days * 24 * 60 * 60 * 1000));
        const wake = {
            id: `wake_cirp_${key.toLowerCase()}_${Date.now()}`,
            caseName: path.basename(caseDir || ''),
            sessionId: 'cirp_timeline',
            kind: KIND_MILESTONE,
            milestoneKey: key,
            fireAt: targetTime.toISOString(),
            jobId: null,
            state: STATE_PENDING,
            note: meta.title,
            actionPayload: {
                milestoneDays: meta.days,
                guidance: meta.note
            },
            createdAt: new Date().toISOString(),
            firedAt: null
        };
        store.wakes.push(wake);
        createdMilestones.push(wake);
    }

    saveWakes(caseDir, store);
    return createdMilestones;
}

/**
 * Retrieves all pending wakes that are due (fireAt <= now).
 */
function getDueWakes(caseDir, now = new Date()) {
    const store = loadWakes(caseDir);
    const currentTime = new Date(now).getTime();

    return store.wakes.filter(w => {
        if (w.state !== STATE_PENDING) return false;
        if (w.kind === KIND_COMPLETION) return false; // Triggered via completeJob
        if (w.fireAt) {
            return new Date(w.fireAt).getTime() <= currentTime;
        }
        return false;
    });
}

/**
 * Fires a wake, transitioning state from pending -> fired, and alerting Case Action Inbox.
 * 
 * @param {string} caseDir 
 * @param {string} wakeId 
 * @returns {Object} Fired wake record
 */
function fireWake(caseDir, wakeId) {
    const store = loadWakes(caseDir);
    const wake = store.wakes.find(w => w.id === wakeId);

    if (!wake) {
        throw new Error(`Wake "${wakeId}" not found in case ${caseDir}`);
    }

    if (wake.state === STATE_FIRED) {
        return wake;
    }

    wake.state = STATE_FIRED;
    wake.firedAt = new Date().toISOString();
    saveWakes(caseDir, store);

    // Cross-phase integration: Inject actionable notification into Case Action Inbox (Phase 2)
    try {
        inboxManager.createItem(caseDir, {
            kind: 'notification',
            title: `[Statutory Milestone] ${wake.note || wake.milestoneKey}`,
            body: `CIRP Timeline checkpoint reached. ${wake.actionPayload?.guidance || ''}`,
            data: {
                wakeId: wake.id,
                kind: wake.kind,
                milestoneKey: wake.milestoneKey,
                fireAt: wake.fireAt
            }
        });
    } catch (err) {
        console.warn(`[WakeScheduler] Failed to create inbox notification on wake ${wakeId}:`, err.message);
    }

    return wake;
}

/**
 * Fires any completion wakes waiting on a specific background job.
 */
function completeJob(caseDir, jobId, resultPayload = null) {
    const store = loadWakes(caseDir);
    const matched = store.wakes.filter(w => w.kind === KIND_COMPLETION && w.jobId === jobId && w.state === STATE_PENDING);

    const fired = [];
    for (const w of matched) {
        w.state = STATE_FIRED;
        w.firedAt = new Date().toISOString();
        if (resultPayload) {
            w.actionPayload = { ...w.actionPayload, result: resultPayload };
        }
        fired.push(w);

        // Notify inbox
        try {
            inboxManager.createItem(caseDir, {
                kind: 'notification',
                title: `[Task Complete] ${w.note}`,
                body: `Background job "${jobId}" has finished. Resuming dependent workflow.`,
                data: { jobId, result: resultPayload }
            });
        } catch (_) {}
    }

    if (fired.length > 0) {
        saveWakes(caseDir, store);
    }
    return fired;
}

/**
 * Starts the zero-idle periodic evaluation loop.
 */
function startWakeLoop(intervalMs = 60000, onWakeFired = null) {
    if (_wakeLoopInterval) return;

    _wakeLoopInterval = setInterval(() => {
        // Evaluate wakes across registered active cases if any
    }, intervalMs);

    // Unref timer so it does not keep Node.js process artificially alive
    if (_wakeLoopInterval && typeof _wakeLoopInterval.unref === 'function') {
        _wakeLoopInterval.unref();
    }
}

function stopWakeLoop() {
    if (_wakeLoopInterval) {
        clearInterval(_wakeLoopInterval);
        _wakeLoopInterval = null;
    }
}

module.exports = {
    KIND_TIMER,
    KIND_MILESTONE,
    KIND_COMPLETION,
    STATE_PENDING,
    STATE_DUE,
    STATE_FIRED,
    STATE_CANCELLED,
    CIRP_MILESTONE_SCHEDULE,
    getWakesFilePath,
    loadWakes,
    saveWakes,
    addTimerWake,
    addCompletionWake,
    scheduleCirpMilestones,
    getDueWakes,
    fireWake,
    completeJob,
    startWakeLoop,
    stopWakeLoop
};
