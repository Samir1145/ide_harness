// backend/tests/test_full_licensing_lifecycle.test.js
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
    getLicenseDb,
    checkAgentAccess,
    checkTriTierAccess,
    activateLicense,
    startTrial,
    getLicenseStatus
} = require('../lib/core/license-manager');
const { validateLicenseEnvelope } = require('../lib/utils/license-validator');
const { getMachineId } = require('../lib/utils/machine-fingerprint');

const testDir = path.join(__dirname, 'fixtures', 'test_lifecycle_vault');
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
const testDbPath = path.join(testDir, 'lifecycle_vault.db');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

const secret = 'hayagriva_sovereign_chamber_secret_key_2026';
const currentMachine = getMachineId();

console.log('─── Phase 1: Unactivated Initial State ───');
const db = getLicenseDb(testDbPath);
const tri1 = checkTriTierAccess('', testDbPath);
assert.strictEqual(tri1.stage1_dms.allowed, true, 'Stage 1 DMS must be perpetual free');
assert.strictEqual(tri1.stage2_local.allowed, false, 'Stage 2 local agents must be gated initially');
assert.strictEqual(tri1.trial_available, true, '7-day trial must be available');

const agentDms = checkAgentAccess('', testDbPath, '@dms');
assert.strictEqual(agentDms.allowed, true, '@DMS must be allowed free');

const agentAdvisor = checkAgentAccess('', testDbPath, '@advisor');
assert.strictEqual(agentAdvisor.allowed, false, '@Advisor must be gated');
assert.strictEqual(agentAdvisor.status, 'TRIAL_AVAILABLE');
console.log('✓ Phase 1 Passed: Free core open, AI agents gated');

console.log('─── Phase 2: 2-Part Cloud Token Activation (<payload>.<sig>) ───');
const payload2 = {
    sub: 'advocate.atul@groverlaw.in',
    licenseKey: 'HAYA-STR-8899AABB',
    hardwareFingerprint: currentMachine,
    tier: 'starter',
    planTier: 'starter',
    valid_until: new Date(Date.now() + 365 * 86400000).toISOString(),
    expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
    issued_at: new Date().toISOString()
};

const pB64 = Buffer.from(JSON.stringify(payload2)).toString('base64url');
const sigB64 = crypto.createHmac('sha256', secret).update(pB64).digest('base64url');
const token2Part = `${pB64}.${sigB64}`;

const valRes2 = validateLicenseEnvelope(token2Part);
assert.strictEqual(valRes2.valid, true, '2-part token envelope must be valid');
assert.strictEqual(valRes2.tier, 'starter');

const actRes2 = activateLicense(token2Part, '', testDbPath);
assert.strictEqual(actRes2.success, true, 'License activation in SQLite vault must succeed');
assert.strictEqual(actRes2.licensee, 'advocate.atul@groverlaw.in');
assert.strictEqual(actRes2.tier, 'starter');

const tri2 = checkTriTierAccess('', testDbPath);
assert.strictEqual(tri2.stage2_local.allowed, true, 'Stage 2 agents must now be unlocked');
assert.strictEqual(tri2.is_subscribed, true);

const agentAdvisorAfter = checkAgentAccess('', testDbPath, '@advisor');
assert.strictEqual(agentAdvisorAfter.allowed, true, '@Advisor agent must now be permitted');
console.log('✓ Phase 2 Passed: 2-Part cloud token unlocks chamber');

console.log('─── Phase 3: 3-Part Legacy Envelope Activation (HAYG.<payload>.<sig>) ───');
const payload3 = {
    sub: 'enterprise.counsel@chambers.in',
    licenseKey: 'HAYA-ENT-11223344',
    tier: 'enterprise',
    valid_until: new Date(Date.now() + 365 * 86400000).toISOString()
};
const pB64_3 = Buffer.from(JSON.stringify(payload3)).toString('base64url');
const sigB64_3 = crypto.createHmac('sha256', secret).update(pB64_3).digest('base64url');
const token3Part = `HAYG.${pB64_3}.${sigB64_3}`;

const actRes3 = activateLicense(token3Part, '', testDbPath);
assert.strictEqual(actRes3.success, true);
assert.strictEqual(actRes3.tier, 'enterprise');
assert.strictEqual(actRes3.licensee, 'enterprise.counsel@chambers.in');
console.log('✓ Phase 3 Passed: 3-Part legacy envelope backwards compatibility confirmed');

console.log('─── Phase 4: Full Diagnostic Status Verification ───');
const status = getLicenseStatus(testDbPath);
assert.strictEqual(status.licensee, 'enterprise.counsel@chambers.in');
assert.strictEqual(status.tier, 'enterprise');
assert.strictEqual(status.is_subscribed, true);
assert.strictEqual(status.workbench_free, true);
console.log('✓ Phase 4 Passed: Full diagnostic telemetry confirmed');

console.log('\n======================================================');
console.log('🎉 ALL 4 PHASES PASSED: END-TO-END LICENSING VERIFIED');
console.log('======================================================');
