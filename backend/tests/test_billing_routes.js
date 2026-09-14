// backend/tests/test_billing_routes.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const TEST_DIR = path.join(__dirname, 'fixtures', 'test_billing_routes_sandbox');
const TEST_CASE = path.join(TEST_DIR, 'CIRP_ABC_LTD');

async function main() {
    console.log('=== Testing Billing API Routes in routes.js ===');

    if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_CASE, { recursive: true });

    const routes = require('../lib/routes');

    // Helper to simulate request to route handler
    function simulateRequest(method, urlStr, bodyObj) {
        return new Promise((resolve) => {
            const url = new URL(urlStr, 'http://127.0.0.1:3210');
            const parsedUrl = {
                pathname: url.pathname,
                query: Object.fromEntries(url.searchParams.entries())
            };

            const req = new (require('events').EventEmitter)();
            req.method = method;
            req.url = urlStr;

            let resBody = '';
            let resStatus = 200;
            let resHeaders = {};

            const res = {
                writeHead: (status, headers) => {
                    resStatus = status;
                    resHeaders = headers;
                },
                end: (chunk) => {
                    if (chunk) resBody += chunk;
                    resolve({
                        status: resStatus,
                        headers: resHeaders,
                        data: JSON.parse(resBody)
                    });
                }
            };

            const handler = routes[method] ? routes[method][parsedUrl.pathname] : null;
            if (!handler) {
                return resolve({ status: 404, data: { error: 'Route not found' } });
            }

            handler(req, res, parsedUrl, TEST_DIR);

            if (bodyObj) {
                req.emit('data', JSON.stringify(bodyObj));
            }
            req.emit('end');
        });
    }

    // 1. Test GET /api/billing/rate-card
    const rateCardRes = await simulateRequest('GET', '/api/billing/rate-card');
    assert.strictEqual(rateCardRes.status, 200);
    assert.strictEqual(rateCardRes.data.success, true);
    assert.strictEqual(rateCardRes.data.rateCard.screen_section_29a_entity, 250.00);
    console.log('✔ GET /api/billing/rate-card verified.');

    // 2. Test POST /api/billing/record-pending
    const recordRes = await simulateRequest('POST', '/api/billing/record-pending', {
        case: 'CIRP_ABC_LTD',
        task: {
            task_id: 'tsk_test_sec29a',
            tool_name: 'screen_section_29a_entity',
            target_identifier: 'U12345DL2018PTC000000',
            target_name: 'Adani Infra Tech',
            rate_inr: 250.00
        }
    });
    assert.strictEqual(recordRes.status, 200);
    assert.strictEqual(recordRes.data.success, true);
    assert.strictEqual(recordRes.data.task.status, 'PENDING_APPROVAL');
    console.log('✔ POST /api/billing/record-pending verified.');

    // 3. Test GET /api/billing/case-summary
    const summaryRes = await simulateRequest('GET', '/api/billing/case-summary?case=CIRP_ABC_LTD');
    assert.strictEqual(summaryRes.status, 200);
    assert.strictEqual(summaryRes.data.ledger.pending_approval_count, 1);
    assert.strictEqual(summaryRes.data.ledger.total_due_inr, 0);
    console.log('✔ GET /api/billing/case-summary verified (zero liability for pending).');

    // 4. Test POST /api/billing/authorize-task
    const authRes = await simulateRequest('POST', '/api/billing/authorize-task', {
        case: 'CIRP_ABC_LTD',
        taskId: 'tsk_test_sec29a',
        authorizedBy: 'Resolution Professional'
    });
    assert.strictEqual(authRes.status, 200);
    assert.strictEqual(authRes.data.success, true);
    console.log('✔ POST /api/billing/authorize-task verified.');

    // 5. Test POST /api/billing/record-executed
    const execRes = await simulateRequest('POST', '/api/billing/record-executed', {
        case: 'CIRP_ABC_LTD',
        taskId: 'tsk_test_sec29a',
        serverResult: {
            server_task_id: 'srv_rbz_1001',
            server_receipt_sig: 'hmac_sha256_mock_sig'
        }
    });
    assert.strictEqual(execRes.status, 200);
    assert.strictEqual(execRes.data.success, true);
    console.log('✔ POST /api/billing/record-executed verified.');

    // 6. Test GET /api/billing/case-summary after execution
    const summaryRes2 = await simulateRequest('GET', '/api/billing/case-summary?case=CIRP_ABC_LTD');
    assert.strictEqual(summaryRes2.status, 200);
    assert.strictEqual(summaryRes2.data.ledger.pending_approval_count, 0);
    assert.strictEqual(summaryRes2.data.ledger.unbilled_count, 1);
    assert.strictEqual(summaryRes2.data.ledger.unbilled_subtotal_inr, 250.00);
    assert.strictEqual(summaryRes2.data.ledger.total_due_inr, 295.00); // 250 + 18% GST (45)
    console.log('✔ GET /api/billing/case-summary reflects executed liability: ₹' + summaryRes2.data.ledger.total_due_inr);

    // 7. Test GET /api/billing/verify-integrity
    const integRes = await simulateRequest('GET', '/api/billing/verify-integrity?case=CIRP_ABC_LTD');
    assert.strictEqual(integRes.status, 200);
    assert.strictEqual(integRes.data.integrity.valid, true);
    console.log('✔ GET /api/billing/verify-integrity confirmed hash chain valid.');

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    console.log('All backend billing route tests passed successfully!');
}

main().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
