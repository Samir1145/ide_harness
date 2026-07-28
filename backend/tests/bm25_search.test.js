const bm25 = require('../lib/core/bm25');
const assert = require('assert');

function testTokenizerAndStemmer() {
    console.log('  -> Testing BM25 tokenizer and stemmer...');
    
    // Stemming assertions
    assert.strictEqual(bm25.stem('defaulted'), 'default');
    assert.strictEqual(bm25.stem('petitions'), 'petition');
    assert.strictEqual(bm25.stem('retrieved'), 'retriev');
    
    // Tokenization and stop word filtering
    const tokens = bm25.tokenize('The petitioner defaulted on the payment of money owed.');
    assert.ok(tokens.includes('default'), 'Should tokenize and stem "defaulted"');
    assert.ok(tokens.includes('pay'), 'Should tokenize and stem "payment"');
    assert.ok(!tokens.includes('the'), 'Should filter out common stop words');
    assert.ok(!tokens.includes('on'), 'Should filter out short preposition stop words');
}

function testIndexBuildingAndScoring() {
    console.log('  -> Testing index creation, term weighting, and search ranking...');
    
    const doc1 = { id: 'doc_1', text: 'Corporate debtor entered insolvency resolution process on March 15.' };
    const doc2 = { id: 'doc_2', text: 'Liquidator submitted the report to NCLT showing outstanding defaults.' };
    const index = bm25.buildIndex([doc1, doc2]);
    
    assert.strictEqual(index.totalDocs, 2, 'Total indexed documents count mismatch');
    
    // Querying first doc
    const results = bm25.search(index, 'insolvency process');
    assert.ok(results.length > 0, 'Search should return results');
    assert.strictEqual(results[0].docId, 'doc_1', 'Best match should be doc_1');
    
    // Querying second doc
    const results2 = bm25.search(index, 'outstanding defaults');
    assert.ok(results2.length > 0, 'Search should return results');
    assert.strictEqual(results2[0].docId, 'doc_2', 'Best match should be doc_2');
}

function run() {
    console.log('[BM25 Search Unit Tests]');
    testTokenizerAndStemmer();
    testIndexBuildingAndScoring();
}

module.exports = { run };
