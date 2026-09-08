// Ultra-lightweight CPU/ONNX-based cross-encoder reranker using ms-marco-MiniLM-L-6-v2 (~22 MB)
// Provides ~10ms precision reranking directly in Node.js with zero Python dependencies.
const path = require('path');
const fs = require('fs');

let _rerankerPipeline = null;
let _lastRerankerAccess = Date.now();
const RERANKER_IDLE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Background monitor to evict reranker model from native memory after 5 minutes of inactivity
setInterval(() => {
    const idleTime = Date.now() - _lastRerankerAccess;
    if (idleTime >= RERANKER_IDLE_TTL_MS) {
        if (_rerankerPipeline) {
            console.log('[Reranker] Idle TTL reached (5m). Evicting in-process ONNX cross-encoder model from RAM...');
            _rerankerPipeline = null;
            if (global.gc) {
                try { global.gc(); } catch (_) {}
            }
        }
    }
}, 60 * 1000).unref();

async function getRerankerPipeline() {
    _lastRerankerAccess = Date.now();
    if (_rerankerPipeline) {
        return _rerankerPipeline;
    }

    const modelDir = path.join(__dirname, '..', '..', 'models', 'reranker', 'ms-marco-MiniLM-L-6-v2');
    const onnxModelPath = path.join(modelDir, 'onnx', 'model_quantized.onnx');

    if (!fs.existsSync(onnxModelPath)) {
        throw new Error(`Reranker ONNX model not found at ${onnxModelPath}. Please run download-reranker.js.`);
    }

    const { pipeline, env } = await import('@xenova/transformers');
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.localModelPath = path.join(__dirname, '..', '..', 'models', 'reranker');

    const t0 = Date.now();
    console.log('[Reranker] Loading local quantized cross-encoder (ms-marco-MiniLM-L-6-v2)...');
    _rerankerPipeline = await pipeline('text-classification', 'ms-marco-MiniLM-L-6-v2', {
        quantized: true
    });
    console.log(`[Reranker] ✓ Pipeline ready in ${Date.now() - t0} ms`);
    return _rerankerPipeline;
}

/**
 * Pre-warms the reranker pipeline during case bootstrap to eliminate first-query cold start.
 */
async function warmupRerankerPipeline() {
    try {
        const pipeline = await getRerankerPipeline();
        const dummyQuery = ['warmup query'];
        const dummyPassage = ['warmup passage'];
        const inputs = pipeline.tokenizer(dummyQuery, {
            text_pair: dummyPassage,
            padding: true,
            truncation: true,
            max_length: 64
        });
        await pipeline.model(inputs);
        console.log('[Reranker] ✓ Pre-warmup complete.');
    } catch (err) {
        console.warn('[Reranker] Pre-warmup notice:', err.message);
    }
}

/**
 * Reranks an array of candidate snippets against a search query using cross-encoder attention.
 *
 * @param {string} queryText - The user query or search term
 * @param {Array<object>} candidates - List of candidate snippets { title, docName, body, hit, ... }
 * @param {object} options - { topK = 5, maxBatchSize = 24, minScoreThreshold = null }
 * @returns {Promise<Array<object>>} - Sorted candidate snippets with attached rerankerScore and logit
 */
async function rerankCandidates(queryText, candidates, options = {}) {
    if (!candidates || !Array.isArray(candidates) || candidates.length <= 1) {
        return candidates || [];
    }

    const topK = options.topK || 5;
    const cleanQuery = (queryText || '').trim();
    if (!cleanQuery) {
        return candidates.slice(0, topK);
    }

    try {
        const pipeline = await getRerankerPipeline();
        const tStart = Date.now();

        // Extract body text, truncating to ~350 words to respect model max_position_embeddings (512 tokens)
        const passages = candidates.map(c => {
            const body = c.body || c.content || '';
            return body.replace(/\s+/g, ' ').trim().slice(0, 1500);
        });

        const queryArr = passages.map(() => cleanQuery);
        const inputs = pipeline.tokenizer(queryArr, {
            text_pair: passages,
            padding: true,
            truncation: true,
            max_length: 512
        });

        const outputs = await pipeline.model(inputs);
        const logits = outputs.logits.data;

        // Attach cross-encoder scores (sigmoid activation)
        const scoredCandidates = candidates.map((cand, idx) => {
            const logit = logits[idx] !== undefined ? logits[idx] : -99;
            const sigmoidScore = 1 / (1 + Math.exp(-logit));
            return {
                ...cand,
                rerankerLogit: logit,
                rerankerScore: sigmoidScore
            };
        });

        // Sort descending by rerankerScore
        scoredCandidates.sort((a, b) => b.rerankerScore - a.rerankerScore);

        const duration = Date.now() - tStart;
        console.log(`[Reranker] Scored ${candidates.length} candidates in ${duration} ms. Top match: "${scoredCandidates[0].docName} / ${scoredCandidates[0].title}" (score: ${scoredCandidates[0].rerankerScore.toFixed(4)}, logit: ${scoredCandidates[0].rerankerLogit.toFixed(2)})`);

        return scoredCandidates.slice(0, topK);
    } catch (err) {
        console.warn(`[Reranker] ONNX cross-encoder execution failed (${err.message}). Falling back to existing RRF rank order.`);
        return candidates.slice(0, topK);
    }
}

module.exports = {
    rerankCandidates,
    warmupRerankerPipeline,
    getRerankerPipeline
};
