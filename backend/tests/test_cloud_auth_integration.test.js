// backend/tests/test_cloud_auth_integration.test.js
'use strict';

const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');

async function runTests() {
    console.log('=== Task 2: Testing Desktop Backend Cloud Auth Integration & Offline Fallback ===\n');

    // 1. Setup a Mock Cloud Portal Server
    let mockPortalCalls = [];
    let mockPortalHandler = (req, res) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const data = JSON.parse(body || '{}');
            mockPortalCalls.push({ url: req.url, method: req.method, data });

            if (req.url === '/api/auth/login') {
                if (data.email === 'advocate@chambers.in' && data.password === 'valid_cloud_password') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        ok: true,
                        success: true,
                        token: 'tok_cloud_advocate_session_9921',
                        user: {
                            id: 'usr_cloud_adv_01',
                            name: 'Adv. Ananya Sharma',
                            email: 'advocate@chambers.in',
                            role: 'ADVOCATE',
                            plan: 'ENTERPRISE',
                            org: 'Sharma Law Chambers'
                        },
                        license: {
                            id: 'lic_cloud_01',
                            licenseKey: 'HAYA-ENT-9981-TEST-KEY',
                            planTier: 'ENTERPRISE',
                            status: 'ACTIVE'
                        },
                        leaseExpiresAt: new Date(Date.now() + 7 * 86400000).toISOString()
                    }));
                } else {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        ok: false,
                        success: false,
                        error: 'Invalid email or password'
                    }));
                }
                return;
            }

            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not Found' }));
        });
    };

    const mockServer = http.createServer((req, res) => mockPortalHandler(req, res));
    await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
    const mockPort = mockServer.address().port;
    const mockPortalUrl = `http://127.0.0.1:${mockPort}`;
    process.env.HAYAGRIVA_PORTAL_URL = mockPortalUrl;

    const authService = require('../lib/core/auth-service');
    const routes = require('../lib/routes');

    try {
        // [Test 2.1] Cloud Login via authenticateUser
        console.log('[Test 2.1] Testing online cloud authentication via mock portal...');
        mockPortalCalls = [];
        const resultOnline = await authService.authenticateUser('advocate@chambers.in', 'valid_cloud_password');
        assert.strictEqual(resultOnline.ok, true, 'Online login must succeed');
        assert.strictEqual(resultOnline.user.email, 'advocate@chambers.in');
        assert.strictEqual(resultOnline.user.name, 'Adv. Ananya Sharma');
        assert.strictEqual(resultOnline.token, 'tok_cloud_advocate_session_9921');
        assert.strictEqual(mockPortalCalls[0].url, '/api/auth/login');
        assert.strictEqual(mockPortalCalls[1].url, '/api/v1/activate', 'Must auto-activate attached license');
        console.log('✔ Cloud portal authenticated user and auto-activated attached license.');

        // [Test 2.2] Invalid Credentials via Cloud
        console.log('[Test 2.2] Testing invalid credentials rejection via cloud...');
        const resultBadPass = await authService.authenticateUser('advocate@chambers.in', 'wrong_pass');
        assert.strictEqual(resultBadPass.ok, false, 'Invalid credentials must fail');
        assert.strictEqual(resultBadPass.error, 'Invalid email or password');
        console.log('✔ Cloud 401 rejected invalid credentials properly.');

        // [Test 2.3] Offline Grace Fallback when Cloud is down
        console.log('[Test 2.3] Testing offline grace fallback when portal is unreachable...');
        // Point to dead port
        process.env.HAYAGRIVA_PORTAL_URL = 'http://127.0.0.1:59999';
        
        // Built-in / previously cached account admin@hayagriva.app
        const resultOffline = await authService.authenticateUser('admin@hayagriva.app', 'hayagriva_secure_password');
        assert.strictEqual(resultOffline.ok, true, 'Local fallback must succeed for cached account');
        assert.strictEqual(resultOffline.user.email, 'admin@hayagriva.app');
        assert.strictEqual(resultOffline.isOfflineGrace, true, 'Must flag offline grace mode');
        console.log('✔ Offline fallback authenticated user with isOfflineGrace = true.');

        // [Test 2.4] Route /api/auth/login handler with async cloud dispatch
        console.log('[Test 2.4] Testing /api/auth/login route endpoint...');
        process.env.HAYAGRIVA_PORTAL_URL = mockPortalUrl;
        
        function simulateRoute(bodyObj) {
            return new Promise((resolve) => {
                const req = new EventEmitter();
                req.method = 'POST';
                req.url = '/api/auth/login';
                req.headers = { 'content-type': 'application/json' };

                let resStatus = 200;
                let resData = '';
                const res = {
                    writeHead: (status) => { resStatus = status; },
                    end: (chunk) => {
                        if (chunk) resData += chunk;
                        resolve({ status: resStatus, body: JSON.parse(resData || '{}') });
                    }
                };

                const handler = routes['POST'] && routes['POST']['/api/auth/login'];
                handler(req, res, { pathname: '/api/auth/login', query: {} }, '');
                req.emit('data', JSON.stringify(bodyObj));
                req.emit('end');
            });
        }

        const routeRes = await simulateRoute({ email: 'advocate@chambers.in', password: 'valid_cloud_password' });
        assert.strictEqual(routeRes.status, 200, 'Route must return 200');
        assert.strictEqual(routeRes.body.ok, true);
        assert.strictEqual(routeRes.body.user.email, 'advocate@chambers.in');
        console.log('✔ /api/auth/login route completed async cloud authentication.');

        console.log('\n✔ ALL TESTS PASSED FOR DESKTOP BACKEND CLOUD AUTH INTEGRATION.');
    } finally {
        await new Promise(resolve => mockServer.close(resolve));
    }
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
