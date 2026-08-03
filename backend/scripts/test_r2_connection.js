'use strict';

const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

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

async function main() {
    console.log(`[R2 Test] Listing objects in bucket "${BUCKET_NAME}"...`);
    try {
        const cmd = new ListObjectsV2Command({ Bucket: BUCKET_NAME });
        const res = await s3.send(cmd);
        if (!res.Contents || res.Contents.length === 0) {
            console.log('[R2 Test] Bucket is empty or no contents returned.');
        } else {
            for (const item of res.Contents) {
                const sizeMb = (item.Size / (1024 * 1024)).toFixed(2);
                console.log(` - ${item.Key} (${sizeMb} MB)`);
            }
        }
    } catch (e) {
        console.error('[R2 Test Error]', e);
    }
}

main();
