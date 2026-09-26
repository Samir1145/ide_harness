'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const url = require('url');

const {
    classifyDocument,
    extractKeyParameters,
    detectIntegrityIssues,
    generatePostIngestBrief,
    postBriefToInbox,
    FOCUS_MODES
} = require('../lib/core/post-ingest-briefer');

const caseSession = require('../lib/core/case-session');
const inboxManager = require('../lib/agents/inbox-manager');
const routes = require('../lib/routes');

async function runTests() {
    console.log('[Plan 18: Conversational Post-Ingest Brief & Interactive Emphasis Tests]');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hayagriva-brief-test-'));

    try {
        // ====================================================================
        // TEST 1: Document Classification across Statutory Archetypes
        // ====================================================================
        console.log('  -> Test 1: classifyDocument identifies statutory insolvency archetypes');
        
        // Resolution Plan
        const planText = 'Draft Resolution Plan submitted by Consortium of Star Infra Ltd under Section 30 read with Regulation 38 for Corporate Debtor.';
        const planClass = classifyDocument(planText, 'Resolution_Plan_v2.pdf');
        assert.strictEqual(planClass.docType, 'RESOLUTION_PLAN');
        assert(planClass.confidence >= 0.90);

        // Admission Order
        const orderText = 'Before the National Company Law Tribunal, New Delhi Bench. Section 7 petition admitted into CIRP. Moratorium declared under Section 14.';
        const orderClass = classifyDocument(orderText, 'Admission_Order.pdf');
        assert.strictEqual(orderClass.docType, 'CIRP_ADMISSION_ORDER');

        // Forensic Audit
        const auditText = 'Transaction Audit Report of ABC Ltd. Identification of preferential transactions under Section 43 and undervalued transfers under Section 45.';
        const auditClass = classifyDocument(auditText, 'Forensic_Audit_Report.pdf');
        assert.strictEqual(auditClass.docType, 'FORENSIC_AUDIT');

        // Claim Form
        const claimText = 'Form C: Proof of Claim by Financial Creditor under Regulation 8 of the IBBI CIRP Regulations, 2016.';
        const claimClass = classifyDocument(claimText, 'Claim_Form_C_StateBank.pdf');
        assert.strictEqual(claimClass.docType, 'CLAIM_FORM');

        // CoC Minutes
        const cocText = 'Minutes of the 3rd Meeting of the Committee of Creditors held on 12th March 2024. Agenda item 4: Voting share and approval of IRP fee.';
        const cocClass = classifyDocument(cocText, 'CoC_3rd_Minutes.pdf');
        assert.strictEqual(cocClass.docType, 'COC_MINUTES');

        // ====================================================================
        // TEST 2: Parameter Extraction (Debtor, Creditor, Quantum, Sections)
        // ====================================================================
        console.log('  -> Test 2: extractKeyParameters extracts debtor, parties, quantum, and sections');
        const sampleText = `
        BEFORE THE NATIONAL COMPANY LAW TRIBUNAL, MUMBAI BENCH
        IN THE MATTER OF:
        State Bank of India (Financial Creditor)
        VERSUS
        Zenith Power Systems Private Limited (Corporate Debtor)
        
        ORDER DATED 14th January 2024
        The Adjudicating Authority hereby admits the application under Section 7 of the Code.
        The total admitted financial debt is ₹845,20,00,000 (Rupees Eight Hundred Forty Five Crores).
        Moratorium is declared under Section 14.
        `;
        const params = extractKeyParameters(sampleText);
        assert(params.corporate_debtor && params.corporate_debtor.includes('Zenith Power Systems'), 'Must extract CD');
        assert(params.applicant_or_creditor && params.applicant_or_creditor.includes('State Bank of India'), 'Must extract Creditor');
        assert(params.debt_quantum && params.debt_quantum.includes('845,20,00,000'), 'Must extract debt quantum');
        assert(params.statutory_sections.includes('§ 7') && params.statutory_sections.includes('§ 14'), 'Must extract sections 7 & 14');

        // ====================================================================
        // TEST 3: Integrity & Scanned Page Detection
        // ====================================================================
        console.log('  -> Test 3: detectIntegrityIssues flags low-density scanned pages (<35 chars/page)');
        // 5 pages: p1=500 chars, p2=12 chars (scanned), p3=600 chars, p4=20 chars (scanned), p5=800 chars
        const densities = [500, 12, 600, 20, 800];
        const integrity = detectIntegrityIssues(densities);
        assert.strictEqual(integrity.scannedFlag, true);
        assert.deepStrictEqual(integrity.lowDensityPages, [2, 4]);

        const cleanDensities = [500, 600, 750, 820];
        const cleanIntegrity = detectIntegrityIssues(cleanDensities);
        assert.strictEqual(cleanIntegrity.scannedFlag, false);
        assert.strictEqual(cleanIntegrity.lowDensityPages.length, 0);

        // ====================================================================
        // TEST 4: Post-Ingest Brief Generation
        // ====================================================================
        console.log('  -> Test 4: generatePostIngestBrief formats structured 3-5 bullet briefing');
        const brief = generatePostIngestBrief(tempDir, 'Resolution_Plan_Zenith.pdf', {
            text: `Resolution Plan submitted by Star Consortium Limited for Zenith Power Systems Private Limited under Section 30 and Regulation 38. Total Proposed Plan Value: ₹350 Crore.`,
            pageCount: 45,
            densityArray: [500, 450, 18, 600] // Page 3 scanned
        });

        assert.strictEqual(brief.docType, 'RESOLUTION_PLAN');
        assert(brief.bullets.length >= 3, 'Must have at least 3 executive bullets');
        assert(brief.markdown.includes('Ingestion Brief: `Resolution_Plan_Zenith.pdf`'), 'Must format markdown header');
        assert(brief.markdown.includes('Pages 3 have low text density'), 'Must flag scanned page 3');
        assert.strictEqual(brief.focusOptions.length, 4, 'Must provide 4 focus mode options');

        // ====================================================================
        // TEST 5: Actionable Case Action Inbox Card
        // ====================================================================
        console.log('  -> Test 5: postBriefToInbox creates actionable card in case_inbox.json');
        const inboxCard = postBriefToInbox(tempDir, brief);
        assert(inboxCard && inboxCard.id, 'Inbox card must be created');
        assert.strictEqual(inboxCard.kind, 'INGEST_BRIEF');
        assert.strictEqual(inboxCard.options.length, 3, 'Must have focus buttons');
        assert.strictEqual(inboxCard.options[0].id, 'set_focus_waterfall');

        const inboxStore = inboxManager.loadInbox(tempDir);
        assert(inboxStore.items.some(i => i.id === inboxCard.id), 'Card must be persisted to reviews/case_inbox.json');

        // ====================================================================
        // TEST 6: Interactive Emphasis Mode Setting & Session Sync
        // ====================================================================
        console.log('  -> Test 6: Setting focus mode updates reviews/case_session.json');
        const updatedSession = caseSession.recordFocusMode(tempDir, 'waterfall');
        assert.strictEqual(updatedSession.active_focus, 'waterfall');

        const reloaded = caseSession.loadCaseSession(tempDir);
        assert.strictEqual(reloaded.active_focus, 'waterfall');

        // ====================================================================
        // TEST 7: Dynamic Emphasis Scoring in CMS retrieveContexts
        // ====================================================================
        console.log('  -> Test 7: retrieveContexts boosts chunks matching active_focus by 2.0x');
        const { getDb } = require('../lib/core/sqlite-store');
        const { retrieveContexts } = require('../lib/core/rag');

        const db = getDb(tempDir);
        // Create fts_chunks and document_vectors tables if needed
        // getDb already initializes fts_chunks as an FTS5 virtual table

        // Insert two test chunks:
        // Chunk A: Financial Waterfall chunk
        db.prepare(`
            INSERT INTO fts_chunks (filename, section_title, page_number, chunk_index, content)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            'Resolution_Plan.pdf',
            'Distribution Waterfall',
            12,
            0,
            'Under Section 53 read with Regulation 38, the Resolution Plan provides for a distribution waterfall where secured creditors receive ₹250 Cr and operational creditors receive ₹25 Cr payout.'
        );

        // Chunk B: General background chunk
        db.prepare(`
            INSERT INTO fts_chunks (filename, section_title, page_number, chunk_index, content)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            'Resolution_Plan.pdf',
            'Company Overview',
            2,
            1,
            'The corporate debtor was established in 2005 as a manufacturer of industrial turbine components and electrical transformers.'
        );

        // Set focus to 'waterfall'
        caseSession.recordFocusMode(tempDir, 'waterfall');
        const resultsWaterfall = await retrieveContexts(tempDir, 'Resolution Plan distribution');
        assert(resultsWaterfall.length > 0, 'Must retrieve chunks');
        
        // Find the waterfall chunk
        const waterfallHit = resultsWaterfall.find(h => h.title.includes('Distribution Waterfall') || (h.content && h.content.includes('distribution waterfall')));
        assert(waterfallHit, 'Waterfall chunk must be retrieved');
        assert.strictEqual(waterfallHit.emphasisMatch, true, 'Waterfall chunk must have emphasisMatch flag set to true');

        // Switch focus to 'general'
        caseSession.recordFocusMode(tempDir, 'general');
        const resultsGeneral = await retrieveContexts(tempDir, 'Resolution Plan distribution');
        const waterfallHitGeneral = resultsGeneral.find(h => h.title.includes('Distribution Waterfall') || (h.content && h.content.includes('distribution waterfall')));
        assert(waterfallHitGeneral, 'Waterfall chunk retrieved');
        assert.strictEqual(waterfallHitGeneral.emphasisMatch, false, 'General mode must set emphasisMatch to false');

        // ====================================================================
        // TEST 8: RESTful HTTP Endpoints
        // ====================================================================
        console.log('  -> Test 8: HTTP Routes: GET brief, GET emphasis, POST set-emphasis');
        const docsRoot = os.tmpdir();
        const caseName = path.basename(tempDir);
        let server;
        let baseUrl;

        try {
            server = http.createServer(async (req, res) => {
                const parsedUrl = url.parse(req.url, true);
                const methodRoutes = routes[req.method];
                if (methodRoutes && methodRoutes[parsedUrl.pathname]) {
                    try {
                        await methodRoutes[parsedUrl.pathname](req, res, parsedUrl, docsRoot);
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

            // 8A. GET /api/hayagriva/ingest/brief
            const resBrief = await fetch(`${baseUrl}/api/hayagriva/ingest/brief?case=${encodeURIComponent(caseName)}&file=Resolution_Plan.pdf`);
            assert.strictEqual(resBrief.status, 200);
            const dataBrief = await resBrief.json();
            assert.strictEqual(dataBrief.success, true);
            assert(dataBrief.brief.bullets.length >= 2);

            // 8B. POST /api/hayagriva/ingest/set-emphasis
            const resSetFocus = await fetch(`${baseUrl}/api/hayagriva/ingest/set-emphasis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ case: caseName, focus: 's29a' })
            });
            assert.strictEqual(resSetFocus.status, 200);
            const dataSetFocus = await resSetFocus.json();
            assert.strictEqual(dataSetFocus.success, true);
            assert.strictEqual(dataSetFocus.active_focus, 's29a');

            // 8C. GET /api/hayagriva/ingest/emphasis
            const resGetFocus = await fetch(`${baseUrl}/api/hayagriva/ingest/emphasis?case=${encodeURIComponent(caseName)}`);
            assert.strictEqual(resGetFocus.status, 200);
            const dataGetFocus = await resGetFocus.json();
            assert.strictEqual(dataGetFocus.success, true);
            assert.strictEqual(dataGetFocus.active_focus, 's29a');
            assert.strictEqual(dataGetFocus.boost_multiplier, 2.0);
            assert(dataGetFocus.focus_terms.includes('section 29a'));

            console.log('   ✓ HTTP endpoints verified (GET brief, POST set-emphasis, GET emphasis).');
        } finally {
            if (server) {
                await new Promise(resolve => server.close(resolve));
            }
        }

        console.log('\n✅ ALL PLAN 18 POST-INGEST BRIEF & EMPHASIS TESTS PASSED CLEANLY!\n');
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

runTests().catch(err => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
});
