// backend/tests/test_license_manager_urls.test.js
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTests() {
    console.log('=== Task 3: Testing License Manager & Settings Dashboard URLs Alignment ===\n');

    const licenseManager = require('../lib/core/license-manager');
    const settingsPath = path.join(__dirname, '../lib/assets/settings-dashboard.html');

    // [Test 3.1] Verify Settings Dashboard contains cloud portal links
    console.log('[Test 3.1] Checking settings-dashboard.html portal links...');
    assert(fs.existsSync(settingsPath), 'settings-dashboard.html must exist');
    const settingsHtml = fs.readFileSync(settingsPath, 'utf8');

    assert(
        settingsHtml.includes('https://app-apnet-net.onrender.com/dashboard/licenses'),
        'Settings dashboard must link to https://app-apnet-net.onrender.com/dashboard/licenses'
    );
    assert(
        settingsHtml.includes('https://app-apnet-net.onrender.com'),
        'Settings dashboard must reference cloud portal app-apnet-net.onrender.com'
    );
    console.log('✔ settings-dashboard.html verified with cloud portal URLs.');

    // [Test 3.2] Verify license activation error URLs
    console.log('[Test 3.2] Checking license activation failure URL payload structure...');
    delete process.env.HAYAGRIVA_PORTAL_URL;
    // Attempt activation with non-existent key to test portal URL generation
    const res = await licenseManager.activateLicenseWithCloud('HAYA-STR-NONEXISTENT-KEY-999');
    assert.strictEqual(res.success, false);
    // If network error occurred, verify message contains app-apnet-net.onrender.com
    assert(
        res.message.includes('https://app-apnet-net.onrender.com') ||
        (res.portalUrl && res.portalUrl.includes('https://app-apnet-net.onrender.com')),
        'Error or message must reference https://app-apnet-net.onrender.com'
    );
    console.log('✔ license-manager.js error reporting links correctly to https://app-apnet-net.onrender.com.');

    console.log('\n✔ ALL TESTS PASSED FOR LICENSE MANAGER & SETTINGS URL ALIGNMENT.');
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
