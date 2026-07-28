const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vaultLoader = require('../lib/utils/vault-loader');

const VAULT_DIR = path.join(__dirname, '..', 'vault');
const OVERLAYS_DIR = path.join(VAULT_DIR, 'user_overlays');
const TEMP_OVERLAY_PATH = path.join(OVERLAYS_DIR, 'mock_unit_test_overlay.json');

async function run() {
    console.log('[User-Space Law Overlays Unit Tests]');

    // Ensure overlays directory exists
    if (!fs.existsSync(OVERLAYS_DIR)) {
        fs.mkdirSync(OVERLAYS_DIR, { recursive: true });
    }

    // Define a mock overlay section to inject
    const mockOverride = {
        id: 'ica/sec1',
        title: 'Indian Contract Act Section 1 Custom Override',
        section: '1',
        text: 'The custom override text of Indian Contract Act Section 1 containing uniqueKeywordsForSearch.'
    };

    // Write mock overlay file to user_overlays/
    fs.writeFileSync(TEMP_OVERLAY_PATH, JSON.stringify([mockOverride]), 'utf8');
    console.log(`  -> Created mock overlay JSON at: ${TEMP_OVERLAY_PATH}`);

    // Mock Process env key to satisfy vault checks during tests
    const originalKey = process.env.VAULT_KEY;
    if (!process.env.VAULT_KEY) {
        process.env.VAULT_KEY = 'a'.repeat(64); // mock 64-char hex key
    }

    // Mock manifest.json presence if it doesn't exist (to pass loadVault validation)
    const manifestPath = path.join(VAULT_DIR, 'manifest.json');
    let dummyManifestCreated = false;
    if (!fs.existsSync(manifestPath)) {
        fs.writeFileSync(manifestPath, JSON.stringify([]), 'utf8');
        dummyManifestCreated = true;
    }

    // Mock laws.vlt.data presence if it doesn't exist
    const dataPath = path.join(VAULT_DIR, 'laws.vlt.data');
    let dummyDataCreated = false;
    if (!fs.existsSync(dataPath)) {
        fs.writeFileSync(dataPath, 'dummy data', 'utf8');
        dummyDataCreated = true;
    }

    try {
        console.log('  -> Triggering vault load with custom overlays active...');
        const success = vaultLoader.loadVault();
        assert.ok(success, 'loadVault should return true with keys and manifest mocked');
        assert.ok(vaultLoader.isVaultReady(), 'Vault should report isVaultReady === true');

        // Test 1: getLawText returns the override directly
        console.log('  -> Verifying getLawText bypasses decryption and returns custom overlay text...');
        const text = vaultLoader.getLawText('ica/sec1');
        assert.strictEqual(text, mockOverride.text, 'getLawText should return the custom override text verbatim');

        // Test 2: searchLaws finds the custom section using custom search index scoping
        console.log('  -> Verifying searchLaws is able to query and retrieve custom overlay sections...');
        
        // Define clean custom index matching our override tokens with dummy vector to satisfy similarity calculations
        const customIndex = [{
            id: 'ica/sec1',
            title: mockOverride.title,
            section: mockOverride.section,
            tokens: ['uniquekeywordsforsearch'],
            vector: new Array(384).fill(0.05),
            offset: -1,
            length: -1
        }];

        // Repeat search terms to guarantee BM25 score goes above the noise threshold filters
        const searchTerms = new Array(15).fill('uniqueKeywordsForSearch').join(' ');
        const results = await vaultLoader.searchLaws(searchTerms, 5, customIndex);
        
        assert.ok(results.length > 0, 'Search should find the custom overlay section');
        const found = results.find(r => r.id === 'ica/sec1');
        assert.ok(found, 'Search results should contain ica/sec1');
        assert.strictEqual(found.title, mockOverride.title, 'Search result should match custom title');
        assert.strictEqual(found.text, mockOverride.text, 'Search result should match custom text');

        console.log('     ✓ Decryption bypass and keyword searching verified successfully.');

    } finally {
        // Cleanup temporary files
        if (fs.existsSync(TEMP_OVERLAY_PATH)) {
            fs.unlinkSync(TEMP_OVERLAY_PATH);
            console.log('  -> Cleaned up mock overlay JSON.');
        }
        if (dummyManifestCreated && fs.existsSync(manifestPath)) {
            fs.unlinkSync(manifestPath);
        }
        if (dummyDataCreated && fs.existsSync(dataPath)) {
            fs.unlinkSync(dataPath);
        }
        process.env.VAULT_KEY = originalKey;
    }

    console.log('  ✓ SUCCESS: User-Space Law Overlays validations completed!');
}

module.exports = { run };
