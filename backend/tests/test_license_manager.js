// backend/tests/test_license_manager.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, 'fixtures', 'test_license_sandbox');
const TEST_DB = path.join(TEST_DIR, 'test_license_vault.db');
const TEST_CASE = path.join(TEST_DIR, 'CIRP_ABC_TEST');

async function main() {
    console.log('=== Testing Tamper-Resistant License Manager & Anchor-Gate Model ===');

    if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_CASE, { recursive: true });

    const {
        getLicenseDb,
        checkAgentAccess,
        recordAgentTurn,
        reanchorFromNetwork,
        activateLicense,
        getLicenseStatus
    } = require('../lib/core/license-manager');

    const { generateLicenseKey } = require('../lib/utils/license-validator');

    // 1. Initial State: Fresh install starts as UNACTIVATED until KYC
    let access = checkAgentAccess(TEST_CASE, TEST_DB);
    assert.strictEqual(access.allowed, false);
    assert.strictEqual(access.status, 'UNACTIVATED');
    console.log('1a. Fresh install is correctly UNACTIVATED.');

    // Activate initial license to test working hours and tamper detection
    const initKey = generateLicenseKey({
        sub: 'Evaluation User',
        tier: 'trial',
        issued_at: new Date().toISOString(),
        valid_until: new Date(Date.now() + 30 * 86400000).toISOString(),
        max_active_hours: 150.0,
        max_agent_turns: 1000
    });
    activateLicense(initKey, TEST_CASE, TEST_DB);
    access = checkAgentAccess(TEST_CASE, TEST_DB);
    assert.strictEqual(access.allowed, true);
    assert.strictEqual(access.status, 'ACTIVE');
    console.log('1b. Activated Evaluation License is ACTIVE.');

    // 2. Accumulate Monotonic Working Hours
    recordAgentTurn(TEST_CASE, 15.5, TEST_DB); // 15.5 seconds
    let status = getLicenseStatus(TEST_DB);
    assert.strictEqual(status.turns_used, 1);
    assert.ok(status.active_hours_used > 0);
    console.log('2. Monotonic active duration recorded: ' + status.active_hours_used + ' hrs (' + status.turns_used + ' turn).');

    // 3. Test High-Water Mark Clock Rollback Detection
    // Manually force max_wall_clock 7 days into the future (simulating a future run)
    const db = getLicenseDb(TEST_DB);
    const futureTime = Date.now() + (7 * 86400000);
    db.prepare('UPDATE license_state SET max_wall_clock = ? WHERE id = 1').run(futureTime);

    // Now call checkAgentAccess when system clock is 7 days behind high-water mark
    access = checkAgentAccess(TEST_CASE, TEST_DB);
    assert.strictEqual(access.allowed, false);
    assert.strictEqual(access.status, 'TAMPERED');
    assert.ok(access.reason.includes('rollback'));
    console.log('3. Clock Rollback detected successfully! Agentic panel blocked with status: ' + access.status);

    // 4. Verify Left & Middle Panels Immunity:
    // When license is TAMPERED, ensure local RAG or file reads still work!
    const { retrieveContexts } = require('../lib/core/rag');
    const localRagResult = await retrieveContexts(TEST_CASE, 'statutory claim', 2);
    assert.ok(Array.isArray(localRagResult), 'Local RAG search must never be locked');
    console.log('4. Left & Middle Workspace Immunity verified (local RAG operates 100% unlocked).');

    // 5. Test Network Re-Anchoring Latch
    // Authoritative server timestamp from Resolution Bazaar restores state
    const serverTimestamp = futureTime + 1000;
    const reanchorRes = reanchorFromNetwork(serverTimestamp, TEST_DB);
    assert.strictEqual(reanchorRes.success, true);
    assert.strictEqual(reanchorRes.status, 'ACTIVE');

    access = checkAgentAccess(TEST_CASE, TEST_DB);
    assert.strictEqual(access.allowed, true);
    assert.strictEqual(access.status, 'ACTIVE');
    console.log('5. Network Re-anchoring successfully restored active status without client clock reliance.');

    // 6. Test Cryptographic License Activation
    const key = generateLicenseKey({
        sub: 'Senior Advocate Atul Grover',
        tier: 'enterprise_cirp',
        issued_at: new Date().toISOString(),
        valid_until: new Date(Date.now() + 365 * 86400000).toISOString(),
        max_active_hours: 300.0,
        max_agent_turns: 2500,
        allowed_domains: ['insolvency', 'legal', 'finance']
    });

    console.log('Generated Cryptographic License Token:', key.substring(0, 40) + '...');
    const actRes = activateLicense(key, TEST_CASE, TEST_DB);
    assert.strictEqual(actRes.success, true);
    assert.strictEqual(actRes.tier, 'enterprise_cirp');
    assert.strictEqual(actRes.licensee, 'Senior Advocate Atul Grover');

    status = getLicenseStatus(TEST_DB);
    assert.strictEqual(status.licensee, 'Senior Advocate Atul Grover');
    assert.strictEqual(status.tier, 'enterprise_cirp');
    assert.strictEqual(status.max_active_hours, 300.0);
    assert.strictEqual(status.max_agent_turns, 2500);
    console.log('6. Cryptographic activation verified successfully!');

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    console.log('=== All License Manager & Anchor-Gate Tests PASSED! ===');
}

main().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
