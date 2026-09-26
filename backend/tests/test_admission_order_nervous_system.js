'use strict';

const fs = require('fs');
const path = require('path');
const { localEventBus, EVENT_TYPES } = require('../lib/agents/event-bus');
const { getQueue } = require('../lib/gatekeeper/compliance_queue');
const { subAgentRegistry } = require('../lib/agents/subagents');

async function testAdmissionOrderNervousSystem() {
  console.log('🧪 Testing Admission Order Nervous System Synapse...');

  const tempCaseDir = path.resolve(__dirname, 'temp_test_admission_case');
  if (fs.existsSync(tempCaseDir)) {
    fs.rmSync(tempCaseDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempCaseDir, { recursive: true });

  try {
    // 1. Verify StatutoryAuditorSubAgent is registered
    const auditor = subAgentRegistry['STATUTORY_AUDITOR'];
    if (!auditor) {
      throw new Error('STATUTORY_AUDITOR not found in subAgentRegistry');
    }
    console.log('✓ StatutoryAuditorSubAgent registered.');

    // 2. Dispatch simulated ADMISSION_ORDER_DETECTED event
    console.log('▶ Dispatching EVENT_ADMISSION_ORDER_DETECTED...');
    localEventBus.emitStatutoryEvent(EVENT_TYPES.ADMISSION_ORDER_DETECTED, {
      matter_dir: tempCaseDir,
      matter_name: path.basename(tempCaseDir),
      corporate_debtor: 'Suryajyoti Infotech Ltd',
      cdName: 'Suryajyoti Infotech Ltd',
      financial_creditor: 'State Bank of India',
      nclt_bench: 'Hyderabad Bench – II',
      irp_name: 'Mr. Kaspa Venu Gopal',
      case_number: '168/7/HDB/2023',
      admission_date: '18.09.2026',
      section: 'IBC Section 7'
    });

    // 3. Inspect compliance_queue.json
    const queue = getQueue(tempCaseDir);
    console.log(`✓ Compliance queue items count: ${queue.length}`);

    const hasReport05 = queue.some(it => it.report_id === 'REPORT_05');
    const hasReport06 = queue.some(it => it.report_id === 'REPORT_06');

    if (!hasReport05 || !hasReport06) {
      throw new Error(`Queue did not contain both REPORT_05 and REPORT_06. Items: ${JSON.stringify(queue, null, 2)}`);
    }

    console.log('✓ Successfully verified: REPORT_05 (IP Pre-Assignment Diagnostic) queued.');
    console.log('✓ Successfully verified: REPORT_06 (Formal IP Fee & IRPC Budget Proposal) queued.');
    console.log('🎉 Nervous system synapse test PASSED!');
  } finally {
    if (fs.existsSync(tempCaseDir)) {
      fs.rmSync(tempCaseDir, { recursive: true, force: true });
    }
  }
}

testAdmissionOrderNervousSystem().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
