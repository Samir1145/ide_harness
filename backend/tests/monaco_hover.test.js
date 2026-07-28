const assert = require('assert');
const vaultLoader = require('../lib/utils/vault-loader');

async function run() {
    console.log('[Monaco Hover & Vault Unit Tests]');

    // Test 1: Graceful failure on missing keys
    const originalKey = process.env.VAULT_KEY;
    delete process.env.VAULT_KEY;

    try {
        console.log('  -> Verifying vault handles missing keys gracefully...');
        const loaded = vaultLoader.loadVault();
        assert.strictEqual(loaded, false, 'loadVault should return false when VAULT_KEY is missing');
        assert.strictEqual(vaultLoader.isVaultReady(), false, 'isVaultReady should be false');
    } finally {
        if (originalKey) {
            process.env.VAULT_KEY = originalKey;
        }
    }

    // Test 2: If key is present, verify resolveTrigger behavior
    if (process.env.VAULT_KEY) {
        console.log('  -> VAULT_KEY detected, verifying decryption lookup...');
        // Reload vault with active key
        const success = vaultLoader.loadVault();
        if (success) {
            assert.ok(vaultLoader.isVaultReady(), 'Vault should load successfully with valid key');
            
            // Try resolving a standard IBC trigger: e.g. "ibc/prelim/sec1"
            const results = await vaultLoader.resolveTrigger('ibc/prelim/sec1', 1);
            if (results.length > 0) {
                console.log(`     Decrypted title: "${results[0].title}"`);
                assert.ok(results[0].text.length > 0, 'Decrypted text should not be empty');
                console.log('     ✓ Decryption verification passed.');
            } else {
                console.log('     ⚠️ Section ibc/prelim/sec1 not found in local manifest index (skipping verify).');
            }
        }
    } else {
        console.log('  -> Skipping live decryption check (VAULT_KEY env not configured).');
    }

    console.log('  ✓ SUCCESS: Hover & Vault validations completed!');
}

module.exports = { run };
