// backend/tests/test_frontend_auth_links.test.js
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTests() {
    console.log('=== Task 4: Testing Frontend UI Portal Links Integrity ===\n');

    const authModalPath = path.join(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/auth-modal.ts');
    const profileWidgetPath = path.join(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/profile-widget.ts');
    const commandsPath = path.join(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/commands.ts');

    assert(fs.existsSync(authModalPath), 'auth-modal.ts must exist');
    assert(fs.existsSync(profileWidgetPath), 'profile-widget.ts must exist');
    assert(fs.existsSync(commandsPath), 'commands.ts must exist');

    const authModalContent = fs.readFileSync(authModalPath, 'utf8');
    const profileWidgetContent = fs.readFileSync(profileWidgetPath, 'utf8');
    const commandsContent = fs.readFileSync(commandsPath, 'utf8');

    // 1. AuthModal Links
    console.log('[Test 4.1] Checking auth-modal.ts links to https://app-apnet-net.onrender.com...');
    assert(authModalContent.includes('https://app-apnet-net.onrender.com/login'), 'AuthModal must link to /login');
    assert(authModalContent.includes('https://app-apnet-net.onrender.com/register'), 'AuthModal must link to /register');
    assert(authModalContent.includes('https://app-apnet-net.onrender.com/dashboard/licenses'), 'AuthModal must link to /dashboard/licenses');
    console.log('✔ AuthModal links verified (/login, /register, /dashboard/licenses).');

    // 2. ProfileWidget Links
    console.log('[Test 4.2] Checking profile-widget.ts portal links...');
    assert(profileWidgetContent.includes('https://app-apnet-net.onrender.com'), 'ProfileWidget must link to app-apnet-net.onrender.com');
    console.log('✔ ProfileWidget links verified.');

    // 3. Commands.ts Links
    console.log('[Test 4.3] Checking commands.ts portal links...');
    assert(commandsContent.includes('https://app-apnet-net.onrender.com/dashboard/licenses'), 'commands.ts must link to dashboard/licenses');
    console.log('✔ commands.ts links verified.');

    console.log('\n✔ ALL TESTS PASSED FOR FRONTEND UI PORTAL LINKS INTEGRITY.');
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
