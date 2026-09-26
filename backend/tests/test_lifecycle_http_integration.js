const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const lifecycleManager = require('../lib/core/lifecycle-manager');
const sqliteStore = require('../lib/core/sqlite-store');
const routes = require('../lib/routes');

async function run() {
    console.log('--- Testing Matter Lifecycle HTTP Integration (Modification 3) ---');

    const testDirA = path.join(__dirname, 'fixtures', 'test_http_lifecycle_A_' + Date.now());
    const testDirB = path.join(__dirname, 'fixtures', 'test_http_lifecycle_B_' + Date.now());
    fs.mkdirSync(path.join(testDirA, 'concepts'), { recursive: true });
    fs.mkdirSync(path.join(testDirB, 'concepts'), { recursive: true });

    let server;
    let baseUrl;

    try {
        console.log('1. Launching test API server with routes.js...');
        server = http.createServer(async (req, res) => {
            const url = require('url').parse(req.url, true);
            const methodRoutes = routes[req.method];
            if (methodRoutes && methodRoutes[url.pathname]) {
                try {
                    await methodRoutes[url.pathname](req, res, url, path.dirname(testDirA));
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

        // 2. Register effects on Matter A
        console.log('2. Registering active effects on Matter A...');
        const scopeA = lifecycleManager.getScope(testDirA);
        let watcherTornDown = false;
        scopeA.registerWatcher({
            close: async () => { watcherTornDown = true; }
        }, 'test_watcher_A');

        // Open DB connection for Matter A
        sqliteStore.getDb(testDirA);

        // 3. Test GET /api/hayagriva/matter/lifecycle-status
        console.log('3. Testing GET /api/hayagriva/matter/lifecycle-status...');
        const statusRes = await fetch(`${baseUrl}/api/hayagriva/matter/lifecycle-status`);
        assert.strictEqual(statusRes.status, 200);
        const statusData = await statusRes.json();
        assert.strictEqual(statusData.success, true);
        assert.ok(statusData.status.total_active_scopes >= 1);
        console.log(`   Active scopes detected: ${statusData.status.total_active_scopes}`);

        // 4. Test POST /api/hayagriva/matter/switch from A to B
        console.log('4. Testing POST /api/hayagriva/matter/switch from Matter A to Matter B...');
        const switchRes = await fetch(`${baseUrl}/api/hayagriva/matter/switch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fromCase: path.basename(testDirA),
                toCase: path.basename(testDirB)
            })
        });
        assert.strictEqual(switchRes.status, 200);
        const switchData = await switchRes.json();
        assert.strictEqual(switchData.success, true);
        assert.strictEqual(watcherTornDown, true, 'Matter A watcher must be closed on switch');
        console.log('   Matter A successfully torn down on switch. Watcher closed = true');

        // 5. Test POST /api/hayagriva/matter/teardown on Matter B
        console.log('5. Testing POST /api/hayagriva/matter/teardown on Matter B...');
        const scopeB = lifecycleManager.getScope(testDirB);
        let scopeBTornDown = false;
        scopeB.registerEffect(() => { scopeBTornDown = true; }, 'scopeB_effect');

        const teardownRes = await fetch(`${baseUrl}/api/hayagriva/matter/teardown`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                case: path.basename(testDirB)
            })
        });
        assert.strictEqual(teardownRes.status, 200);
        const teardownData = await teardownRes.json();
        assert.strictEqual(teardownData.success, true);
        assert.strictEqual(scopeBTornDown, true, 'Matter B effect must be executed during teardown');

        console.log('✅ All Matter Lifecycle HTTP Integration tests passed cleanly!');
        return true;
    } finally {
        if (server) server.close();
        await lifecycleManager.teardownAll();
        try {
            fs.rmSync(testDirA, { recursive: true, force: true });
            fs.rmSync(testDirB, { recursive: true, force: true });
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
