'use strict';

const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

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

async function uploadFile(filePath, r2Key) {
    const stat = fs.statSync(filePath);
    const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
    console.log(`[R2 Upload] Uploading "${r2Key}" (${sizeMb} MB) to bucket "${BUCKET_NAME}"...`);

    const fileStream = fs.createReadStream(filePath);
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: r2Key,
        Body: fileStream,
        ContentLength: stat.size,
        ContentType: 'application/vnd.microsoft.portable-executable',
    });

    await s3.send(command);
    console.log(`[R2 Upload] ✓ Successfully uploaded "${r2Key}" (${sizeMb} MB) to "${BUCKET_NAME}"!`);
}

async function main() {
    const targetFile = process.argv[2] || path.join(__dirname, '../../frontend/applications/electron/dist/HayagrivaSetup.exe');
    if (!fs.existsSync(targetFile)) {
        console.error(`[R2 Upload Error] File not found: ${targetFile}`);
        process.exit(1);
    }

    console.log(`[R2 Uploader] Preparing to upload Windows executable: ${targetFile}`);
    // Upload both HayagrivaSetup.exe and Hayagriva.exe alias
    await uploadFile(targetFile, 'HayagrivaSetup.exe');
    await uploadFile(targetFile, 'Hayagriva.exe');
    console.log('[R2 Uploader] All Windows executables synchronized to Cloudflare R2!');
}

main().catch(err => {
    console.error('[R2 Upload Fatal Error]', err);
    process.exit(1);
});
