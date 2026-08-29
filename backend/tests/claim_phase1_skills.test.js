const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
    numberToIndianWords,
    formatIndianCurrency,
    calculateInterest,
    extractClaimantData
} = require('../lib/agents/skills/claim-extract');
const {
    normalizeFormType,
    generateClaimForm
} = require('../lib/agents/skills/claim-form-fill');

async function runTests() {
    console.log('--- Running Phase 1 Claim Skills & Skeletons Tests ---');

    // 1. Test Indian Currency and Number to Words
    console.log('[Test 1] Testing Indian numbering and currency formatter...');
    assert.strictEqual(formatIndianCurrency(123456789.5), '12,34,56,789.50');
    assert.strictEqual(formatIndianCurrency(5000000), '50,00,000.00');

    const words1 = numberToIndianWords(47500000);
    assert.ok(words1.includes('Four Crore Seventy Five Lakh'), `Expected words to have Four Crore Seventy Five Lakh, got: ${words1}`);
    console.log('✓ Currency & words formatting verified.');

    // 2. Test Interest Calculation Engine
    console.log('[Test 2] Testing statutory interest computation...');
    // ₹10,00,000 at 12% for 1 year simple interest = ₹1,20,000
    const calc = calculateInterest(1000000, 12, '2023-01-01', '2024-01-01', 'simple');
    assert.ok(Math.abs(calc.interestAmount - 120000) < 500, `Expected ~120000, got: ${calc.interestAmount}`);
    assert.strictEqual(calc.total, 1000000 + calc.interestAmount);
    console.log('✓ Interest calculation verified.');

    // 3. Test Form Type Normalization
    console.log('[Test 3] Testing form type normalizer...');
    assert.strictEqual(normalizeFormType('form-b'), 'cirp-form-b');
    assert.strictEqual(normalizeFormType('operational'), 'cirp-form-b');
    assert.strictEqual(normalizeFormType('financial'), 'cirp-form-c');
    assert.strictEqual(normalizeFormType('class'), 'cirp-form-ca');
    assert.strictEqual(normalizeFormType('workman'), 'cirp-form-d');
    assert.strictEqual(normalizeFormType('other'), 'cirp-form-f');
    console.log('✓ Form normalization verified.');

    // 4. Test Statutory Form C Generation
    console.log('[Test 4] Testing Form C generation and draft saving...');
    const testCaseDir = path.join(__dirname, 'fixtures', 'test_claim_case');
    if (!fs.existsSync(testCaseDir)) {
        fs.mkdirSync(testCaseDir, { recursive: true });
    }

    const claimResult = await generateClaimForm(testCaseDir, 'form-c', {
        claimantName: 'State Bank of India',
        claimantAddress: 'SBI Bhavan, Nariman Point, Mumbai - 400021',
        claimantEmail: 'sbi.cirp@sbi.co.in',
        claimantId: 'AAACS8577K',
        corporateDebtorName: 'Apex Infrastructures Limited',
        principalAmount: 42500000,
        interestAmount: 4850000,
        penalCharges: 150000,
        dateOfDefault: '2023-11-15',
        icdDate: '2024-06-01'
    });

    assert.ok(fs.existsSync(claimResult.filePath), `Expected draft file at ${claimResult.filePath}`);
    const draftContent = fs.readFileSync(claimResult.filePath, 'utf8');

    assert.ok(draftContent.includes('FORM C'), 'Draft must contain FORM C header');
    assert.ok(draftContent.includes('State Bank of India'), 'Draft must contain claimant name');
    assert.ok(draftContent.includes('Apex Infrastructures Limited'), 'Draft must contain CD name');
    assert.ok(draftContent.includes('4,75,00,000.00'), 'Draft must contain formatted total claim amount');
    assert.ok(draftContent.includes('DECLARATION'), 'Draft must contain statutory Declaration');
    assert.ok(draftContent.includes('VERIFICATION'), 'Draft must contain statutory Verification');

    console.log(`✓ Form C generated at ${claimResult.fileName}`);

    // 5. Test Form B (Operational Creditor) Generation
    console.log('[Test 5] Testing Form B generation...');
    const formBResult = await generateClaimForm(testCaseDir, 'form-b', {
        claimantName: 'Bharat Steel Supplies Pvt Ltd',
        principalAmount: 1850000,
        interestAmount: 220000,
        corporateDebtorName: 'Apex Infrastructures Limited'
    });
    assert.ok(fs.existsSync(formBResult.filePath));
    const formBContent = fs.readFileSync(formBResult.filePath, 'utf8');
    assert.ok(formBContent.includes('FORM B'));
    assert.ok(formBContent.includes('Bharat Steel Supplies Pvt Ltd'));
    assert.ok(formBContent.includes('20,70,000.00'));
    console.log(`✓ Form B generated at ${formBResult.fileName}`);

    // Clean up test fixture directory
    fs.rmSync(testCaseDir, { recursive: true, force: true });
    console.log('✓ Cleaned up test fixture.');
    console.log('✅ ALL PHASE 1 SKILLS AND SKELETONS TESTS PASSED!');
    return true;
}

if (require.main === module) {
    runTests().catch(err => {
        console.error('❌ Phase 1 test failed:', err);
        process.exit(1);
    });
}

module.exports = runTests;
