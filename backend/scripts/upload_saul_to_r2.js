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

const ITEM = {
    localPath: path.join(__dirname, '../models/llm/saul/Saul-Instruct-v1.Q4_K_M.gguf'),
    r2Key: 'models/saullm-7b.gguf',
    contentType: 'application/octet-stream'
};

async function main() {
    console.log(`[R2 Upload] Starting upload of SaulLM-7B GGUF to bucket "${BUCKET_NAME}"...`);
    if (!fs.existsSync(ITEM.localPath)) {
        console.error(`[R2 Upload Error] File not found: ${ITEM.localPath}`);
        process.exit(1);
    }

    const stat = fs.statSync(ITEM.localPath);
    const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
    console.log(`[R2 Upload] File size: ${sizeMb} MB. Uploading to object key "${ITEM.r2Key}"...`);

    const fileStream = fs.createReadStream(ITEM.localPath);
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: ITEM.r2Key,
        Body: fileStream,
        ContentLength: stat.size,
        ContentType: ITEM.contentType,
    });

    await s3.send(command);
    console.log(`[R2 Upload] ✓ Successfully uploaded "${ITEM.r2Key}" (${sizeMb} MB) to Cloudflare R2!`);
}

main().catch(err => {
    console.error('[R2 Upload Exception]', err);
    process.exit(1);
});
