// Helper script to pre-download the ONNX embeddings model so first launch is offline-ready and low-latency
const path = require('path');

async function main() {
    console.log('[ONNX Setup] Verifying local model files for "Xenova/all-MiniLM-L6-v2"...');
    try {
        const { pipeline } = await import('@xenova/transformers');
        // This will check if cached locally. If not, it downloads the model showing a progress bar.
        await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        console.log('[ONNX Setup] ✓ local model files verified and ready.');
    } catch (err) {
        console.error('[ONNX Setup] Error pre-downloading model:', err.message);
        process.exit(1);
    }
}

main();
