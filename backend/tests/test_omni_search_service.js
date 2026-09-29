'use strict';

const path = require('path');
const http = require('http');
const assert = require('assert');
const { searchOmni } = require('../lib/vault/omni-search-service');

async function testOmniSearchService() {
    console.log('🧪 Starting Phase 2: High-Speed Omni-Search Verification Suite...\n');

    const demoCaseDir = path.join(__dirname, '..', '..', 'demo_case');

    // ── Test 1: Context-Aware Ranking (Inline vs Block) ──────────────────────
    console.log('Test 1: Context-Aware Ranking (Inline: Facts Boosted | Block: Templates Boosted)...');

    // 1A. Inline context with 'default' -> Facts should win
    const inlineResults = searchOmni({
        query: 'default',
        context: 'inline',
        caseDir: demoCaseDir,
        limit: 10
    });
    assert(inlineResults.length > 0, 'Should return results for "default"');
    const topInline = inlineResults[0];
    console.log(`  Top inline result for "default": [${topInline.category}] ${topInline.title} (score: ${topInline.score})`);
    assert(topInline.category === 'fact' || topInline.category === 'law', 'Inline default should prioritize case facts or statutory definition');
    assert(topInline.title.toLowerCase().includes('default'), 'Title must contain default');

    // 1B. Block context with 'order38' -> Template should win
    const blockResults = searchOmni({
        query: 'order38',
        context: 'block',
        caseDir: demoCaseDir,
        limit: 10
    });
    assert(blockResults.length > 0, 'Should return results for "order38"');
    const topBlock = blockResults[0];
    console.log(`  Top block result for "order38": [${topBlock.category}] ${topBlock.title} (score: ${topBlock.score})`);
    assert(topBlock.category === 'template' || topBlock.category === 'law', 'Block context should prioritize template or statute');
    assert(topBlock.title.toLowerCase().includes('order xxxviii') || topBlock.title.toLowerCase().includes('order 38') || topBlock.id.includes('o38'), 'Must match Order 38');

    // ── Test 2: Statutory Provisions Search ──────────────────────────────────
    console.log('\nTest 2: Statutory Vault provisions search...');
    const statuteResults = searchOmni({
        query: 'ibc 7',
        context: 'inline',
        caseDir: demoCaseDir,
        limit: 5
    });
    assert(statuteResults.length > 0, 'Should find Section 7 IBC');
    const sec7 = statuteResults.find(r => r.id === 'law:ibc-sec-7');
    assert(sec7, 'Must return Section 7 IBC provision');
    assert(sec7.payload.displayText.includes('financial creditor'), 'Must contain statutory quote');
    console.log(`  ✓ Found statutory bare act: ${sec7.title}`);

    // ── Test 3: Standard Court Actions Search ────────────────────────────────
    console.log('\nTest 3: Court Actions search...');
    const actionResults = searchOmni({
        query: 'export',
        context: 'block',
        caseDir: demoCaseDir,
        limit: 5
    });
    assert(actionResults.length > 0, 'Should find export court actions');
    const exportDocx = actionResults.find(r => r.id === 'action:export-docx');
    assert(exportDocx, 'Must find Supreme Court DOCX export action');
    console.log(`  ✓ Found court action: ${exportDocx.title} (${exportDocx.slashCommand})`);

    // ── Test 4: Blank Query Recommendations ──────────────────────────────────
    console.log('\nTest 4: Blank query ("/") recommendations...');
    const blankResults = searchOmni({
        query: '',
        context: 'block',
        caseDir: demoCaseDir,
        limit: 15
    });
    assert(blankResults.length >= 10, 'Blank query should return rich default palette');
    const categories = new Set(blankResults.map(r => r.category));
    assert(categories.has('template') || categories.has('action'), 'Blank block query should feature templates or actions');
    console.log(`  ✓ Blank query returned ${blankResults.length} categorized suggestions covering: ${Array.from(categories).join(', ')}`);

    // ── Test 5: Sub-20ms Performance Benchmark (50 iterations) ───────────────
    console.log('\nTest 5: Sub-20ms Performance Benchmark...');
    const startTime = Date.now();
    const iterations = 50;
    for (let i = 0; i < iterations; i++) {
        searchOmni({ query: 'default', context: 'inline', caseDir: demoCaseDir, limit: 20 });
        searchOmni({ query: 'order39', context: 'block', caseDir: demoCaseDir, limit: 20 });
    }
    const totalTimeMs = Date.now() - startTime;
    const avgLatencyMs = (totalTimeMs / (iterations * 2)).toFixed(2);
    console.log(`  ✓ Completed ${iterations * 2} searches in ${totalTimeMs}ms (Average Latency: ${avgLatencyMs}ms / query)`);
    assert(avgLatencyMs < 20, `Latency benchmark failed: ${avgLatencyMs}ms >= 20ms`);

    // ── Test 6: Live HTTP Endpoint GET /api/hayagriva/omni-search ────────────
    console.log('\nTest 6: Live HTTP API verification on port 3210...');
    await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:3210/api/hayagriva/omni-search?q=apex&context=inline&case=demo_case', (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    assert.strictEqual(res.statusCode, 200, `Expected 200 but got ${res.statusCode}`);
                    const json = JSON.parse(data);
                    assert.strictEqual(json.success, true, 'Response must be success: true');
                    assert(json.items && json.items.length > 0, 'Should find Apex Steel in demo_case');
                    const apexItem = json.items[0];
                    assert(apexItem.title.includes('Apex Steel'), `Top item should mention Apex Steel, got: ${apexItem.title}`);
                    console.log(`  ✓ Live HTTP API returned: "${apexItem.title}" (badge: ${apexItem.badge})`);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });

    console.log('\n🎉 ALL PHASE 2 OMNI-SEARCH TESTS PASSED! Backend API is verified and sub-20ms fast.\n');
}

testOmniSearchService().catch(err => {
    console.error('❌ Phase 2 Test failed:', err.message);
    process.exit(1);
});
