// backend/tests/test_case_billing_store.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
    getCaseBillingDb,
    recordPendingTask,
    markTaskAuthorized,
    markTaskExecuted,
    cancelTask,
    updateSettlementStatus,
    getCaseLedger,
    verifyLedgerIntegrity
} = require('../lib/core/case-billing-store');

const TEST_CASE_DIR = path.join(__dirname, 'fixtures', 'test_case_billing_sandbox');

function runTest() {
    console.log('=== Running Local SQLite Case Billing Store Tests ===');

    if (fs.existsSync(TEST_CASE_DIR)) {
        fs.rmSync(TEST_CASE_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_CASE_DIR, { recursive: true });

    // 1. Record pending unapproved task
    const t1 = recordPendingTask(TEST_CASE_DIR, {
        task_id: 'tsk_001_cibil',
        tool_name: 'query_cibil_defaulters',
        target_identifier: '01234567',
        target_name: 'Aman Grover',
        rate_inr: 75.00
    });
    console.log('1. Recorded pending task:', t1.task_id, '| Rate: ₹' + t1.rate_inr);
    assert.strictEqual(t1.status, 'PENDING_APPROVAL');

    // 2. Verify ledger shows 1 pending task, 0 unbilled executed tasks
    let ledger = getCaseLedger(TEST_CASE_DIR);
    assert.strictEqual(ledger.pending_approval_count, 1);
    assert.strictEqual(ledger.unbilled_count, 0);
    assert.strictEqual(ledger.total_due_inr, 0);
    console.log('2. Verified zero financial liability while pending approval.');

    // 3. User authorizes task
    markTaskAuthorized(TEST_CASE_DIR, 'tsk_001_cibil', 'Atul Grover (RP)');
    console.log('3. Task authorized by user.');

    // 4. Server executes and returns receipt
    const execRes = markTaskExecuted(TEST_CASE_DIR, 'tsk_001_cibil', {
        server_task_id: 'srv_rbz_99218',
        server_receipt_sig: 'sig_ed25519_mock_abc123'
    });
    console.log('4. Task marked executed:', execRes.server_task_id);

    ledger = getCaseLedger(TEST_CASE_DIR);
    assert.strictEqual(ledger.pending_approval_count, 0);
    assert.strictEqual(ledger.unbilled_count, 1);
    assert.strictEqual(ledger.unbilled_subtotal_inr, 75.00);
    assert.strictEqual(ledger.total_due_inr, 88.50); // 75 + 18% GST (13.5)
    console.log('5. Accrued liability correctly calculated: ₹' + ledger.total_due_inr + ' (incl 18% GST).');

    // 5. Verify cryptographic hash chain integrity
    let integrity = verifyLedgerIntegrity(TEST_CASE_DIR);
    assert.strictEqual(integrity.valid, true);
    console.log('6. Cryptographic ledger integrity check: PASSED (' + integrity.rows_verified + ' rows).');

    // 6. Settle invoice via Razorpay callback simulation
    updateSettlementStatus(TEST_CASE_DIR, 'inv_001', 'RBZ-INV-2026-001', 88.50, 'pay_rzp_test_123');
    ledger = getCaseLedger(TEST_CASE_DIR);
    assert.strictEqual(ledger.unbilled_count, 0);
    assert.strictEqual(ledger.settled_count, 1);
    assert.strictEqual(ledger.receipts.length, 1);
    console.log('7. Invoice settled successfully! Settled tasks: ' + ledger.settled_count);

    // Clean up
    fs.rmSync(TEST_CASE_DIR, { recursive: true, force: true });
    console.log('=== All Local SQLite Billing Store Tests PASSED! ===');
}

runTest();
