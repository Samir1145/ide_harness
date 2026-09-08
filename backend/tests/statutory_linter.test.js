'use strict';

const assert = require('assert');
const {
    checkAntecedentBasis,
    checkVagueLanguage,
    splitAtomicElements,
    calculateLimitationCoverage,
    lintDraft,
    EXEMPTED_TERMS,
    VAGUE_TERMS
} = require('../lib/core/statutory-linter');
const { executeTool } = require('../lib/agents/skills/tool-dispatcher');

async function runTests() {
    console.log('[Statutory & Antecedent Basis Drafting Linter Tests]');

    // 1. Antecedent Basis Checks
    console.log('  -> Test 1: Valid introduction with "a" prevents antecedent errors');
    const validText = '1. A method comprising: generating a laser beam; and focusing the laser beam.';
    const validErrors = checkAntecedentBasis(validText);
    assert.strictEqual(validErrors.length, 0, `Expected 0 antecedent errors, got ${validErrors.length}`);

    console.log('  -> Test 2: Missing introduction flags antecedent basis error');
    const missingIntroText = '1. A method comprising: focusing the toaster onto the bread carriage.';
    const missingErrors = checkAntecedentBasis(missingIntroText);
    assert.strictEqual(missingErrors.length, 2, `Expected 2 errors ('the toaster', 'the bread'), got ${missingErrors.length}`);
    assert(missingErrors[0].message.includes('toaster'), 'Expected error message to mention toaster');
    assert.strictEqual(missingErrors[0].severity, 'Warning');

    console.log('  -> Test 3: Legal exemptions (tribunal, corporate debtor, court) are not flagged');
    const legalText = 'The corporate debtor filed an application before the tribunal and the court.';
    const legalErrors = checkAntecedentBasis(legalText);
    assert.strictEqual(legalErrors.length, 0, `Expected 0 errors for exempted legal terms, got: ${JSON.stringify(legalErrors)}`);

    // 2. Vague Language Checks
    console.log('  -> Test 4: Indefinite / vague words detection');
    const vagueText = 'The respondent shall make payment within a reasonable period of approximately 10 lakhs as mutually agreed.';
    const vagueIssues = checkVagueLanguage(vagueText);
    assert(vagueIssues.length >= 3, `Expected at least 3 vague issues, got ${vagueIssues.length}`);
    const detectedWords = vagueIssues.map(i => i.word.toLowerCase());
    assert(detectedWords.includes('reasonable period'), 'Expected detection of "reasonable period"');
    assert(detectedWords.includes('approximately'), 'Expected detection of "approximately"');
    assert(detectedWords.includes('as mutually agreed'), 'Expected detection of "as mutually agreed"');
    assert(vagueIssues[0].message.includes('Indefinite term'), 'Expected message guidance');

    // 3. Atomic Clause / Limitation Splitting
    console.log('  -> Test 5: Split claim/clause into atomic elements');
    const claimText = '1. An apparatus comprising: an optical sensor; a heating element; and a controller, wherein the controller adjusts temperature.';
    const elements = splitAtomicElements(claimText);
    assert.strictEqual(elements.length, 5, `Expected 5 atomic elements, got ${elements.length}: ${JSON.stringify(elements)}`);
    assert.strictEqual(elements[0], 'An apparatus');
    assert.strictEqual(elements[1], 'an optical sensor');
    assert.strictEqual(elements[2], 'a heating element');
    assert.strictEqual(elements[3], 'a controller');
    assert(elements[4].includes('controller adjusts temperature'));

    // 4. Limitation Coverage vs Evidence
    console.log('  -> Test 6: Limitation evidence coverage calculation');
    const element1 = 'an optical sensor for measuring brownness';
    const evidence1 = 'The toaster includes an optical sensor calibrated to detect surface brownness on toast.';
    const match1 = calculateLimitationCoverage(element1, evidence1);
    assert.strictEqual(match1.status, 'SUPPORTED_OVERLAP');
    assert(match1.similarity >= 50);

    const element2 = 'a cryogenic refrigeration conduit';
    const evidence2 = 'The toaster uses standard electrical resistance heating coils.';
    const match2 = calculateLimitationCoverage(element2, evidence2);
    assert.strictEqual(match2.status, 'NOVELTY_OR_UNSUPPORTED');

    // 5. Full lintDraft Aggregator
    console.log('  -> Test 7: Full lintDraft aggregation and stats');
    const draftSample = `
# Draft Claim
1. A system comprising a laser.
The toaster generates heat within a reasonable time.
`;
    const report = lintDraft(draftSample);
    assert.strictEqual(report.stats.antecedentCount, 1); // "The toaster"
    assert.strictEqual(report.stats.vagueCount, 1);      // "reasonable time"
    assert.strictEqual(report.stats.totalIssues, 2);

    // 6. Agent Tool Dispatcher Integration
    console.log('  -> Test 8: executeTool integrates "lintDraft"');
    const res = await executeTool(null, 'lintDraft', {
        text: 'The debtor shall substantially complete operations.'
    });
    assert.strictEqual(res.tool, 'lintDraft');
    assert(res.report);
    assert.strictEqual(res.report.stats.vagueCount, 1); // "substantially"

    console.log('  ✓ SUCCESS: All Statutory & Antecedent Basis Drafting Linter tests passed!');
}

if (require.main === module) {
    runTests().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { run: runTests, runTests };
