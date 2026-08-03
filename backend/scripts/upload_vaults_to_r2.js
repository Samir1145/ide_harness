'use strict';

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

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

const DIST_DIR = '/Users/atulgrover/Desktop/ibc_vault/output/client_vaults/dist';

const VAULTS_TO_UPLOAD = [
    {
        localPath: path.join(DIST_DIR, 'laws_vault_2026-W31.zip'),
        r2Key: 'vaults/laws_vault.zip',
        contentType: 'application/zip'
    },
    {
        localPath: path.join(DIST_DIR, 'cases_vault_2026-W31.zip'),
        r2Key: 'vaults/cases_vault.zip',
        contentType: 'application/zip'
    },
    {
        localPath: path.join(DIST_DIR, 'documents_vault_2026-W31.zip'),
        r2Key: 'vaults/documents_vault.zip',
        contentType: 'application/zip'
    },
    {
        localPath: path.join(DIST_DIR, 'forms_vault_2026-W31.zip'),
        r2Key: 'vaults/forms_vault.zip',
        contentType: 'application/zip'
    },
    {
        localPath: path.join(DIST_DIR, 'latest.json'),
        r2Key: 'vaults/latest.json',
        contentType: 'application/json'
    }
];

async function uploadFile(item) {
    if (!fs.existsSync(item.localPath)) {
        console.warn(`[R2 Vault Warning] Local file missing: ${item.localPath}`);
        return;
    }

    const stat = fs.statSync(item.localPath);
    const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
    console.log(`[R2 Vault Upload] Uploading "${item.r2Key}" (${sizeMb} MB)...`);

    const fileStream = fs.createReadStream(item.localPath);

    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: item.r2Key,
        Body: fileStream,
        ContentLength: stat.size,
        ContentType: item.contentType,
    });

    await s3.send(command);
    console.log(`[R2 Vault Upload] ✓ Successfully uploaded "${item.r2Key}" (${sizeMb} MB) to bucket "${BUCKET_NAME}"!`);
}

async function main() {
    console.log(`[R2 Vault Uploader] Starting upload of 4 finalized 768-dim vaults to bucket "${BUCKET_NAME}"`);
    for (const item of VAULTS_TO_UPLOAD) {
        try {
            await uploadFile(item);
        } catch (err) {
            console.error(`[R2 Vault Upload Error] Failed uploading "${item.r2Key}":`, err.message);
        }
    }
    console.log('[R2 Vault Uploader] All 4 768-dim vaults successfully uploaded!');
}

main();
