// backend/tests/test_portal_license_handshake.test.js
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getLicenseDb, activateLicense, checkAgentAccess } = require('../lib/core/license-manager');
const { validateLicenseEnvelope } = require('../lib/utils/license-validator');

// Create test isolated vault
const testDir = path.join(__dirname, 'fixtures', 'test_portal_handshake');
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
const testDbPath = path.join(testDir, 'test_vault.db');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

const db = getLicenseDb(testDbPath);

// 1. Generate a valid portal-signed offline token
const crypto = require('crypto');
const secret = 'hayagriva_sovereign_chamber_secret_key_2026';
const payload = {
    sub: 'advocate.atulgrover@chambers.in',
    licenseKey: 'HAYA-STR-ABC12345',
    hardwareFingerprint: 'MAC-778899001122',
    tier: 'starter',
    planTier: 'starter',
    valid_until: new Date(Date.now() + 365 * 86400000).toISOString(),
    expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
    issued_at: new Date().toISOString()
};

const pB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
const sigB64 = crypto.createHmac('sha256', secret).update(pB64).digest('base64url');
const signedOfflineToken = `${pB64}.${sigB64}`;

// 2. Activate in test vault
const actResult = activateLicense(signedOfflineToken, '', testDbPath);
assert.strictEqual(actResult.success, true, 'Direct offline token activation should succeed');
assert.strictEqual(actResult.tier, 'starter');
assert.strictEqual(actResult.licensee, 'advocate.atulgrover@chambers.in');

// 3. Verify agent access is now unlocked in stage 2
const access = checkAgentAccess('', testDbPath, '@advisor');
assert.strictEqual(access.allowed, true, '@Advisor agent must now be allowed after activation');

console.log('✓ Task 2: Portal offline token activation and agent access unlock verified');
