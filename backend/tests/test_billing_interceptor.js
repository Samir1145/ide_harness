// backend/tests/test_billing_interceptor.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, 'fixtures', 'test_interceptor_sandbox');
const TEST_CASE = path.join(TEST_DIR, 'CIRP_TEST_INTERCEPTOR');

async function main() {
    console.log('=== Testing Hard Floor Billing Interceptor & Execution Flow ===');

    if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_CASE, { recursive: true });

    const { executeTool } = require('../lib/agents/skills/tool-dispatcher');
    const { getCaseLedger, verifyLedgerIntegrity, markTaskAuthorized } = require('../lib/core/case-billing-store');

    // 1. Unapproved call without parkInInbox: Must throw ERR_PERMISSION_REQUIRED
    let caughtErr = null;
    try {
        await executeTool(TEST_CASE, 'screen_section_29a_entity', {
            identifier: 'L24110MH1985PLC038047',
            name: 'Generic Corp Ltd'
        }, { mode: 'auto' });
    } catch (err) {
        caughtErr = err;
    }

    assert.ok(caughtErr, 'Unapproved tool call must be blocked');
    assert.strictEqual(caughtErr.code, 'ERR_PERMISSION_REQUIRED');
    assert.strictEqual(caughtErr.rate_inr, 250.00);
    assert.ok(caughtErr.taskId, 'A pending task ID must be generated');
    console.log('✔ Unapproved call blocked with Hard Floor Guarantee. Task ID:', caughtErr.taskId);

    // 2. Check that pending task exists in SQLite ledger with zero due
    let ledger = getCaseLedger(TEST_CASE);
    assert.strictEqual(ledger.pending_approval_count, 1);
    assert.strictEqual(ledger.unbilled_count, 0);
    assert.strictEqual(ledger.total_due_inr, 0);
    console.log('✔ Ledger confirms 1 pending task and ₹0 accrued liability.');

    // 3. Unapproved call with parkInInbox: Must return parked_in_inbox without throwing
    const parkRes = await executeTool(TEST_CASE, 'query_cibil_defaulters', {
        identifier: '09876543',
        name: 'Promoter Guarantor'
    }, { mode: 'auto', parkInInbox: true });

    assert.strictEqual(parkRes.status, 'parked_in_inbox');
    assert.strictEqual(parkRes.rate_inr, 75.00);
    assert.ok(parkRes.inboxItemId, 'Must create inbox item');
    console.log('✔ Call with parkInInbox parked cleanly:', parkRes.taskId, '| Inbox item:', parkRes.inboxItemId);

    ledger = getCaseLedger(TEST_CASE);
    assert.strictEqual(ledger.pending_approval_count, 2);
    assert.strictEqual(ledger.total_due_inr, 0);
    console.log('✔ Ledger confirms 2 pending tasks and ₹0 liability.');

    // 4. Authorize first task and execute with allowExternal: true
    const taskIdToRun = caughtErr.taskId;
    markTaskAuthorized(TEST_CASE, taskIdToRun, 'Lead Partner');

    const execRes = await executeTool(TEST_CASE, 'screen_section_29a_entity', {
        identifier: 'L24110MH1985PLC038047',
        name: 'Generic Corp Ltd'
    }, {
        mode: 'auto',
        allowExternal: true,
        taskId: taskIdToRun
    });

    assert.strictEqual(execRes.status, 'executed');
    assert.strictEqual(execRes.taskId, taskIdToRun);
    assert.ok(execRes.serverTaskId, 'Must have server receipt ID');
    console.log('✔ Task executed successfully upon authorization:', execRes.serverTaskId);

    // 5. Verify ledger updated: 1 pending, 1 executed, ₹295.00 due
    ledger = getCaseLedger(TEST_CASE);
    assert.strictEqual(ledger.pending_approval_count, 1);
    assert.strictEqual(ledger.unbilled_count, 1);
    assert.strictEqual(ledger.unbilled_subtotal_inr, 250.00);
    assert.strictEqual(ledger.total_due_inr, 295.00);
    console.log('✔ Ledger accrued liability correctly reflects executed task: ₹' + ledger.total_due_inr);

    // 6. Verify cryptographic SHA-256 ledger integrity
    const integrity = verifyLedgerIntegrity(TEST_CASE);
    assert.strictEqual(integrity.valid, true);
    console.log('✔ Cryptographic SHA-256 hash chain verified 100% intact!');

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    console.log('All billing interceptor tests passed successfully!');
}

main().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
