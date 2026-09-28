'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  stitchCaseWikiCards,
  exportCaseWikiToCourtDocx
} = require('../lib/core/wiki-stitcher');

async function runTests() {
  console.log('🧪 Starting Phase 4: Continuous Court Pleading Stitcher & DOCX Export Unit Tests...\n');

  const testCaseDir = path.join(__dirname, 'scratch_p4_case_' + Date.now());
  fs.mkdirSync(testCaseDir, { recursive: true });

  try {
    // Test 1: Stitching cards with transclusions and sequential legal numbering
    console.log('Test 1: Verifying card stitching, transclusion unrolling & sequential numbering...');
    
    const sampleCards = [
      {
        title: '01_Parties',
        order: 1,
        tags: 'Pleading',
        text: '1. That the Plaintiffs are lawful co-owners of SCO No. 123-124, Sector 17, Chandigarh.'
      },
      {
        title: '02_Lease_Terms',
        order: 2,
        tags: 'Pleading Lease',
        text: '2. That vide registered Lease Deed dated 15.01.2018, the premises was demised to Defendant No. 1. Detailed arrears are set out below:\n\n{{03_Arrears_Table}}'
      },
      {
        title: '03_Arrears_Table',
        order: 3,
        tags: 'Table Financial',
        text: '| Period | Months | Monthly Rent | Rent Due |\n| --- | --- | --- | --- |\n| Oct-23 to Aug-24 | 11 | 14,58,608 | 70,93,422 |\n| **Total Due** | | | **70,93,422** |'
      },
      {
        title: '04_Eviction_Order',
        order: 4,
        tags: 'Pleading Exhibit',
        text: '12. That Defendant No. 3 has a habitual pattern of defaulting on rent obligations. Photocopy of eviction order is Ex P-8.'
      },
      {
        title: '05_Cause_Of_Action',
        order: 5,
        tags: 'Pleading Jurisdiction',
        text: '13. That the cause of action accrued when Defendants failed to pay rent.'
      }
    ];

    const stitched = stitchCaseWikiCards(testCaseDir, 'RentRecovery', sampleCards);
    assert(stitched && stitched.stitchedMarkdown, 'Must return stitchedMarkdown');
    assert(stitched.paraCount >= 4, `Expected at least 4 paragraphs, got ${stitched.paraCount}`);

    // Verify Transclusion Unrolling
    assert(!stitched.stitchedMarkdown.includes('{{03_Arrears_Table}}'), 'Transclusion tag must be replaced');
    assert(stitched.stitchedMarkdown.includes('70,93,422'), 'Transcluded table content must be inlined');

    // Verify Sequential Renumbering
    assert(stitched.stitchedMarkdown.includes('1. That the Plaintiffs'), 'Para 1 must be numbered 1.');
    assert(stitched.stitchedMarkdown.includes('2. That vide registered Lease Deed'), 'Para 2 must be numbered 2.');
    assert(stitched.stitchedMarkdown.includes('3. That Defendant No. 3 has a habitual pattern'), 'Para 12 must be re-numbered sequentially to 3.');
    assert(stitched.stitchedMarkdown.includes('4. That the cause of action accrued'), 'Para 13 must be re-numbered sequentially to 4.');

    // Verify Statutory Statement of Truth & Section 63 BSA Certificate
    assert(stitched.stitchedMarkdown.includes('STATEMENT OF TRUTH'), 'Must include Order VI Rule 15A Statement of Truth');
    assert(stitched.stitchedMarkdown.includes('BHARATIYA SAKSHYA ADHINIYAM'), 'Must include Section 63 BSA certificate');
    assert(stitched.stitchedMarkdown.includes('VERIFICATION'), 'Must include formal Court Verification');

    console.log('  ✓ Transclusions unrolled, sequential legal numbering normalized, statutory certificates injected.');

    // Test 2: Compiling Court DOCX file
    console.log('Test 2: Compiling continuous court pleading to .docx file in exports/...');
    const result = await exportCaseWikiToCourtDocx(testCaseDir, 'RentRecovery', sampleCards);
    assert(result.success === true, 'Export must succeed');
    assert(fs.existsSync(result.docxPath), 'DOCX file must exist on disk');
    assert(fs.existsSync(result.mdPath), 'Companion MD file must exist on disk');

    const stat = fs.statSync(result.docxPath);
    assert(stat.size > 2000, `DOCX file must be non-empty (size: ${stat.size} bytes)`);
    console.log(`  ✓ Successfully compiled Court DOCX (${stat.size} bytes) at: ${path.basename(result.docxPath)}`);

    console.log('\n🎉 ALL PHASE 4 WIKI STITCHER & DOCX EXPORT TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    try {
      fs.rmSync(testCaseDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
