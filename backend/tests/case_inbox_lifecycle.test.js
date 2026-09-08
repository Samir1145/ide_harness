'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
    KIND_APPROVAL,
    KIND_QUESTION,
    KIND_PLAN,
    KIND_NOTIFICATION,
    STATE_PENDING,
    STATE_RESOLVED,
    createItem,
    getItem,
    listItems,
    resolveItem,
    suspendUntilResolved,
    getPendingCount
} = require('../lib/agents/inbox-manager');
const { executeTool } = require('../lib/agents/skills/tool-dispatcher');

async function runTests() {
    console.log('[Case Action Inbox Lifecycle & Asynchronous HITL Tests]');

    const tempCaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hayagriva-inbox-test-'));

    try {
        // 1. Item Creation & Persistence
        console.log('  -> Test 1: createItem creates and persists APPROVAL item on disk');
        const appItem = createItem(tempCaseDir, {
            kind: KIND_APPROVAL,
            title: 'Authorize MCA Portal Form H Filing',
            body: 'Agent @evaluator has verified Section 30(2) compliance. Proceed to MCA e-filing?',
            riskClass: 'external',
            toolCallId: 'call_mca_123'
        });
        assert(appItem.id.startsWith('inbox_item_'), 'Expected valid item ID');
        assert.strictEqual(appItem.state, STATE_PENDING);
        assert.strictEqual(appItem.kind, KIND_APPROVAL);
        assert.strictEqual(appItem.riskClass, 'external');

        // Check on-disk JSON
        const inboxJsonPath = path.join(tempCaseDir, 'reviews', 'case_inbox.json');
        assert(fs.existsSync(inboxJsonPath), 'Expected reviews/case_inbox.json to exist on disk');
        const diskData = JSON.parse(fs.readFileSync(inboxJsonPath, 'utf8'));
        assert.strictEqual(diskData.items.length, 1);
        assert.strictEqual(diskData.items[0].id, appItem.id);

        // 2. Question Item Creation with Options
        console.log('  -> Test 2: createItem creates QUESTION item with quick-reply options');
        const qItem = createItem(tempCaseDir, {
            kind: KIND_QUESTION,
            title: 'Conflicting Default Dates Found',
            body: 'Exhibit A-1 states 15/03/2023, while NeSL certificate states 22/03/2023. Which date should govern?',
            options: ['15/03/2023 (Exhibit A-1)', '22/03/2023 (NeSL)']
        });
        assert.strictEqual(qItem.kind, KIND_QUESTION);
        assert.strictEqual(qItem.options.length, 2);

        // 3. Listing and Pending Counts
        console.log('  -> Test 3: listItems filters by state and kind, calculating pending counts');
        const all = listItems(tempCaseDir);
        assert.strictEqual(all.totalCount, 2);
        assert.strictEqual(all.pendingCount, 2);
        assert.strictEqual(getPendingCount(tempCaseDir), 2);

        const onlyQuestions = listItems(tempCaseDir, { kind: KIND_QUESTION });
        assert.strictEqual(onlyQuestions.items.length, 1);
        assert.strictEqual(onlyQuestions.items[0].id, qItem.id);

        // 4. Idempotent Resolution (First-Responder Wins)
        console.log('  -> Test 4: resolveItem transitions pending -> resolved with resolution audit');
        const res1 = resolveItem(tempCaseDir, appItem.id, 'allow', 'Advocate Sharma');
        assert.strictEqual(res1.success, true);
        assert.strictEqual(res1.alreadyResolved, false);
        assert.strictEqual(res1.item.state, STATE_RESOLVED);
        assert.strictEqual(res1.item.resolution, 'allow');
        assert.strictEqual(res1.item.resolvedBy, 'Advocate Sharma');

        // Second resolution attempt must be idempotent
        console.log('  -> Test 5: Second resolution attempt is safely idempotent');
        const res2 = resolveItem(tempCaseDir, appItem.id, 'deny', 'Other Lawyer');
        assert.strictEqual(res2.success, true);
        assert.strictEqual(res2.alreadyResolved, true);
        assert.strictEqual(res2.item.resolution, 'allow', 'Initial resolution must not be overwritten');

        // Verify pending count dropped
        assert.strictEqual(getPendingCount(tempCaseDir), 1);

        // 5. Asynchronous Agent Suspension & Wakeup
        console.log('  -> Test 6: suspendUntilResolved halts caller and wakes when resolved');
        const planItem = createItem(tempCaseDir, {
            kind: KIND_PLAN,
            title: 'Review 5-step Avoidance Investigation Plan',
            body: '1. Scan bank records\n2. Flag preferential transactions under Sec 43'
        });

        let asyncCompleted = false;
        let asyncResult = null;

        const suspensionPromise = suspendUntilResolved(tempCaseDir, planItem.id, 5000)
            .then(result => {
                asyncCompleted = true;
                asyncResult = result;
            });

        // Simulate small delay before lawyer responds
        await new Promise(r => setTimeout(r, 50));
        assert.strictEqual(asyncCompleted, false, 'Agent should remain suspended');

        // Lawyer resolves the item
        resolveItem(tempCaseDir, planItem.id, 'approved_with_notes', 'Senior Counsel');
        await suspensionPromise;

        assert.strictEqual(asyncCompleted, true, 'Agent should have resumed execution');
        assert.strictEqual(asyncResult.resolution, 'approved_with_notes');
        assert.strictEqual(asyncResult.resolvedBy, 'Senior Counsel');

        // 6. Dispatcher Parking Integration
        console.log('  -> Test 7: executeTool with parkInInbox parks unapproved tool call');
        const parkResult = await executeTool(tempCaseDir, 'mcaPortalSubmit', { form: 'Form H' }, { parkInInbox: true });
        assert.strictEqual(parkResult.status, 'parked_in_inbox');
        assert(parkResult.inboxItemId, 'Expected inbox item ID returned');
        assert(parkResult.inboxItemId.startsWith('inbox_item_'));

        const parkedItem = getItem(tempCaseDir, parkResult.inboxItemId);
        assert(parkedItem !== null, 'Parked item must exist in store');
        assert.strictEqual(parkedItem.state, STATE_PENDING);
        assert.strictEqual(parkedItem.riskClass, 'external');

        console.log('  ✓ SUCCESS: All 7 Case Action Inbox lifecycle tests passed!');
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
