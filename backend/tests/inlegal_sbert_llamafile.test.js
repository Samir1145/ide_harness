const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { extractLegalCitations } = require('../lib/utils/legal-citation-parser');
const { checkLlamafileHealth, getEmbedding } = require('../lib/core/llm-client');

async function testCitationParser() {
    console.log('[Test] Testing Indian Legal Citation Parser...');
    const sampleText = 'In (2023) 4 SCC 121 and AIR 2021 SC 450, the Supreme Court interpreted the IBC provisions. See also [2022] INSC 85.';
    const citations = extractLegalCitations(sampleText);
    assert.strictEqual(citations.length, 3, 'Should extract exactly 3 citations');
    assert.strictEqual(citations[0].raw, '(2023) 4 SCC 121');
    assert.strictEqual(citations[1].raw, 'AIR 2021 SC 450');
    assert.strictEqual(citations[2].raw, '[2022] INSC 85');
    console.log('✓ Citation parser tests passed.');
}

async function testSetupScripts() {
    console.log('[Test] Testing model setup scripts...');
    const prepareSbert = require('../scripts/prepare-inlegal-sbert.js');
    const prepareLlamafile = require('../scripts/prepare-llamafile.js');

    const sbertDir = path.join(__dirname, '..', 'models', 'embeddings', 'legal', 'inlegal-sbert');
    const llamafileDir = path.join(__dirname, '..', 'models', 'llm', 'llamafile');

    assert.strictEqual(fs.existsSync(sbertDir), true, 'InLegal-SBERT directory should exist');
    assert.strictEqual(fs.existsSync(llamafileDir), true, 'Llamafile directory should exist');
    assert.strictEqual(fs.existsSync(path.join(llamafileDir, 'run-llamafile.bat')), true, 'run-llamafile.bat helper should exist');
    console.log('✓ Setup scripts tests passed.');
}

async function testLlamafileHealth() {
    console.log('[Test] Testing Llamafile health check...');
    const isHealthy = await checkLlamafileHealth('http://127.0.0.1:8090');
    assert.strictEqual(typeof isHealthy, 'boolean', 'Health check should return a boolean');
    console.log(`✓ Llamafile health check returned: ${isHealthy}`);
}

async function run() {
    console.log('[InLegal-SBERT & LLM Setup Master Tests]');
    await testCitationParser();
    await testSetupScripts();
    await testLlamafileHealth();
    console.log('  ✓ SUCCESS: InLegal-SBERT & LLM Setup tests completed successfully!\n');
}

module.exports = { run };

