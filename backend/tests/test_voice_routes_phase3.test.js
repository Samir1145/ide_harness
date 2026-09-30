'use strict';

const assert = require('assert');
const http = require('http');
const routes = require('../lib/routes');

// Helper to simulate HTTP requests against routes.js handlers
function dispatchRoute(urlPath, method, payload = null, queryParams = {}) {
    return new Promise((resolve, reject) => {
        const methodKey = String(method || 'GET').toUpperCase();
        const handler = (routes[methodKey] && routes[methodKey][urlPath]) || (routes.GET && routes.GET[urlPath]) || (routes.POST && routes.POST[urlPath]);
        if (!handler) {
            return reject(new Error(`Route ${urlPath} [${methodKey}] not registered in routes.js`));
        }

        const req = new http.IncomingMessage();
        req.method = method;
        req.url = urlPath;

        let resData = '';
        let resStatusCode = 200;
        let resHeaders = {};

        const res = {
            writeHead: (status, headers) => {
                resStatusCode = status;
                resHeaders = headers;
            },
            end: (data) => {
                if (data) resData += data;
                let parsed = null;
                try {
                    parsed = JSON.parse(resData);
                } catch (_) {
                    parsed = resData;
                }
                resolve({
                    status: resStatusCode,
                    headers: resHeaders,
                    body: parsed
                });
            }
        };

        const parsedUrl = {
            pathname: urlPath,
            query: queryParams
        };

        const docsRoot = process.env.HOME || '/tmp';

        // Execute handler
        try {
            handler(req, res, parsedUrl, docsRoot);
            if (payload != null) {
                req.emit('data', Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)));
            }
            req.emit('end');
        } catch (err) {
            reject(err);
        }
    });
}

async function runVoiceRoutesTests() {
    console.log('--- Phase 3 Test: Voice Precedent Agent REST Routes ---');

    // 1. Verify route handlers exist in routes.js
    assert.strictEqual(typeof routes.POST['/api/hayagriva/voice/inquest'], 'function', '/api/hayagriva/voice/inquest handler exists in POST');
    assert.strictEqual(typeof routes.GET['/api/hayagriva/voice/telemetry'], 'function', '/api/hayagriva/voice/telemetry handler exists in GET');
    assert.strictEqual(typeof routes.POST['/api/hayagriva/voice/config'], 'function', '/api/hayagriva/voice/config handler exists in POST');
    console.log('✓ All 3 Voice Precedent routes mounted in routes.js');

    // 2. Test /api/hayagriva/voice/config
    const configRes = await dispatchRoute('/api/hayagriva/voice/config', 'POST', {
        apiUrl: 'http://127.0.0.1:9621',
        apiKey: 'test-sovereign-key',
        workspace: 'ibc_nclat_precedents',
        queryMode: 'mix',
        speechRate: 1.05,
        speechVoice: 'en-IN'
    });

    assert.strictEqual(configRes.status, 200, 'Config endpoint returns 200');
    assert.strictEqual(configRes.body.success, true, 'Config save succeeded');
    assert.strictEqual(configRes.body.config.apiUrl, 'http://127.0.0.1:9621', 'API URL updated');
    assert.strictEqual(configRes.body.config.workspace, 'ibc_nclat_precedents', 'Workspace updated');
    assert.strictEqual(configRes.body.config.queryMode, 'mix', 'Query mode updated');
    console.log('✓ /api/hayagriva/voice/config saved and updated in-memory client');

    // 3. Test /api/hayagriva/voice/telemetry
    const telemetryRes = await dispatchRoute('/api/hayagriva/voice/telemetry', 'GET');
    assert.strictEqual(telemetryRes.status, 200, 'Telemetry endpoint returns 200');
    assert.strictEqual(telemetryRes.body.success, true, 'Telemetry check succeeded');
    assert.strictEqual(typeof telemetryRes.body.telemetry.onlineLightRag, 'boolean', 'Telemetry contains onlineLightRag');
    assert.strictEqual(typeof telemetryRes.body.telemetry.localLegalParam, 'boolean', 'Telemetry contains localLegalParam');
    assert.strictEqual(telemetryRes.body.telemetry.queryMode, 'mix', 'Telemetry reports queryMode');
    console.log('✓ /api/hayagriva/voice/telemetry reported engine and graph status');

    // 4. Test /api/hayagriva/voice/inquest (Oral Inquiry)
    const inquestRes = await dispatchRoute('/api/hayagriva/voice/inquest', 'POST', {
        query: 'What is the effect of Section 14 moratorium on criminal proceedings under Section 138 NI Act?'
    });

    assert.strictEqual(inquestRes.status, 200, 'Inquest endpoint returns 200');
    assert.strictEqual(inquestRes.body.success, true, 'Inquest succeeded');
    assert.strictEqual(typeof inquestRes.body.spokenText, 'string', 'Returned spoken text string');
    assert(inquestRes.body.spokenText.length > 20, 'Spoken text is non-empty');
    assert(inquestRes.body.fullDossier.includes('## ⚖️ Precedent Voice Counsel Dossier'), 'Full markdown dossier generated');
    assert(Array.isArray(inquestRes.body.citations), 'Citations array returned');
    assert.strictEqual(typeof inquestRes.body.telemetry.latencyMs, 'number', 'Latency telemetry recorded');
    console.log('✓ /api/hayagriva/voice/inquest executed successfully and returned dual oral + dossier payload!');

    console.log('\n--- ALL PHASE 3 VOICE ROUTE TESTS PASSED! ---');
}

runVoiceRoutesTests().catch(err => {
    console.error('Phase 3 test failed:', err);
    process.exit(1);
});
