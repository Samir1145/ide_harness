'use strict';

/**
 * Automated Verification: Standalone RBZ HTTP Server (Port 4001)
 * Concurrency Throttling, Smart Entity Caching, & Real HTTP Loopback
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { startRbzServer } = require('../lib/agents/rbz-server/server');
const relatedPartyClient = require('../lib/agents/subagents/related-party-agent');
const { getCaseBillingDb, verifyLedgerIntegrity } = require('../lib/core/case-billing-store');

const TEST_PORT = 4001;
const SERVER_URL = `http://127.0.0.1:${TEST_PORT}`;

async function runTests() {
    console.log('═════════════════════════════════════════════════════════════════════════');
    console.log('  🌐 RBZ CLOUD HTTP SERVER, ASYNC QUEUE & CACHE VERIFICATION TEST');
    console.log('═════════════════════════════════════════════════════════════════════════\n');

    let serverInstance = null;

    try {
        // ── 1. Boot Standalone RBZ HTTP Server ──────────────────────────────────
        console.log(`[1] Booting Standalone RBZ HTTP Server on port ${TEST_PORT}...`);
        serverInstance = await startRbzServer(TEST_PORT);
        console.log('    ✓ RBZ HTTP Server started successfully.');

        // ── 2. Health & Tool Discovery Verification ─────────────────────────────
        console.log('\n[2] Testing /health and /api/mcp/tools endpoints...');
        const healthRes = await fetch(`${SERVER_URL}/health`);
        assert.strictEqual(healthRes.status, 200, 'Health endpoint must return 200');
        const healthData = await healthRes.json();
        console.log('    ✓ Health status:', healthData.status);
        console.log('    ✓ Initial Queue stats:', JSON.stringify(healthData.queue));
        console.log('    ✓ Initial Cache stats:', JSON.stringify(healthData.cache));

        const toolsRes = await fetch(`${SERVER_URL}/api/mcp/tools`);
        assert.strictEqual(toolsRes.status, 200);
        const toolsData = await toolsRes.json();
        assert.ok(Array.isArray(toolsData.tools));
        assert.ok(toolsData.tools.some(t => t.name === 'resolution_bazaar:put_report_task'));
        assert.ok(toolsData.tools.some(t => t.name === 'resolution_bazaar:get_report_result'));
        console.log(`    ✓ Verified ${toolsData.tools.length} advertised MCP tools.`);

        // ── 3. Single E2E HTTP MCP Round-Trip via Client Agent ──────────────────
        console.log('\n[3] Executing Real HTTP Loopback Call (Haya Client -> RBZ Server)...');
        const tempCaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'case_rbz_http_'));
        const fixturePath = path.join(__dirname, 'fixtures', 'case_noida_marketing', '03_Form_A_Public_Announcement_Noida_Marketing.md');
        const formAData = relatedPartyClient.extractFormAContext(fixturePath);

        // Stage in client ledger
        const stageRes = relatedPartyClient.stageReportTask(tempCaseDir, formAData, 'counsel@nclt.in');
        assert.strictEqual(stageRes.success, true);
        console.log(`    ✓ Task ${stageRes.taskId} staged in local client ledger.`);

        // Execute real HTTP loopback call
        const deliveryRes = await relatedPartyClient.executeMcpReportCycle(
            tempCaseDir,
            stageRes.taskId,
            formAData,
            null, // No in-process object; forces HTTP transport
            { serverUrl: SERVER_URL }
        );

        assert.strictEqual(deliveryRes.success, true);
        assert.ok(fs.existsSync(deliveryRes.reportAbsPath));
        console.log(`    ✓ Delivered Report over HTTP: ${deliveryRes.reportPath}`);
        console.log(`    ✓ Server Task Reference     : ${deliveryRes.serverTaskId}`);
        console.log(`    ✓ Invoice Number            : ${deliveryRes.invoiceNumber}`);
        console.log(`    ✓ Payment ID                : ${deliveryRes.paymentId}`);
        console.log(`    ✓ HMAC Signature Verified   : ${deliveryRes.receiptSignature.slice(0, 24)}...`);

        // Verify local SQLite ledger
        const db = getCaseBillingDb(tempCaseDir);
        const settledTask = db.prepare("SELECT * FROM case_billing_tasks WHERE task_id = ?").get(stageRes.taskId);
        assert.strictEqual(settledTask.status, 'EXECUTED');
        assert.strictEqual(settledTask.payment_status, 'SETTLED');

        const receipt = db.prepare("SELECT * FROM case_payment_receipts WHERE invoice_number = ?").get(deliveryRes.invoiceNumber);
        assert.ok(receipt);
        assert.strictEqual(receipt.total_inr, 1770.00);

        const integrity = verifyLedgerIntegrity(tempCaseDir);
        assert.strictEqual(integrity.valid, true);
        console.log('    ✓ Client Ledger Cryptographic Hash Chain: VALID');

        // ── 4. Concurrency & Cache Stress Test (6 Simultaneous Requests) ────────
        console.log('\n[4] Concurrency & Cache Stress Test: Launching 6 Simultaneous HTTP Requests...');
        console.log('    (Simulates multiple practitioners submitting filings simultaneously)');

        const concurrentBatchSize = 6;
        const promises = [];

        for (let i = 0; i < concurrentBatchSize; i++) {
            const clientCaseDir = fs.mkdtempSync(path.join(os.tmpdir(), `case_batch_${i}_`));
            const staged = relatedPartyClient.stageReportTask(clientCaseDir, formAData, `lawyer${i}@bar.org`);
            
            const p = relatedPartyClient.executeMcpReportCycle(
                clientCaseDir,
                staged.taskId,
                formAData,
                null,
                { serverUrl: SERVER_URL }
            ).then(res => ({ index: i, success: true, res }))
             .catch(err => ({ index: i, success: false, error: err.message }));

            promises.push(p);
        }

        const batchResults = await Promise.all(promises);
        const successCount = batchResults.filter(r => r.success).length;
        console.log(`    ✓ Completed ${successCount} of ${concurrentBatchSize} concurrent requests successfully.`);
        assert.strictEqual(successCount, concurrentBatchSize, 'All concurrent requests must succeed');

        // ── 5. Verify Cache & Queue Performance Metrics ─────────────────────────
        console.log('\n[5] Verifying Server Telemetry & Cache Hit Metrics...');
        const finalHealthRes = await fetch(`${SERVER_URL}/health`);
        const finalHealth = await finalHealthRes.json();

        console.log('    • Final Queue Stats:');
        console.log(`      - Total Processed : ${finalHealth.queue.totalProcessed}`);
        console.log(`      - Failed          : ${finalHealth.queue.totalFailed}`);
        console.log(`      - Max Concurrency : ${finalHealth.queue.maxConcurrent}`);
        console.log('    • Final Cache Stats:');
        console.log(`      - Cache Hits      : ${finalHealth.cache.hits}`);
        console.log(`      - Cache Misses    : ${finalHealth.cache.misses}`);
        console.log(`      - Hit Ratio       : ${(finalHealth.cache.hitRatio * 100).toFixed(1)}%`);

        assert.ok(finalHealth.queue.totalProcessed >= 7, 'Must have processed at least 7 jobs total');
        assert.strictEqual(finalHealth.queue.totalFailed, 0, 'No jobs should have failed');
        assert.ok(finalHealth.cache.hits > 0, 'Cache must have recorded cache hits for repeated queries');
        console.log('    ✓ High-performance entity cache hit verified.');

        console.log('\n═════════════════════════════════════════════════════════════════════════');
        console.log('  ✅ ALL STANDALONE RBZ SERVER, QUEUE & CACHE TESTS PASSED (100%)');
        console.log('═════════════════════════════════════════════════════════════════════════\n');

    } finally {
        if (serverInstance) {
            console.log('Closing RBZ HTTP Server...');
            await new Promise(resolve => serverInstance.close(resolve));
            console.log('RBZ HTTP Server stopped.');
        }
    }
}

runTests().catch(err => {
    console.error('\n❌ Test Suite Failed:', err);
    process.exit(1);
});
