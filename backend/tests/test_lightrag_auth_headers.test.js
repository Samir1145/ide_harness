'use strict';
const assert = require('assert');
const lightRagClient = require('../lib/core/lightrag-client');

async function run() {
    console.log('Testing LightRAG auth headers...');
    const headers = lightRagClient._buildHeaders();
    assert.strictEqual(headers['X-API-Key'], '20b8aa6253d9e09e9c70417d4938f8c7', 'X-API-Key header must be set');
    assert.strictEqual(headers['Authorization'], undefined, 'Authorization: Bearer header must NOT be set to prevent FastAPI JWT collision');
    
    console.log('Testing live query against production LightRAG server...');
    const res = await lightRagClient.queryPrecedents('What is the objective of IBC under Swiss Ribbons?', { top_k: 2, timeoutMs: 35000 });
    assert.strictEqual(res.success, true, 'Query against production LightRAG server succeeds');
    assert(typeof res.answer === 'string' && res.answer.length > 50, 'Answer contains substantive precedent synthesis');
    console.log('✓ LightRAG Client headers and live query verified.');
}

run().catch(e => {
    console.error('Test Failed:', e.message);
    process.exit(1);
});
