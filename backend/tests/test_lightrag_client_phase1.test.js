'use strict';

const assert = require('assert');
const http = require('http');
const lightRagClient = require('../lib/core/lightrag-client');

async function runPhase1Tests() {
    console.log('--- Phase 1 Test: Online LightRAG Client Enhancements ---');

    // 1. Verify methods exist
    assert.strictEqual(typeof lightRagClient.retrieveRawContext, 'function', 'retrieveRawContext should be defined');
    assert.strictEqual(typeof lightRagClient.queryPrecedents, 'function', 'queryPrecedents should be defined');
    assert.strictEqual(typeof lightRagClient.formatRawContextForLlm, 'function', 'formatRawContextForLlm should be defined');

    // 2. Test Header Construction
    lightRagClient.config.apiKey = 'test-api-key-123';
    lightRagClient.config.workspace = 'commercial_ibc';
    const headers = lightRagClient._buildHeaders({ 'X-Custom-Header': 'val' });
    assert.strictEqual(headers['Authorization'], 'Bearer test-api-key-123');
    assert.strictEqual(headers['X-API-Key'], 'test-api-key-123');
    assert.strictEqual(headers['LIGHTRAG-WORKSPACE'], 'commercial_ibc');
    assert.strictEqual(headers['X-Custom-Header'], 'val');
    console.log('✓ Header generation verified (Bearer, X-API-Key, LIGHTRAG-WORKSPACE)');

    // 3. Test Mock LightRAG Server for /query/data and /health
    let receivedHeaders = null;
    let receivedPayload = null;

    const mockServer = http.createServer((req, res) => {
        receivedHeaders = req.headers;
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            if (body) {
                try { receivedPayload = JSON.parse(body); } catch (_) {}
            }

            if (req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'healthy', version: '1.2.0' }));
            } else if (req.url === '/query/data') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'success',
                    data: {
                        chunks: [
                            {
                                chunk_id: 'chk-001',
                                content: 'Section 7 IBC petition is maintainable when financial debt is proved and default exceeds threshold.',
                                reference_id: 'ref-innova',
                                file_path: '/cases/innovative_industries.pdf'
                            },
                            {
                                chunk_id: 'chk-002',
                                content: 'Adjudicating Authority is only required to see if default has occurred. No scope for disputed claims at admission.',
                                reference_id: 'ref-innova'
                            }
                        ],
                        entities: [
                            {
                                entity_name: 'Innoventive Industries Ltd v. ICICI Bank',
                                entity_type: 'Precedent Decision',
                                description: 'Supreme Court landmark ruling on Section 7 CIRP admission.'
                            }
                        ],
                        references: [
                            {
                                reference_id: 'ref-innova',
                                title: 'Innoventive Industries Ltd v. ICICI Bank (2018) 1 SCC 407',
                                file_path: '/cases/innovative_industries.pdf'
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

    await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
    const port = mockServer.address().port;
    lightRagClient.config.apiUrl = `http://127.0.0.1:${port}`;

    try {
        // Test health
        const health = await lightRagClient.checkHealth(2000);
        assert.strictEqual(health.online, true, 'checkHealth should report online');
        console.log('✓ Health check against mock online server passed');

        // Test /query/data raw retrieval
        const rawRes = await lightRagClient.retrieveRawContext('Section 7 admission standard', {
            mode: 'mix',
            top_k: 2
        });

        assert.strictEqual(rawRes.success, true, 'retrieveRawContext should succeed');
        assert.strictEqual(rawRes.chunks.length, 2, 'Should receive 2 normalized chunks');
        assert.strictEqual(rawRes.chunks[0].title, 'Innoventive Industries Ltd v. ICICI Bank (2018) 1 SCC 407', 'Chunk 1 title mapped from reference title');
        assert.strictEqual(rawRes.chunks[0].filePath, '/cases/innovative_industries.pdf', 'Chunk 1 file path preserved');
        assert.strictEqual(rawRes.chunks[1].title, 'Innoventive Industries Ltd v. ICICI Bank (2018) 1 SCC 407', 'Chunk 2 title mapped from reference title');
        assert.strictEqual(rawRes.entities.length, 1, 'Should receive 1 entity');
        assert.strictEqual(receivedHeaders['x-api-key'], 'test-api-key-123', 'X-API-Key sent to server');
        assert.strictEqual(receivedHeaders['lightrag-workspace'], 'commercial_ibc', 'Workspace header sent');
        assert.strictEqual(receivedPayload.mode, 'mix', 'Query mode sent');
        console.log('✓ /query/data raw retrieval & entity parsing verified');

        // Test LLM context block formatting for LegalParam
        const llmContext = lightRagClient.formatRawContextForLlm(rawRes);
        assert(llmContext.includes('Innoventive Industries Ltd v. ICICI Bank'), 'Context contains entity');
        assert(llmContext.includes('Section 7 IBC petition is maintainable'), 'Context contains chunk');
        console.log('✓ formatRawContextForLlm verified (concise prompt block generated)');

    } finally {
        mockServer.close();
    }

    console.log('\n--- ALL PHASE 1 TESTS PASSED! ---');
}

runPhase1Tests().catch(err => {
    console.error('Phase 1 test failed:', err);
    process.exit(1);
});
