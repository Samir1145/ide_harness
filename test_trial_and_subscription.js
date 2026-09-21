/**
 * test_trial_and_subscription.js
 * Verification suite for:
 * 1. Hayagriva Pro Annual Plan (₹25,000 / 365 Days / 7-Day Trial)
 * 2. Perpetual Free Workbench (Stage 1 DMS / Ingestion / Monaco)
 * 3. 7-Day Free Trial Lifecycle (Voluntary Start -> Active -> Hard Expiration on Day 8)
 * 4. Double-Trial Prevention on Same Device
 * 5. Full License Activation (365 Days Pro)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

async function runTestSuite() {
  console.log('================================================================');
  console.log('  TEST SUITE: Zero-Friction Workbench & 7-Day Trial System');
  console.log('================================================================\n');

  // ── TEST 1: Pricing Plans Configuration ──────────────────────────────
  console.log('[Test 1] Validating Pricing Plans Configuration...');
  const { PRICING_PLANS, TRIAL_DURATION_DAYS, buildOrderNotes } = require('./backend/lib/config/pricing-plans');
  assert.strictEqual(TRIAL_DURATION_DAYS, 7, 'Trial duration must be 7 days');
  
  const proPlan = PRICING_PLANS.hayagriva_pro_annual;
  assert.ok(proPlan, 'hayagriva_pro_annual plan must exist');
  assert.strictEqual(proPlan.amountPaise, 2500000, 'Price must be 2,500,000 paise (₹25,000.00)');
  assert.strictEqual(proPlan.validityDays, 365, 'Validity must be 365 days');
  assert.strictEqual(proPlan.trialDays, 7, 'Trial days must be 7');
  console.log('  ✓ hayagriva_pro_annual configured: ₹25,000 / 365 days / 7-day trial');

  // ── TEST 2: Free Workbench Out-of-the-Box ────────────────────────────
  console.log('\n[Test 2] Validating Out-of-the-Box Zero-Friction State...');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hayagriva_lic_test_'));
  const testDbPath = path.join(tempDir, 'test_vault.db');

  const {
    checkTriTierAccess,
    checkAgentAccess,
    startTrial,
    getLicenseStatus,
    activateLicense
  } = require('./backend/lib/core/license-manager');

  const initialTri = checkTriTierAccess('', testDbPath);
  assert.strictEqual(initialTri.stage1_dms.allowed, true, 'Stage 1 DMS must be allowed out-of-the-box');
  assert.strictEqual(initialTri.stage1_dms.mode, 'perpetual_free', 'Stage 1 must be perpetual_free');
  assert.strictEqual(initialTri.stage2_local.allowed, false, 'Stage 2 Agents must be locked before trial/payment');
  assert.strictEqual(initialTri.stage2_local.status, 'TRIAL_AVAILABLE', 'Status must be TRIAL_AVAILABLE');
  assert.strictEqual(initialTri.trial_available, true, 'Trial must be available');
  assert.strictEqual(initialTri.in_trial, false, 'User must not be in trial yet');

  const dmsAccess = checkAgentAccess('', testDbPath, 'dms');
  assert.strictEqual(dmsAccess.allowed, true, 'DMS/Monaco operations must be allowed for free');

  const agentAccessPreTrial = checkAgentAccess('', testDbPath, '@Advisor');
  assert.strictEqual(agentAccessPreTrial.allowed, false, 'Agents must be gated before trial');
  assert.strictEqual(agentAccessPreTrial.status, 'TRIAL_AVAILABLE');
  console.log('  ✓ Stage 1 Free Workbench is 100% active with zero upfront KYC/payment');
  console.log('  ✓ Agents are properly gated with status TRIAL_AVAILABLE');

  // ── TEST 3: Start 7-Day Free Trial (Voluntary Click) ─────────────────
  console.log('\n[Test 3] Testing Voluntary Trial Start (7 Days)...');
  const trialResult = startTrial(7, testDbPath);
  assert.strictEqual(trialResult.success, true, 'startTrial must succeed');
  assert.strictEqual(trialResult.days_remaining, 7, 'Must have 7 days remaining');

  const inTrialTri = checkTriTierAccess('', testDbPath);
  assert.strictEqual(inTrialTri.stage2_local.allowed, true, 'Stage 2 Agents must be unlocked during trial');
  assert.strictEqual(inTrialTri.stage2_local.status, 'ACTIVE');
  assert.strictEqual(inTrialTri.stage2_local.mode, 'trial');
  assert.strictEqual(inTrialTri.in_trial, true);

  const agentAccessInTrial = checkAgentAccess('', testDbPath, '@Document');
  assert.strictEqual(agentAccessInTrial.allowed, true, 'Agents must execute during trial');
  console.log('  ✓ 7-Day trial successfully started and all agents unlocked');

  // ── TEST 4: Double-Trial Prevention (Same Device) ───────────────────
  console.log('\n[Test 4] Testing Anti-Abuse (Preventing Multiple Trials on Same Device)...');
  const secondTrial = startTrial(7, testDbPath);
  assert.strictEqual(secondTrial.success, false, 'Second trial activation must be rejected');
  assert.strictEqual(secondTrial.expired, true);
  console.log('  ✓ Re-activating trial on the same device correctly rejected');

  // ── TEST 5: Hard-Gate on Trial Expiration (Day 8) ───────────────────
  console.log('\n[Test 5] Simulating Trial Expiration (Day 8 Hard Gate)...');
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(testDbPath);
  // Set trial_expires_at to 1 hour in the past
  const pastIso = new Date(Date.now() - 3600000).toISOString();
  db.prepare('UPDATE license_state SET trial_expires_at = ?, stage2_valid_until = ? WHERE id = 1')
    .run(pastIso, pastIso);

  const expiredTri = checkTriTierAccess('', testDbPath);
  assert.strictEqual(expiredTri.stage1_dms.allowed, true, 'Stage 1 Workbench MUST remain 100% free after trial');
  assert.strictEqual(expiredTri.stage2_local.allowed, false, 'Stage 2 Agents must be hard-blocked');
  assert.strictEqual(expiredTri.stage2_local.status, 'TRIAL_EXPIRED');

  const agentAccessExpired = checkAgentAccess('', testDbPath, '@Forms');
  assert.strictEqual(agentAccessExpired.allowed, false, 'Agent execution must be blocked on Day 8');
  assert.strictEqual(agentAccessExpired.status, 'TRIAL_EXPIRED');
  console.log('  ✓ Day 8 hard-gate active: agents blocked, free workbench remains completely intact');

  // ── TEST 6: Full Subscription Activation (₹25,000 / 365 Days) ───────
  console.log('\n[Test 6] Testing Hayagriva Pro 365-Day Subscription Activation...');
  const { generateLicenseKey } = require('./backend/lib/utils/license-validator');
  const expiry365 = new Date(Date.now() + 365 * 86400000).toISOString();
  const testLicense = generateLicenseKey({
    sub: 'rajesh@sharmachambers.in',
    name: 'Advocate Rajesh Sharma',
    tier: 'pro',
    planId: 'hayagriva_pro_annual',
    amountPaid: 2500000,
    expiresAt: expiry365
  });

  const actResult = activateLicense(testLicense, '', testDbPath);
  assert.strictEqual(actResult.success, true, 'License activation must succeed');

  const subTri = checkTriTierAccess('', testDbPath);
  assert.strictEqual(subTri.is_subscribed, true);
  assert.strictEqual(subTri.stage2_local.allowed, true);
  assert.strictEqual(subTri.stage2_local.mode, 'annual_pro');
  assert.ok(subTri.stage2_local.days_remaining >= 364);

  const agentAccessSubscribed = checkAgentAccess('', testDbPath, '@Advisor');
  assert.strictEqual(agentAccessSubscribed.allowed, true);
  console.log('  ✓ Pro subscription successfully verified: 365 days of full intelligence unlocked');

  // Clean up test vault
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}

  console.log('\n================================================================');
  console.log('  ALL 6 SUITE TESTS PASSED PERFECTLY (100% SUCCESS)');
  console.log('================================================================\n');
}

runTestSuite().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
