'use strict';

const assert = require('assert');
const http = require('http');
const lightRagVoiceAgent = require('../lib/agents/lightrag-voice-agent');
const lightRagClient = require('../lib/core/lightrag-client');

async function runPhase2Tests() {
    console.log('--- Phase 2 Test: LightRagVoiceAgent & LegalParam Reasoner ---');

    // 1. Test Speech Sanitizer
    const rawMarkdownText = `### Landmark Ratio on Section 7
**Innoventive Industries Ltd v. ICICI Bank** (2018) 1 SCC 407 [1]:
* The Adjudicating Authority must ascertain default under Sec. 7(5).
* Disputed claims cannot be raised by the Corporate Debtor to delay CIRP.
CoC voting requires compliance with IBC regulations. 👍`;

    const spoken = lightRagVoiceAgent.sanitizeForSpeech(rawMarkdownText);
    assert(!spoken.includes('###'), 'Headers should be stripped');
    assert(!spoken.includes('**'), 'Bold markdown should be stripped');
    assert(!spoken.includes('[1]'), 'Bracketed citation indices should be stripped');
    assert(!spoken.includes('👍'), 'Emojis should be stripped');
    assert(spoken.includes('versus'), 'v. expanded to versus');
    assert(spoken.includes('Section 7(5)'), 'Sec. expanded to Section');
    assert(spoken.includes('Committee of Creditors'), 'CoC expanded to Committee of Creditors');
    assert(spoken.includes('Insolvency and Bankruptcy Code'), 'IBC expanded to Insolvency and Bankruptcy Code');
    console.log('✓ Speech sanitizer verified (natural spoken cadence without markdown artifacts)');

    // 2. Test Telemetry Check
    const telemetry = await lightRagVoiceAgent.checkTelemetry();
    assert.strictEqual(typeof telemetry.onlineLightRag, 'boolean', 'onlineLightRag is boolean');
    assert.strictEqual(typeof telemetry.localLegalParam, 'boolean', 'localLegalParam is boolean');
    assert.strictEqual(telemetry.legalParamPort, 8090, 'LegalParam port is 8090');
    console.log('✓ Telemetry check verified:', telemetry);

    // 3. Test Inquest with Mock LightRAG Server and Mock LegalParam Server
    let mockLlmPrompt = null;

    // Mock LegalParam llama-server on ephemeral port
    const mockLlamaServer = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            if (req.url === '/v1/models') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ data: [{ id: 'legalparam-2.9b' }] }));
            } else if (req.url === '/v1/chat/completions') {
                try { mockLlmPrompt = JSON.parse(body); } catch (_) {}
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: 'Under the Supreme Court ruling in Innoventive Industries versus ICICI Bank, the Adjudicating Authority must only ascertain whether a financial debt and default exist under Section 7. Once default is established, admission is mandatory and disputes regarding quantum cannot stall the process.'
                        },
                        finish_reason: 'stop'
                    }],
                    usage: { total_tokens: 110 }
                }));
            } else {
                res.writeHead(404);
                res.end('Not found');
            }
        });
    });

    // Mock LightRAG server on ephemeral port
    const mockLightRagServer = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            if (req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok' }));
            } else if (req.url === '/query/data') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'success',
                    data: {
                        chunks: [
                            {
                                chunk_id: 'chk-innova-1',
                                content: 'The Adjudicating Authority must only determine whether there is debt and default under Section 7 IBC.',
                                reference_id: 'ref-innova'
                            }
                        ],
                        entities: [
                            {
                                entity_name: 'Innoventive Industries Ltd v. ICICI Bank',
                                entity_type: 'Judgment',
                                description: 'Landmark ruling on Section 7 CIRP initiation.'
                            }
                        ],
                        references: [
                            {
                                reference_id: 'ref-innova',
                                title: 'Innoventive Industries Ltd v. ICICI Bank (2018) 1 SCC 407',
                                file_path: '/vaults/sc_rulings/innoventive.pdf'
                            }
                        ]
                    }
                }));
            } else {
                res.writeHead(404);
                res.end('Not found');
            }
        });
    });

    await new Promise(resolve => mockLlamaServer.listen(0, '127.0.0.1', resolve));
    await new Promise(resolve => mockLightRagServer.listen(0, '127.0.0.1', resolve));

    const llamaPort = mockLlamaServer.address().port;
    const lightRagPort = mockLightRagServer.address().port;

    // Direct agent to use mock ports
    lightRagVoiceAgent.llamaProvider.port = llamaPort;
    lightRagClient.config.apiUrl = `http://127.0.0.1:${lightRagPort}`;

    try {
        const inquestRes = await lightRagVoiceAgent.inquire('Can an operational dispute prevent Section 7 admission?');

        assert.strictEqual(inquestRes.success, true, 'Inquest should succeed');
        assert.strictEqual(inquestRes.telemetry.isLiveCloud, true, 'Should detect online LightRAG');
        assert.strictEqual(inquestRes.telemetry.legalParamUsed, true, 'Should use LegalParam reasoning');
        assert(inquestRes.spokenText.includes('Innoventive Industries versus ICICI Bank'), 'Spoken text mentions precedent');
        assert(inquestRes.spokenText.includes('mandatory'), 'Spoken text contains legal ratio');
        assert(inquestRes.citations.length > 0, 'Citations generated');
        assert(inquestRes.fullDossier.includes('## ⚖️ Precedent Voice Counsel Dossier'), 'Full markdown dossier generated');
        assert(mockLlmPrompt.messages.length >= 2, 'System and User prompts sent to LegalParam');
        console.log('✓ End-to-end inquiry verified with mock LightRAG + LegalParam servers!');

        // 4. Test Deterministic Fallback when LegalParam is offline (Lite Mode Parity)
        lightRagVoiceAgent.llamaProvider.port = 59999; // intentionally dead port
        const fallbackRes = await lightRagVoiceAgent.inquire('Can an operational dispute prevent Section 7 admission?');

        assert.strictEqual(fallbackRes.success, true, 'Fallback inquiry should succeed');
        assert.strictEqual(fallbackRes.telemetry.legalParamUsed, false, 'Should note LegalParam was offline');
        assert(fallbackRes.spokenText.length > 20, 'Spoken text generated deterministically');
        assert(fallbackRes.spokenText.includes('Insolvency and Bankruptcy Code'), 'Deterministic synthesis speaks correctly');
        console.log('✓ Deterministic Lite Mode fallback verified (zero crashes with offline LLM)!');

    } finally {
        mockLlamaServer.close();
        mockLightRagServer.close();
        // Restore default port
        lightRagVoiceAgent.llamaProvider.port = 8090;
    }

    console.log('\n--- ALL PHASE 2 TESTS PASSED! ---');
}

runPhase2Tests().catch(err => {
    console.error('Phase 2 test failed:', err);
    process.exit(1);
});
