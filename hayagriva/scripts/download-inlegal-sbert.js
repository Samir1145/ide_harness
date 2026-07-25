// Pure Node.js script to set up model directories and download InLegal-SBERT tokenizer & config files
const fs = require('fs');
const path = require('path');
const https = require('https');

const SBERT_DIR = path.join(__dirname, '..', 'models', 'embeddings', 'legal', 'inlegal-sbert');
const LLAMAFILE_DIR = path.join(__dirname, '..', 'models', 'llm', 'llamafile');

const BASE_URL = 'https://huggingface.co/bhavyagiri/InLegal-Sbert/raw/main/';

const FILES_TO_DOWNLOAD = [
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'special_tokens_map.json',
    'vocab.txt'
];

function downloadFile(file) {
    const destPath = path.join(SBERT_DIR, file);
    return new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(destPath);
        const url = BASE_URL + file;
        
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                https.get(response.headers.location, (redirectRes) => {
                    redirectRes.pipe(fileStream);
                    fileStream.on('finish', () => {
                        fileStream.close();
                        console.log(`✓ Downloaded ${file}`);
                        resolve();
                    });
                }).on('error', reject);
            } else if (response.statusCode === 200) {
                response.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close();
                    console.log(`✓ Downloaded ${file}`);
                    resolve();
                });
            } else {
                reject(new Error(`Failed to download ${file}: HTTP status ${response.statusCode}`));
            }
        }).on('error', reject);
    });
}

async function main() {
    console.log('[Model Setup] Creating model directories...');
    fs.mkdirSync(SBERT_DIR, { recursive: true });
    fs.mkdirSync(LLAMAFILE_DIR, { recursive: true });
    console.log(`✓ Directory initialized: ${SBERT_DIR}`);
    console.log(`✓ Directory initialized: ${LLAMAFILE_DIR}`);

    console.log('\n[Model Setup] Downloading InLegal-SBERT configuration & tokenizer files via Node.js...');
    for (const file of FILES_TO_DOWNLOAD) {
        try {
            await downloadFile(file);
        } catch (err) {
            console.error(`Failed downloading ${file}:`, err.message);
        }
    }

    console.log('\n[Model Setup] Setup completed successfully!');
    console.log(`SBERT Assets Directory: ${SBERT_DIR}`);
    console.log(`Llamafile Directory:    ${LLAMAFILE_DIR}`);
}

main().catch(err => {
    console.error('Setup error:', err);
    process.exit(1);
});
