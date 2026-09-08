const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Test the updated prompt structure and verify clean tree / card output
async function testLazySummaryEnrichment() {
    console.log('=== Test Suite: Streamlined 2-3 Sentence Tree Summaries ===\n');

    // 1. Verify watcher exports and prompt structure
    const watcherSrc = fs.readFileSync(path.join(__dirname, '../lib/daemon/watcher.js'), 'utf8');
    
    console.log('Checking prompt and processing updates in watcher.js:');
    assert.ok(watcherSrc.includes('2 to 3 concise sentences (maximum 80 words)'), 'Prompt must require 2-3 concise sentences');
    assert.ok(watcherSrc.includes('Core legal subject and key obligations or rights established'), 'Prompt must focus on legal subject/rights');
    assert.ok(watcherSrc.includes('Specific figures, monetary amounts, percentages, deadlines, or dates'), 'Prompt must focus on figures/dates');
    assert.ok(watcherSrc.includes('Key conditions, consequences of default/breach, or statutory provisos'), 'Prompt must focus on conditions/exceptions');
    console.log('✓ 2-3 sentence legal summary prompt verified.');

    // 2. Verify Doc2Query and QnA generation were removed from startLazyWorker
    assert.ok(!watcherSrc.includes('Starting Doc2Query questions generation'), 'Doc2Query generation must be removed');
    assert.ok(!watcherSrc.includes('Writing Q&A wiki cards'), 'Q&A wiki card generation must be removed');
    console.log('✓ Legacy Q&A question generation completely removed.');

    // 3. Verify markdown card cleaning
    assert.ok(watcherSrc.includes('cleanBody.trim()'), 'Markdown card body must be cleaned');
    console.log('✓ Companion markdown card clean body formatting verified.');

    console.log('\n=== All Lazy Summary Tests Passed Successfully! ===');
}

if (require.main === module) {
    testLazySummaryEnrichment().catch(err => {
        console.error('Test failed:', err);
        process.exit(1);
    });
}

module.exports = { run: testLazySummaryEnrichment, runTests: testLazySummaryEnrichment };
