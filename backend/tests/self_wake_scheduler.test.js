'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
    KIND_TIMER,
    KIND_MILESTONE,
    KIND_COMPLETION,
    STATE_PENDING,
    STATE_FIRED,
    CIRP_MILESTONE_SCHEDULE,
    loadWakes,
    addTimerWake,
    addCompletionWake,
    scheduleCirpMilestones,
    getDueWakes,
    fireWake,
    completeJob,
    startWakeLoop,
    stopWakeLoop
} = require('../lib/daemon/wake-scheduler');
const { executeTool } = require('../lib/agents/skills/tool-dispatcher');
const inboxManager = require('../lib/agents/inbox-manager');

async function runTests() {
    console.log('[Zero-Idle Self-Wake State Machine Unit & Integration Tests]');

    const tempCaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hayagriva-wake-test-'));

    try {
        // 1. Timer Wake Scheduling & Persistence
        console.log('  -> Test 1: addTimerWake persists timer checkpoint to disk');
        const futureDate = new Date(Date.now() + 3600000); // 1 hour from now
        const timerWake = addTimerWake(tempCaseDir, {
            sessionId: 'session_advisor',
            fireAt: futureDate.toISOString(),
            note: 'Verify Form 2 claims reconciliation'
        });

        assert(timerWake.id.startsWith('wake_'), 'Expected valid wake ID');
        assert.strictEqual(timerWake.state, STATE_PENDING);
        assert.strictEqual(timerWake.kind, KIND_TIMER);

        const wakesJsonPath = path.join(tempCaseDir, 'reviews', 'case_wakes.json');
        assert(fs.existsSync(wakesJsonPath), 'reviews/case_wakes.json must exist');
        const store = loadWakes(tempCaseDir);
        assert.strictEqual(store.wakes.length, 1);
        assert.strictEqual(store.wakes[0].id, timerWake.id);

        // 2. Due Wake Evaluation
        console.log('  -> Test 2: getDueWakes returns only past/current timer wakes');
        // Currently future wake should not be due
        const dueInitial = getDueWakes(tempCaseDir);
        assert.strictEqual(dueInitial.length, 0);

        // Add an immediately due wake (1 minute in the past)
        const pastDate = new Date(Date.now() - 60000);
        const pastWake = addTimerWake(tempCaseDir, {
            sessionId: 'session_due',
            fireAt: pastDate.toISOString(),
            note: 'Overdue statutory compliance notice'
        });

        const dueAfter = getDueWakes(tempCaseDir);
        assert.strictEqual(dueAfter.length, 1);
        assert.strictEqual(dueAfter[0].id, pastWake.id);

        // 3. Automated CIRP Statutory Milestone Scheduling (T0 -> T330)
        console.log('  -> Test 3: scheduleCirpMilestones computes all 10 statutory IBC checkpoints');
        const admissionDate = '2024-03-01T00:00:00.000Z';
        const milestones = scheduleCirpMilestones(tempCaseDir, admissionDate);

        assert.strictEqual(milestones.length, 10, 'Expected exactly 10 IBC milestone checkpoints');
        const keys = milestones.map(m => m.milestoneKey);
        assert(keys.includes('T_03_PUBLIC_ANNOUNCEMENT'), 'Expected T+3 Public Announcement');
        assert(keys.includes('T_14_CLAIMS_SUBMISSION'), 'Expected T+14 Claims Deadline');
        assert(keys.includes('T_21_CLAIMS_VERIFICATION'), 'Expected T+21 Claims Verification');
        assert(keys.includes('T_30_FIRST_COC_MEETING'), 'Expected T+30 1st CoC Meeting');
        assert(keys.includes('T_75_FORM_G_EOI'), 'Expected T+75 Form G EOI');
        assert(keys.includes('T_105_IM_RFRP_ISSUANCE'), 'Expected T+105 IM/RFRP');
        assert(keys.includes('T_135_RESOLUTION_PLANS'), 'Expected T+135 Resolution Plans');
        assert(keys.includes('T_165_COC_PLAN_VOTING'), 'Expected T+165 Plan Voting');
        assert(keys.includes('T_180_FORM_H_FILING'), 'Expected T+180 Form H Filing');
        assert(keys.includes('T_330_STATUTORY_LIMIT'), 'Expected T+330 Outer Limit');

        // Check date math: T+14 should be 2024-03-15
        const t14 = milestones.find(m => m.milestoneKey === 'T_14_CLAIMS_SUBMISSION');
        const expectedT14Date = new Date('2024-03-15T00:00:00.000Z').getTime();
        assert.strictEqual(new Date(t14.fireAt).getTime(), expectedT14Date);

        // 4. Milestone Firing & Case Action Inbox Injection
        console.log('  -> Test 4: fireWake transitions pending -> fired and notifies Case Action Inbox');
        const firedWake = fireWake(tempCaseDir, t14.id);
        assert.strictEqual(firedWake.state, STATE_FIRED);
        assert(firedWake.firedAt, 'Expected firedAt timestamp');

        // Verify inbox item was automatically injected
        const inboxList = inboxManager.listItems(tempCaseDir);
        assert(inboxList.items.length >= 1, 'Expected notification item in Case Action Inbox');
        const notif = inboxList.items.find(i => i.data && i.data.wakeId === t14.id);
        assert(notif !== undefined, 'Expected matching inbox notification for fired milestone');
        assert(notif.title.includes('T+14: Creditor Claims Submission Deadline'));

        // 5. Completion Wakes (wake_on jobId)
        console.log('  -> Test 5: completeJob triggers awaiting completion wakes');
        const compWake = addCompletionWake(tempCaseDir, {
            sessionId: 'session_ocr',
            jobId: 'job_ocr_scan_999',
            note: 'Resume evaluation after balance sheet OCR finishes'
        });
        assert.strictEqual(compWake.state, STATE_PENDING);

        const firedJobs = completeJob(tempCaseDir, 'job_ocr_scan_999', { pagesProcessed: 42 });
        assert.strictEqual(firedJobs.length, 1);
        assert.strictEqual(firedJobs[0].id, compWake.id);
        assert.strictEqual(firedJobs[0].state, STATE_FIRED);
        assert.strictEqual(firedJobs[0].actionPayload.result.pagesProcessed, 42);

        // 6. Subagent Tool Dispatcher Integration
        console.log('  -> Test 6: executeTool schedules wake via scheduleWake tool');
        const toolRes = await executeTool(tempCaseDir, 'scheduleWake', {
            days: 7,
            note: 'Audit provisional claims ledger'
        });
        assert.strictEqual(toolRes.status, 'scheduled');
        assert.strictEqual(toolRes._riskClass, 'write_local');
        assert(toolRes.wakeId.startsWith('wake_'));

        // 7. Background Loop Lifecycle
        console.log('  -> Test 7: startWakeLoop and stopWakeLoop execute safely without leak');
        startWakeLoop(5000);
        stopWakeLoop();

        console.log('  ✓ SUCCESS: All 7 Zero-Idle Self-Wake State Machine tests passed!');
    } finally {
        if (tempCaseDir && fs.existsSync(tempCaseDir)) {
            fs.rmSync(tempCaseDir, { recursive: true, force: true });
        }
    }
}

if (require.main === module) {
    runTests().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { run: runTests, runTests };
