// Helper script to prepare and verify local ONNX assets for "bhavyagiri/InLegal-Sbert" (768-dim)
const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, '..', 'models', 'embeddings', 'legal', 'inlegal-sbert');

async function main() {
    console.log('[InLegal-SBERT Setup] Verifying model directory structure...');
    fs.mkdirSync(MODELS_DIR, { recursive: true });

    const requiredFiles = [
        'model_quantized.onnx',
        'tokenizer.json',
        'config.json'
    ];

    const missingFiles = requiredFiles.filter(file => !fs.existsSync(path.join(MODELS_DIR, file)));

    if (missingFiles.length === 0) {
        console.log(`[InLegal-SBERT Setup] ✓ All ONNX embedding model assets verified at: ${MODELS_DIR}`);
        return;
    }

    console.log(`[InLegal-SBERT Setup] Missing local ONNX assets: ${missingFiles.join(', ')}`);
    console.log(`[InLegal-SBERT Setup] Target path: ${MODELS_DIR}`);
    console.log('[InLegal-SBERT Setup] Note: Place your quantized ONNX assets into this folder or run optimum-cli export:');
    console.log('                      optimum-cli export onnx --model bhavyagiri/InLegal-Sbert --quantize hayagriva/models/embeddings/legal/inlegal-sbert/');
}

main().catch(err => {
    console.error('[InLegal-SBERT Setup] Failed:', err.message);
    process.exit(1);
});
