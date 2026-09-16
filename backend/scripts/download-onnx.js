// Helper script to pre-download the ONNX embeddings model so first launch is offline-ready and low-latency
const path = require('path');

async function main() {
    console.log('[ONNX Setup] Verifying local model files for "InLegal-SBERT" (768d)...');
    try {
        const { pipeline, env } = await import('@xenova/transformers');
        env.localModelPath = path.join(__dirname, '..', 'models', 'embeddings', 'legal');
        env.allowLocalModels = true;
        env.allowRemoteModels = false;
        await pipeline('feature-extraction', 'inlegal-sbert', { quantized: false });
        console.log('[ONNX Setup] ✓ Local InLegal-SBERT model files verified and ready.');
    } catch (err) {
        console.warn('[ONNX Setup] Local InLegal-SBERT model not found. Core IDE will operate in Pure BM25 RAG mode.');
        process.exit(0);
    }
}

main();
