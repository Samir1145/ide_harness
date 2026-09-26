'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { getRoutes } = require('../lib/routes');
const { enqueueRequisition, getQueue } = require('../lib/gatekeeper/compliance_queue');

async function testHttpEndpoints() {
  console.log('🧪 Testing Compliance HTTP Endpoints for LexAI Delivery & TiddlyWiki Callback...\n');

  const testCaseDir = path.join(__dirname, 'http_test_case_' + Date.now());
  fs.mkdirSync(testCaseDir, { recursive: true });

  // 1. Enqueue a Section 29A task
  const enq = enqueueRequisition(testCaseDir, {
    report_id: 'REPORT_11',
    report_code: 'RBZ-SEC29A-ELIGIBILITY-11',
    title: 'Section 29A Eligibility Dossier',
    subject: 'Consortium Bharat Heavy Tech',
    statutory_trigger: 'Mandatory Section 29A screening',
    statutory_citation: 'IBC Section 29A read with Reg. 36A(8)',
    required_inputs: {
      applicant_name: 'Consortium Bharat Heavy Tech',
      applicant_cin: 'U28100MH2012PTC998877'
    }
  });

  const taskId = enq.task_id;
  assert(taskId, 'Task must be enqueued');
  console.log(`  ✓ Enqueued statutory task: ${taskId}`);

  // Create lightweight HTTP server using routes
  const routes = require('../lib/routes');
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, 'http://localhost:3210');
    const pathname = parsedUrl.pathname;
    const query = Object.fromEntries(parsedUrl.searchParams.entries());
    parsedUrl.query = query;

    const methodRoutes = routes[req.method] || {};
    const handler = methodRoutes[pathname];
    if (handler) {
      handler(req, res, parsedUrl, path.dirname(testCaseDir));
    } else {
      res.writeHead(404);
      res.end(`Not Found: ${req.method} ${pathname}`);
    }
  });

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const caseName = path.basename(testCaseDir);

  try {
    // 2. Call simulate-lexai-delivery
    console.log(`  ✓ Calling POST /api/hayagriva/compliance/simulate-lexai-delivery (Port: ${port})...`);
    const simRes = await fetch(`http://localhost:${port}/api/hayagriva/compliance/simulate-lexai-delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case: caseName,
        taskId,
        simulateIneligible: true
      })
    });

    const simJson = await simRes.json();
    assert.strictEqual(simJson.success, true, 'Simulation should succeed');
    assert.strictEqual(simJson.completed, true, 'Task should be marked completed');
    assert(simJson.auditResult.has_ineligibility, 'Ineligibility should be flagged');
    assert(fs.existsSync(simJson.auditResult.audit_note_path), 'Audit note must exist on disk');
    assert(fs.existsSync(simJson.auditResult.cure_draft_path), 'Cure draft must exist on disk');
    assert(fs.existsSync(simJson.auditResult.wiki_html_path), 'TiddlyWiki HTML must exist on disk');

    console.log(`  ✓ Successfully simulated LexAI delivery for ${taskId}`);
    console.log(`    - Audit Note: ${simJson.auditResult.audit_note_rel}`);
    console.log(`    - TiddlyWiki HTML: ${simJson.auditResult.wiki_html_rel}`);
    console.log(`    - Cure Draft: ${simJson.auditResult.cure_draft_rel}`);

    // 3. Test viewing the TiddlyWiki file via /api/hayagriva/tiddlywiki/view
    console.log(`  ✓ Testing GET /api/hayagriva/tiddlywiki/view for reports file...`);
    const wikiViewRes = await fetch(`http://localhost:${port}/api/hayagriva/tiddlywiki/view?case=${encodeURIComponent(caseName)}&file=${encodeURIComponent(path.basename(simJson.auditResult.wiki_html_path))}`);
    assert.strictEqual(wikiViewRes.status, 200, 'TiddlyWiki view endpoint must return HTTP 200');
    const wikiContent = await wikiViewRes.text();
    assert(wikiContent.includes('<!doctype html>'), 'Wiki content must be HTML');
    assert(wikiContent.includes('Consortium Bharat Heavy Tech'), 'Wiki content must include applicant');

    console.log(`  ✓ TiddlyWiki viewer returned HTTP 200 with rendered interactive wiki!`);

    // 4. Verify compliance_queue.json status updated
    const queue = getQueue(testCaseDir);
    const updatedTask = queue.find(t => t.task_id === taskId);
    assert.strictEqual(updatedTask.status, 'COMPLETED', 'Queue task status must be COMPLETED');
    assert.strictEqual(updatedTask.dispatch_mode, 'SIMULATED_LEXAI_DELIVERY');

    console.log(`  ✓ Verified compliance queue status updated to COMPLETED with dispatch results`);

    console.log('\n🎉 ALL HTTP ENDPOINTS & TIDDLYWIKI VIEW VERIFIED CLEANLY!');
  } finally {
    server.close();
    try {
      fs.rmSync(testCaseDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

testHttpEndpoints().catch(err => {
  console.error('❌ HTTP Route Test Failed:', err);
  process.exit(1);
});
