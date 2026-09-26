'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const StatutoryAuditor = require('../lib/agents/subagents/statutory-auditor');
const { enqueueRequisition, getTaskById } = require('../lib/gatekeeper/compliance_queue');

async function runTests() {
  console.log('🧪 Starting Integrated TiddlyWiki + Audit Note + Reg 36A(8) Pipeline Tests...\n');

  const testDir = path.join(__dirname, 'scratch_test_case_' + Date.now());
  fs.mkdirSync(testDir, { recursive: true });

  try {
    // ── Test 1: Ingestion of LexAI Forensic Tiddlers with Section 29A Disqualification ──
    console.log('Test 1: Auditing LexAI Tiddlers with § 29A(c) NPA & § 164(2) Disqualified Director...');

    const auditor = new StatutoryAuditor();
    const taskId = 'req_report_11_test_01';

    const sampleTiddlers = [
      {
        title: 'Executive Summary — Resolution Applicant Screening',
        tags: 'ExecutiveSummary Section29A',
        text: '! Executive Summary\nScreened Acme Steel Holdings Ltd across MCA-21, CIBIL, NeSL and Judicial Records.'
      },
      {
        title: 'MCA-21: Director Status — Din 01234567',
        tags: 'MCA21 Directors Section29A_e Disqualified',
        text: '! Director Status Flagged\nDirector Vikram Sharma (DIN 01234567) is DISQUALIFIED under Section 164(2) of Companies Act, 2013 for default in associate company filing.'
      },
      {
        title: 'NeSL: Credit Default Ledger',
        tags: 'Banking NeSL Section29A_c NPA Flagged',
        text: '! NPA Classification Alert\nAccount classified as NPA > 1 Year with overdue debt of INR 45 Crores at Bank of Baroda.'
      },
      {
        title: 'CIBIL / RBI Wilful Defaulter Check',
        tags: 'Credit Clean',
        text: 'No wilful defaulter records on file.'
      }
    ];

    const result = auditor.auditReportAndDraftCure(testDir, {
      taskId,
      reportId: 'REPORT_11',
      reportTitle: 'Section 29A Eligibility Dossier',
      tiddlers: sampleTiddlers,
      metadata: {
        applicant_name: 'Acme Steel Holdings Ltd',
        applicant_cin: 'L27100MH2010PLC123456',
        cd_name: 'Zenith Metals Ltd'
      }
    });

    assert.strictEqual(result.success, true, 'Result should be successful');
    assert.strictEqual(result.has_ineligibility, true, 'Ineligibility should be detected');
    assert(result.report_json_path && fs.existsSync(result.report_json_path), 'Raw report JSON should exist in reports/');
    assert(result.wiki_html_path && fs.existsSync(result.wiki_html_path), 'TiddlyWiki HTML should exist in reports/');
    assert(result.audit_note_path && fs.existsSync(result.audit_note_path), 'Audit note should exist in reviews/');
    assert(result.cure_draft_path && fs.existsSync(result.cure_draft_path), 'Reg 36A(8) cure draft should exist in drafts/');

    console.log('  ✓ Generated raw JSON:', result.report_json_rel);
    console.log('  ✓ Generated TiddlyWiki HTML:', result.wiki_html_rel);
    console.log('  ✓ Generated Audit Note:', result.audit_note_rel);
    console.log('  ✓ Generated Reg 36A(8) Cure Notice:', result.cure_draft_rel);

    // Verify TiddlyWiki HTML content
    const wikiHtml = fs.readFileSync(result.wiki_html_path, 'utf8');
    assert(wikiHtml.includes('<!doctype html>'), 'TiddlyWiki HTML must be valid DOCTYPE');
    assert(wikiHtml.includes('Acme Steel Holdings Ltd'), 'TiddlyWiki must contain applicant name');
    assert(wikiHtml.includes('Section 164(2)'), 'TiddlyWiki must contain tiddler text');

    // Verify Audit Note content
    const auditNote = fs.readFileSync(result.audit_note_path, 'utf8');
    assert(auditNote.includes('STATUTORY INELIGIBILITY DETECTED'), 'Audit Note must show caution alert');
    assert(auditNote.includes('§ 29A(c)'), 'Audit Note must include clause matrix');
    assert(auditNote.includes('Regulation 36A(8)'), 'Audit Note must cite Reg 36A(8)');

    // Verify Reg 36A(8) Notice content
    const cureNotice = fs.readFileSync(result.cure_draft_path, 'utf8');
    assert(cureNotice.includes('NOTICE OF STATUTORY INELIGIBILITY UNDER SECTION 29A'), 'Cure Notice header match');
    assert(cureNotice.includes('REGULATION 36A(8)'), 'Cure Notice citation match');
    assert(cureNotice.includes('DEADLINE:'), 'Cure Notice must calculate 5-day deadline');
    assert(cureNotice.includes('Acme Steel Holdings Ltd'), 'Cure Notice must address applicant');

    console.log('  ✓ Verified all file contents, citations, and 5-day deadline calculations.');

    // ── Test 2: Ingestion of Clean Dossier (No Disqualifications) ──
    console.log('\nTest 2: Auditing Clean LexAI Tiddlers (Negative Assurance Satisfied)...');

    const cleanTiddlers = [
      {
        title: 'Summary',
        tags: 'ExecutiveSummary Clean',
        text: 'All registry sweeps pass. No statutory disqualification detected.'
      },
      {
        title: 'MCA-21 Directorships',
        tags: 'Directors Clean',
        text: 'All DINs active and compliant under Section 164(2).'
      },
      {
        title: 'Banking & NeSL Records',
        tags: 'Banking Clean',
        text: 'No accounts classified as NPA.'
      }
    ];

    const cleanResult = auditor.auditReportAndDraftCure(testDir, {
      taskId: 'req_report_11_clean',
      reportId: 'REPORT_11',
      reportTitle: 'Section 29A Eligibility Dossier',
      tiddlers: cleanTiddlers,
      metadata: {
        applicant_name: 'Solvent Bidder Corp',
        applicant_cin: 'U72200DL2015PTC999888',
        cd_name: 'Zenith Metals Ltd'
      }
    });

    assert.strictEqual(cleanResult.success, true);
    assert.strictEqual(cleanResult.has_ineligibility, false, 'No ineligibility should be detected');
    assert.strictEqual(cleanResult.cure_draft_path, null, 'No cure notice should be drafted for clean bidder');
    assert(fs.existsSync(cleanResult.audit_note_path), 'Audit note should still be compiled');

    const cleanAuditNote = fs.readFileSync(cleanResult.audit_note_path, 'utf8');
    assert(cleanAuditNote.includes('PRELIMINARY NEGATIVE ASSURANCE SATISFIED'), 'Clean audit note should confirm negative assurance satisfied');
    console.log('  ✓ Clean audit note generated without unnecessary cure notice.');

    console.log('\n🎉 ALL PIPELINE TESTS PASSED SUCCESSFULLY!');
  } finally {
    // Cleanup test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runTests().catch(err => {
  console.error('❌ Pipeline test failed:', err);
  process.exit(1);
});
