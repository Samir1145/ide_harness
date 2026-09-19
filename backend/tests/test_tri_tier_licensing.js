// backend/tests/test_tri_tier_licensing.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, 'fixtures', 'test_tri_tier_sandbox');
const TEST_DB = path.join(TEST_DIR, 'tri_tier_vault.db');
const TEST_CASE = path.join(TEST_DIR, 'CIRP_TEST_CASE');

async function runTests() {
    console.log('=== TEST SUITE: Tri-Tier Hybrid Monetization Model ===\n');

    if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_CASE, { recursive: true });

    const {
        getLicenseDb,
        checkTriTierAccess,
        checkAgentAccess,
        activateLicense,
        getLicenseStatus
    } = require('../lib/core/license-manager');
    const { generateLicenseKey } = require('../lib/utils/license-validator');
    const { PRICING_PLANS } = require('../lib/config/pricing-plans');

    // ── Test 1: Validate Pricing Plans ──────────────────────────────────────
    console.log('[Test 1] Validating Pricing Plans Schema...');
    assert.ok(PRICING_PLANS.core_starter_90d, 'core_starter_90d plan exists');
    assert.strictEqual(PRICING_PLANS.core_starter_90d.amountPaise, 100, 'Price is ₹1.00');
    assert.strictEqual(PRICING_PLANS.core_starter_90d.validityDays, 90, 'Validity is 90 days');
    assert.strictEqual(PRICING_PLANS.core_starter_90d.stage1_perpetual_dms, true, 'Stage 1 DMS is perpetual');
    assert.strictEqual(PRICING_PLANS.core_starter_90d.stage3_pay_per_use, true, 'Stage 3 is pay-per-use');
    console.log('  ✓ core_starter_90d configured: ₹1, 90-day trial, perpetual DMS');

    // ── Test 2: Fresh Install Unactivated State ─────────────────────────────
    console.log('\n[Test 2] Fresh Installation Unactivated State...');
    const freshTri = checkTriTierAccess(TEST_CASE, TEST_DB);
    assert.strictEqual(freshTri.initial_kyc_completed, false, 'KYC is not completed yet');
    assert.strictEqual(freshTri.status, 'UNACTIVATED', 'Overall status is UNACTIVATED');
    assert.strictEqual(freshTri.stage1_dms.allowed, false, 'Stage 1 DMS locked before ₹1 KYC');
    assert.strictEqual(freshTri.stage2_local.allowed, false, 'Stage 2 Local AI locked before ₹1 KYC');
    assert.strictEqual(freshTri.stage3_global.allowed, true, 'Stage 3 Global is always open (pay-per-use)');

    const agentAccessUnactivated = checkAgentAccess(TEST_CASE, TEST_DB, 'advisor');
    assert.strictEqual(agentAccessUnactivated.allowed, false);
    assert.strictEqual(agentAccessUnactivated.status, 'UNACTIVATED');

    // Stage 3 agent check is still allowed!
    const precedentAccessFresh = checkAgentAccess(TEST_CASE, TEST_DB, 'precedent');
    assert.strictEqual(precedentAccessFresh.allowed, true);
    assert.strictEqual(precedentAccessFresh.stage, 3);
    assert.strictEqual(precedentAccessFresh.payPerUse, true);
    console.log('  ✓ Unactivated gate verified: Stage 1 & 2 locked, Stage 3 pay-per-use ready');

    // ── Test 3: Activate ₹1 Token License (90-Day Pilot) ────────────────────
    console.log('\n[Test 3] Simulating ₹1 Token Verification Activation...');
    const now = Date.now();
    const expiry90d = new Date(now + 90 * 86400000).toISOString();
    const starterKey = generateLicenseKey({
        sub: 'advocate@bombayhighcourt.in',
        name: 'Advocate Sneha Deshmukh',
        tier: 'starter',
        planId: 'core_starter_90d',
        deviceId: 'TEST-MAC-UUID-001',
        issuedAt: new Date(now).toISOString(),
        expiresAt: expiry90d,
        validityDays: 90
    });

    const actResult = activateLicense(starterKey, TEST_CASE, TEST_DB);
    assert.strictEqual(actResult.success, true);
    assert.strictEqual(actResult.initial_kyc_completed, true);

    const activeTri = checkTriTierAccess(TEST_CASE, TEST_DB);
    assert.strictEqual(activeTri.initial_kyc_completed, true, 'KYC now completed');
    assert.strictEqual(activeTri.stage1_dms.allowed, true, 'Stage 1 DMS unlocked');
    assert.strictEqual(activeTri.stage1_dms.mode, 'perpetual_lifetime', 'Stage 1 is perpetual');
    assert.strictEqual(activeTri.stage2_local.allowed, true, 'Stage 2 Local AI unlocked');
    assert.strictEqual(activeTri.stage2_local.days_remaining, 90, '90 days remaining on Stage 2');
    console.log(`  ✓ Stage 1 DMS lifetime activated & Stage 2 active with ${activeTri.stage2_local.days_remaining} days remaining`);

    // ── Test 4: Simulate Stage 2 Expiration (Advancing Beyond 90 Days) ───────
    console.log('\n[Test 4] Simulating Stage 2 Expiration (After 90-Day Pilot)...');
    const db = getLicenseDb(TEST_DB);
    // Set stage2_valid_until to yesterday
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    db.prepare('UPDATE license_state SET stage2_valid_until = ?, valid_until = ? WHERE id = 1').run(yesterday, yesterday);

    const expiredTri = checkTriTierAccess(TEST_CASE, TEST_DB);
    assert.strictEqual(expiredTri.initial_kyc_completed, true, 'KYC still remembered');
    // CRITICAL: Stage 1 DMS MUST REMAIN ALLOWED FOREVER!
    assert.strictEqual(expiredTri.stage1_dms.allowed, true, 'Stage 1 DMS remains 100% active forever');
    // Stage 2 Local AI MUST BE EXPIRED
    assert.strictEqual(expiredTri.stage2_local.allowed, false, 'Stage 2 Local AI is paused');
    assert.strictEqual(expiredTri.stage2_local.status, 'EXPIRED');
    // Stage 3 Global MUST REMAIN ALLOWED
    assert.strictEqual(expiredTri.stage3_global.allowed, true, 'Stage 3 Global remains open');

    // Test checkAgentAccess behavior with expired Stage 2
    const dmsCheck = checkAgentAccess(TEST_CASE, TEST_DB, 'skeletons');
    assert.strictEqual(dmsCheck.allowed, true, 'Stage 1 deterministic drafting permitted');

    const localAiCheck = checkAgentAccess(TEST_CASE, TEST_DB, 'advisor');
    assert.strictEqual(localAiCheck.allowed, false, 'Local AI drafting paused');
    assert.strictEqual(localAiCheck.status, 'EXPIRED');
    assert.ok(localAiCheck.message.includes('Stage 2 Local Intelligence'));

    const globalPrecedentCheck = checkAgentAccess(TEST_CASE, TEST_DB, 'precedent');
    assert.strictEqual(globalPrecedentCheck.allowed, true, 'Stage 3 Precedent agent always allowed');
    assert.strictEqual(globalPrecedentCheck.payPerUse, true);

    const globalForensicCheck = checkAgentAccess(TEST_CASE, TEST_DB, 'forensic');
    assert.strictEqual(globalForensicCheck.allowed, true, 'Stage 3 Forensic agent always allowed');
    assert.strictEqual(globalForensicCheck.payPerUse, true);

    console.log('  ✓ Verified: Stage 1 DMS is PERPETUAL, Stage 2 is GATED, Stage 3 is ALWAYS-ON');

    // ── Test 5: Test AgentCoordinator Routing & Diligence Ledger Logging ────
    console.log('\n[Test 5] Testing AgentCoordinator Execution & Resolution Bazaar Ledger Logging...');
    const coordinator = require('../lib/agents/agent-coordinator');

    // Query @precedent (Stage 3) when Stage 2 is expired
    const precedentOutput = await coordinator.run(TEST_CASE, '@precedent What is the moratorium scope under Section 14?', [], 'precedent');
    assert.ok(precedentOutput, 'Received response from @precedent');

    // Verify task logged in Diligence Ledger SQLite
    const { getCaseBillingDb } = require('../lib/core/case-billing-store');
    const billingDb = getCaseBillingDb(TEST_CASE);
    const tasks = billingDb.prepare('SELECT * FROM case_billing_tasks').all();
    assert.ok(tasks.length >= 1, 'Task recorded in Diligence Ledger');
    console.log(`  ✓ Logged ${tasks.length} task(s) in Resolution Bazaar Diligence Ledger:`);
    tasks.forEach(t => console.log(`    - [${t.task_id}] ${t.tool_name} (₹${t.rate_inr}): ${t.target_name}`));

    // Clean up
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    console.log('\n=== ALL TRI-TIER HYBRID MONETIZATION TESTS PASSED! ===');
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
