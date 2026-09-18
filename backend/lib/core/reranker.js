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

    const os = require('os');
    const candidates = [
        process.env.HAYA_RERANKER_PATH ? process.env.HAYA_RERANKER_PATH : null,
        process.env.HAYA_MODELS_PATH ? path.join(process.env.HAYA_MODELS_PATH, 'reranker') : null,
        path.join(os.homedir(), 'Desktop', 'ide_models', 'weights', 'reranker'),
        path.join(os.homedir(), 'Library', 'Application Support', 'Hayagriva', 'models', 'reranker'),
        path.join(__dirname, '..', '..', 'models', 'default', 'reranker'),
        path.join(__dirname, '..', '..', 'models', 'reranker')
    ].filter(Boolean);

    let modelDir = null;
    let baseRerankerDir = null;
    let selectedModelName = 'ms-marco-MiniLM-L-6-v2';

    // Model priority: bge-reranker-base (if present) -> ms-marco-MiniLM-L-6-v2
    const modelPriorities = ['bge-reranker-base', 'ms-marco-MiniLM-L-6-v2'];

    for (const c of candidates) {
        for (const mName of modelPriorities) {
            const candidateModel = path.join(c, mName);
            if (fs.existsSync(path.join(candidateModel, 'onnx', 'model_quantized.onnx')) ||
                fs.existsSync(path.join(candidateModel, 'onnx', 'model.onnx'))) {
                modelDir = candidateModel;
                baseRerankerDir = c;
                selectedModelName = mName;
                break;
            }
        }
        if (modelDir) break;
    }

    if (!modelDir) {
        throw new Error('Reranker ONNX model not found in core models or local directories.');
    }

    const { pipeline, env } = await import('@xenova/transformers');
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.localModelPath = baseRerankerDir;

    const t0 = Date.now();
    console.log(`[Reranker] Loading local quantized cross-encoder (${selectedModelName})...`);
    _rerankerPipeline = await pipeline('text-classification', selectedModelName, {
        quantized: true
    });
    console.log(`[Reranker] ✓ Pipeline ready (${selectedModelName}) in ${Date.now() - t0} ms`);
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
