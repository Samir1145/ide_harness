const assert = require('assert');
const fs = require('fs');
const path = require('path');
const policyGuard = require('../lib/security/policy_guard');
const { PolicyGuard, HARD_FLOORS, splitCompoundCommand, extractExecutableName } = policyGuard;
const inboxManager = require('../lib/agents/inbox-manager');
const auditTrail = require('../lib/core/audit_trail');

async function run() {
    console.log('--- Testing Policy Guard & Hard Floors (Modification 4) ---');

    const testDir = path.join(__dirname, 'fixtures', 'test_policy_case_' + Date.now());
    const reviewsDir = path.join(testDir, 'reviews');
    const draftsDir = path.join(testDir, 'drafts');
    const dossierDir = path.join(testDir, '01_dossier');
    fs.mkdirSync(reviewsDir, { recursive: true });
    fs.mkdirSync(draftsDir, { recursive: true });
    fs.mkdirSync(dossierDir, { recursive: true });

    try {
        const guard = new PolicyGuard();

        // 1. Test Hard Floor 1: Mutating Verified Key
        console.log('1. Testing Hard Floor 1: KV Verified Key Protection...');
        const kvPath = path.join(reviewsDir, 'case_kv_dictionary.json');
        const initialKv = {
            unverified_key: { value: 'Old Value', verified_by_user: 0 },
            corporate_debtor: { value: 'Zenith Metals Ltd', verified_by_user: 1 }
        };
        fs.writeFileSync(kvPath, JSON.stringify(initialKv, null, 2), 'utf8');

        // Unverified key mutation should be ALLOWED
        const unverifiedRes = guard.checkKvMutation(testDir, 'unverified_key', 'New Value');
        assert.strictEqual(unverifiedRes.allowed, true);

        // Verified key with identical value should be ALLOWED
        const verifiedSameRes = guard.checkKvMutation(testDir, 'corporate_debtor', 'Zenith Metals Ltd');
        assert.strictEqual(verifiedSameRes.allowed, true);

        // Verified key mutation with changed value must be BLOCKED
        const verifiedChangeRes = guard.checkKvMutation(testDir, 'corporate_debtor', 'Malicious Rename Ltd');
        assert.strictEqual(verifiedChangeRes.allowed, false);
        assert.strictEqual(verifiedChangeRes.hardFloor, HARD_FLOORS.MUTATE_VERIFIED_KEY);
        console.log('   Correctly blocked verified key mutation:', verifiedChangeRes.reason);

        // 2. Test Hard Floor 2: Draft Overwrite Protection
        console.log('2. Testing Hard Floor 2: Draft Overwrite Protection...');
        const draftPath = path.join(draftsDir, 'Notice_of_Ineligibility.md');
        fs.writeFileSync(draftPath, '# Original Draft Pleading\n', 'utf8');

        // Writing to non-existent draft should be ALLOWED
        const newDraftRes = guard.checkDraftOverwrite(testDir, 'drafts/New_Pleading.md');
        assert.strictEqual(newDraftRes.allowed, true);

        // Overwriting existing draft must be BLOCKED
        const overwriteRes = guard.checkDraftOverwrite(testDir, 'drafts/Notice_of_Ineligibility.md');
        assert.strictEqual(overwriteRes.allowed, false);
        assert.strictEqual(overwriteRes.hardFloor, HARD_FLOORS.OVERWRITE_DRAFT);
        console.log('   Correctly blocked existing draft overwrite:', overwriteRes.reason);

        // 3. Test Hard Floor 3: External Network Call Outside Localhost
        console.log('3. Testing Hard Floor 3: Strict Air-Gap Network Egress...');
        // Localhost calls allowed
        const localCall1 = guard.checkNetworkDispatch('http://localhost:3210/api/status');
        assert.strictEqual(localCall1.allowed, true);
        const localCall2 = guard.checkNetworkDispatch('http://127.0.0.1:4000/api/report');
        assert.strictEqual(localCall2.allowed, true);

        // Remote egress without authorization must be BLOCKED
        const remoteCall = guard.checkNetworkDispatch('https://api.external-cloud.com/v1/extract');
        assert.strictEqual(remoteCall.allowed, false);
        assert.strictEqual(remoteCall.hardFloor, HARD_FLOORS.EXTERNAL_NETWORK);
        console.log('   Correctly blocked external network call:', remoteCall.reason);

        // Remote egress with human authorization should be ALLOWED
        const authRemoteCall = guard.checkNetworkDispatch('https://api.external-cloud.com/v1/extract', { humanAuthorized: true });
        assert.strictEqual(authRemoteCall.allowed, true);

        // 4. Test Hard Floor 5: Compound Commands & Blacklisted Arg-Executors
        console.log('4. Testing Hard Floor 5: Arg-Executors & Command Splitting...');
        const splitTokens = splitCompoundCommand('cat input.txt | xargs rm -rf && echo "done"');
        assert.strictEqual(splitTokens.length, 3);
        assert.strictEqual(splitTokens[0], 'cat input.txt');
        assert.strictEqual(splitTokens[1], 'xargs rm -rf');
        assert.strictEqual(splitTokens[2], 'echo "done"');

        // Safe command should be ALLOWED
        const safeCmd = guard.checkShellCommand('git status && ls -l');
        assert.strictEqual(safeCmd.allowed, true);

        // Commands with xargs, sudo, or npx must be BLOCKED
        const xargsCmd = guard.checkShellCommand('find . -name "*.tmp" | xargs rm');
        assert.strictEqual(xargsCmd.allowed, false);
        assert.strictEqual(xargsCmd.hardFloor, HARD_FLOORS.BLACKLISTED_ARG_EXECUTOR);
        assert.strictEqual(xargsCmd.blockedExecutable, 'xargs');

        const sudoCmd = guard.checkShellCommand('echo "test" && sudo reboot');
        assert.strictEqual(sudoCmd.allowed, false);
        assert.strictEqual(sudoCmd.blockedExecutable, 'sudo');

        const npxCmd = guard.checkShellCommand('npx some-package');
        assert.strictEqual(npxCmd.allowed, false);
        assert.strictEqual(npxCmd.blockedExecutable, 'npx');
        console.log('   Correctly blocked arg-executors (xargs, sudo, npx).');

        // 5. Test Composite Evaluation with Auto-Inbox & Audit Trail Routing
        console.log('5. Testing Composite evaluate() with Inbox & Audit Trail Routing...');
        const evalRes = await guard.evaluate(testDir, {
            type: 'KV_MUTATION',
            key: 'corporate_debtor',
            value: 'Unauthorized Mutation'
        });

        assert.strictEqual(evalRes.allowed, false);
        assert.strictEqual(evalRes.blocked, true);
        assert.ok(evalRes.inboxItem, 'Must automatically generate an Inbox Item');
        assert.strictEqual(evalRes.inboxItem.riskClass, HARD_FLOORS.MUTATE_VERIFIED_KEY);

        // Verify inbox item was saved to disk
        const inboxData = inboxManager.loadInbox(testDir);
        assert.ok(inboxData.items.some(i => i.id === evalRes.inboxItem.id));
        console.log(`   Case Inbox item created: ${evalRes.inboxItem.id}`);

        // Verify audit trail recorded HARD_FLOOR_INTERCEPTED
        const auditVerify = auditTrail.verifyChain(testDir);
        assert.strictEqual(auditVerify.valid, true);
        assert.ok(auditVerify.total_entries >= 1);
        const { entries } = auditTrail.readEntries(testDir);
        const interceptedEntry = entries.find(e => e.event === 'HARD_FLOOR_INTERCEPTED');
        assert.ok(interceptedEntry, 'Audit trail must contain HARD_FLOOR_INTERCEPTED event');
        console.log('   Audit trail successfully sealed intercepted event with SHA-256.');

        console.log('✅ All Policy Guard & Hard Floor tests passed cleanly!');
        return true;
    } finally {
        try {
            fs.rmSync(testDir, { recursive: true, force: true });
        } catch (_) {}
    }
}

if (require.main === module) {
    run().catch(err => {
        console.error('❌ Test failed:', err);
        process.exit(1);
    });
}

module.exports = { run };
