/**
 * Automated End-to-End Test: RelatedPartyAgent (Haya) to RelatedPartyAgent (RBZ)
 * Standardized PUT/GET MCP Report Protocol
 * 
 * Target: Noida Marketing Private Limited (from Form A)
 * Live Data Source: PostgreSQL (postgres_db, port 5432)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const relatedPartyClient = require('../lib/agents/subagents/related-party-agent');
const relatedPartyServer = require('../lib/agents/rbz-server/related-party-server-agent');
const { getCaseBillingDb, verifyLedgerIntegrity } = require('../lib/core/case-billing-store');

async function runTest() {
    console.log('═════════════════════════════════════════════════════════════════════════');
    console.log('  👥 RELATED PARTY REPORT: HAYA-TO-RBZ MCP PUT/GET INTEGRATION TEST');
    console.log('═════════════════════════════════════════════════════════════════════════\n');

    // 1. Create isolated case directory
    const tempCaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'case_rp_test_'));
    const fixtureFormAPath = path.join(__dirname, 'fixtures', 'case_noida_marketing', '03_Form_A_Public_Announcement_Noida_Marketing.md');
    assert.ok(fs.existsSync(fixtureFormAPath), 'Form A fixture must exist');

    console.log(`[1] Created isolated case directory: ${tempCaseDir}`);

    // 2. Client Agent extracts Form A context
    console.log('[2] RelatedPartyAgent (Haya) extracting entity metadata from Form A...');
    const formAData = relatedPartyClient.extractFormAContext(fixtureFormAPath);

    console.log('    • Corporate Debtor : ' + formAData.corporate_debtor);
    console.log('    • CIN              : ' + formAData.cin);
    console.log('    • Registered Office: ' + formAData.registered_office);
    console.log('    • Petition Number  : ' + formAData.case_number);
    console.log('    • Bench            : ' + formAData.nclt_bench);
    console.log('    • IRP              : ' + formAData.irp_name);

    assert.strictEqual(formAData.corporate_debtor, 'Noida Marketing Private Limited');
    assert.strictEqual(formAData.cin, 'U51109DL2000PTC106074');

    // 3. Client Agent stages task in local SQLite billing store
    console.log('\n[3] Staging Task in local SQLite ledger (case_billing.db)...');
    const stageRes = relatedPartyClient.stageReportTask(tempCaseDir, formAData, 'counsel@nclt.in');
    assert.strictEqual(stageRes.success, true);
    assert.ok(stageRes.taskId);
    assert.strictEqual(stageRes.toolName, 'rbz_related_party_inquest');
    assert.strictEqual(stageRes.totalInr, 1770.00);

    const db = getCaseBillingDb(tempCaseDir);
    const stagedTask = db.prepare("SELECT * FROM case_billing_tasks WHERE task_id = ?").get(stageRes.taskId);
    assert.ok(stagedTask);
    assert.strictEqual(stagedTask.status, 'PENDING_APPROVAL');
    assert.strictEqual(stagedTask.payment_status, 'UNBILLED');
    console.log(`    ✓ Task ${stageRes.taskId} stored in SQLite ledger (Status: PENDING_APPROVAL)`);

    // 4. Client Agent invokes standardized MCP PUT to RBZ Server Agent
    console.log('\n[4] Executing Standardized MCP PUT: Submitting task to RelatedPartyAgent (RBZ)...');
    const putResponse = await relatedPartyServer.putReportTask({
        task_id: stageRes.taskId,
        case_id: path.basename(tempCaseDir),
        report_type: 'RELATED_PARTY_AUDIT',
        payload: formAData
    });

    assert.strictEqual(putResponse.success, true);
    assert.ok(putResponse.status === 'QUEUED' || putResponse.status === 'COMPLETED');
    assert.strictEqual(putResponse.task_id, stageRes.taskId);
    console.log(`    ✓ MCP PUT succeeded: Task ${putResponse.task_id} enqueued (Status: ${putResponse.status}).`);
    console.log(`    ✓ Server Task Reference: ${putResponse.server_task_id}`);

    // 5. Client Agent invokes standardized MCP GET to retrieve the report payload (with async polling)
    console.log('\n[5] Executing Standardized MCP GET: Retrieving report from RelatedPartyAgent (RBZ)...');
    let getResponse = null;
    const startWait = Date.now();
    while (Date.now() - startWait < 10000) {
        getResponse = await relatedPartyServer.getReportResult(stageRes.taskId);
        if (getResponse && getResponse.status === 'COMPLETED') break;
        await new Promise(r => setTimeout(r, 100));
    }

    assert.ok(getResponse, 'Must receive GET response');
    assert.strictEqual(getResponse.status, 'COMPLETED');
    assert.strictEqual(getResponse.report_type, 'RELATED_PARTY_AUDIT');
    assert.ok(getResponse.invoice_number);
    assert.ok(getResponse.receipt_signature);
    assert.ok(getResponse.content);
    assert.ok(getResponse.structured_data);

    console.log(`    ✓ MCP GET succeeded:`);
    console.log(`      - Invoice Issued : ${getResponse.invoice_number}`);
    console.log(`      - Payment ID     : ${getResponse.gateway_payment_id}`);
    console.log(`      - HMAC Signature : ${getResponse.receipt_signature.slice(0, 32)}...`);
    console.log(`      - Rate (with GST): ₹${getResponse.total_inr.toFixed(2)}`);
    console.log(`      - Related Parties Identified: ${getResponse.structured_data.related_parties_count}`);

    // Verify identified related parties include Parsvnath Developers
    const hasParsvnath = getResponse.structured_data.related_parties.some(
        rp => rp.name.includes('Parsvnath') || rp.cin === 'L45201DL1990PLC040945'
    );
    assert.ok(hasParsvnath, 'Must identify Parsvnath Developers Limited as connected flagship related party');
    console.log(`    ✓ Flagship Related Party Identified: Parsvnath Developers Limited (CIN: L45201DL1990PLC040945)`);

    // 6. Client Agent executes report delivery into /RBZ_reports/ and settles SQLite ledger
    console.log('\n[6] Client Agent delivering report into /RBZ_reports/ and settling ledger...');
    const deliveryRes = await relatedPartyClient.executeMcpReportCycle(
        tempCaseDir,
        stageRes.taskId,
        formAData,
        relatedPartyServer
    );

    assert.strictEqual(deliveryRes.success, true);
    assert.ok(fs.existsSync(deliveryRes.reportAbsPath));
    console.log(`    ✓ Report deposited on disk: ${deliveryRes.reportPath}`);

    // Verify delivered file has tamper-evident frontmatter
    const reportText = fs.readFileSync(deliveryRes.reportAbsPath, 'utf8');
    assert.ok(reportText.includes(deliveryRes.invoiceNumber));
    assert.ok(reportText.includes(deliveryRes.paymentId));
    assert.ok(reportText.includes('verified_audit_trail: true'));
    console.log('    ✓ Tamper-evident YAML frontmatter verified.');

    // Verify SQLite Ledger Status is EXECUTED and SETTLED
    const settledTask = db.prepare("SELECT * FROM case_billing_tasks WHERE task_id = ?").get(stageRes.taskId);
    assert.strictEqual(settledTask.status, 'EXECUTED');
    assert.strictEqual(settledTask.payment_status, 'SETTLED');
    assert.strictEqual(settledTask.report_path, deliveryRes.reportPath);
    console.log(`    ✓ Task in case_billing.db settled: status=${settledTask.status}, payment_status=${settledTask.payment_status}`);

    // Verify 1-to-1 Payment Receipt in SQLite
    const receipt = db.prepare("SELECT * FROM case_payment_receipts WHERE invoice_number = ?").get(deliveryRes.invoiceNumber);
    assert.ok(receipt);
    assert.strictEqual(receipt.task_id, stageRes.taskId);
    assert.strictEqual(receipt.total_inr, 1770.00);
    console.log(`    ✓ 1-to-1 Payment Receipt recorded in case_payment_receipts (Total: ₹${receipt.total_inr})`);

    // Verify SHA-256 Hash Chain Integrity
    const integrity = verifyLedgerIntegrity(tempCaseDir);
    assert.strictEqual(integrity.valid, true);
    console.log(`    ✓ Cryptographic SHA-256 Hash Chain: VALID (Rows Verified: ${integrity.rows_verified})`);

    // Also copy to demo_case/RBZ_reports/ for immediate user review in the workspace
    const demoReportsDir = path.join(__dirname, '..', '..', 'demo_case', 'RBZ_reports');
    fs.mkdirSync(demoReportsDir, { recursive: true });
    const permanentPath = path.join(demoReportsDir, path.basename(deliveryRes.reportAbsPath));
    fs.writeFileSync(permanentPath, reportText, 'utf8');
    console.log(`\n  📂 Permanent Report Copied for User Review:\n     ${permanentPath}`);

    console.log('\n═════════════════════════════════════════════════════════════════════════');
    console.log('  ✅ ALL RELATED PARTY MCP PUT/GET TESTS PASSED (100% SUCCESS)');
    console.log('═════════════════════════════════════════════════════════════════════════\n');
}

runTest().catch(err => {
    console.error('❌ Test Failed:', err);
    process.exit(1);
});
