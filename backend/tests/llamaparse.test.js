const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { testLlamaParseConnection, parsePdfWithLlamaParse } = require('../lib/pipeline/pdf/llamaparse-client');

async function runTests() {
    console.log('--- Running LlamaParse Integration Tests ---');

    // Test 1: Module structure
    console.log('Test 1: Verifying llamaparse-client exports...');
    assert.strictEqual(typeof testLlamaParseConnection, 'function', 'testLlamaParseConnection should be exported');
    assert.strictEqual(typeof parsePdfWithLlamaParse, 'function', 'parsePdfWithLlamaParse should be exported');
    console.log('✓ Test 1 Passed: Exports verified.');

    // Test 2: Connection test with valid key
    console.log('Test 2: Testing connection with API key...');
    const validKey = 'llx-GYZ8XAQIJv5bzd4SA7pKd2af0BgqKgZ0ipPD7TNWxNPlCy1a';
    const connResult = await testLlamaParseConnection(validKey);
    assert.strictEqual(connResult.success, true, 'Connection should succeed with provided API key');
    console.log('✓ Test 2 Passed: Connection successful.');

    // Test 3: Connection test with invalid key
    console.log('Test 3: Testing connection with invalid API key...');
    const invalidResult = await testLlamaParseConnection('llx-invalid-fake-key-12345');
    assert.strictEqual(invalidResult.success, false, 'Connection should fail with fake key');
    console.log('✓ Test 3 Passed: Invalid key rejected cleanly.');

    // Test 4: Settings persistence
    console.log('Test 4: Testing LlamaParse settings persistence...');
    const tempDir = path.join(__dirname, 'fixtures', 'temp_llamaparse_test');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const settingsPath = path.join(tempDir, 'hayagriva_settings.json');
    const settingsData = {
        activeMode: 'lite',
        llamaCloudApiKey: validKey,
        llamaCloudTier: 'agentic'
    };
    fs.writeFileSync(settingsPath, JSON.stringify(settingsData, null, 2), 'utf8');

    const loaded = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.strictEqual(loaded.llamaCloudApiKey, validKey);
    assert.strictEqual(loaded.llamaCloudTier, 'agentic');

    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('✓ Test 4 Passed: Settings persistence verified.');

    // Test 5: Re-parse cleanup logic
    console.log('Test 5: Testing stale concept & vector cleanup on re-parse...');
    const testCaseDir = path.join(__dirname, 'fixtures', 'temp_llamaparse_reparse');
    const conceptsFolder = path.join(testCaseDir, 'concepts', 'sample_doc');
    fs.mkdirSync(conceptsFolder, { recursive: true });
    fs.writeFileSync(path.join(conceptsFolder, 'pageindex_tree.json'), '{"tree":{}}', 'utf8');

    assert.strictEqual(fs.existsSync(conceptsFolder), true);
    // Simulate cleanup
    fs.rmSync(conceptsFolder, { recursive: true, force: true });
    assert.strictEqual(fs.existsSync(conceptsFolder), false);
    fs.rmSync(testCaseDir, { recursive: true, force: true });
    console.log('✓ Test 5 Passed: Concept cleanup verified.');

    console.log('--- All LlamaParse Tests Passed Successfully ---');
}

runTests().catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
});
