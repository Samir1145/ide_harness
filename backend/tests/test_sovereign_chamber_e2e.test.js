const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== Sovereign Legal Coworker Chamber E2E Integration Suite ===');

// Check all test files created for the 5 phases
const testFiles = [
  'test_top_emblem_and_cockpit.test.js',
  'test_header_notifications.test.js',
  'test_billing_relocation.test.js',
  'test_agents_menu_contribution.test.js',
  'test_agent_directory_modal.test.js',
  'test_task_queue_modal.test.js',
  'test_registry_docking.test.js',
  'test_dynamic_coworker_roster.test.js',
  'test_lightrag_dock_and_orb_retirement.test.js',
  'test_agent_workstation_accordion.test.js',
  'test_word_view_draft_delivery.test.js'
];

for (const tf of testFiles) {
  const fullPath = path.resolve(__dirname, tf);
  assert.strictEqual(fs.existsSync(fullPath), true, `FAIL: Suite file ${tf} is missing!`);
  console.log(`  Running phase test: ${tf}...`);
  require(fullPath);
}

console.log('\n🎉 ALL 11 SOVEREIGN LEGAL CHAMBER PHASES PASSED WITH ZERO REGRESSIONS!');
