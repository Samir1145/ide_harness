const assert = require('assert');
const fs = require('fs');
const path = require('path');
const coordinator = require('../lib/agents/agent-coordinator');
const { readAllKV } = require('../lib/agents/skills/kv-write');
const { getDb, closeAllDbs } = require('../lib/core/sqlite-store');
const { getConversionsDir } = require('../lib/pipeline/common/helper');

async function runTests() {
    console.log('--- Running Claim Document Extraction & Auto-Filling Integration Test ---');

    const testCaseDir = path.join(__dirname, 'fixtures', 'test_claim_doc_extraction_case');
    fs.rmSync(testCaseDir, { recursive: true, force: true });
    fs.mkdirSync(testCaseDir, { recursive: true });

    const conversionsDir = getConversionsDir(testCaseDir);
    const docFolder = path.join(conversionsDir, 'sbi_sanction_letter');
    fs.mkdirSync(docFolder, { recursive: true });

    // Write a realistic uploaded document markdown in conversions/
    const sanctionDoc = `# STATE BANK OF INDIA
## Stressed Assets Management Branch (SAMB)
11th Floor, Jawahar Vyapar Bhawan, Tolstoy Marg, New Delhi - 110001
Email for CIRP Claims: sbi.samb.delhi@sbi.co.in | PAN: AAACS8577K

**Ref No:** SBI/SAMB/DL/2020/982  
**Date:** 15 October 2020

### SANCTION OF CREDIT FACILITIES
**To:**  
**Solaris Energy Infra Limited**  
Regd Office: 42 Barakhamba Road, Connaught Place, New Delhi - 110001  
**CIN:** U40100DL2018PLC334455

**Sub:** Sanction of Term Loan Facility of ₹65,00,00,000 (Rupees Sixty Five Crore Only)

Dear Sir/Madam,

With reference to your application, State Bank of India is pleased to sanction a Term Loan facility under the following terms and conditions:

1. **Borrower / Corporate Debtor:** Solaris Energy Infra Limited (CIN: U40100DL2018PLC334455)
2. **Lender / Financial Creditor:** State Bank of India
3. **Principal Loan Amount Sanctioned:** ₹65,00,00,000.00 (Rupees Sixty Five Crore Only)
4. **Interest Rate:** 11.50% per annum with monthly rests
5. **Date of Default / NPA Classification:** 30 September 2023
6. **Insolvency Commencement Date (ICD):** 01 June 2024
7. **Security Interest:** First pari-passu charge by way of hypothecation on all movable fixed assets, plant & machinery, and receivables, duly registered with ROC vide Form CHG-1.
8. **Disbursement & Settlement Bank Account:**
   - **Bank Name:** State Bank of India
   - **Account No:** 38992019482
   - **IFSC Code:** SBIN0000691
   - **Branch:** CAG Branch, New Delhi
9. **Authorised Signatory for Claims:** Sanjay V. Deshmukh, Chief Manager (SAMB)

Yours faithfully,  
For State Bank of India  
**Sanjay V. Deshmukh**  
Chief Manager
`;

    fs.writeFileSync(path.join(docFolder, 'sbi_sanction_letter.md'), sanctionDoc, 'utf8');

    // 1. Run @claim_prep agent without any pre-existing case_facts.md
    console.log('[Test 1] Executing @claim_prep on document in folder (zero pre-existing KV)...');
    const prepAgent = coordinator.vaultAgents['claim_preparation'];
    assert.ok(prepAgent, 'ClaimPreparationAgent must be registered in coordinator');

    const prepResponse = await prepAgent.run(
        testCaseDir,
        'draft claim for the financial creditor in the folder'
    );

    console.log('--- Agent Response Summary ---');
    console.log(prepResponse.substring(0, 400) + '...\n');

    // Assert response contains extracted details
    assert.ok(prepResponse.includes('Statutory Claim Draft Generated: FORM-C'), 'Must generate Form C');
    assert.ok(prepResponse.includes('State Bank of India'), 'Must identify State Bank of India as creditor');
    assert.ok(prepResponse.includes('86,81,61,533') || prepResponse.includes('65,00,00,000'), 'Must show multi-crore total claim amount');

    // 2. Locate generated draft markdown
    const candidates = [
        path.join(testCaseDir, 'CLAIM_State_Bank_of_India_FORM-C.md'),
        path.join(testCaseDir, '02_claims', 'CLAIM_State_Bank_of_India_FORM-C.md'),
        path.join(testCaseDir, 'claims', 'CLAIM_State_Bank_of_India_FORM-C.md'),
        path.join(testCaseDir, 'drafts', 'CLAIM_State_Bank_of_India_FORM-C.md')
    ];
    let draftPath = candidates.find(c => fs.existsSync(c));
    if (!draftPath) {
        const allMd = fs.readdirSync(testCaseDir).filter(f => f.startsWith('CLAIM_'));
        if (allMd.length > 0) draftPath = path.join(testCaseDir, allMd[0]);
    }

    assert.ok(draftPath && fs.existsSync(draftPath), 'Draft file must exist on disk');
    const draftContent = fs.readFileSync(draftPath, 'utf8');

    console.log('[Test 2] Verifying draft form content details...');
    assert.ok(draftContent.includes('State Bank of India'), 'Draft must contain State Bank of India');
    assert.ok(draftContent.includes('Solaris Energy Infra Limited'), 'Draft must contain CD name Solaris Energy Infra Limited');
    assert.ok(draftContent.includes('U40100DL2018PLC334455'), 'Draft must contain CD CIN');
    assert.ok(draftContent.includes('AAACS8577K'), 'Draft must contain PAN AAACS8577K');
    assert.ok(draftContent.includes('SBIN0000691'), 'Draft must contain IFSC SBIN0000691');
    assert.ok(draftContent.includes('38992019482'), 'Draft must contain Bank Account No');
    assert.ok(draftContent.includes('65,00,00,000.00'), 'Draft must contain principal amount ₹65,00,00,000.00');
    assert.ok(draftContent.includes('hypothecation'), 'Draft must contain hypothecation security details');
    assert.ok(draftContent.includes('Sanjay V. Deshmukh') || draftContent.includes('Signatory'), 'Draft must contain signatory info');
    console.log('✓ Draft form filled accurately with all document particulars.');

    // 3. Verify KV write-back
    console.log('[Test 3] Verifying KV dictionary and SQLite write-back...');
    const kv = readAllKV(testCaseDir);
    assert.strictEqual(kv['claimant_name'], 'State Bank of India');
    assert.strictEqual(kv['corporate_debtor_name'], 'Solaris Energy Infra Limited');
    assert.strictEqual(kv['cin'], 'U40100DL2018PLC334455');
    assert.strictEqual(kv['claimant_pan'], 'AAACS8577K');
    assert.strictEqual(kv['bank_ifsc'], 'SBIN0000691');
    assert.strictEqual(kv['bank_account_no'], '38992019482');
    console.log('✓ KV store successfully enriched with all discovered particulars.');

    // Clean up
    closeAllDbs();
    fs.rmSync(testCaseDir, { recursive: true, force: true });
    console.log('✓ Cleaned up test fixture.');
    console.log('✅ ALL CLAIM DOCUMENT EXTRACTION TESTS PASSED!');
    return true;
}

if (require.main === module) {
    runTests().then(() => {
        process.exit(0);
    }).catch(err => {
        console.error('❌ Document extraction test failed:', err);
        process.exit(1);
    });
}

module.exports = runTests;
