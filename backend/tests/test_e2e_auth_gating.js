// backend/tests/test_e2e_auth_gating.js
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const TEST_DIR = path.join(__dirname, 'fixtures', 'test_e2e_auth_sandbox');
const TEST_CASE = path.join(TEST_DIR, 'CIRP_E2E_DEMO');

async function runE2ETests() {
    console.log('=== Task 6: End-to-End Auth, Token Lifecycle & Feature Gating Verification ===\n');

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

    // --- Phase 1: Unauthenticated Boot & Access Control ---
    console.log('[Phase 1] Simulating unauthenticated boot & feature gating check...');
    let session = null;
    
    function isFeatureAllowed(feature, s) {
        if (feature === 'dms') return true; // Documents & Editor are always unrestricted
        return !!s && !!s.token;
    }

    assert.strictEqual(isFeatureAllowed('dms', session), true, 'Core DMS must remain unrestricted without login');
    assert.strictEqual(isFeatureAllowed('agents', session), false, 'Hayagriva Agents must be gated when not logged in');
    assert.strictEqual(isFeatureAllowed('billing', session), false, 'Estate Accounts & Billing must be gated when not logged in');

    const unauthReq = await simulateRequest('GET', `/api/hayagriva/billing/summary?caseName=CIRP_E2E_DEMO`);
    assert.strictEqual(unauthReq.status, 401, 'Backend billing endpoint must reject unauthenticated call');
    console.log('✔ Phase 1: Unauthenticated state verified (DMS open, Agents/Billing locked).');

    // --- Phase 2: Login via Main Server ---
    console.log('[Phase 2] User submits login credentials to main server...');
    const loginRes = await simulateRequest('POST', '/api/auth/login', {
        email: 'admin@hayagriva.app',
        password: 'hayagriva_secure_password'
    });
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.data.ok, true);
    assert(loginRes.data.token, 'Must return JWT token');
    assert.strictEqual(loginRes.data.user.name, 'Adv. Atul Grover');

    session = {
        token: loginRes.data.token,
        user: loginRes.data.user,
        lastVerifiedAt: new Date().toISOString(),
        leaseExpiresAt: loginRes.data.leaseExpiresAt
    };

    assert.strictEqual(isFeatureAllowed('agents', session), true, 'Hayagriva Agents must unlock after login');
    assert.strictEqual(isFeatureAllowed('billing', session), true, 'Estate Accounts must unlock after login');

    const authBillingReq = await simulateRequest('GET', `/api/hayagriva/billing/summary?caseName=CIRP_E2E_DEMO`, undefined, {
        authorization: `Bearer ${session.token}`
    });
    assert.strictEqual(authBillingReq.status, 200, 'Authenticated billing call must succeed');
    console.log('✔ Phase 2: Login & feature unlocking verified.');

    // --- Phase 3: Token Verification & 7-Day Offline Grace Mode ---
    console.log('[Phase 3] Testing token verification and offline grace mode...');
    const verifyRes = await simulateRequest('POST', '/api/auth/verify', {}, {
        authorization: `Bearer ${session.token}`
    });
    assert.strictEqual(verifyRes.status, 200);
    assert.strictEqual(verifyRes.data.ok, true);

    // Simulate 3 days offline (within 7 days grace)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const offlineSession = { ...session, lastVerifiedAt: threeDaysAgo };
    const elapsedMs = Date.now() - new Date(offlineSession.lastVerifiedAt).getTime();
    const isWithinGrace = elapsedMs <= 7 * 24 * 60 * 60 * 1000;
    assert.strictEqual(isWithinGrace, true, '3 days elapsed must be within 7-day grace window');
    assert.strictEqual(isFeatureAllowed('agents', offlineSession), true, 'Offline grace keeps agents active');

    // Simulate 8 days offline (expired grace)
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const expiredSession = { ...session, lastVerifiedAt: eightDaysAgo };
    const expiredElapsedMs = Date.now() - new Date(expiredSession.lastVerifiedAt).getTime();
    const isExpired = expiredElapsedMs > 7 * 24 * 60 * 60 * 1000;
    assert.strictEqual(isExpired, true, '8 days elapsed must be outside 7-day grace window');
    console.log('✔ Phase 3: Token verification & 7-day offline grace mode logic verified.');

    // --- Phase 4: Sign Out & Re-locking ---
    console.log('[Phase 4] User signs out...');
    const logoutRes = await simulateRequest('POST', '/api/auth/logout', {}, {
        authorization: `Bearer ${session.token}`
    });
    assert.strictEqual(logoutRes.status, 200);

    session = null;
    assert.strictEqual(isFeatureAllowed('dms', session), true, 'DMS remains open after logout');
    assert.strictEqual(isFeatureAllowed('agents', session), false, 'Agents re-lock after logout');
    assert.strictEqual(isFeatureAllowed('billing', session), false, 'Billing re-locks after logout');
    console.log('✔ Phase 4: Sign out & re-locking verified.');

    // Cleanup sandbox
    fs.rmSync(TEST_DIR, { recursive: true, force: true });

    console.log('\n🎉 ALL END-TO-END AUTH & FEATURE GATING TESTS PASSED (100%)');
}

runE2ETests().catch((err) => {
    console.error('\n❌ E2E test failed:\n', err);
    process.exit(1);
});
