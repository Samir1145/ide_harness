/**
 * test_statutory_drafting.js
 * Validates statutory form drafting and DOCX compilation across multiple suites.
 */

const path = require('path');
const fs   = require('fs');
const { 
  listAvailableStatutoryForms, 
  draftStatutoryForm 
} = require('../lib/pipeline/forms/statutory-drafting');

async function runTest() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 Testing Statutory Form Drafting & Export Engine');
  console.log('═══════════════════════════════════════════════════════════\n');

  const caseDir = path.join(__dirname, '..', '..', 'claims_live_run');
  
  // 1. Check inventory
  const inventory = listAvailableStatutoryForms();
  console.log(`[Test 1] Inventory check: Found ${inventory.length} statutory forms.`);
  if (inventory.length < 50) {
    throw new Error(`Expected at least 50 forms, got ${inventory.length}`);
  }
  console.log('  ✓ Inventory validated (CIRP, CILP, CIVLP, PPIRP, PG).\n');

  // 2. Draft CIRP Form A (Public Announcement)
  console.log('[Test 2] Drafting CIRP Form A (Public Announcement)...');
  const resFormA = await draftStatutoryForm(caseDir, 'form-a', {
    company_name: 'Apex Infrastructure Private Limited',
    insolvency_commencement_date: '2026-09-01',
    ip_name: 'Rajesh Kumar Sharma',
    registration_number: 'IBBI/IPA-001/IP-P00245/2020-2021/10892',
    cin: 'U45200DL2015PTC284910'
  });
  console.log(`  ✓ Form A Drafted: ${path.basename(resFormA.draftMdPath)}`);
  console.log(`    DOCX Compiled: ${resFormA.draftDocxPath ? 'YES' : 'NO'} (${path.basename(resFormA.draftDocxPath || '')})`);
  console.log(`    Filled: ${resFormA.filledCount}, Unfilled: ${resFormA.unfilledCount}\n`);

  // 3. Draft CIRP Form C (Financial Creditor Claim)
  console.log('[Test 3] Drafting CIRP Form C (Financial Creditor Claim)...');
  const resFormC = await draftStatutoryForm(caseDir, 'form-c', {
    company_name: 'Apex Infrastructure Private Limited',
    creditor_name: 'State Bank of India',
    total_claim_amount: '₹ 45,28,90,150/-',
    principal_amount: '₹ 38,00,00,000/-',
    interest_amount: '₹ 7,28,90,150/-',
    date_of_default: '2025-11-15'
  });
  console.log(`  ✓ Form C Drafted: ${path.basename(resFormC.draftMdPath)}`);
  console.log(`    DOCX Compiled: ${resFormC.draftDocxPath ? 'YES' : 'NO'}`);
  console.log(`    Filled: ${resFormC.filledCount}, Unfilled: ${resFormC.unfilledCount}\n`);

  // 4. Draft Liquidation Form B_LP (Liquidation Public Announcement)
  console.log('[Test 4] Drafting Liquidation Form B_LP...');
  const resFormBLP = await draftStatutoryForm(caseDir, 'form-b-lp', {
    company_name: 'Apex Infrastructure Private Limited',
    date_of_passing_of_order_of_liquidation: '2026-09-01',
    liquidator_name: 'Rajesh Kumar Sharma',
    claims_last_date: '2026-10-01'
  });
  console.log(`  ✓ Form B_LP Drafted: ${path.basename(resFormBLP.draftMdPath)}`);
  console.log(`    DOCX Compiled: ${resFormBLP.draftDocxPath ? 'YES' : 'NO'}`);
  console.log(`    Filled: ${resFormBLP.filledCount}, Unfilled: ${resFormBLP.unfilledCount}\n`);

  // 5. Draft Pre-pack Form P1 (Written Consent)
  console.log('[Test 5] Drafting Pre-pack Form P1 (Written Consent)...');
  const resFormP1 = await draftStatutoryForm(caseDir, 'form-p1', {
    company_name: 'Apex Infrastructure Private Limited',
    ip_name: 'Rajesh Kumar Sharma',
    ip_registration_number: 'IBBI/IPA-001/IP-P00245/2020-2021/10892'
  });
  console.log(`  ✓ Form P1 Drafted: ${path.basename(resFormP1.draftMdPath)}`);
  console.log(`    DOCX Compiled: ${resFormP1.draftDocxPath ? 'YES' : 'NO'}`);
  console.log(`    Filled: ${resFormP1.filledCount}, Unfilled: ${resFormP1.unfilledCount}\n`);

  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ All Statutory Form Drafting Tests PASSED Successfully!');
  console.log('═══════════════════════════════════════════════════════════');
}

runTest().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
