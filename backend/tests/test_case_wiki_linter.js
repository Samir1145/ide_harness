const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const routes = require('../lib/routes');
const {
    auditCaseWiki,
    resolveLintIssue,
    getLintSummary,
    normalizePartyName
} = require('../lib/core/case-wiki-linter');
const { getDb } = require('../lib/core/sqlite-store');
const inboxManager = require('../lib/agents/inbox-manager');

async function run() {
    console.log('--- Testing Plan 13: Case Wiki Lint Operation & Discrepancy Inquest ---');

    // ─── PART 1: Test normalizePartyName helper ──────────────────────────────
    console.log('1. Testing normalizePartyName...');
    assert.strictEqual(normalizePartyName('Punjab National Bank Ltd'), 'punjab national');
    assert.strictEqual(normalizePartyName('ICICI Bank Limited'), 'icici');
    assert.strictEqual(normalizePartyName('State Bank of India'), 'state of india');
    console.log('   ✓ normalizePartyName verified.');

    // ─── PART 2: Setup Test Case Environment ─────────────────────────────────
    console.log('2. Setting up test fixtures for Case Wiki Lint audit...');
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });

    const caseDir = path.join(fixturesDir, 'test_lint_case_' + Date.now());
    const caseName = path.basename(caseDir);
    const wikiDir = path.join(caseDir, `${caseName}_wiki_haya`);
    const reviewsDir = path.join(caseDir, 'reviews');
    fs.mkdirSync(caseDir, { recursive: true });
    fs.mkdirSync(wikiDir, { recursive: true });
    fs.mkdirSync(reviewsDir, { recursive: true });

    // Initialize SQLite
    const db = getDb(caseDir);

    // 2A: Create claims_registry.md
    const claimsTable = `| Creditor Name | Claimed Amount | Admitted Amount | Admitted Interest | Rejected Amount | Rejection Reason | Status |
|---|---|---|---|---|---|---|
| Punjab National Bank | 500,000,000 | 500,000,000 | 0 | 0 | None | admitted |
| State Bank of India | 300,000,000 | 300,000,000 | 0 | 0 | None | admitted |`;
    fs.writeFileSync(path.join(caseDir, 'claims_registry.md'), claimsTable, 'utf8');

    // 2B: Create avoidance_ledger.md with unadjusted preferential transfer to Punjab National Bank
    const avoidanceTable = `| Transaction Date | Amount | Debited Account | Credited Party | Related Party Status | Applicable Section | Forensic Notes |
|---|---|---|---|---|---|---|
| 2023-08-15 | 50,000,000 | Current A/c | Punjab National Bank | Secured Creditor | Section 43 | Preferential contra-sweep lookback |`;
    fs.writeFileSync(path.join(caseDir, 'avoidance_ledger.md'), avoidanceTable, 'utf8');

    // Sync to SQLite tables
    db.exec(`
        INSERT INTO claims (creditor, claimed_amount, admitted_amount, admitted_interest, rejected_amount, rejection_reason, status)
        VALUES ('Punjab National Bank', 500000000, 500000000, 0, 0, 'None', 'admitted');
        
        INSERT INTO avoidance_transactions (transaction_date, amount, debited_account, credited_party, related_party_status, applicable_section, forensic_notes)
        VALUES ('2023-08-15', 50000000, 'Current A/c', 'Punjab National Bank', 'Secured Creditor', 'Section 43', 'Preferential contra-sweep lookback');
    `);

    // 2C: Setup case_kv_dictionary.json with missing corporate_debtor and an old cirp_commencement_date
    const kvData = {
        corporate_debtor: { value: '', verified_by_user: 0 },
        cirp_commencement_date: { value: '2024-01-01', verified_by_user: 1 }
    };
    fs.writeFileSync(path.join(reviewsDir, 'case_kv_dictionary.json'), JSON.stringify(kvData, null, 2), 'utf8');

    // 2D: Insert searchable FTS chunk containing derivable corporate_debtor name
    db.prepare(`
        INSERT INTO fts_chunks (filename, section_title, page_number, chunk_index, content)
        VALUES ('NCLT_Admission_Order.pdf', 'Title', 1, 0, 'In the matter of Zenith Metals Limited, the Adjudicating Authority observes...')
    `).run();

    // 2E: Create wiki page with broken link
    fs.writeFileSync(path.join(wikiDir, 'case_overview.md'), `# Case Overview\n\nRefer to [[insights/missing_disqualification_memo]] for details.\n`, 'utf8');

    // 2F: Create orphan document in caseDir
    fs.writeFileSync(path.join(caseDir, 'Unreferenced_Loan_Agreement.pdf'), '%PDF-1.4 Mock Binary', 'utf8');

    // ─── PART 3: Run auditCaseWiki ───────────────────────────────────────────
    console.log('3. Running full auditCaseWiki pass...');
    const report = await auditCaseWiki(caseDir, { autoPostToInbox: true });

    assert.strictEqual(report.success, true);
    assert.strictEqual(report.caseName, caseName);
    console.log(`   Found ${report.stats.issuesFound} diagnostic issues across ${report.stats.rulesExecuted} rules executed.`);

    // Verify Rule 1: Claim vs Avoidance Discrepancy
    const avoidanceIssue = report.issues.find(i => i.ruleId === 'RULE_AVOIDANCE_CLAIM_OFFSET');
    assert(avoidanceIssue, 'Must flag RULE_AVOIDANCE_CLAIM_OFFSET');
    assert.strictEqual(avoidanceIssue.severity, 'HIGH');
    assert.strictEqual(avoidanceIssue.evidence.creditor, 'Punjab National Bank');
    assert.strictEqual(avoidanceIssue.evidence.avoidanceAmount, 50000000);
    console.log('   ✓ Rule 1 (Claim vs Avoidance Offset) correctly flagged.');

    // Verify Rule 2: Derivable Blank Fact
    const factIssue = report.issues.find(i => i.ruleId === 'RULE_DERIVABLE_BLANK_FACTS');
    assert(factIssue, 'Must flag RULE_DERIVABLE_BLANK_FACTS');
    assert.strictEqual(factIssue.evidence.key, 'corporate_debtor');
    assert(factIssue.evidence.detectedValue.includes('Zenith Metals Limited'), 'Detected value must match');
    console.log('   ✓ Rule 2 (Derivable Blank Fact) correctly extracted "Zenith Metals Limited".');

    // Verify Rule 3: CIRP Milestone Lag
    const milestoneIssues = report.issues.filter(i => i.ruleId === 'RULE_CIRP_MILESTONE_LAG');
    assert(milestoneIssues.length > 0, 'Must flag CIRP milestone lag for elapsed time since 2024-01-01');
    console.log(`   ✓ Rule 3 (CIRP Milestone Lag) flagged ${milestoneIssues.length} overdue milestones.`);

    // Verify Rule 4: Broken Wikilink
    const linkIssue = report.issues.find(i => i.ruleId === 'RULE_BROKEN_WIKILINKS');
    assert(linkIssue, 'Must flag RULE_BROKEN_WIKILINKS');
    assert(linkIssue.evidence.targetLink.includes('missing_disqualification_memo'));
    console.log('   ✓ Rule 4 (Broken Wikilink) correctly detected missing target.');

    // Verify Rule 5: Orphan Document
    const orphanIssue = report.issues.find(i => i.ruleId === 'RULE_ORPHAN_KNOWLEDGE');
    assert(orphanIssue, 'Must flag RULE_ORPHAN_KNOWLEDGE');
    assert.strictEqual(orphanIssue.evidence.docName, 'Unreferenced_Loan_Agreement.pdf');
    console.log('   ✓ Rule 5 (Orphan Document) correctly caught unreferenced file.');

    // Verify Case Action Inbox has been populated
    console.log('4. Verifying Case Action Inbox items created on disk...');
    const inbox = inboxManager.loadInbox(caseDir);
    assert(inbox.items.length >= 4, 'Must create at least 4 action cards in case_inbox.json');
    const firstItem = inbox.items[0];
    assert(firstItem.title, 'Inbox card must have title');
    assert.strictEqual(firstItem.state, 'pending');
    console.log(`   ✓ ${inbox.items.length} cards successfully posted to case_inbox.json.`);

    // ─── PART 4: Test Remediation via resolveLintIssue ───────────────────────
    console.log('5. Testing remediation via resolveLintIssue...');
    const resKey = await resolveLintIssue(caseDir, {
        issueId: factIssue.id,
        action: 'Accept & Populate Key',
        extra: factIssue.evidence
    });
    assert.strictEqual(resKey.success, true);

    // Verify KV dictionary was updated and verified_by_user = 1
    const updatedKv = JSON.parse(fs.readFileSync(path.join(reviewsDir, 'case_kv_dictionary.json'), 'utf8'));
    assert.strictEqual(updatedKv.corporate_debtor.value, factIssue.evidence.detectedValue);
    assert.strictEqual(updatedKv.corporate_debtor.verified_by_user, 1);

    // Verify inbox item was resolved
    const updatedInbox = inboxManager.loadInbox(caseDir);
    const resolvedItem = updatedInbox.items.find(i => i.id === factIssue.id);
    assert.strictEqual(resolvedItem.state, 'resolved');
    console.log('   ✓ resolveLintIssue updated KV fact, marked verified_by_user=1, and resolved inbox card.');

    // ─── PART 5: Test HTTP Endpoints in routes.js ────────────────────────────
    console.log('6. Testing Case Wiki Lint HTTP routes...');
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
        console.log(`   Test server listening on ${baseUrl}`);

        // 5A: GET /api/hayagriva/wiki/lint-summary
        console.log('7. Testing GET /api/hayagriva/wiki/lint-summary...');
        const resSum = await fetch(`${baseUrl}/api/hayagriva/wiki/lint-summary?case=${encodeURIComponent(caseName)}`);
        assert.strictEqual(resSum.status, 200);
        const dataSum = await resSum.json();
        assert.strictEqual(dataSum.success, true);
        assert(dataSum.stats.issuesFound > 0, 'Summary must show issues found');
        console.log(`   ✓ GET /api/hayagriva/wiki/lint-summary returned summary (${dataSum.stats.issuesFound} total issues).`);

        // 5B: POST /api/hayagriva/wiki/lint
        console.log('8. Testing POST /api/hayagriva/wiki/lint...');
        const resLintPost = await fetch(`${baseUrl}/api/hayagriva/wiki/lint`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caseName, autoPostToInbox: false })
        });
        assert.strictEqual(resLintPost.status, 200);
        const dataLintPost = await resLintPost.json();
        assert.strictEqual(dataLintPost.success, true);
        assert(dataLintPost.report.stats.rulesExecuted >= 4, 'Must execute audit rules');
        console.log('   ✓ POST /api/hayagriva/wiki/lint executed full audit.');

        // 5C: POST /api/hayagriva/wiki/lint-resolve
        console.log('9. Testing POST /api/hayagriva/wiki/lint-resolve...');
        const resResolve = await fetch(`${baseUrl}/api/hayagriva/wiki/lint-resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                caseName,
                issueId: linkIssue.id,
                action: 'Create Stub Page',
                extra: linkIssue.evidence
            })
        });
        assert.strictEqual(resResolve.status, 200);
        const dataResolve = await resResolve.json();
        assert.strictEqual(dataResolve.success, true);

        // Verify stub file was created on disk
        assert(fs.existsSync(path.join(wikiDir, `${linkIssue.evidence.targetLink}.md`)), 'Stub file must be created on disk');
        console.log('   ✓ POST /api/hayagriva/wiki/lint-resolve created stub page and resolved card.');

        console.log('\n✅ ALL CASE WIKI LINT OPERATION TESTS PASSED CLEANLY!\n');
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
