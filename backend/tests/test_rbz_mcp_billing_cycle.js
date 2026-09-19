/**
 * Automated Integration Test: RBZ MCP Cloud Dispatch & 1-to-1 Razorpay Audit Cycle
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
    getCaseBillingDb,
    recordPendingTask,
    deliverReportAndSettle,
    getCaseLedger,
    verifyLedgerIntegrity
} = require('../lib/core/case-billing-store');

const precedentAgent = require('../lib/agents/subagents/precedent-agent');
const BankAnalyzerSubAgent = require('../lib/agents/subagents/bank-analyzer');

async function runTest() {
    console.log('--- Starting RBZ MCP Billing & Report Delivery Integration Test ---');

    // 1. Create temporary mock case directory
    const tempCaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'case_rbz_test_'));
    console.log(`[1] Created isolated case directory: ${tempCaseDir}`);

    try {
        // 2. Test @Precedent staging an MCP task
        const stageRes = await precedentAgent.stageCloudResearch(
            'NCLAT MSME Section 29A Exemption Limitation',
            tempCaseDir,
            'advocate.test@lawfirm.in'
        );

        assert.strictEqual(stageRes.success, true);
        assert.strictEqual(stageRes.staged, true);
        assert.ok(stageRes.taskId);
        assert.strictEqual(stageRes.rateInr, 150.00);
        assert.strictEqual(stageRes.totalInr, 177.00);
        console.log(`[2] Precedent task staged: ${stageRes.taskId} (₹${stageRes.totalInr})`);

        // 3. Verify task is recorded as PENDING_APPROVAL in SQLite ledger
        const db = getCaseBillingDb(tempCaseDir);
        const task = db.prepare("SELECT * FROM case_billing_tasks WHERE task_id = ?").get(stageRes.taskId);
        assert.ok(task);
        assert.strictEqual(task.status, 'PENDING_APPROVAL');
        assert.strictEqual(task.payment_status, 'UNBILLED');
        assert.ok(task.payload_json.includes('NCLAT MSME'));
        console.log(`[3] Task successfully stored in case_billing.db with status PENDING_APPROVAL`);

        // 4. Test @bank_analyzer staging a multi-bank forensic inquest
        const bankAnalyzer = new BankAnalyzerSubAgent();
        const forensicStage = await bankAnalyzer.stageCloudInquest(tempCaseDir, 'ABC Infrastructure Pvt Ltd', 'ip.forensic@insolvency.in');

        assert.strictEqual(forensicStage.success, true);
        assert.strictEqual(forensicStage.rateInr, 1200.00);
        assert.strictEqual(forensicStage.totalInr, 1416.00);
        console.log(`[4] Forensic inquest staged: ${forensicStage.taskId} (₹${forensicStage.totalInr})`);

        // 5. Test Payment Settlement & Report Delivery into RBZ_reports/
        const invoiceNo = 'RBZ-INV-2026-9901';
        const mockPaymentId = 'pay_Test1234567890';
        const deliveryRes = deliverReportAndSettle(tempCaseDir, stageRes.taskId, {
            invoice_number: invoiceNo,
            payment_id: mockPaymentId,
            title: 'Precedent_Memo_MSME_29A',
            content: '# Precedent Research Dossier\n\nOperative ratio on Section 29A MSME exemption.'
        });

        assert.strictEqual(deliveryRes.success, true);
        assert.strictEqual(deliveryRes.invoice_number, invoiceNo);
        assert.strictEqual(deliveryRes.payment_id, mockPaymentId);
        assert.ok(fs.existsSync(deliveryRes.report_abs_path));
        console.log(`[5] Report delivered to: ${deliveryRes.report_path}`);

        // 6. Verify Delivered Report File & Frontmatter
        const reportContent = fs.readFileSync(deliveryRes.report_abs_path, 'utf8');
        assert.ok(reportContent.includes(invoiceNo));
        assert.ok(reportContent.includes(mockPaymentId));
        assert.ok(reportContent.includes('total_paid_inr: 177.00'));
        console.log(`[6] Verified 1-to-1 frontmatter matching in delivered report`);

        // 7. Verify Ledger Status & 1-to-1 Receipt Record
        const updatedTask = db.prepare("SELECT * FROM case_billing_tasks WHERE task_id = ?").get(stageRes.taskId);
        assert.strictEqual(updatedTask.status, 'EXECUTED');
        assert.strictEqual(updatedTask.payment_status, 'SETTLED');
        assert.strictEqual(updatedTask.report_path, deliveryRes.report_path);

        const receipt = db.prepare("SELECT * FROM case_payment_receipts WHERE invoice_number = ?").get(invoiceNo);
        assert.ok(receipt);
        assert.strictEqual(receipt.task_id, stageRes.taskId);
        assert.strictEqual(receipt.gateway_payment_id, mockPaymentId);
        assert.strictEqual(receipt.total_inr, 177.00);
        console.log(`[7] 1-to-1 Receipt and Task settlement verified in SQLite`);

        // 8. Verify Cryptographic SHA-256 Ledger Integrity
        const integrity = verifyLedgerIntegrity(tempCaseDir);
        assert.strictEqual(integrity.valid, true);
        console.log(`[8] Cryptographic SHA-256 Hash Chain Integrity: VALID (Rows: ${integrity.rows_verified})`);

        console.log('✅ ALL RBZ MCP BILLING & REPORT DELIVERY TESTS PASSED SUCCESSFULLY!');
    } finally {
        try { fs.rmSync(tempCaseDir, { recursive: true, force: true }); } catch (_) {}
    }
}

runTest().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
