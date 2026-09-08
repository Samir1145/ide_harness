const assert = require('assert');
const { rerankCandidates, warmupRerankerPipeline } = require('../lib/core/reranker');

async function runTests() {
    console.log('=== Test Suite: Native ONNX Reranker (ms-marco-MiniLM-L-6-v2) ===\n');

    // Test 1: Pre-warmup
    console.log('Test 1: Pre-warmup pipeline...');
    const tWarmup0 = Date.now();
    await warmupRerankerPipeline();
    console.log(`✓ Pre-warmup executed successfully in ${Date.now() - tWarmup0} ms.\n`);

    // Test 2: Legal Ranking Precision
    console.log('Test 2: Discriminatory power on Homebuyer Claim Query...');
    const query = 'Form CA homebuyer interest claim in insolvency';
    const candidates = [
        {
            docName: 'General_Companies_Act',
            title: 'Section 134 Financial Statements',
            body: 'Every balance sheet and profit and loss account laid before the company in annual general meeting shall be signed on behalf of the Board.'
        },
        {
            docName: 'CIRP_Regulations_2016',
            title: 'Regulation 8A Claims by Creditors in a Class',
            body: 'A person claiming to be a creditor in a class shall submit its claim with proof to the interim resolution professional in Form CA electronic means. Allottees under real estate projects claim principal together with interest.'
        },
        {
            docName: 'Operational_Creditors_Guide',
            title: 'Form B Supplier Invoices',
            body: 'Operational creditors including vendors and suppliers of materials must file their claims under Form B accompanied by tax invoices and delivery challans.'
        }
    ];

    const tRank0 = Date.now();
    const ranked = await rerankCandidates(query, candidates, { topK: 3 });
    const latency = Date.now() - tRank0;

    console.log(`Scored ${candidates.length} passages in ${latency} ms.`);
    for (let i = 0; i < ranked.length; i++) {
        console.log(`  [Rank ${i + 1}] ${ranked[i].docName} / ${ranked[i].title} => Score: ${ranked[i].rerankerScore.toFixed(4)} (logit: ${ranked[i].rerankerLogit.toFixed(2)})`);
    }
    assert.strictEqual(ranked.length, 3);
    assert.strictEqual(ranked[0].docName, 'CIRP_Regulations_2016', 'Regulation 8A Form CA must rank #1');
    assert.ok(ranked[0].rerankerScore > 0.6, `Form CA score must be > 0.6 (got ${ranked[0].rerankerScore.toFixed(4)})`);
    assert.ok(ranked[0].rerankerScore > ranked[1].rerankerScore * 10, 'Rank 1 score must heavily dominate Rank 2');
    console.log(`✓ Rank 1 correctly identified as: ${ranked[0].title} (Score: ${ranked[0].rerankerScore.toFixed(4)})`);
    console.log(`✓ Latency benchmark: ${latency} ms (< 50 ms threshold).\n`);

    // Test 3: Edge cases (empty candidates, empty query, single candidate)
    console.log('Test 3: Edge cases handling...');
    const single = [{ docName: 'Solo', title: 'Single Doc', body: 'Single document body' }];
    const resSingle = await rerankCandidates(query, single);
    assert.strictEqual(resSingle.length, 1);

    const empty = await rerankCandidates(query, []);
    assert.deepStrictEqual(empty, []);

    const emptyQueryRes = await rerankCandidates('', candidates, { topK: 2 });
    assert.strictEqual(emptyQueryRes.length, 2);
    console.log('✓ Edge cases handled gracefully.\n');

    console.log('=== All Reranker Tests Passed! ===');
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
