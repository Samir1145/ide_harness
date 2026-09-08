'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const {
    RiskClass,
    ExecutionMode,
    evaluateToolCall,
    grantRunAllowance,
    isRunAllowed,
    clearRunGrants
} = require('../lib/agents/risk-engine');
const { executeTool } = require('../lib/agents/skills/tool-dispatcher');
const inboxManager = require('../lib/agents/inbox-manager');

console.log('[Ephemeral Run Grants (THIS_RUN) Unit & Integration Tests]');

const tempWorkspace = path.join(__dirname, 'fixtures', 'temp_run_grants_workspace');

async function runTests() {
    if (fs.existsSync(tempWorkspace)) {
        fs.rmSync(tempWorkspace, { recursive: true, force: true });
    }
    fs.mkdirSync(tempWorkspace, { recursive: true });

// Test 1: Basic run allowance tracking
console.log('  -> Test 1: grantRunAllowance registers in-memory tool grant');
const runId = 'run_abc_123';
clearRunGrants(runId);
assert.strictEqual(isRunAllowed(runId, 'mca_portal_submit'), false);
grantRunAllowance(runId, 'mca_portal_submit');
assert.strictEqual(isRunAllowed(runId, 'mca_portal_submit'), true);
assert.strictEqual(isRunAllowed(runId, 'other_tool'), false);

// Test 2: clearRunGrants purges run scope
console.log('  -> Test 2: clearRunGrants purges grants at run boundary');
clearRunGrants(runId);
assert.strictEqual(isRunAllowed(runId, 'mca_portal_submit'), false);

// Test 3: evaluateToolCall auto-allows EXTERNAL tool with run grant
console.log('  -> Test 3: evaluateToolCall auto-allows EXTERNAL tool with runId grant');
grantRunAllowance(runId, 'mcaportalsubmit');
const eval1 = evaluateToolCall(tempWorkspace, 'mcaportalsubmit', {}, { runId });
assert.strictEqual(eval1.allowed, true);
assert.strictEqual(eval1.needsApproval, false);
assert(eval1.reason.includes('THIS_RUN'));

// Test 4: evaluateToolCall auto-allows with runGrants set or array
console.log('  -> Test 4: evaluateToolCall auto-allows with explicit runGrants set');
const eval2 = evaluateToolCall(tempWorkspace, 'dispatch_notice', {}, { runGrants: new Set(['dispatch_notice']) });
assert.strictEqual(eval2.allowed, true);
assert.strictEqual(eval2.needsApproval, false);
assert(eval2.reason.includes('THIS_RUN'));

// Test 5: evaluateToolCall preserves workspace containment check even with run grant
console.log('  -> Test 5: evaluateToolCall blocks path traversal even when run grant exists');
grantRunAllowance(runId, 'writekv');
const eval3 = evaluateToolCall(tempWorkspace, 'save_artifact', { path: '../../evil.sh' }, { runId });
assert.strictEqual(eval3.allowed, false);
assert(eval3.reason.includes('Path traversal'));

// Test 6: evaluateToolCall still enforces read-only mode ceiling
console.log('  -> Test 6: evaluateToolCall strictly enforces DISCUSS mode even with run grant');
const eval4 = evaluateToolCall(tempWorkspace, 'mcaportalsubmit', {}, { runId, mode: ExecutionMode.DISCUSS });
assert.strictEqual(eval4.allowed, false);
assert(eval4.reason.includes('strictly read-only'));

// Test 7: executeTool runs without throwing when runId has active grant
console.log('  -> Test 7: executeTool executes EXTERNAL tool when runId has active grant');
const res7 = await executeTool(tempWorkspace, 'mca_portal_submit', { formId: 'FORM_2' }, { runId });
assert.strictEqual(res7.tool.toLowerCase().replace(/_/g, ''), 'mcaportalsubmit');
assert.strictEqual(res7.status, 'submitted');

// Test 8: resolveItem with this_run registers grant dynamically
console.log('  -> Test 8: resolveItem with this_run dynamically enables subsequent calls in that run');
const newRun = 'run_session_999';
const item = inboxManager.createItem(tempWorkspace, {
    kind: 'approval',
    title: 'Approve email dispatch',
    riskClass: RiskClass.EXTERNAL,
    data: { toolName: 'send_email_notice' },
    metadata: { toolName: 'send_email_notice', runId: newRun }
});

// Initially not allowed for newRun
assert.strictEqual(isRunAllowed(newRun, 'send_email_notice'), false);

// Resolve with 'this_run'
const resolveRes = inboxManager.resolveItem(tempWorkspace, item.id, 'this_run', 'lead_counsel');
assert.strictEqual(resolveRes.success, true);
assert.strictEqual(isRunAllowed(newRun, 'send_email_notice'), true);

// Clean up
    clearRunGrants();
    if (fs.existsSync(tempWorkspace)) {
        fs.rmSync(tempWorkspace, { recursive: true, force: true });
    }

    console.log('  ✓ SUCCESS: All 8 Ephemeral Run Grants (THIS_RUN) tests passed!\n');
}

runTests().catch(err => {
    console.error('Run grants test failed:', err);
    process.exit(1);
});

