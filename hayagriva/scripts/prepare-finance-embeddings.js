// Helper script to prepare and verify local ONNX assets for "FinLang/finance-embeddings-investopedia" (768-dim)
const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, '..', 'models', 'embeddings', 'finance', 'finance-embeddings-investopedia');

async function main() {
    console.log('[Finance Embedding Setup] Verifying model directory structure...');
    fs.mkdirSync(path.join(MODELS_DIR, 'onnx'), { recursive: true });

    const requiredFiles = [
        'onnx/model.onnx',
        'tokenizer.json',
        'config.json'
    ];

    const missingFiles = requiredFiles.filter(file => !fs.existsSync(path.join(MODELS_DIR, file)));

    if (missingFiles.length === 0) {
        console.log(`[Finance Embedding Setup] ✓ All ONNX embedding model assets verified at: ${MODELS_DIR}`);
        return;
    }

    console.log(`[Finance Embedding Setup] Missing local ONNX assets: ${missingFiles.join(', ')}`);
    console.log(`[Finance Embedding Setup] Target path: ${MODELS_DIR}`);
    console.log('[Finance Embedding Setup] Note: Place your ONNX assets into this folder or run optimum-cli export:');
    console.log('                        optimum-cli export onnx --model FinLang/finance-embeddings-investopedia --task feature-extraction --library-name transformers --opset 14 --optimize O3 hayagriva/models/embeddings/finance/finance-embeddings-investopedia/');
}

main().catch(err => {
    console.error('[Finance Embedding Setup] Failed:', err.message);
    process.exit(1);
});
