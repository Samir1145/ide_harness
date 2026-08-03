'use strict';

const path = require('path');
const fs = require('fs');
const { getCatalogStatus, installFromLocalPath, isItemInstalled } = require('../lib/pipeline/vault-importer');

async function testImporter() {
    console.log('[Test Marketplace] Checking catalog status...');
    const initialStatus = getCatalogStatus();
    console.log('[Catalog Initial Status]:', JSON.stringify(initialStatus, null, 2));

    const sampleZip = '/Users/atulgrover/Desktop/RBZ Vaults/output/client_vaults/dist/laws_vault_2026-W31.zip';
    if (fs.existsSync(sampleZip)) {
        console.log(`[Test Marketplace] Testing local import of "${sampleZip}"...`);
        const result = installFromLocalPath(sampleZip, 'laws_vault');
        console.log('[Import Result]:', result);

        const isInstalled = isItemInstalled('laws_vault');
        console.log(`[Item Installed Check]: laws_vault = ${isInstalled}`);
        if (!isInstalled) {
            throw new Error('Expected laws_vault to be marked as installed!');
        }
    } else {
        console.log(`[Test Marketplace Warning] Sample zip "${sampleZip}" not found, skipping extraction step.`);
    }

    console.log('✓ Marketplace Importer test passed successfully!');
}

testImporter().catch(err => {
    console.error('[Test Failed]', err);
    process.exit(1);
});
