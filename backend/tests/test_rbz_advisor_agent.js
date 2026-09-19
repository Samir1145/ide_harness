/**
 * Automated Test: Proactive RBZ Advisor Agent Context Awareness & Anti-Annoyance Safeguards
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { getCaseBillingDb } = require('../lib/core/case-billing-store');
const rbzAdvisorAgent = require('../lib/agents/subagents/rbz-advisor-agent');

async function runTest() {
    console.log('--- Starting Proactive RBZ Advisor Agent Test ---');

    const tempCaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'case_rbz_advisor_test_'));
    console.log(`[1] Created isolated case directory: ${tempCaseDir}`);

    try {
        // Test 1: Dwell time safeguard (<8s should be rejected)
        const earlyEvaluation = await rbzAdvisorAgent.evaluateContext({
            activeFilePath: '/workspace/case/pra_profiles/acme_consortium.docx',
            fileContentSnippet: 'Prospective Resolution Applicant Acme Consortium DIN 01234567 submitted EOI.',
            dwellTimeMs: 4000 // Only 4 seconds
        });
        assert.strictEqual(earlyEvaluation.shouldSuggest, false);
        assert.strictEqual(earlyEvaluation.reason, 'DWELL_THRESHOLD_NOT_MET');
        console.log('[✓] Test 1 Passed: Dwell time safeguard properly blocks premature suggestions (<8s).');

        // Test 2: PRA Context detection (dwell time > 8s)
        const praEvaluation = await rbzAdvisorAgent.evaluateContext({
            activeFilePath: '/workspace/case/pra_profiles/acme_consortium.docx',
            fileContentSnippet: 'The Prospective Resolution Applicant (PRA) Acme Global Infrastructure Ltd. DIN 09876543 has submitted an Expression of Interest.',
            dwellTimeMs: 9000
        });
        assert.strictEqual(praEvaluation.shouldSuggest, true);
        assert.strictEqual(praEvaluation.suggestion.tool, 'rbz_section_29a_screening');
        assert.strictEqual(praEvaluation.suggestion.rateInr, 350.00);
        assert.strictEqual(praEvaluation.suggestion.totalInr, 413.00);
        assert.ok(praEvaluation.suggestion.message.includes('Acme Global Infrastructure Ltd'));
        console.log(`[✓] Test 2 Passed: PRA context accurately triggered 29A screening suggestion for Acme Global Infrastructure Ltd (₹${praEvaluation.suggestion.totalInr}).`);

        // Test 3: Global 10-minute cooldown safeguard
        const cooldownEvaluation = await rbzAdvisorAgent.evaluateContext({
            activeFilePath: '/workspace/case/financials/sbi_bank_statement.xlsx',
            fileContentSnippet: 'Account Statement for SBI Credit Facility. Contra-sweep entries identified.',
            dwellTimeMs: 12000
        });
        assert.strictEqual(cooldownEvaluation.shouldSuggest, false);
        assert.strictEqual(cooldownEvaluation.reason, 'COOLDOWN_ACTIVE');
        console.log('[✓] Test 3 Passed: Global cooldown blocked subsequent suggestion within 10 minutes.');

        // Reset cooldown artificially for next unit checks
        rbzAdvisorAgent._lastSuggestionTimestamp = 0;

        // Test 4: Bank Statement / Contra Context detection
        const bankEvaluation = await rbzAdvisorAgent.evaluateContext({
            activeFilePath: '/workspace/case/financials/sbi_bank_statement.xlsx',
            fileContentSnippet: 'Contra transfer of ₹4.5 Crores detected across HDFC Bank and ICICI Bank accounts.',
            dwellTimeMs: 10000
        });
        assert.strictEqual(bankEvaluation.shouldSuggest, true);
        assert.strictEqual(bankEvaluation.suggestion.tool, 'rbz_multibank_inquest');
        assert.strictEqual(bankEvaluation.suggestion.rateInr, 1200.00);
        assert.strictEqual(bankEvaluation.suggestion.totalInr, 1416.00);
        console.log(`[✓] Test 4 Passed: Multi-bank statement context accurately triggered Forensic Inquest suggestion (₹${bankEvaluation.suggestion.totalInr}).`);

        // Test 5: Session Mute / Dismissal
        const targetDismissKey = bankEvaluation.suggestion.targetKey;
        rbzAdvisorAgent.dismissSuggestion(targetDismissKey);
        rbzAdvisorAgent._lastSuggestionTimestamp = 0; // reset cooldown

        const dismissedEvaluation = await rbzAdvisorAgent.evaluateContext({
            activeFilePath: '/workspace/case/financials/sbi_bank_statement.xlsx',
            fileContentSnippet: 'Contra transfer of ₹4.5 Crores detected across HDFC Bank and ICICI Bank accounts.',
            dwellTimeMs: 10000
        });
        assert.strictEqual(dismissedEvaluation.shouldSuggest, false);
        assert.strictEqual(dismissedEvaluation.reason, 'ENTITY_DISMISSED_FOR_SESSION');
        console.log(`[✓] Test 5 Passed: Dismissed target [${targetDismissKey}] remained silenced for the entire session.`);

        // Test 6: Precedents / Limitation Context detection
        const precedentEvaluation = await rbzAdvisorAgent.evaluateContext({
            activeFilePath: '/workspace/case/pleadings/application_under_section_7.docx',
            fileContentSnippet: 'The application is filed under Section 7 of IBC. Corporate Debtor claims debt is barred by limitation under Article 137, but acknowledgement of debt exists in balance sheet under Section 18 Limitation Act.',
            dwellTimeMs: 8500
        });
        assert.strictEqual(precedentEvaluation.shouldSuggest, true);
        assert.strictEqual(precedentEvaluation.suggestion.tool, 'rbz_query_precedents');
        assert.strictEqual(precedentEvaluation.suggestion.rateInr, 150.00);
        assert.strictEqual(precedentEvaluation.suggestion.totalInr, 177.00);
        console.log(`[✓] Test 6 Passed: Section 7 & Limitation context accurately triggered Precedent Search suggestion (₹${precedentEvaluation.suggestion.totalInr}).`);

        // Test 7: One-Click Staging to Outbound Queue
        const stageRes = await rbzAdvisorAgent.stageSuggestedTask({
            suggestion: precedentEvaluation.suggestion,
            caseDir: tempCaseDir,
            userEmail: 'counsel.advocate@nclt.gov.in'
        });
        assert.strictEqual(stageRes.success, true);
        assert.ok(stageRes.taskId);

        // Verify task exists in SQLite ledger
        const db = getCaseBillingDb(tempCaseDir);
        const task = db.prepare("SELECT * FROM case_billing_tasks WHERE task_id = ?").get(stageRes.taskId);
        assert.ok(task);
        assert.strictEqual(task.status, 'PENDING_APPROVAL');
        assert.strictEqual(task.payment_status, 'UNBILLED');
        assert.strictEqual(task.tool_name, 'rbz_query_precedents');
        assert.strictEqual(task.rate_inr, 150.00);
        assert.strictEqual(Math.round(task.rate_inr * 1.18 * 100) / 100, 177.00);
        console.log(`[✓] Test 7 Passed: Staged task [${stageRes.taskId}] written to SQLite ledger under PENDING_APPROVAL / UNBILLED.`);

        console.log('--- All Proactive RBZ Advisor Agent Tests Passed Successfully! ---');
    } finally {
        fs.rmSync(tempCaseDir, { recursive: true, force: true });
    }
}

runTest().catch(err => {
    console.error('Test Failed:', err);
    process.exit(1);
});
