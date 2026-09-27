/**
 * test_commercial_courts_drafter.js
 * ─────────────────────────────────────────────────────────────────
 * Comprehensive Test Suite for Plan 26 / Roadmap #49:
 * Commercial Courts & Interlocutory Relief Drafter
 * (Order 38 Rule 5, Order 39 Rules 1 & 2 CPC, Statement of Truth,
 * and Section 12A Commercial Courts Act PIMS & Urgency Application).
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

const {
  listAvailableCommercialCourtForms,
  resolveCommercialCourtTemplate,
  draftCommercialCourtForm,
  validateCommercialPleading,
  numberToIndianWords,
  COMMERCIAL_FORMS_REGISTRY
} = require('../lib/pipeline/forms/commercial-courts-drafting');

const { draftDocument } = require('../lib/core/drafting');
const { validateCommercialPleading: validatorBridge } = require('../lib/pipeline/forms/rules_validator');

async function runTestSuite() {
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('🧪 Running Test Suite: Commercial Courts & Interlocutory Drafter');
  console.log('─────────────────────────────────────────────────────────────────');

  const tempCaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haya_test_commercial_'));
  const reviewsDir = path.join(tempCaseDir, 'reviews');
  fs.mkdirSync(reviewsDir, { recursive: true });

  const mockKvData = {
    court_name: 'Dr. Parikshit, Rent Controller & Commercial Court, Chandigarh',
    suit_type: 'Commercial Eviction & Arrears Suit',
    suit_number: '142',
    suit_year: '2026',
    petitioner_name: 'M/s P.D. Hotels Private Limited',
    petitioner_rep: 'Shri Atul Grover',
    petitioner_address: 'House No. 1634, Sector 18-D, Chandigarh',
    respondent_name: 'M/s P.R. Hospitality',
    target_respondent_name: 'Shri Prem Pal Singh',
    target_respondent_address: 'House No. 1576, Sector 33, Chandigarh',
    disputed_quantum: '3,08,54,000',
    schedule_property_description: 'Residential Property bearing House No. 1576, Sector 33, Chandigarh, measuring 1 Kanal (500 Sq. Yards)',
    sub_registrar_jurisdiction: 'Sub-Registrar / Estate Officer, UT Chandigarh',
    nature_of_commercial_dispute: 'Commercial lease rent arrears (₹58.54L) and building misuse penalties (₹2.5Cr)',
    advocate_name: 'Pradeep Bedi'
  };
  fs.writeFileSync(path.join(reviewsDir, 'case_kv_dictionary.json'), JSON.stringify(mockKvData, null, 2), 'utf8');

  try {
    // ── TEST 1: Form Registry & Metadata Completeness ───────────────────
    console.log('\n[Test 1] Verifying Form Registry & Statutory Metadata...');
    const forms = listAvailableCommercialCourtForms();
    assert.strictEqual(forms.length >= 7, true, `Expected at least 7 forms, found ${forms.length}`);
    for (const f of forms) {
      assert.ok(f.id, `Missing ID on form: ${JSON.stringify(f)}`);
      assert.ok(f.slug, `Missing Slug on form: ${f.id}`);
      assert.ok(f.title, `Missing Title on form: ${f.id}`);
      assert.ok(f.act, `Missing Act on form: ${f.id}`);
      assert.ok(f.forum, `Missing Forum on form: ${f.id}`);
      assert.ok(f.relief, `Missing Relief on form: ${f.id}`);
    }
    console.log(`  ✓ Form Registry verified (${forms.length} statutory templates with complete metadata).`);

    // ── TEST 2: Template Slug Resolution & Alias Routing ────────────────
    console.log('\n[Test 2] Verifying Template Resolution & Alias Matching...');
    const cases = [
      { input: 'cpc-order38', expectedId: 'cpc_order_38_rule_5_attachment' },
      { input: 'order38', expectedId: 'cpc_order_38_rule_5_attachment' },
      { input: 'draft-order38', expectedId: 'cpc_order_38_rule_5_attachment' },
      { input: 'attachment-before-judgment', expectedId: 'cpc_order_38_rule_5_attachment' },
      { input: 'cpc-order39', expectedId: 'cpc_order_39_rules_1_2_injunction' },
      { input: 'draft-order39', expectedId: 'cpc_order_39_rules_1_2_injunction' },
      { input: 'temporary-injunction', expectedId: 'cpc_order_39_rules_1_2_injunction' },
      { input: 'cpc-truth', expectedId: 'cpc_statement_of_truth' },
      { input: 'draft-truth', expectedId: 'cpc_statement_of_truth' },
      { input: 'cpc-order11', expectedId: 'cpc_order_11_statement_of_documents' },
      { input: 'cca-sec12a-pims', expectedId: 'cca_section_12a_pims_form_1' },
      { input: 'draft-pims', expectedId: 'cca_section_12a_pims_form_1' },
      { input: 'cca-urgency', expectedId: 'cca_section_12a_urgency_application' },
      { input: 'cca-nonstarter', expectedId: 'cca_section_12a_form_3_non_starter' }
    ];

    for (const c of cases) {
      const resolved = resolveCommercialCourtTemplate(c.input);
      assert.ok(resolved, `Failed to resolve template for "${c.input}"`);
      assert.strictEqual(resolved.id, c.expectedId, `Mismatch resolving "${c.input}". Expected ${c.expectedId}, got ${resolved.id}`);
    }
    console.log(`  ✓ All ${cases.length} slug and alias variants successfully resolved.`);

    // ── TEST 3: Indian English Number to Words Converter ────────────────
    console.log('\n[Test 3] Verifying Indian Number to Words Converter...');
    assert.strictEqual(numberToIndianWords(30000000), 'Three Crore Only');
    assert.strictEqual(numberToIndianWords(5854000), 'Fifty Eight Lakh Fifty Four Thousand Only');
    assert.strictEqual(numberToIndianWords(30854000), 'Three Crore Eight Lakh Fifty Four Thousand Only');
    console.log('  ✓ Indian currency number-to-words logic verified accurately.');

    // ── TEST 4: Drafting Order 38 Rule 5 Attachment Before Judgment ───────
    console.log('\n[Test 4] Drafting Order XXXVIII Rule 5 CPC Application...');
    const order38Result = await draftCommercialCourtForm(tempCaseDir, 'cpc-order38');
    assert.strictEqual(order38Result.success, true);
    assert.ok(fs.existsSync(order38Result.draftPath), 'Draft file was not written to disk');
    
    const order38Content = fs.readFileSync(order38Result.draftPath, 'utf8');
    assert.ok(order38Content.includes('ORDER XXXVIII RULE 5 READ WITH SECTION 151'), 'Missing statutory invocation');
    assert.ok(order38Content.includes('M/s P.D. Hotels Private Limited'), 'Missing petitioner fact');
    assert.ok(order38Content.includes('Shri Prem Pal Singh'), 'Missing respondent target fact');
    assert.ok(order38Content.includes('House No. 1576, Sector 33, Chandigarh'), 'Missing property schedule');
    assert.ok(order38Content.includes('Raman Tech'), 'Missing Raman Tech precedent standard');
    assert.ok(order38Content.includes('red note'), 'Missing red note / lis pendens prayer');
    assert.ok(order38Content.includes('AFFIDAVIT IN SUPPORT OF APPLICATION'), 'Missing supporting affidavit');
    console.log(`  ✓ Order 38 Rule 5 Application drafted successfully (${order38Result.filledCount} fields populated, draft: ${order38Result.draftName}).`);

    // ── TEST 5: Drafting Order 39 Rules 1 & 2 CPC Temporary Injunction ───
    console.log('\n[Test 5] Drafting Order XXXIX Rules 1 & 2 CPC Temporary Injunction...');
    const order39Result = await draftCommercialCourtForm(tempCaseDir, 'cpc-order39');
    assert.strictEqual(order39Result.success, true);
    const order39Content = fs.readFileSync(order39Result.draftPath, 'utf8');
    assert.ok(order39Content.includes('ORDER XXXIX RULES 1 AND 2'), 'Missing Order 39 statutory title');
    assert.ok(order39Content.includes('Strong Prima Facie Case'), 'Missing 3-prong test');
    assert.ok(order39Content.includes('Overwhelming Balance of Convenience'), 'Missing balance of convenience');
    assert.ok(order39Content.includes('Irreparable Injury'), 'Missing irreparable injury');
    assert.ok(order39Content.includes('Order XXXIX Rule 3 CPC Proviso'), 'Missing Rule 3 proviso compliance undertaking');
    assert.ok(order39Content.includes('24 hours'), 'Missing 24 hours service undertaking');
    console.log(`  ✓ Order 39 Rules 1 & 2 Application drafted successfully (${order39Result.filledCount} fields populated).`);

    // ── TEST 6: Drafting Statement of Truth (Order VI Rule 15A) ───────────
    console.log('\n[Test 6] Drafting Order VI Rule 15A Statement of Truth...');
    const truthResult = await draftCommercialCourtForm(tempCaseDir, 'cpc-truth');
    assert.strictEqual(truthResult.success, true);
    const truthContent = fs.readFileSync(truthResult.draftPath, 'utf8');
    assert.ok(truthContent.includes('STATEMENT OF TRUTH'), 'Missing Statement of Truth title');
    assert.ok(truthContent.includes('Order VI Rule 15A'), 'Missing Order VI Rule 15A reference');
    assert.ok(truthContent.includes('Section 63 of the Bharatiya Sakshya Adhiniyam, 2023'), 'Missing BSA section 63 declaration');
    console.log(`  ✓ Statement of Truth drafted successfully with digital evidence certifications.`);

    // ── TEST 7: Drafting Section 12A PIMS Form 1 & Urgency Application ────
    console.log('\n[Test 7] Drafting Section 12A PIMS Form 1 & Urgency Application...');
    const pimsResult = await draftCommercialCourtForm(tempCaseDir, 'cca-sec12a-pims');
    assert.strictEqual(pimsResult.success, true);
    const pimsContent = fs.readFileSync(pimsResult.draftPath, 'utf8');
    assert.ok(pimsContent.includes('SCHEDULE I — FORM 1'), 'Missing Schedule I Form 1 title');
    assert.ok(pimsContent.includes('DETAILS OF PARTIES'), 'Missing Details of Parties');
    assert.ok(pimsContent.includes('DETAILS OF DISPUTE'), 'Missing Details of Dispute');

    const urgencyResult = await draftCommercialCourtForm(tempCaseDir, 'cca-urgency');
    assert.strictEqual(urgencyResult.success, true);
    const urgencyContent = fs.readFileSync(urgencyResult.draftPath, 'utf8');
    assert.ok(urgencyContent.includes('PROVISO TO SECTION 12A(1) OF THE COMMERCIAL COURTS ACT, 2015'), 'Missing Section 12A proviso invocation');
    assert.ok(urgencyContent.includes('Patil Automation'), 'Missing Patil Automation citation');
    console.log(`  ✓ Section 12A Form 1 and Urgency Exemption application drafted successfully.`);

    // ── TEST 8: Statutory Checklist Validation & Linter Checks ────────────
    console.log('\n[Test 8] Verifying Statutory Checklist Validator (CC_01 to CC_05)...');
    
    // 8a: Clean Order 38 should pass
    const diag38 = validateCommercialPleading(order38Content, 'cpc-order38');
    assert.strictEqual(diag38.valid, true, 'Order 38 draft should have valid = true');

    // 8b: Malformed Order 38 missing schedule of property
    const bad38 = 'APPLICATION UNDER ORDER 38 RULE 5. We pray for attachment.';
    const bad38Diag = validateCommercialPleading(bad38, 'cpc-order38');
    assert.strictEqual(bad38Diag.valid, false, 'Bad Order 38 must fail validation');
    assert.ok(bad38Diag.issues.some(i => i.ruleId === 'CC_02'), 'Must flag CC_02 missing schedule of property');

    // 8c: Malformed Order 39 missing 24-hour Rule 3 undertaking
    const bad39 = 'APPLICATION UNDER ORDER 39 RULES 1 AND 2. Please grant stay.';
    const bad39Diag = validateCommercialPleading(bad39, 'cpc-order39');
    assert.strictEqual(bad39Diag.valid, false, 'Bad Order 39 must fail validation');
    assert.ok(bad39Diag.issues.some(i => i.ruleId === 'CC_05'), 'Must flag CC_05 missing Rule 3 proviso undertaking');

    // 8d: Bridge check from rules_validator.js
    const bridgeDiag = validatorBridge(order38Content, 'cpc-order38');
    assert.strictEqual(bridgeDiag.valid, true, 'rules_validator bridge must succeed');
    console.log('  ✓ Statutory checklist and diagnostic audit rules (CC_01–CC_05) functioning correctly.');

    // ── TEST 9: Seamless draftDocument() Core Integration ─────────────────
    console.log('\n[Test 9] Verifying Core Drafting Engine Routing (draftDocument)...');
    const coreResult = await draftDocument(tempCaseDir, 'cpc-order38');
    assert.strictEqual(coreResult.version, 1);
    assert.ok(coreResult.draftPath && fs.existsSync(coreResult.draftPath), 'Core draftDocument did not produce draft path');
    assert.strictEqual(coreResult.title, 'Attachment Before Judgment (Order XXXVIII Rule 5 CPC)');
    console.log(`  ✓ draftDocument() seamlessly routes commercial formats to Commercial Courts Drafter.`);

    // ── TEST 10: Commercial Context Readiness Audit (Found vs Missing) ────
    console.log('\n[Test 10] Verifying Context Readiness Audit Engine...');
    const { auditContextReadiness, updateContextFact } = require('../lib/pipeline/forms/context-readiness');
    const readinessAudit = auditContextReadiness(tempCaseDir);
    assert.ok(readinessAudit.summary, 'Missing readiness summary');
    assert.strictEqual(readinessAudit.summary.totalFacts, 20, 'Expected 20 statutory facts');
    assert.ok(readinessAudit.summary.foundCount > 0, 'Expected found facts from mock KV');
    assert.ok(readinessAudit.summary.missingCount > 0, 'Expected missing facts to be flagged');
    assert.ok(readinessAudit.summary.readinessScore > 0, 'Readiness score must be calculated');
    assert.ok(readinessAudit.markdownReport.includes('Commercial Court Context Readiness Audit'), 'Missing markdown report header');
    assert.ok(readinessAudit.markdownReport.includes('Missing Statutory Context'), 'Missing missing section in markdown');
    console.log(`  ✓ Readiness audit verified (${readinessAudit.summary.readinessScore}% ready, ${readinessAudit.summary.foundCount}/${readinessAudit.summary.totalFacts} facts verified).`);

    // ── TEST 11: Heuristic Text Inference from Ingested Files ─────────────
    console.log('\n[Test 11] Verifying Heuristic Regex Inference from Raw Ingested Files...');
    const rawDir = path.join(tempCaseDir, 'raw');
    fs.mkdirSync(rawDir, { recursive: true });
    // Simulate an uploaded commercial lease file with an agreement date not yet in KV
    fs.writeFileSync(path.join(rawDir, 'unindexed_lease.md'), 'The parties executed a commercial lease deed dated 30.04.2017 with 18% per annum contractual interest.', 'utf8');
    
    const heuristicAudit = auditContextReadiness(tempCaseDir);
    const dateItem = heuristicAudit.foundItems.find(i => i.key === 'agreement_date');
    assert.ok(dateItem, 'Failed to extract agreement_date from raw file');
    assert.strictEqual(dateItem.status, 'INFERRED');
    assert.strictEqual(dateItem.value, '30.04.2017');
    console.log(`  ✓ Heuristic scanner inferred agreement_date (${dateItem.value}) from unindexed file.`);

    // ── TEST 12: Quick-Fill Fact Update & Instant Score Recalculation ──────
    console.log('\n[Test 12] Verifying Quick-Fill Fact Update & Persistence...');
    const updatedAudit = updateContextFact(tempCaseDir, 'board_resolution_date', '14.08.2026');
    assert.ok(updatedAudit.summary.foundCount > readinessAudit.summary.foundCount, 'Score did not increment after quick-fill');
    
    const kvSaved = JSON.parse(fs.readFileSync(path.join(tempCaseDir, 'reviews', 'case_kv_dictionary.json'), 'utf8'));
    assert.strictEqual(kvSaved.board_resolution_date, '14.08.2026');
    assert.strictEqual(kvSaved.board_resolution_date_verified_by_user, 1);
    console.log(`  ✓ Quick-fill persisted fact to case_kv_dictionary.json with verified_by_user = 1.`);

    // ── TEST 13: Ground-Truth Click Labs Sample Pleading & Email Affidavit ─
    console.log('\n[Test 13] Verifying Ground-Truth Click Labs Sample & Email Affidavit...');
    const emailAffidavitResult = await draftCommercialCourtForm(tempCaseDir, 'cpc-email-affidavit');
    assert.strictEqual(emailAffidavitResult.success, true);
    assert.ok(fs.existsSync(emailAffidavitResult.draftPath));
    const emailContent = fs.readFileSync(emailAffidavitResult.draftPath, 'utf8');
    assert.ok(emailContent.includes('AFFIDAVIT OF CORRECT EMAIL ADDRESSES'));
    assert.ok(emailContent.includes('Rule 3(2) and 3(3)'));
    assert.ok(emailContent.includes('Opposite Party No. 1'));

    // Test extraction from actual Click Labs ground-truth snippet
    const clickLabsText = `
      M/S CLICK LABS PVT. LTD. THROUGH ITS DIRECTOR SHRI SAMAR SINGLA
      Annexure P-1 (Resolution) dated 20.11.2023
      Industrial Plot No. D-279, Phase VIII-B, measuring 2415.85 Sq. Yards at Industrial Focal Point IFP, SAS Nagar (Mohali)
      forfeiting the earnest money of Rs. 2,00,01,000/- as per Clause 12
      liable to pay a sum of Rs. 2,00,000/- P.M. as mesne profits/damages
      AFFIDAVIT OF CORRECT E-MAIL
    `;
    fs.writeFileSync(path.join(rawDir, 'click_labs_sample.md'), clickLabsText, 'utf8');
    const groundTruthAudit = auditContextReadiness(tempCaseDir);
    assert.ok(groundTruthAudit.foundItems.some(i => i.key === 'mesne_profits_rate'));
    assert.ok(groundTruthAudit.foundItems.some(i => i.key === 'earnest_money_forfeited'));
    assert.ok(groundTruthAudit.foundItems.some(i => i.key === 'affidavit_of_correct_email'));
    console.log(`  ✓ Ground-truth Click Labs sample successfully audited and extracted into readiness matrix.`);

    console.log('\n─────────────────────────────────────────────────────────────────');
    console.log('🎉 ALL 13 TEST SUITE PHASES PASSED WITH 100% SUCCESS!');
    console.log('─────────────────────────────────────────────────────────────────');
  } finally {
    fs.rmSync(tempCaseDir, { recursive: true, force: true });
  }
}

runTestSuite().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
