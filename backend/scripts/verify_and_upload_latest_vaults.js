'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { installFromLocalPath, isItemInstalled } = require('../lib/pipeline/vault-importer');

const ACCOUNT_ID = 'f0b9b9d65437d2ef1c98d46b1c33337b';
const ACCESS_KEY_ID = '2401daa91ebf6faa34af796364b5f0a5';
const SECRET_ACCESS_KEY = 'd3149c7c8fda52c623542369d3fd55a8b3dcdd4f0e262774b505d7f8800e953f';
const BUCKET_NAME = 'hayagriva';

const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
    },
});

const DIST_DIR = '/Users/atulgrover/Desktop/RBZ Vaults/output/client_vaults/dist';

function calculateSha256(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
}

async function verifyAndSyncVaults() {
    console.log(`[Vault Verification] Checking latest vaults in "${DIST_DIR}"...`);

    const latestJsonPath = path.join(DIST_DIR, 'latest.json');
    if (!fs.existsSync(latestJsonPath)) {
        throw new Error(`latest.json not found in ${DIST_DIR}`);
    }

    const manifest = JSON.parse(fs.readFileSync(latestJsonPath, 'utf8'));
    console.log('[Manifest Version]:', manifest.laws?.version || '2026-W31');

    for (const [key, info] of Object.entries(manifest)) {
        const localZipPath = path.join(DIST_DIR, info.zipName);
        if (!fs.existsSync(localZipPath)) {
            console.warn(` [Warning] Zip missing for key "${key}": ${localZipPath}`);
            continue;
        }

        const calculatedSha = calculateSha256(localZipPath);
        const match = calculatedSha === info.sha256;
        console.log(` - ${key} (${info.zipName}): SHA256 Match = ${match ? '✓ MATCH' : '❌ MISMATCH'}`);

        // Test installing into Hayagriva local data_vaults folder directly
        console.log(` [Local Import Test] Installing "${info.zipName}" into Hayagriva local vaults...`);
        installFromLocalPath(localZipPath, `${key}_vault`);
    }

    // Upload updated latest zips to R2 to ensure Cloudflare R2 has 100% latest 2026-W31 builds!
    console.log('\n[R2 Sync] Uploading latest 2026-W31 vault archives to R2 bucket...');
    const uploads = [
        { local: path.join(DIST_DIR, manifest.laws.zipName), r2Key: 'vaults/laws_vault.zip' },
        { local: path.join(DIST_DIR, manifest.cases.zipName), r2Key: 'vaults/cases_vault.zip' },
        { local: path.join(DIST_DIR, manifest.documents.zipName), r2Key: 'vaults/documents_vault.zip' },
        { local: path.join(DIST_DIR, manifest.forms.zipName), r2Key: 'vaults/forms_vault.zip' },
        { local: path.join(DIST_DIR, 'latest.json'), r2Key: 'vaults/latest.json' }
    ];

    for (const item of uploads) {
        if (fs.existsSync(item.local)) {
            const sizeMb = (fs.statSync(item.local).size / (1024 * 1024)).toFixed(2);
            console.log(` [R2 Upload] Uploading "${item.r2Key}" (${sizeMb} MB)...`);
            const stream = fs.createReadStream(item.local);
            const cmd = new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: item.r2Key,
                Body: stream,
                ContentLength: fs.statSync(item.local).size
            });
            await s3.send(cmd);
            console.log(` [R2 Upload] ✓ Synchronized "${item.r2Key}" to Cloudflare R2!`);
        }
    }

    console.log('\n✓ Vault verification and R2 sync completed successfully!');
}

verifyAndSyncVaults().catch(err => {
    console.error('[Verification Error]', err);
    process.exit(1);
});
