const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const routes = require('../lib/routes');
const {
    fileInsight,
    recompileWikiCatalog,
    getWikiCatalog,
    shouldSuggestFiling,
    extractSynopsis
} = require('../lib/pipeline/wiki/catalog');
const { getDb } = require('../lib/core/sqlite-store');

async function run() {
    console.log('--- Testing Plan 12 & 19: Case Wiki Compounding Artifact & Answer Filing ---');

    // ─── PART 1: Test shouldSuggestFiling & extractSynopsis ──────────────────
    console.log('1. Testing auto-suggest heuristics & synopsis extraction...');
    
    // Test brief non-statutory answer -> false
    assert.strictEqual(shouldSuggestFiling('The meeting was scheduled at 10 AM.', ['doc1.pdf']), false);

    // Test long multi-document answer (≥ 250 words, ≥ 3 docs) -> true
    const longWords = new Array(260).fill('word').join(' ');
    assert.strictEqual(shouldSuggestFiling(longWords, ['doc1.pdf', 'doc2.pdf', 'doc3.pdf']), true);

    // Test statutory trigger with moderate length (≥ 180 words with Section 29A) -> true
    const s29aAnswer = 'Resolution Applicant is ineligible under Section 29A of the IBC. ' + new Array(185).fill('evidence').join(' ');
    assert.strictEqual(shouldSuggestFiling(s29aAnswer, ['doc1.pdf']), true);

    // Test extractSynopsis
    const sampleBody = `# Title Header\n\n---\nkey: val\n---\nResolution Applicant XYZ Ltd is disqualified under Section 29A(c) due to an NPA classification. Second sentence here.`;
    const syn = extractSynopsis(sampleBody);
    assert(syn.includes('Resolution Applicant XYZ Ltd is disqualified under Section 29A(c)'), 'Synopsis must extract first sentence');
    console.log('   ✓ Auto-suggest heuristics and synopsis extraction verified.');

    // ─── PART 2: Test fileInsight & recompileWikiCatalog Directly ─────────────
    console.log('2. Setting up test fixtures for Case Wiki catalog...');
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });

    const caseDir = path.join(fixturesDir, 'test_wiki_case_' + Date.now());
    const caseName = path.basename(caseDir);
    const wikiDir = path.join(caseDir, `${caseName}_wiki_haya`);
    fs.mkdirSync(wikiDir, { recursive: true });

    // Initialize SQLite DB
    const db = getDb(caseDir);

    console.log('3. Filing first legal insight via fileInsight()...');
    const insight1 = await fileInsight(caseDir, {
        title: 'Section 29A Eligibility Audit: Applicant XYZ',
        slug: 's29a_eligibility_applicant_xyz',
        query: 'Is Applicant XYZ eligible under Section 29A?',
        answer: 'Resolution Applicant XYZ Ltd is disqualified under Section 29A(c) of the IBC due to NPA accounts with Punjab National Bank exceeding 1 year. The proviso cure has not been demonstrated.',
        agent: 'AdvisorAgent',
        documentsUsed: ['NCLT_Admission_Order.pdf', 'Forensic_Audit_Report.pdf'],
        tags: ['section-29a', 'eligibility']
    });

    assert.strictEqual(insight1.success, true);
    assert(fs.existsSync(insight1.filePath), 'Insight markdown file must exist on disk');

    // Verify content on disk has frontmatter
    const diskContent = fs.readFileSync(insight1.filePath, 'utf8');
    const { parseMarkdownWithFrontmatter } = require('../lib/utils/okf');
    const parsedDisk = parseMarkdownWithFrontmatter(diskContent);
    assert.strictEqual(parsedDisk.frontmatter.slug, 's29a_eligibility_applicant_xyz');
    assert.strictEqual(parsedDisk.frontmatter.agent, 'AdvisorAgent');

    // Verify indexed into SQLite
    const ftsRow = db.prepare('SELECT * FROM fts_chunks WHERE filename = ?').get('wiki/insights/s29a_eligibility_applicant_xyz.md');
    assert(ftsRow, 'Must index insight into SQLite fts_chunks');
    assert(ftsRow.content.includes('disqualified under Section 29A(c)'), 'Chunk must contain answer text');

    // Verify INDEX.md generated
    const indexPath = path.join(wikiDir, 'INDEX.md');
    assert(fs.existsSync(indexPath), 'INDEX.md must be generated automatically');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    assert(indexContent.includes('## Synthesized Legal Insights'), 'INDEX.md must have Synthesized Legal Insights section');
    assert(indexContent.includes('[[insights/s29a_eligibility_applicant_xyz]]'), 'INDEX.md must link to new insight');
    console.log('   ✓ fileInsight created disk file, SQLite FTS5 record, and updated INDEX.md.');

    // Add a second insight and a source summary
    console.log('4. Adding second insight and primary source summary...');
    await fileInsight(caseDir, {
        title: 'Section 43 Avoidance: Contra-Sweeps to ICICI',
        slug: 'avoidance_contra_sweeps_icici',
        query: 'Analyze ICICI bank contra-sweeps for avoidance',
        answer: 'Forensic reconciliation identified INR 4.8 Cr transferred within the 1-year lookback period constituting preferential transactions under Section 43.',
        agent: 'DocumentAgent',
        documentsUsed: ['Bank_Ledger_ICICI.xlsx']
    });

    // Add source summary
    const sourcesDir = path.join(wikiDir, 'sources');
    fs.mkdirSync(sourcesDir, { recursive: true });
    fs.writeFileSync(path.join(sourcesDir, 'nclt_admission_order.md'), `---
title: "NCLT Admission Order Summary"
slug: "nclt_admission_order"
---
# NCLT Admission Order Summary
Statutory analysis of CIRP commencement order declaring interim moratorium under Section 14.`, 'utf8');

    // Recompile catalog
    const catalogRes = recompileWikiCatalog(caseDir);
    assert.strictEqual(catalogRes.success, true);
    assert.strictEqual(catalogRes.counts.insights, 2);
    assert.strictEqual(catalogRes.counts.sources, 1);

    const updatedIndex = fs.readFileSync(indexPath, 'utf8');
    assert(updatedIndex.includes('[[insights/avoidance_contra_sweeps_icici]]'), 'Catalog must include second insight');
    assert(updatedIndex.includes('[[sources/nclt_admission_order]]'), 'Catalog must include primary source summary');
    console.log('   ✓ Recompiled catalog successfully with multiple insights and sources.');

    // ─── PART 3: Test HTTP Endpoints via routes.js ────────────────────────────
    console.log('5. Testing Case Wiki HTTP routes...');
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

        // Test 3A: GET /api/hayagriva/wiki/index
        console.log('6. Testing GET /api/hayagriva/wiki/index...');
        const resIndex = await fetch(`${baseUrl}/api/hayagriva/wiki/index?case=${encodeURIComponent(caseName)}`);
        assert.strictEqual(resIndex.status, 200);
        const dataIndex = await resIndex.json();
        assert.strictEqual(dataIndex.success, true);
        assert(dataIndex.content.includes('Section 29A Eligibility Audit'), 'Catalog response must contain insight title');
        console.log('   ✓ GET /api/hayagriva/wiki/index verified.');

        // Test 3B: POST /api/hayagriva/wiki/file-insight
        console.log('7. Testing POST /api/hayagriva/wiki/file-insight...');
        const resFilePost = await fetch(`${baseUrl}/api/hayagriva/wiki/file-insight`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                caseName,
                title: 'CIRP Moratorium Scope under Section 14',
                query: 'Does Section 14 prevent arbitration proceedings?',
                answer: 'Under Section 14(1)(a), the institution of suits or continuation of pending proceedings against the Corporate Debtor including arbitration is strictly prohibited during the moratorium.',
                agent: 'AdvisorAgent',
                documentsUsed: ['NCLT_Admission_Order.pdf']
            })
        });
        assert.strictEqual(resFilePost.status, 200);
        const dataFilePost = await resFilePost.json();
        assert.strictEqual(dataFilePost.success, true);
        assert.strictEqual(dataFilePost.title, 'CIRP Moratorium Scope under Section 14');
        console.log('   ✓ POST /api/hayagriva/wiki/file-insight successfully filed new insight.');

        // Test 3C: GET /api/hayagriva/wiki-cards
        console.log('8. Testing GET /api/hayagriva/wiki-cards category grouping...');
        const resCards = await fetch(`${baseUrl}/api/hayagriva/wiki-cards?case=${encodeURIComponent(caseName)}`);
        assert.strictEqual(resCards.status, 200);
        const dataCards = await resCards.json();
        assert(Array.isArray(dataCards.cards), 'Must return cards array');
        
        const insightCards = dataCards.cards.filter(c => c.category === 'insight');
        const sourceCards = dataCards.cards.filter(c => c.category === 'source');
        assert(insightCards.length >= 3, 'Must categorize at least 3 insight cards');
        assert(sourceCards.length >= 1, 'Must categorize at least 1 source card');
        console.log(`   ✓ GET /api/hayagriva/wiki-cards returned ${insightCards.length} insight cards and ${sourceCards.length} source cards.`);

        // Test 3D: POST /api/hayagriva/wiki/should-suggest-filing
        console.log('9. Testing POST /api/hayagriva/wiki/should-suggest-filing...');
        const resSuggest = await fetch(`${baseUrl}/api/hayagriva/wiki/should-suggest-filing`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                answer: 'Brief reply without statutory triggers.',
                documentsUsed: []
            })
        });
        const dataSuggest = await resSuggest.json();
        assert.strictEqual(dataSuggest.suggest, false);

        const resSuggestTrue = await fetch(`${baseUrl}/api/hayagriva/wiki/should-suggest-filing`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                answer: 'In-depth finding on Section 66 fraudulent trading and avoidance transactions. ' + new Array(190).fill('details').join(' '),
                documentsUsed: ['Audit_Report.pdf']
            })
        });
        const dataSuggestTrue = await resSuggestTrue.json();
        assert.strictEqual(dataSuggestTrue.suggest, true);
        console.log('   ✓ POST /api/hayagriva/wiki/should-suggest-filing verified.');

        // Test Part 10: RAG Prioritization of Filed Insights
        console.log('10. Testing RAG retrieval prioritization for Case Wiki insights...');
        const { retrieveContexts } = require('../lib/core/rag');
        const contexts = await retrieveContexts(caseDir, 'Section 29A eligibility Applicant XYZ');
        assert(contexts.length > 0, 'Must retrieve context matches');
        const topHit = contexts[0];
        assert(topHit.docName === 'Wiki Insight' || topHit.docName === 'Wiki', 'Top retrieved context should be Wiki Insight');
        assert(topHit.title.includes('Section 29A Eligibility Audit') || topHit.content.includes('disqualified under Section 29A'), 'Top hit should contain insight content');
        console.log(`   ✓ Top context prioritized as "${topHit.docName}" (Score: ${topHit.score ? topHit.score.toFixed(3) : 'n/a'})`);

        console.log('\n✅ ALL CASE WIKI COMPOUNDING ARTIFACT TESTS PASSED CLEANLY!\n');
    } finally {
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }
        // Cleanup test directory
        try {
            fs.rmSync(caseDir, { recursive: true, force: true });
        } catch (_) {}
    }
}

run().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
