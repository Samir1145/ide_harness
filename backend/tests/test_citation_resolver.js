const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const routes = require('../lib/routes');
const { replaceCitations } = require('../lib/core/rag');

async function run() {
    console.log('--- Testing Plan 3: Clickable Citation Preview & Resolver Pipeline ---');

    // ─── PART 1: Test replaceCitations in rag.js ──────────────────────────────
    console.log('1. Testing replaceCitations formatting & bibliography generation in rag.js...');
    const sampleText = 'According to the order [source:0], the CIRP was admitted on 12th Jan 2024. Furthermore, the claims total INR 50 Cr [source:1].';
    const mockCitations = [
        {
            filename: 'NCLT_Admission_Order.pdf',
            metadata: {
                page: 4,
                chunk: 0,
                section_title: 'Admission of CIRP under Section 7'
            }
        },
        {
            filename: 'Claims_Summary_Memo.docx',
            metadata: {
                page: 2,
                chunk: 1,
                section_title: 'List of Admitted Financial Creditors'
            }
        }
    ];

    const processedText = replaceCitations(sampleText, mockCitations);

    // Verify URI format
    assert(processedText.includes('hayagriva-citation://NCLT_Admission_Order.pdf?page=4&chunk=0&title='), 'Must format URI for citation 0');
    assert(processedText.includes('hayagriva-citation://Claims_Summary_Memo.docx?page=2&chunk=1&title='), 'Must format URI for citation 1');
    assert(processedText.includes('[1](hayagriva-citation://'), 'Must contain [1](hayagriva-citation://)');
    assert(processedText.includes('[2](hayagriva-citation://'), 'Must contain [2](hayagriva-citation://)');

    // Verify Bibliography Footer
    assert(processedText.includes('**Sources Cited:**'), 'Must append Sources Cited bibliography header');
    assert(processedText.includes('[**NCLT_Admission_Order.pdf** (p. 4)'), 'Must list source 1 with page');
    assert(processedText.includes('Admission of CIRP under Section 7'), 'Must include section title for source 1');
    assert(processedText.includes('[**Claims_Summary_Memo.docx** (p. 2)'), 'Must list source 2 with page');
    console.log('   ✓ rag.js citation link and bibliography generation verified.');

    // ─── PART 2: Test /api/hayagriva/citation/resolve HTTP Endpoint ───────────
    console.log('2. Setting up test fixtures for Citation Resolver endpoint...');
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });

    const caseDir = path.join(fixturesDir, 'test_citation_case_' + Date.now());
    const caseName = path.basename(caseDir);
    const conceptsDir = path.join(caseDir, `${caseName}_concepts_haya`);
    const docConceptsDir = path.join(conceptsDir, 'NCLT_Admission_Order.pdf');
    fs.mkdirSync(caseDir, { recursive: true });
    fs.mkdirSync(docConceptsDir, { recursive: true });

    // Mock binary PDF in caseDir
    fs.writeFileSync(path.join(caseDir, 'NCLT_Admission_Order.pdf'), '%PDF-1.4 Mock Binary PDF Content', 'utf8');

    // Mock companion markdown
    const companionContent = `# NCLT Admission Order
## Page 1
Introductory notices and appearance of parties.

## Page 4 - Section 7 Admission
The Adjudicating Authority hereby admits the application filed under Section 7 of the IBC by State Bank of India. The Corporate Debtor is placed under Corporate Insolvency Resolution Process (CIRP). An interim moratorium under Section 14 is declared forthwith.

## Page 5
Appointment of the Interim Resolution Professional.`;
    fs.writeFileSync(path.join(docConceptsDir, 'companion.md'), companionContent, 'utf8');

    // Mock pageindex_tree.json
    const pageIndexTree = [
        {
            title: 'Title and Cause Title',
            page: 1,
            summary: 'Formal notice and appearances.'
        },
        {
            title: 'Admission of CIRP under Section 7',
            page: 4,
            summary: 'Application admitted and moratorium initiated.'
        },
        {
            title: 'Appointment of IRP',
            page: 5,
            summary: 'Mr. Rajesh Sharma appointed as IRP.'
        }
    ];
    fs.writeFileSync(path.join(docConceptsDir, 'pageindex_tree.json'), JSON.stringify(pageIndexTree, null, 2), 'utf8');

    let server;
    let baseUrl;

    try {
        server = http.createServer(async (req, res) => {
            const url = require('url').parse(req.url, true);
            const methodRoutes = routes[req.method];
            if (methodRoutes && methodRoutes[url.pathname]) {
                try {
                    await methodRoutes[url.pathname](req, res, url, fixturesDir);
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not found' }));
            }
        });

        await new Promise(resolve => server.listen(0, resolve));
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`   Test server running at ${baseUrl}`);

        // Test 2A: Resolve Page 4 from PageIndex Tree & Companion MD
        console.log('3. Resolving citation with PageIndex Tree matching...');
        const resPage4 = await fetch(`${baseUrl}/api/hayagriva/citation/resolve?case=${encodeURIComponent(caseName)}&doc=NCLT_Admission_Order.pdf&page=4`);
        assert.strictEqual(resPage4.status, 200);
        const dataPage4 = await resPage4.json();
        assert.strictEqual(dataPage4.success, true);
        assert.strictEqual(dataPage4.docName, 'NCLT_Admission_Order.pdf');
        assert.strictEqual(dataPage4.page, 4);
        assert.strictEqual(dataPage4.sectionTitle, 'Admission of CIRP under Section 7');
        assert.strictEqual(dataPage4.isPdf, true);
        assert(dataPage4.excerpt.includes('Section 7 of the IBC'), 'Excerpt must contain Section 7 excerpt text');
        console.log('   ✓ Resolved successfully with title & excerpt:', dataPage4.sectionTitle);

        // Test 2B: Verify LRU Cache Hit
        console.log('4. Testing LRU cache response on second request...');
        const resCached = await fetch(`${baseUrl}/api/hayagriva/citation/resolve?case=${encodeURIComponent(caseName)}&doc=NCLT_Admission_Order.pdf&page=4`);
        assert.strictEqual(resCached.status, 200);
        const dataCached = await resCached.json();
        assert.strictEqual(dataCached.success, true);
        assert.strictEqual(dataCached.excerpt, dataPage4.excerpt);
        console.log('   ✓ Cache hit returned matching payload.');

        // Test 2C: Resolve document without pageindex tree (companion fallback)
        console.log('5. Resolving citation without pageindex tree (companion fallback)...');
        const docNoTreeDir = path.join(conceptsDir, 'Plain_Agreement.md');
        fs.mkdirSync(docNoTreeDir, { recursive: true });
        fs.writeFileSync(path.join(docNoTreeDir, 'companion.md'), 'This is a standalone agreement text without tree index. It defines obligations.', 'utf8');

        const resFallback = await fetch(`${baseUrl}/api/hayagriva/citation/resolve?case=${encodeURIComponent(caseName)}&doc=Plain_Agreement.md`);
        assert.strictEqual(resFallback.status, 200);
        const dataFallback = await resFallback.json();
        assert.strictEqual(dataFallback.success, true);
        assert.strictEqual(dataFallback.isPdf, false);
        assert(dataFallback.excerpt.includes('standalone agreement text'), 'Must extract excerpt from companion markdown');
        console.log('   ✓ Fallback companion markdown extraction verified.');

        // Test 2D: Missing doc param validation (400)
        console.log('6. Testing validation of missing doc param (400)...');
        const resNoDoc = await fetch(`${baseUrl}/api/hayagriva/citation/resolve?case=${encodeURIComponent(caseName)}`);
        assert.strictEqual(resNoDoc.status, 400);
        console.log('   ✓ Missing doc param returned HTTP 400.');

        // Test 2E: Non-existent doc (404)
        console.log('7. Testing non-existent document (404)...');
        const resNotFound = await fetch(`${baseUrl}/api/hayagriva/citation/resolve?case=${encodeURIComponent(caseName)}&doc=Ghost_Document_404.pdf`);
        assert.strictEqual(resNotFound.status, 404);
        console.log('   ✓ Non-existent document returned HTTP 404.');

        console.log('\n✅ ALL CITATION PREVIEW & RESOLVER TESTS PASSED SUCCESSFULLY!\n');
    } finally {
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }
        // Cleanup test directory
        try {
            fs.rmSync(caseDir, { recursive: true, force: true });
            fs.rmSync(conceptsDir, { recursive: true, force: true });
        } catch (_) {}
    }
}

run().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
