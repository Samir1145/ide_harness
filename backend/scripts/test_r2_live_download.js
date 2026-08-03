'use strict';

const path = require('path');
const fs = require('fs');
const { downloadAndInstall, getCatalogStatus } = require('../lib/pipeline/vault-importer');

async function runLiveDownloadTest() {
    const targetDir = path.join(__dirname, '..', 'vault', 'agent_packs', 'coding_agents.vlt');

    console.log(`[R2 Live Download Test] Removing target directory to simulate fresh install: ${targetDir}`);
    if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
    }

    console.log('[R2 Live Download Test] Triggering 1-Click R2 Download for "coding_agents.vlt"...');
    await downloadAndInstall('coding_agents.vlt');

    // Poll status until completion
    await new Promise((resolve, reject) => {
        const interval = setInterval(() => {
            const status = getCatalogStatus()['coding_agents.vlt'];
            console.log(` - Progress: ${status.progressPct}% | Status: ${status.status}`);

            if (status.status === 'completed' || status.status === 'installed') {
                clearInterval(interval);
                resolve();
            } else if (status.status === 'error') {
                clearInterval(interval);
                reject(new Error(`Download error: ${status.error}`));
            }
        }, 300);
    });

    console.log(`[R2 Live Download Test] Checking extracted files in "${targetDir}"...`);
    const files = fs.readdirSync(targetDir);
    console.log(` - Found ${files.length} items in extracted pack:`, files.slice(0, 5));

    console.log('✓ R2 Live Download & Extraction verified successfully!');
}

runLiveDownloadTest().catch(err => {
    console.error('[Test Failed]', err);
    process.exit(1);
});
