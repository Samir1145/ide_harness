'use strict';

const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
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

const FILES_TO_UPLOAD = [
    {
        localPath: path.join(__dirname, '../models/llm/llamafile/legalparam/legalparam-2.9b.gguf'),
        r2Key: 'models/legalparam-2.9b.gguf',
        contentType: 'application/octet-stream'
    },
    {
        localPath: path.join(__dirname, '../models/llm/llamafile/financeparam/financeparam-2.9b.gguf'),
        r2Key: 'models/financeparam-2.9b.gguf',
        contentType: 'application/octet-stream'
    },
    {
        localPath: path.join(__dirname, '../vault/agent_packs/legal_agents.vlt'),
        r2Key: 'agent_packs/legal_agents.vlt',
        contentType: 'application/zip'
    },
    {
        localPath: path.join(__dirname, '../vault/agent_packs/finance_agents.vlt'),
        r2Key: 'agent_packs/finance_agents.vlt',
        contentType: 'application/zip'
    },
    {
        localPath: path.join(__dirname, '../vault/agent_packs/coding_agents.vlt'),
        r2Key: 'agent_packs/coding_agents.vlt',
        contentType: 'application/zip'
    }
];

const { execSync } = require('child_process');

async function uploadFile(item) {
    if (!fs.existsSync(item.localPath)) {
        console.warn(`[R2 Upload Warning] Local file missing: ${item.localPath}`);
        return;
    }

    let uploadPath = item.localPath;
    let tempZipCreated = false;

    const stat = fs.statSync(item.localPath);
    if (stat.isDirectory()) {
        const tmpZip = path.join(__dirname, `../../branding/resources/.tmp_${path.basename(item.localPath)}.zip`);
        fs.mkdirSync(path.dirname(tmpZip), { recursive: true });
        console.log(`[R2 Upload] Archiving directory "${path.basename(item.localPath)}" -> zip...`);
        execSync(`cd "${item.localPath}" && zip -r "${tmpZip}" . -x "*.DS_Store"`, { stdio: 'pipe' });
        uploadPath = tmpZip;
        tempZipCreated = true;
    }

    const uploadStat = fs.statSync(uploadPath);
    const sizeMb = (uploadStat.size / (1024 * 1024)).toFixed(2);
    console.log(`[R2 Upload] Uploading "${item.r2Key}" (${sizeMb} MB) to R2 bucket "${BUCKET_NAME}"...`);

    const fileStream = fs.createReadStream(uploadPath);

    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: item.r2Key,
        Body: fileStream,
        ContentLength: uploadStat.size,
        ContentType: item.contentType,
    });

    await s3.send(command);
    console.log(`[R2 Upload] ✓ Successfully uploaded "${item.r2Key}" (${sizeMb} MB) to bucket "${BUCKET_NAME}"!`);

    if (tempZipCreated && fs.existsSync(uploadPath)) {
        fs.unlinkSync(uploadPath);
    }
}

async function main() {
    console.log(`[R2 Uploader] Starting upload to Cloudflare R2 bucket: "${BUCKET_NAME}"`);
    for (const item of FILES_TO_UPLOAD) {
        try {
            await uploadFile(item);
        } catch (err) {
            console.error(`[R2 Upload Error] Failed uploading "${item.r2Key}":`, err.message);
        }
    }
    console.log('[R2 Uploader] All tasks completed!');
}

main();
