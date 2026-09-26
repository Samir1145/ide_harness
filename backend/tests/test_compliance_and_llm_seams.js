'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');

const complianceSeam = require('../lib/seams/compliance');
const llmSeam = require('../lib/seams/llm');
const { enqueueRequisition, getQueue } = require('../lib/gatekeeper/compliance_queue');
const routes = require('../lib/routes');

async function runSeamTests() {
  console.log('🧪 Starting Capability Seams (Compliance & LLM) Test Suite...\n');

  const testCaseDir = path.join(__dirname, 'seam_test_case_' + Date.now());
  fs.mkdirSync(testCaseDir, { recursive: true });

  try {
    // ── Test 1: Compliance Seam - Local Provider Execution ──
    console.log('Test 1: Testing Compliance Seam with LOCAL provider...');
    const taskLocal = enqueueRequisition(testCaseDir, {
      report_id: 'REPORT_06',
      report_code: 'RBZ-IP-FEE-PROPOSAL-06',
      title: 'IP Fee & IRPC Budget Proposal',
      execution_tier: 'LOCAL',
      target_agent: '@document',
      subject: 'Zenith Metals Ltd Fee Requisition',
      statutory_citation: 'IBBI CIRP Regulation 34B',
      required_inputs: {
        corporate_debtor: 'Zenith Metals Ltd',
        irp_name: 'CS R. K. Gupta'
      }
    });

    const localResult = await complianceSeam.dispatch(testCaseDir, taskLocal.item, { tier: 'LOCAL' });
    assert.strictEqual(localResult.success, true, 'Local dispatch must succeed');
    assert.strictEqual(localResult.completed, true, 'Task should be completed');
    assert(fs.existsSync(localResult.draftPath), 'Draft file must exist on disk in drafts/');

    const draftText = fs.readFileSync(localResult.draftPath, 'utf8');
    assert(draftText.includes('Zenith Metals Ltd'), 'Draft must contain case facts');
    console.log('  ✓ Local subagent provider executed cleanly and created:', localResult.draftFile);

    // ── Test 2: Compliance Seam - Air-Gapped Staged Provider ──
    console.log('\nTest 2: Testing Compliance Seam with AIRGAP provider...');
    const taskAirgap = enqueueRequisition(testCaseDir, {
      report_id: 'REPORT_16',
      report_code: 'RBZ-PUFE-INQUEST-16',
      title: 'Forensic PUFE Avoidance Inquest',
      execution_tier: 'AIRGAP',
      subject: 'Air-gapped Estate Inquest',
      statutory_citation: 'IBC Sections 43, 45, 50, 66',
      required_inputs: { accounts_analyzed: 4 }
    });

    const airgapResult = await complianceSeam.dispatch(testCaseDir, taskAirgap.item, { tier: 'AIRGAP' });
    assert.strictEqual(airgapResult.success, true);
    assert.strictEqual(airgapResult.mode, 'AIRGAP_OUTBOX');
    assert(fs.existsSync(airgapResult.stagedPath), 'Staged requisition envelope must exist');

    const envelope = JSON.parse(fs.readFileSync(airgapResult.stagedPath, 'utf8'));
    assert.strictEqual(envelope.protocol_version, '1.0');
    assert(envelope.airgap_receipt_id.startsWith('AIRGAP-STAGED-'));
    console.log('  ✓ Air-gapped provider staged envelope:', airgapResult.stagedPath);

    // ── Test 3: Compliance Seam - LexAI Ingestion & TiddlyWiki Audit ──
    console.log('\nTest 3: Testing Compliance Seam Ingest (LexAI TiddlyWiki + Audit Note + Reg 36A(8))...');
    const taskGlobal = enqueueRequisition(testCaseDir, {
      report_id: 'REPORT_11',
      report_code: 'RBZ-SEC29A-ELIGIBILITY-11',
      title: 'Section 29A Eligibility Dossier',
      execution_tier: 'GLOBAL',
      subject: 'Consortium Delta Infra',
      statutory_citation: 'IBC Section 29A',
      required_inputs: { applicant_name: 'Consortium Delta Infra' }
    });

    const sampleTiddlers = [
      {
        title: 'Executive Summary',
        tags: 'ExecutiveSummary Clean',
        text: 'Clean registry pass across MCA-21.'
      },
      {
        title: 'NeSL Record Check',
        tags: 'Disqualified NPA Flagged',
        text: 'NPA > 1 year flagged on connected group entity with default of INR 18 Crores.'
      }
    ];

    const ingestResult = await complianceSeam.ingest(testCaseDir, {
      taskId: taskGlobal.task_id,
      reportId: 'REPORT_11',
      reportTitle: 'Section 29A Eligibility Dossier',
      tiddlers: sampleTiddlers,
      metadata: {
        applicant_name: 'Consortium Delta Infra',
        applicant_cin: 'U45200MH2014PTC112233'
      }
    }, { tier: 'GLOBAL' });

    assert.strictEqual(ingestResult.success, true);
    assert.strictEqual(ingestResult.completed, true);
    assert.strictEqual(ingestResult.auditResult.has_ineligibility, true);
    assert(fs.existsSync(ingestResult.auditResult.audit_note_path), 'Audit note must exist');
    assert(fs.existsSync(ingestResult.auditResult.cure_draft_path), 'Cure notice must exist');
    assert(fs.existsSync(ingestResult.auditResult.wiki_html_path), 'TiddlyWiki HTML must exist');
    console.log('  ✓ LexAI Ingest via Compliance Seam generated all 4 statutory artifacts.');

    // ── Test 4: LLM Engine Seam - Deterministic (Lite Mode) ──
    console.log('\nTest 4: Testing LLM Seam with DETERMINISTIC provider (Lite Mode)...');
    assert.strictEqual(llmSeam.getActiveProviderName(), 'DETERMINISTIC');
    const isHealthy = await llmSeam.isHealthy();
    assert.strictEqual(isHealthy, true, 'Deterministic provider should always be healthy');

    const completion = await llmSeam.complete('Synthesize preliminary case facts');
    assert(completion.text.includes('Lite Mode'), 'Completion must indicate Lite Mode fallback');

    let streamedText = '';
    await llmSeam.stream('Draft resolution plan checklist', chunk => {
      streamedText += chunk;
    });
    assert(streamedText.includes('Lite Mode'), 'Streamed completion must match');
    console.log('  ✓ LLM Seam executed deterministic zero-CPU completion and streaming.');

    // ── Test 5: End-to-End HTTP Route Dispatch using Refactored routes.js ──
    console.log('\nTest 5: Testing HTTP routes utilizing Compliance Seam...');
    const server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url, 'http://localhost:3210');
      parsedUrl.query = Object.fromEntries(parsedUrl.searchParams.entries());
      const handler = (routes[req.method] || {})[parsedUrl.pathname];
      if (handler) {
        handler(req, res, parsedUrl, path.dirname(testCaseDir));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    const caseName = path.basename(testCaseDir);

    try {
      // Test run-local HTTP route
      const httpRes = await fetch(`http://localhost:${port}/api/hayagriva/compliance/run-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case: caseName, taskId: taskLocal.task_id })
      });
      const httpJson = await httpRes.json();
      if (!httpJson.success) {
        console.error('HTTP run-local response:', httpJson);
      }
      assert.strictEqual(httpJson.success, true);
      assert.strictEqual(httpJson.completed, true);
      console.log('  ✓ POST /api/hayagriva/compliance/run-local dispatched successfully via seam.');
    } finally {
      server.close();
    }

    console.log('\n🎉 ALL SEAM UNIT & INTEGRATION TESTS PASSED CLEANLY!');
  } finally {
    try {
      fs.rmSync(testCaseDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runSeamTests().catch(err => {
  console.error('❌ Seam Test Suite Failed:', err);
  process.exit(1);
});
