const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');

const profileManager = require('../lib/core/profile-manager');

async function makeRequest(method, urlPath, body = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const options = {
            hostname: '127.0.0.1',
            port: 3210,
            path: urlPath,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = data ? JSON.parse(data) : {};
                    resolve({ status: res.statusCode, data: parsed, raw: data });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function runTests() {
    console.log('=== Running Unified Settings & Display Preferences API Tests ===\n');

    // 1. Test profileManager.getDisplayPreferences defaults
    console.log('1. Checking getDisplayPreferences defaults...');
    assert(typeof profileManager.getDisplayPreferences === 'function', 'profileManager.getDisplayPreferences should be a function');
    const display = profileManager.getDisplayPreferences();
    assert.strictEqual(typeof display, 'object', 'display should be an object');
    assert.strictEqual(typeof display.fontSize, 'number', 'display.fontSize should be a number');
    assert.strictEqual(typeof display.fontFamily, 'string', 'display.fontFamily should be a string');
    assert.strictEqual(typeof display.theme, 'string', 'display.theme should be a string');
    console.log('✓ Default display preferences verified:', display);

    // 2. Test saving display preferences via profileManager
    console.log('2. Checking saveDisplayPreferences...');
    assert(typeof profileManager.saveDisplayPreferences === 'function', 'profileManager.saveDisplayPreferences should be a function');
    const updated = profileManager.saveDisplayPreferences({ fontSize: 16, theme: 'sepia' });
    assert.strictEqual(updated.fontSize, 16, 'fontSize should be updated to 16');
    assert.strictEqual(updated.theme, 'sepia', 'theme should be updated to sepia');
    console.log('✓ saveDisplayPreferences saved and returned updated preferences');

    // 3. Test HTTP GET /api/hayagriva/settings/display
    console.log('3. Testing GET /api/hayagriva/settings/display HTTP route...');
    const getRes = await makeRequest('GET', '/api/hayagriva/settings/display');
    assert.strictEqual(getRes.status, 200, `Expected 200 OK, got ${getRes.status}`);
    assert.strictEqual(getRes.data.success, true, 'Response should indicate success');
    assert.strictEqual(getRes.data.display.fontSize, 16, 'Should return saved fontSize');
    console.log('✓ GET /api/hayagriva/settings/display passed');

    // 4. Test HTTP POST /api/hayagriva/settings/display
    console.log('4. Testing POST /api/hayagriva/settings/display HTTP route...');
    const postRes = await makeRequest('POST', '/api/hayagriva/settings/display', {
        display: {
            fontSize: 18,
            fontFamily: 'Georgia',
            lineHeight: 1.8,
            theme: 'dark'
        }
    });
    assert.strictEqual(postRes.status, 200, `Expected 200 OK, got ${postRes.status}`);
    assert.strictEqual(postRes.data.success, true, 'Response should indicate success');
    assert.strictEqual(postRes.data.display.fontSize, 18, 'Should update fontSize to 18');
    assert.strictEqual(postRes.data.display.fontFamily, 'Georgia', 'Should update fontFamily to Georgia');
    console.log('✓ POST /api/hayagriva/settings/display passed');

    console.log('\n=== All Unified Settings API Tests Passed Successfully! ===');
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
