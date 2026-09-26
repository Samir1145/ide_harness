const assert = require('assert');
const path = require('path');
const fs = require('fs');
const lifecycleManager = require('../lib/core/lifecycle-manager');
const { MatterLifecycleManager, MatterScope } = lifecycleManager;
const sqliteStore = require('../lib/core/sqlite-store');

async function run() {
    console.log('--- Testing Matter Lifecycle Manager (Modification 3) ---');

    const testDirA = path.join(__dirname, 'fixtures', 'test_matter_A_' + Date.now());
    const testDirB = path.join(__dirname, 'fixtures', 'test_matter_B_' + Date.now());
    fs.mkdirSync(path.join(testDirA, 'concepts'), { recursive: true });
    fs.mkdirSync(path.join(testDirB, 'concepts'), { recursive: true });

    try {
        const mgr = new MatterLifecycleManager();

        // 1. Test Scope Creation and Effect Registration
        console.log('1. Registering effects on Matter A scope...');
        const scopeA = mgr.getScope(testDirA);
        assert.ok(scopeA instanceof MatterScope);

        const executionOrder = [];

        scopeA.registerEffect(() => {
            executionOrder.push('effect_1_opened_first');
        }, 'effect_1');

        scopeA.registerEffect(() => {
            executionOrder.push('effect_2_opened_second');
        }, 'effect_2');

        let timerFired = false;
        const timerId = setTimeout(() => { timerFired = true; }, 10000);
        scopeA.registerTimer(timerId, 'test_timer');

        let watcherClosed = false;
        const fakeWatcher = {
            close: async () => { watcherClosed = true; }
        };
        scopeA.registerWatcher(fakeWatcher, 'test_watcher');

        // Open an SQLite connection for Matter A
        const dbA = sqliteStore.getDb(testDirA);
        assert.ok(dbA, 'SQLite DB for Matter A should be open');

        assert.strictEqual(scopeA.effectsCount, 4);

        // 2. Test LIFO Disposal
        console.log('2. Disposing Matter A scope and verifying LIFO order...');
        await scopeA.dispose();

        assert.strictEqual(watcherClosed, true, 'Watcher must be closed');
        assert.strictEqual(timerFired, false, 'Timer must be cancelled before firing');
        assert.strictEqual(executionOrder.length, 2);
        // LIFO order: effect_2 (registered 2nd) runs before effect_1 (registered 1st)
        assert.strictEqual(executionOrder[0], 'effect_2_opened_second');
        assert.strictEqual(executionOrder[1], 'effect_1_opened_first');
        assert.strictEqual(scopeA.disposed, true);

        // 3. Test Clean Matter Switching
        console.log('3. Testing switchMatter from Matter A to Matter B...');
        const scopeA_new = mgr.getScope(testDirA);
        let scopeA_teardown = false;
        scopeA_new.registerEffect(() => { scopeA_teardown = true; }, 'scopeA_marker');

        const switchResult = await mgr.switchMatter(testDirA, testDirB);
        assert.strictEqual(switchResult.success, true);
        assert.strictEqual(switchResult.previous_matter, path.basename(testDirA));
        assert.strictEqual(switchResult.active_matter, path.basename(testDirB));
        assert.strictEqual(scopeA_teardown, true, 'Matter A effects must be cleanly torn down on switch');

        const activeMatter = mgr.getActiveMatter();
        assert.strictEqual(activeMatter, path.resolve(testDirB));

        // 4. Test Error Resilience in Effects
        console.log('4. Testing error resilience during scope disposal...');
        const scopeB = mgr.getScope(testDirB);
        let postErrorEffectRan = false;

        scopeB.registerEffect(() => { postErrorEffectRan = true; }, 'good_effect');
        scopeB.registerEffect(() => { throw new Error('Simulated cleanup failure'); }, 'faulty_effect');

        await scopeB.dispose();
        assert.strictEqual(postErrorEffectRan, true, 'Remaining effects must still execute after an error');

        // 5. Test Teardown All
        console.log('5. Testing teardownAll()...');
        const scope1 = mgr.getScope(testDirA);
        const scope2 = mgr.getScope(testDirB);
        let allTornDown = 0;
        scope1.registerEffect(() => { allTornDown++; }, 's1');
        scope2.registerEffect(() => { allTornDown++; }, 's2');

        await mgr.teardownAll();
        assert.strictEqual(allTornDown, 2);
        assert.strictEqual(mgr.getStatus().total_active_scopes, 0);

        console.log('✅ All MatterLifecycleManager tests passed cleanly!');
        return true;
    } finally {
        try {
            fs.rmSync(testDirA, { recursive: true, force: true });
            fs.rmSync(testDirB, { recursive: true, force: true });
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
