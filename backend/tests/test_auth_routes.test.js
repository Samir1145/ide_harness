// backend/tests/test_auth_routes.test.js
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const TEST_DIR = path.join(__dirname, 'fixtures', 'test_auth_sandbox');
const TEST_CASE = path.join(TEST_DIR, 'CIRP_TEST_AUTH');

async function runTests() {
    console.log('=== Task 1: Testing Auth Service, Endpoints & Route Guards ===\n');

    if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_CASE, { recursive: true });

    const authService = require('../lib/core/auth-service');
    const routes = require('../lib/routes');

    function simulateRequest(method, urlStr, bodyObj, headers = {}) {
        return new Promise((resolve) => {
            const url = new URL(urlStr, 'http://127.0.0.1:3210');
            const parsedUrl = {
                pathname: url.pathname,
                query: Object.fromEntries(url.searchParams.entries())
            };

            const req = new EventEmitter();
            req.method = method;
            req.url = urlStr;
            req.headers = headers;

            let resBody = '';
            let resStatus = 200;
            let resHeaders = {};

            const res = {
                writeHead: (status, hdrs) => {
                    resStatus = status;
                    resHeaders = hdrs || {};
                },
                setHeader: (k, v) => {
                    resHeaders[k] = v;
                },
                end: (chunk) => {
                    if (chunk) resBody += chunk;
                    let parsedData = null;
                    try {
                        parsedData = JSON.parse(resBody);
                    } catch (_) {
                        parsedData = resBody;
                    }
                    resolve({
                        status: resStatus,
                        headers: resHeaders,
                        data: parsedData
                    });
                }
            };

            const handler = routes[method] ? routes[method][parsedUrl.pathname] : null;
            if (!handler) {
                return resolve({ status: 404, data: { error: `Route not found: ${method} ${parsedUrl.pathname}` } });
            }

            handler(req, res, parsedUrl, TEST_DIR);

            if (bodyObj !== undefined) {
                req.emit('data', JSON.stringify(bodyObj));
            }
            req.emit('end');
        });
    }

    // --- 1. Unit Tests for auth-service ---
    console.log('[Test 1.1] Generating and verifying JWT tokens via auth-service...');
    const token = authService.generateToken({
        id: 'usr_123',
        name: 'Adv. Test User',
        email: 'test@hayagriva.app',
        org: 'Test Chambers',
        tier: 'enterprise'
    });
    assert(typeof token === 'string' && token.split('.').length === 3, 'Token must be a valid 3-segment JWT');

    const verifyResult = authService.verifyToken(token);
    assert.strictEqual(verifyResult.valid, true, 'Valid token must verify true');
    assert.strictEqual(verifyResult.payload.email, 'test@hayagriva.app');

    const invalidVerify = authService.verifyToken('invalid.token.here');
    assert.strictEqual(invalidVerify.valid, false, 'Invalid token must verify false');

    // --- 2. POST /api/auth/login ---
    console.log('[Test 1.2] POST /api/auth/login with valid credentials...');
    const loginRes = await simulateRequest('POST', '/api/auth/login', {
        email: 'admin@hayagriva.app',
        password: 'hayagriva_secure_password'
    });
    assert.strictEqual(loginRes.status, 200, `Expected 200, got ${loginRes.status}: ${JSON.stringify(loginRes.data)}`);
    assert.strictEqual(loginRes.data.ok, true);
    assert(loginRes.data.token, 'Response must contain token');
    assert.strictEqual(loginRes.data.user.email, 'admin@hayagriva.app');

    const userToken = loginRes.data.token;

    console.log('[Test 1.3] POST /api/auth/login with invalid credentials...');
    const badLoginRes = await simulateRequest('POST', '/api/auth/login', {
        email: 'admin@hayagriva.app',
        password: 'wrong_password_123'
    });
    assert.strictEqual(badLoginRes.status, 401);
    assert.strictEqual(badLoginRes.data.ok, false);

    // --- 3. POST /api/auth/verify ---
    console.log('[Test 1.4] POST /api/auth/verify with valid token...');
    const verifyRes = await simulateRequest('POST', '/api/auth/verify', {}, {
        authorization: `Bearer ${userToken}`
    });
    assert.strictEqual(verifyRes.status, 200);
    assert.strictEqual(verifyRes.data.ok, true);
    assert.strictEqual(verifyRes.data.user.email, 'admin@hayagriva.app');
    assert(verifyRes.data.leaseExpiresAt, 'Must return lease expiration timestamp');

    console.log('[Test 1.5] POST /api/auth/verify with invalid token...');
    const badVerifyRes = await simulateRequest('POST', '/api/auth/verify', {}, {
        authorization: 'Bearer bad_fake_token'
    });
    assert.strictEqual(badVerifyRes.status, 401);
    assert.strictEqual(badVerifyRes.data.ok, false);

    // --- 4. Billing Route Authorization Guard ---
    console.log('[Test 1.6] GET /api/hayagriva/billing/summary without auth token (should 401)...');
    const unauthBillingRes = await simulateRequest('GET', `/api/hayagriva/billing/summary?caseName=CIRP_TEST_AUTH`);
    assert.strictEqual(unauthBillingRes.status, 401, 'Unauthenticated billing request must return 401');

    console.log('[Test 1.7] GET /api/hayagriva/billing/summary with valid auth token (should 200)...');
    const authBillingRes = await simulateRequest('GET', `/api/hayagriva/billing/summary?caseName=CIRP_TEST_AUTH`, undefined, {
        authorization: `Bearer ${userToken}`
    });
    assert.strictEqual(authBillingRes.status, 200, `Expected 200, got ${authBillingRes.status}`);
    assert.strictEqual(authBillingRes.data.ok, true);

    console.log('\n✅ All Task 1 Auth tests passed successfully!');
}

runTests().catch((err) => {
    console.error('\n❌ Task 1 Auth test failed:\n', err);
    process.exit(1);
});
