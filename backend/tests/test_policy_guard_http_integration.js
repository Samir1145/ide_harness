const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const routes = require('../lib/routes');
const inboxManager = require('../lib/agents/inbox-manager');
const auditTrail = require('../lib/core/audit_trail');

async function run() {
    console.log('--- Testing Policy Guard HTTP Integration (Modification 4) ---');

    const testDir = path.join(__dirname, 'fixtures', 'test_policy_http_' + Date.now());
    const reviewsDir = path.join(testDir, 'reviews');
    const dossierDir = path.join(testDir, '01_dossier');
    fs.mkdirSync(reviewsDir, { recursive: true });
    fs.mkdirSync(dossierDir, { recursive: true });

    // Populate verified KV key
    const kvPath = path.join(reviewsDir, 'case_kv_dictionary.json');
    fs.writeFileSync(kvPath, JSON.stringify({
        corporate_debtor: { value: 'Zenith Metals Ltd', verified_by_user: 1 }
    }, null, 2), 'utf8');

    let server;
    let baseUrl;

    try {
        console.log('1. Launching test API server with routes.js...');
        server = http.createServer(async (req, res) => {
            const url = require('url').parse(req.url, true);
            const methodRoutes = routes[req.method];
            if (methodRoutes && methodRoutes[url.pathname]) {
                try {
                    await methodRoutes[url.pathname](req, res, url, path.dirname(testDir));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not found' }));
            }
        });

        await new Promise(resolve => server.listen(0, resolve));
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`   Server listening on ${baseUrl}`);

        const caseName = path.basename(testDir);

        // 2. Test Safe Operation Evaluation
        console.log('2. Evaluating safe operation via POST /api/hayagriva/policy/evaluate...');
        const safeRes = await fetch(`${baseUrl}/api/hayagriva/policy/evaluate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                case: caseName,
                operation: {
                    type: 'KV_MUTATION',
                    key: 'unverified_field',
                    value: '123'
                }
            })
        });
        assert.strictEqual(safeRes.status, 200);
        const safeData = await safeRes.json();
        assert.strictEqual(safeData.success, true);
        assert.strictEqual(safeData.evaluation.allowed, true);

        // 3. Test Hard Floor 1: Mutate Verified Key via HTTP
        console.log('3. Evaluating Hard Floor 1 (Mutate Verified Key) via HTTP...');
        const mutateRes = await fetch(`${baseUrl}/api/hayagriva/policy/evaluate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                case: caseName,
                operation: {
                    type: 'KV_MUTATION',
                    key: 'corporate_debtor',
                    value: 'Unauthorized Change'
                }
            })
        });
        assert.strictEqual(mutateRes.status, 200);
        const mutateData = await mutateRes.json();
        assert.strictEqual(mutateData.success, true);
        assert.strictEqual(mutateData.evaluation.allowed, false);
        assert.strictEqual(mutateData.evaluation.blocked, true);
        assert.strictEqual(mutateData.evaluation.hardFloor, 'HARD_FLOOR_MUTATE_VERIFIED_KEY');
        assert.ok(mutateData.evaluation.inboxItem, 'Should return created inbox item');
        console.log('   Hard Floor intercepted! Inbox Item:', mutateData.evaluation.inboxItem.id);

        // 4. Test Hard Floor 5: Shell Arg-Executor Blacklist via HTTP
        console.log('4. Evaluating Hard Floor 5 (Arg-Executor Blacklist) via HTTP...');
        const shellRes = await fetch(`${baseUrl}/api/hayagriva/policy/evaluate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                case: caseName,
                operation: {
                    type: 'SHELL_EXEC',
                    commandLine: 'find . -name "*.txt" | xargs rm'
                }
            })
        });
        assert.strictEqual(shellRes.status, 200);
        const shellData = await shellRes.json();
        assert.strictEqual(shellData.success, true);
        assert.strictEqual(shellData.evaluation.allowed, false);
        assert.strictEqual(shellData.evaluation.hardFloor, 'HARD_FLOOR_BLACKLISTED_ARG_EXECUTOR');

        // 5. Verify Case Action Inbox and Audit Trail Integration
        console.log('5. Verifying Inbox item and Audit Trail entry on disk...');
        const inbox = inboxManager.loadInbox(testDir);
        assert.ok(inbox.items.length >= 2, 'Inbox should contain at least 2 intercepted items');

        const auditVerify = auditTrail.verifyChain(testDir);
        assert.strictEqual(auditVerify.valid, true, 'Audit trail hash chain must remain valid');
        assert.ok(auditVerify.total_entries >= 2);

        console.log('✅ All Policy Guard HTTP Integration tests passed cleanly!');
        return true;
    } finally {
        if (server) server.close();
        try {
            fs.rmSync(testDir, { recursive: true, force: true });
        } catch (_) {}
    }
}

if (require.main === module) {
    run().catch(err => {
        console.error('❌ Integration test failed:', err);
        process.exit(1);
    });
}

module.exports = { run };
