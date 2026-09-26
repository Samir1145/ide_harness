'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const caseSession = require('../lib/core/case-session');
const {
    estimateTokens,
    compactHistory,
    emergencyCompact,
    isContextOverflow,
    USER_MESSAGES_MAX
} = require('../lib/core/history-compactor');

async function runTests() {
    console.log('[Plan 14 & Plan 15: Case Session Working-State Extraction & Overflow Guard Tests]');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hayagriva-session-test-'));

    try {
        // ====================================================================
        // TEST 1: Default Session Creation & Initialization
        // ====================================================================
        console.log('  -> Test 1: createDefaultSession produces standard schema');
        const defaultSession = caseSession.createDefaultSession(tempDir);
        assert.strictEqual(defaultSession.version, 1);
        assert.strictEqual(defaultSession.active_focus, 'general');
        assert.strictEqual(defaultSession.turn_count, 0);
        assert.deepStrictEqual(defaultSession.documents_indexed, {});
        assert.deepStrictEqual(defaultSession.kv_keys_written, {});

        // ====================================================================
        // TEST 2: Mechanical Tracking: Documents, Facts, Wiki, Drafts
        // ====================================================================
        console.log('  -> Test 2: Mechanical event recorders persist to reviews/case_session.json');
        
        // Document
        caseSession.recordDocumentIndexed(tempDir, {
            filename: 'Admission_Order_ABC.pdf',
            pages: 18,
            textDensity: 520,
            status: 'indexed'
        });

        // Facts (one verified, one unverified)
        caseSession.recordKVKeyWritten(tempDir, {
            key: 'corporate_debtor',
            value: 'Acme Technologies Ltd',
            verified_by_user: 1,
            source: 'admission_order'
        });
        caseSession.recordKVKeyWritten(tempDir, {
            key: 'cirp_commencement_date',
            value: '2024-02-15',
            verified_by_user: 1,
            source: 'admission_order'
        });
        caseSession.recordKVKeyWritten(tempDir, {
            key: 'admitted_debt_quantum',
            value: '₹142,50,00,000',
            verified_by_user: 0,
            source: 'claim_form_c'
        });

        // Chamber Wiki Page
        caseSession.recordWikiPageModified(tempDir, {
            slug: 'insights/admitted_claims_analysis',
            title: 'Admitted Claims Analysis',
            action: 'created'
        });

        // Legal Draft
        caseSession.recordDraftModified(tempDir, {
            filename: 'drafts/first_coc_meeting_notice.docx',
            template_id: 'coc_notice_v1',
            action: 'created'
        });

        // Focus & Turn
        caseSession.recordFocusMode(tempDir, 'waterfall');
        caseSession.recordTurn(tempDir);

        const loaded = caseSession.loadCaseSession(tempDir);
        assert.strictEqual(loaded.active_focus, 'waterfall');
        assert.strictEqual(loaded.turn_count, 1);
        assert(loaded.documents_indexed['Admission_Order_ABC.pdf'], 'Document must be recorded');
        assert.strictEqual(loaded.documents_indexed['Admission_Order_ABC.pdf'].pages, 18);
        assert.strictEqual(loaded.kv_keys_written['corporate_debtor'].verified_by_user, 1);
        assert.strictEqual(loaded.kv_keys_written['admitted_debt_quantum'].verified_by_user, 0);
        assert(loaded.wiki_pages_modified['insights/admitted_claims_analysis'], 'Wiki page must be recorded');
        assert(loaded.drafts_modified['drafts/first_coc_meeting_notice.docx'], 'Draft must be recorded');

        // ====================================================================
        // TEST 3: Deterministic Formatted Session State Generation
        // ====================================================================
        console.log('  -> Test 3: getFormattedSessionState renders clean factual ledger');
        const formatted = caseSession.getFormattedSessionState(tempDir);
        assert(formatted.includes('Matter Workspace:'), 'Must include Matter Workspace header');
        assert(formatted.includes('Intake Focus Priority: WATERFALL'), 'Must include focus priority');
        assert(formatted.includes('Admission_Order_ABC.pdf (18 pp)'), 'Must include document');
        assert(formatted.includes('corporate_debtor: "Acme Technologies Ltd" [VERIFIED]'), 'Must format verified fact');
        assert(formatted.includes('wiki/insights/admitted_claims_analysis.md'), 'Must format wiki insight');
        assert(formatted.includes('drafts/first_coc_meeting_notice.docx'), 'Must format draft');

        // ====================================================================
        // TEST 4: Sync from Disk Pre-existing Case Artifacts
        // ====================================================================
        console.log('  -> Test 4: syncFromDisk pulls pre-existing case files into session');
        // Create an existing case_kv_dictionary.json
        const kvPath = path.join(tempDir, 'reviews', 'case_kv_dictionary.json');
        fs.writeFileSync(kvPath, JSON.stringify({
            irp_name: { value: 'Shri Rajesh Sharma', verified_by_user: 1, source: 'court_order' },
            nclt_bench: { value: 'New Delhi Bench - Court II', verified_by_user: 0 }
        }, null, 2));

        // Create an existing wiki file
        const wikiInsightsDir = path.join(tempDir, 'wiki', 'insights');
        fs.mkdirSync(wikiInsightsDir, { recursive: true });
        fs.writeFileSync(path.join(wikiInsightsDir, 'avoidance_transaction_summary.md'), '# Avoidance Summary');

        // Create an existing draft
        const draftsDir = path.join(tempDir, 'drafts');
        fs.mkdirSync(draftsDir, { recursive: true });
        fs.writeFileSync(path.join(draftsDir, 'irp_fee_proposal.docx'), 'dummy docx');

        const synced = caseSession.syncFromDisk(tempDir);
        assert(synced.kv_keys_written['irp_name'], 'Synced KV key irp_name must exist');
        assert.strictEqual(synced.kv_keys_written['irp_name'].value, 'Shri Rajesh Sharma');
        assert(synced.wiki_pages_modified['insights/avoidance_transaction_summary'], 'Synced wiki file must exist');
        assert(synced.drafts_modified['irp_fee_proposal.docx'], 'Synced draft must exist');

        // ====================================================================
        // TEST 5: Compaction Integration with Mechanical Session State
        // ====================================================================
        console.log('  -> Test 5: compactHistory includes Active Case Session Ledger when caseDir provided');
        
        // Build 15 turns of dialogue exceeding budget
        const messages = [
            { role: 'system', content: 'You are Hayagriva Legal Assistant.' }
        ];
        for (let i = 1; i <= 15; i++) {
            messages.push({ role: 'user', content: `Directive ${i}: Review creditor claims and prepare avoidance brief for debtor.` });
            messages.push({ role: 'assistant', content: `Analysis ${i}: Admitted financial debt reviewed. Statutory provisions under Section 43/45/66 cross-referenced against banking statements.` });
        }

        const compResult = await compactHistory(messages, {
            contextWindow: 2048,
            force: true,
            caseDir: tempDir
        });

        assert.strictEqual(compResult.compacted, true);
        const compDivider = compResult.messages[1].content;
        assert(compDivider.includes('## Active Case Session Ledger'), 'Must include Active Case Session Ledger header');
        assert(compDivider.includes('Acme Technologies Ltd'), 'Must inject factual corporate debtor');
        assert(compDivider.includes('first_coc_meeting_notice.docx'), 'Must inject active draft');

        // ====================================================================
        // TEST 6: USER_MESSAGES_MAX Cap at 40
        // ====================================================================
        console.log('  -> Test 6: USER_MESSAGES_MAX constant is 40 (Plan 14 cap)');
        assert.strictEqual(USER_MESSAGES_MAX, 40);

        // Build 50 user messages
        const longHistory = [{ role: 'system', content: 'System' }];
        for (let i = 1; i <= 50; i++) {
            longHistory.push({ role: 'user', content: `Prompt number ${i}` });
            longHistory.push({ role: 'assistant', content: `Reply number ${i}` });
        }
        const capResult = await compactHistory(longHistory, { force: true });
        assert.strictEqual(capResult.compacted, true);
        const dividerText = capResult.messages[1].content;
        const directiveMatches = dividerText.match(/\d+\.\s+"Prompt number \d+"/g) || [];
        assert(directiveMatches.length <= 40, `Preserved directives (${directiveMatches.length}) must be capped at 40`);

        // ====================================================================
        // TEST 7: Safe Boundary Selection (Never Cut Mid-Tool)
        // ====================================================================
        console.log('  -> Test 7: pickBoundary never cuts between assistant tool_calls and tool result');
        const toolHistory = [
            { role: 'system', content: 'System' },
            { role: 'user', content: 'Initial user message' },
            {
                role: 'assistant',
                content: 'Running verification tool',
                tool_calls: [{ id: 'call_abc_123', type: 'function', function: { name: 'verify_claim', arguments: '{}' } }]
            },
            {
                role: 'tool',
                tool_call_id: 'call_abc_123',
                content: '{"status":"verified","admitted":1000000}'
            },
            { role: 'assistant', content: 'Claim is verified. Would you like a memo?' },
            { role: 'user', content: 'Yes, draft the memo now.' },
            { role: 'assistant', content: 'Memo generated.' }
        ];

        // Compact with small keep budget
        const toolCompResult = await compactHistory(toolHistory, {
            force: true,
            keepRecentFraction: 0.2
        });
        assert.strictEqual(toolCompResult.compacted, true);
        
        // Ensure tail does not start on a tool message
        const tailFirst = toolCompResult.messages[2]; // messages[0] = system, messages[1] = comp divider, messages[2] = tail start
        assert.notStrictEqual(tailFirst.role, 'tool', 'Tail must never start with a tool message');

        // ====================================================================
        // TEST 8: Context Overflow Detection (Plan 15 isContextOverflow)
        // ====================================================================
        console.log('  -> Test 8: isContextOverflow accurately matches provider error patterns');

        // Known error codes
        assert.strictEqual(isContextOverflow({ code: 'CONTEXT_EXCEEDED' }), true);
        assert.strictEqual(isContextOverflow({ code: 'context_length_exceeded' }), true);
        assert.strictEqual(isContextOverflow({ status: 413 }), true);

        // Provider string messages
        assert.strictEqual(isContextOverflow(new Error('This model\'s maximum context length is 2048 tokens. However, your messages resulted in 2450 tokens.')), true);
        assert.strictEqual(isContextOverflow(new Error('prompt is too long: 2200 tokens > 2048')), true);
        assert.strictEqual(isContextOverflow(new Error('too many tokens in prompt')), true);
        assert.strictEqual(isContextOverflow(new Error('token limit exceeded')), true);
        assert.strictEqual(isContextOverflow(new Error('exceeds the context window of LegalParam')), true);
        assert.strictEqual(isContextOverflow(new Error('input length exceeds model budget')), true);

        // Non-overflow errors
        assert.strictEqual(isContextOverflow(new Error('ECONNREFUSED 127.0.0.1:8090')), false);
        assert.strictEqual(isContextOverflow(new Error('SyntaxError: Unexpected token')), false);
        assert.strictEqual(isContextOverflow(null), false);

        // ====================================================================
        // TEST 9: Emergency Compaction Recovery
        // ====================================================================
        console.log('  -> Test 9: emergencyCompact aggressively reduces token footprint');
        const bulkyHistory = [
            { role: 'system', content: 'System instruction for chamber assistant.' }
        ];
        for (let i = 1; i <= 20; i++) {
            bulkyHistory.push({ role: 'user', content: `Long query ${i}: ` + 'x'.repeat(400) });
            bulkyHistory.push({ role: 'assistant', content: `Long response ${i}: ` + 'y'.repeat(500) });
        }
        const originalTokens = estimateTokens(bulkyHistory);
        assert(originalTokens > 3500, `Original tokens (${originalTokens}) should be bulky`);

        const emergencyResult = await emergencyCompact(bulkyHistory);
        assert.strictEqual(emergencyResult.compacted, true);
        assert(emergencyResult.compactedTokens < 1200, `Emergency tokens (${emergencyResult.compactedTokens}) must be < 1200`);
        assert(emergencyResult.compactedTokens < originalTokens * 0.4, 'Emergency compaction must achieve >60% compression');

        // ====================================================================
        // TEST 10: HTTP Routes Integration
        // ====================================================================
        console.log('  -> Test 10: HTTP Routes: GET session, POST focus, POST sync');
        const http = require('http');
        const url = require('url');
        const routes = require('../lib/routes');

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

            // GET session
            const resGet = await fetch(`${baseUrl}/api/hayagriva/case/session?case=${encodeURIComponent(caseName)}&sync=1`);
            assert.strictEqual(resGet.status, 200);
            const dataGet = await resGet.json();
            assert.strictEqual(dataGet.success, true);
            assert(dataGet.session, 'Must return session object');
            assert(typeof dataGet.formatted === 'string', 'Must return formatted string');

            // POST focus
            const resFocus = await fetch(`${baseUrl}/api/hayagriva/case/session/focus`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ case: caseName, focus: 's29a' })
            });
            assert.strictEqual(resFocus.status, 200);
            const dataFocus = await resFocus.json();
            assert.strictEqual(dataFocus.success, true);
            assert.strictEqual(dataFocus.active_focus, 's29a');

            // POST sync
            const resSync = await fetch(`${baseUrl}/api/hayagriva/case/session/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ case: caseName })
            });
            assert.strictEqual(resSync.status, 200);
            const dataSync = await resSync.json();
            assert.strictEqual(dataSync.success, true);
            assert(dataSync.formatted.includes('S29A'), 'Formatted output must reflect new focus mode');

            console.log('   ✓ HTTP endpoints verified (GET session, POST focus, POST sync).');
        } finally {
            if (server) {
                await new Promise(resolve => server.close(resolve));
            }
        }

        console.log('✅ ALL PLAN 14 & PLAN 15 CASE SESSION & OVERFLOW TESTS PASSED CLEANLY!\n');
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

runTests().catch(err => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
});
