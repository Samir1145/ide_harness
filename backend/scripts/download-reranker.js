// Pure Node.js script to download and package Xenova/ms-marco-MiniLM-L-6-v2 quantized ONNX assets
const fs = require('fs');
const path = require('path');
const https = require('https');

const MODEL_DIR = path.join(__dirname, '..', 'models', 'reranker', 'ms-marco-MiniLM-L-6-v2');
const ONNX_DIR = path.join(MODEL_DIR, 'onnx');
const BASE_URL = 'https://huggingface.co/Xenova/ms-marco-MiniLM-L-6-v2/resolve/main/';

const FILES = [
    { name: 'config.json', destDir: MODEL_DIR },
    { name: 'tokenizer.json', destDir: MODEL_DIR },
    { name: 'tokenizer_config.json', destDir: MODEL_DIR },
    { name: 'special_tokens_map.json', destDir: MODEL_DIR },
    { name: 'onnx/model_quantized.onnx', destDir: ONNX_DIR, localName: 'model_quantized.onnx' }
];

function downloadFile(fileInfo) {
    const fileName = fileInfo.localName || fileInfo.name;
    const destPath = path.join(fileInfo.destDir, fileName);
    
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 1000) {
        console.log(`[Reranker Setup] ✓ Already downloaded: ${fileName} (${(fs.statSync(destPath).size / 1024 / 1024).toFixed(2)} MB)`);
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(destPath);
        const url = BASE_URL + fileInfo.name;

        function fetchUrl(currentUrl, maxRedirects = 5) {
            if (maxRedirects === 0) {
                fileStream.close();
                fs.unlinkSync(destPath);
                return reject(new Error(`Too many redirects downloading ${fileInfo.name}`));
            }

            https.get(currentUrl, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                    let redirectUrl = res.headers.location;
                    if (!redirectUrl) {
                        fileStream.close();
                        fs.unlinkSync(destPath);
                        return reject(new Error(`Redirect status ${res.statusCode} with no location header`));
                    }
                    const resolvedUrl = new URL(redirectUrl, currentUrl).href;
                    return fetchUrl(resolvedUrl, maxRedirects - 1);
                }

                if (res.statusCode === 200) {
                    const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
                    let downloaded = 0;
                    res.on('data', chunk => {
                        downloaded += chunk.length;
                    });
                    res.pipe(fileStream);
                    fileStream.on('finish', () => {
                        fileStream.close();
                        console.log(`[Reranker Setup] ✓ Downloaded ${fileName} (${(downloaded / 1024 / 1024).toFixed(2)} MB)`);
                        resolve();
                    });
                } else {
                    fileStream.close();
                    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                    reject(new Error(`HTTP error ${res.statusCode} for ${currentUrl}`));
                }
            }).on('error', (err) => {
                fileStream.close();
                if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                reject(err);
            });
        }

        fetchUrl(url);
    });
}

async function main() {
    console.log('[Reranker Setup] Target model: Xenova/ms-marco-MiniLM-L-6-v2 (quantized ONNX)');
    console.log(`[Reranker Setup] Directory: ${MODEL_DIR}`);
    fs.mkdirSync(MODEL_DIR, { recursive: true });
    fs.mkdirSync(ONNX_DIR, { recursive: true });

    for (const file of FILES) {
        try {
            await downloadFile(file);
        } catch (e) {
            console.error(`[Reranker Setup] Failed downloading ${file.name}:`, e.message);
            throw e;
        }
    }

    console.log('[Reranker Setup] ✓ All reranker assets verified successfully!');
}

main().catch(err => {
    console.error('[Reranker Setup] Setup failed:', err.message);
    process.exit(1);
});
