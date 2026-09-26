const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { repairToolPairing, isContextOverflow, emergencyCompact } = require('./history-compactor');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:latest';
const LLAMAFILE_URL = process.env.LLAMAFILE_URL || 'http://127.0.0.1:8090';
const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

function checkLlamafileHealth(endpoint = LLAMAFILE_URL) {
    return new Promise((resolve) => {
        const parsed = url.parse(endpoint);
        const req = http.request({
            hostname: parsed.hostname || '127.0.0.1',
            port: parsed.port || 8090,
            path: '/v1/models',
            method: 'GET',
            timeout: 2000
        }, (res) => {
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
        req.end();
    });
}

function streamLlamafile(messages, endpoint = LLAMAFILE_URL) {
    return {
        [Symbol.asyncIterator]: async function* () {
            const parsed = url.parse(endpoint);
            const postData = JSON.stringify({
                messages,
                stream: true,
                temperature: 0.1,
                max_tokens: 512,
                stop: ['<|user|>', '<|/user|>', '<|assistant|>', '<|/assistant|>', '<|endoftext|>', '<|end_of_text|>', '<0x0A><assistant>', '<assistant>']
            });

            const options = {
                hostname: parsed.hostname || '127.0.0.1',
                port: parsed.port || 8090,
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const reqPromise = new Promise((resolve, reject) => {
                const req = http.request(options, (res) => resolve(res));
                req.on('error', reject);
                req.write(postData);
                req.end();
            });

            const res = await reqPromise;
            if (res.statusCode !== 200) {
                throw new Error(`Llamafile server returned status ${res.statusCode}`);
            }

            let buffer = '';
            for await (const chunk of res) {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]') continue;
                    if (trimmed.startsWith('data: ')) {
                        try {
                            const jsonStr = trimmed.slice(6);
                            const parsedJson = JSON.parse(jsonStr);
                            const content = parsedJson.choices?.[0]?.delta?.content;
                            if (content) {
                                yield content;
                            }
                        } catch (e) {
                            console.error('[Llamafile Stream] Failed to parse line:', trimmed, e.message);
                        }
                    }
                }
            }
        }
    };
}

function checkOllamaHealth(endpoint = OLLAMA_URL) {
    return new Promise((resolve) => {
        const parsed = url.parse(endpoint);
        const req = http.request({
            hostname: parsed.hostname || '127.0.0.1',
            port: parsed.port || 11434,
            path: '/api/tags',
            method: 'GET',
            timeout: 2000
        }, (res) => {
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
        req.end();
    });
}

function streamOllama(messages, model = DEFAULT_OLLAMA_MODEL, endpoint = OLLAMA_URL) {
    return {
        [Symbol.asyncIterator]: async function* () {
            const parsed = url.parse(endpoint);
            const postData = JSON.stringify({
                model,
                messages,
                stream: true,
                options: { temperature: 0.1 }
            });

            const options = {
                hostname: parsed.hostname || '127.0.0.1',
                port: parsed.port || 11434,
                path: '/api/chat',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const reqPromise = new Promise((resolve, reject) => {
                const req = http.request(options, (res) => resolve(res));
                req.on('error', reject);
                req.write(postData);
                req.end();
            });

            const res = await reqPromise;
            if (res.statusCode !== 200) {
                throw new Error(`Ollama server returned status ${res.statusCode}`);
            }

            let buffer = '';
            for await (const chunk of res) {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const parsedJson = JSON.parse(line);
                        if (parsedJson.message && parsedJson.message.content) {
                            yield parsedJson.message.content;
                        }
                    } catch (e) {
                        console.error('[Ollama Stream] Failed to parse line:', line, e.message);
                    }
                }
            }
        }
    };
}

function streamGemini(messages, apiKey, model = DEFAULT_GEMINI_MODEL) {
    return {
        [Symbol.asyncIterator]: async function* () {
            const contents = [];
            let systemInstruction = null;
            
            for (const msg of messages) {
                if (msg.role === 'system') {
                    systemInstruction = { parts: [{ text: msg.content }] };
                } else {
                    contents.push({
                        role: msg.role === 'assistant' ? 'model' : 'user',
                        parts: [{ text: msg.content }]
                    });
                }
            }

            const postData = JSON.stringify({
                contents,
                systemInstruction,
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 2048
                }
            });

            const apiPath = `/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`;
            const options = {
                hostname: 'generativelanguage.googleapis.com',
                port: 443,
                path: apiPath,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const reqPromise = new Promise((resolve, reject) => {
                const req = https.request(options, (res) => resolve(res));
                req.on('error', reject);
                req.write(postData);
                req.end();
            });

            const res = await reqPromise;
            if (res.statusCode !== 200) {
                throw new Error(`Gemini server returned status ${res.statusCode}`);
            }

            let buffer = '';
            for await (const chunk of res) {
                buffer += chunk.toString();
                // Gemini streamGenerateContent returns JSON chunks enclosed in brackets [ {...}, {...} ]
                // We clean up commas and brackets to parse individual response blocks
                let cleanBuffer = buffer.trim();
                if (cleanBuffer.startsWith('[')) cleanBuffer = cleanBuffer.slice(1).trim();
                if (cleanBuffer.endsWith(']')) cleanBuffer = cleanBuffer.slice(0, -1).trim();

                const objects = cleanBuffer.split(/\s*,\s*(?={)/);
                let completedIndex = -1;

                for (let i = 0; i < objects.length; i++) {
                    const objText = objects[i].trim();
                    if (!objText) continue;
                    try {
                        const parsedObj = JSON.parse(objText);
                        completedIndex = i;
                        if (parsedObj.candidates && parsedObj.candidates[0].content && parsedObj.candidates[0].content.parts[0]) {
                            yield parsedObj.candidates[0].content.parts[0].text;
                        }
                    } catch (e) {
                        // JSON is incomplete, break loop and keep in buffer
                        break;
                    }
                }

                if (completedIndex !== -1) {
                    const partsLeft = objects.slice(completedIndex + 1);
                    buffer = partsLeft.join(',');
                }
            }
        }
    };
}

function streamOpenAI(messages, apiKey, model = DEFAULT_OPENAI_MODEL) {
    return {
        [Symbol.asyncIterator]: async function* () {
            const postData = JSON.stringify({
                model,
                messages,
                stream: true,
                temperature: 0.1
            });

            const options = {
                hostname: 'api.openai.com',
                port: 443,
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const reqPromise = new Promise((resolve, reject) => {
                const req = https.request(options, (res) => resolve(res));
                req.on('error', reject);
                req.write(postData);
                req.end();
            });

            const res = await reqPromise;
            if (res.statusCode !== 200) {
                throw new Error(`OpenAI server returned status ${res.statusCode}`);
            }

            let buffer = '';
            for await (const chunk of res) {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    const cleanLine = line.trim();
                    if (!cleanLine.startsWith('data: ')) continue;
                    const jsonText = cleanLine.slice(6);
                    if (jsonText === '[DONE]') continue;
                    
                    try {
                        const parsedJson = JSON.parse(jsonText);
                        const delta = parsedJson.choices[0].delta;
                        if (delta && delta.content) {
                            yield delta.content;
                        }
                    } catch (e) {
                        console.error('[OpenAI Stream] Failed to parse line:', jsonText, e.message);
                    }
                }
            }
        }
    };
}

function transformMessagesForOpenRouter(messages) {
    return messages.map(msg => {
        if (msg.role === 'user' && msg.images && msg.images.length > 0) {
            const content = [
                { type: 'text', text: msg.content }
            ];
            for (const img of msg.images) {
                const prefix = img.startsWith('data:') ? '' : 'data:image/png;base64,';
                content.push({
                    type: 'image_url',
                    image_url: { url: `${prefix}${img}` }
                });
            }
            return { role: 'user', content };
        }
        return msg;
    });
}

function streamOpenRouter(messages, apiKey, model = 'google/gemini-2.5-flash') {
    return {
        [Symbol.asyncIterator]: async function* () {
            const transformedMessages = transformMessagesForOpenRouter(messages);
            const postData = JSON.stringify({
                model,
                messages: transformedMessages,
                stream: true,
                temperature: 0.1
            });

            const options = {
                hostname: 'openrouter.ai',
                port: 443,
                path: '/api/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://github.com/google/antigravity',
                    'X-Title': 'Hayagriva',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const reqPromise = new Promise((resolve, reject) => {
                const req = https.request(options, (res) => resolve(res));
                req.on('error', reject);
                req.write(postData);
                req.end();
            });

            const res = await reqPromise;
            if (res.statusCode !== 200) {
                let errBody = '';
                for await (const chunk of res) {
                    errBody += chunk.toString();
                }
                throw new Error(`OpenRouter server returned status ${res.statusCode}: ${errBody}`);
            }

            let buffer = '';
            for await (const chunk of res) {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    const cleanLine = line.trim();
                    if (!cleanLine.startsWith('data: ')) continue;
                    const jsonText = cleanLine.slice(6);
                    if (jsonText === '[DONE]') continue;
                    
                    try {
                        const parsedJson = JSON.parse(jsonText);
                        const delta = parsedJson.choices[0].delta;
                        if (delta && delta.content) {
                            yield delta.content;
                        }
                    } catch (e) {}
                }
            }
        }
    };
}

function loadLlmConfig(opts) {
    const config = {
        activeMode: 'lite', // App starts in Lite Mode by default; switched to 'standard' when LLM started in Settings
        remindLibreOffice: true
    };

    if (opts && opts.caseDir) {
        const settingsPath = path.join(opts.caseDir, 'hayagriva_settings.json');
        if (fs.existsSync(settingsPath)) {
            try {
                const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                Object.assign(config, saved);
            } catch (_) {}
        }
    }

    return config;
}

let _defaultPipeline = null;
let _legalPipeline = null;
let _financePipeline = null;
let _lastEmbeddingAccess = Date.now();
const EMBEDDING_IDLE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

// Background Idle Eviction Monitor (runs every 60s)
setInterval(() => {
    const idleTime = Date.now() - _lastEmbeddingAccess;
    if (idleTime >= EMBEDDING_IDLE_TTL_MS) {
        if (_defaultPipeline || _legalPipeline || _financePipeline) {
            console.log('[LLM Client] Idle TTL reached (5m). Evicting in-process ONNX embedding models from RAM...');
            _defaultPipeline = null;
            _legalPipeline = null;
            _financePipeline = null;
            if (global.gc) {
                try { global.gc(); } catch (_) {}
            }
        }
    }
}, 60 * 1000).unref();

async function warmupEmbeddingPipeline(vectorType = 'legal') {
    try {
        console.log(`[LLM Client] Asynchronously pre-warming ONNX embedding model (${vectorType})...`);
        await getEmbedding('warmup text', { vectorType, isQuery: true });
        console.log(`[LLM Client] ✓ Pre-warmup complete for ${vectorType} embedding model.`);
    } catch (e) {
        console.warn(`[LLM Client] Pre-warmup notice: ${e.message}`);
    }
}

/**
 * Determines which embedding model (legal/finance) to use for a document.
 * Priority:
 *   1. Explicit domain tag in case_manifest.json fileDomains (set at ingestion)
 *   2. File-extension heuristic fallback (existing behaviour preserved)
 *
 * @param {string} filename - Filename or relative path
 * @param {object|null} caseManifest - Parsed case_manifest.json (optional)
 */
function detectDocumentVectorType(filename, caseManifest = null) {
    // 1. Manifest override — explicit domain tag wins
    if (caseManifest && caseManifest.fileDomains && filename) {
        const base = path.basename(filename);
        if (caseManifest.fileDomains[base]) {
            return caseManifest.fileDomains[base]; // 'legal' | 'finance'
        }
    }
    // 2. Extension heuristic fallback (backward-compatible)
    if (!filename) return 'legal';
    const ext = path.extname(filename).toLowerCase();
    if (['.xlsx', '.xls', '.csv', '.tsv'].includes(ext)) {
        return 'finance';
    }
    return 'legal';
}

function resolveEmbeddingModel(vectorType) {
    const defaultEmbeddingsBase = path.join(__dirname, '..', '..', 'models', 'default', 'embeddings');
    const defaultNomic = path.join(defaultEmbeddingsBase, 'nomic-embed-text-v1.5');
    const hasDefault = fs.existsSync(path.join(defaultNomic, 'tokenizer.json')) ||
                       fs.existsSync(path.join(defaultNomic, 'config.json'));

    if (vectorType === 'default' || vectorType === 'core') {
        if (hasDefault) {
            return {
                basePath: defaultEmbeddingsBase,
                modelName: 'nomic-embed-text-v1.5',
                isSpecialized: false,
                quantized: true
            };
        }
    }

    const os = require('os');
    const domain = vectorType === 'finance' ? 'finance' : 'legal';
    const modelName = domain === 'finance' ? 'finance-embeddings-investopedia' : 'inlegal-sbert';

    const candidateBases = [
        process.env.HAYA_MODELS_PATH ? path.join(process.env.HAYA_MODELS_PATH, 'embeddings', domain) : null,
        path.join(os.homedir(), 'Desktop', 'HAYAGRIVA', 'models', 'weights', 'embeddings', domain),
        path.join(__dirname, '..', '..', '..', 'models', 'weights', 'embeddings', domain),
        path.join(os.homedir(), 'Desktop', 'ide_models', 'weights', 'embeddings', domain),
        path.join(os.homedir(), 'Library', 'Application Support', 'Hayagriva', 'models', 'embeddings', domain)
    ].filter(Boolean);

    for (const base of candidateBases) {
        const fullModelPath = path.join(base, modelName);
        if (fs.existsSync(path.join(fullModelPath, 'tokenizer.json')) ||
            fs.existsSync(path.join(fullModelPath, 'config.json'))) {
            return {
                basePath: base,
                modelName: modelName,
                isSpecialized: true,
                quantized: false
            };
        }
    }

    // Default core fallback: nomic-embed-text-v1.5
    if (hasDefault) {
        return {
            basePath: defaultEmbeddingsBase,
            modelName: 'nomic-embed-text-v1.5',
            isSpecialized: false,
            quantized: true
        };
    }

    return null;
}

async function getEmbedding(text, options = {}) {
    _lastEmbeddingAccess = Date.now();
    let vectorType = 'legal';
    let isQuery = false;

    if (typeof options === 'string') {
        if (options === 'finance' || options === 'legal') {
            vectorType = options;
        } else {
            vectorType = detectDocumentVectorType(options);
        }
    } else if (options && typeof options === 'object') {
        if (options.vectorType) {
            vectorType = options.vectorType;
        } else if (options.filename) {
            vectorType = detectDocumentVectorType(options.filename);
        }
        if (options.isQuery !== undefined) {
            isQuery = !!options.isQuery;
        }
    }

    try {
        const resolved = resolveEmbeddingModel(vectorType);
        if (!resolved) {
            console.warn('[LLM Client] No local embedding model found.');
            return null;
        }

        const { pipeline, env } = await import('@xenova/transformers');
        env.allowLocalModels = true;
        env.allowRemoteModels = false;
        env.localModelPath = resolved.basePath;

        if (resolved.isSpecialized) {
            if (vectorType === 'finance') {
                if (!_financePipeline) {
                    console.log(`[LLM Client] Loading specialized Finance ONNX embedding model (768d)...`);
                    env.localModelPath = resolved.basePath;
                    _financePipeline = await pipeline('feature-extraction', resolved.modelName, { quantized: resolved.quantized });
                }
                const output = await _financePipeline(text, { pooling: 'mean', normalize: true });
                return Array.from(output.data);
            } else {
                if (!_legalPipeline) {
                    console.log(`[LLM Client] Loading specialized Legal ONNX embedding model (InLegal-SBERT 768d)...`);
                    env.localModelPath = resolved.basePath;
                    _legalPipeline = await pipeline('feature-extraction', resolved.modelName, { quantized: resolved.quantized });
                }
                const output = await _legalPipeline(text, { pooling: 'mean', normalize: true });
                return Array.from(output.data);
            }
        } else {
            if (!_defaultPipeline) {
                console.log(`[LLM Client] Loading embedded Core ONNX embedding model (nomic-embed-text-v1.5, 768d, 8k)...`);
                env.localModelPath = resolved.basePath;
                _defaultPipeline = await pipeline('feature-extraction', resolved.modelName, { quantized: resolved.quantized });
            }

            // Format with task prefix for optimal Nomic retrieval
            const prefix = isQuery ? 'search_query: ' : 'search_document: ';
            const formattedText = text.startsWith('search_query: ') || text.startsWith('search_document: ')
                ? text
                : `${prefix}${text}`;
            const output = await _defaultPipeline(formattedText, { pooling: 'mean', normalize: true });
            return Array.from(output.data);
        }
    } catch (err) {
        console.warn(`[LLM Client] Embedding generation failed: ${err.message}`);
        return null;
    }
}

async function* streamChat(messages, opts = {}) {
    const config = loadLlmConfig(opts);
    const { compactHistory, shouldCompact, estimateTokens, repairToolPairing, isContextOverflow, emergencyCompact } = require('./history-compactor');

    // Self-healing: ensure all tool calls and results are paired and sequenced correctly
    // Prevents unrecoverable HTTP 400 Bad Request provider errors on interrupted turns
    let outboundMessages = repairToolPairing(messages);

    // Mathematical context auto-compaction before outbound model dispatch
    if (shouldCompact(outboundMessages, 2048, opts)) {
        const est = estimateTokens(outboundMessages);
        console.log(`[LLM Client] Context window threshold reached (~${est} tokens). Auto-compacting outbound history...`);
        const result = await compactHistory(outboundMessages, { contextWindow: 2048, caseDir: opts.caseDir });
        if (result.compacted) {
            console.log(`[LLM Client] Context auto-compacted: ${result.originalTokens} tokens -> ${result.compactedTokens} tokens (Boundary: Turn ${result.boundaryIndex})`);
            outboundMessages = result.messages;
        }
    }

    // Strict 1,500 token input budget pre-flight check with emergency fallback (Plan 15)
    let approxTokens = estimateTokens(outboundMessages);
    if (approxTokens > 1500) {
        console.warn(`[LLM Client] Pre-flight warning: Prompt size (~${approxTokens} tokens) exceeds budget. Attempting emergency compaction...`);
        const emergency = await emergencyCompact(outboundMessages, { contextWindow: 2048, caseDir: opts.caseDir });
        if (emergency.compacted && emergency.compactedTokens < approxTokens) {
            console.log(`[LLM Client] Pre-flight emergency compaction reduced tokens: ${approxTokens} -> ${emergency.compactedTokens}`);
            outboundMessages = emergency.messages;
            approxTokens = emergency.compactedTokens;
        }
        if (approxTokens > 1500) {
            console.warn(`[LLM Client] Prompt size (~${approxTokens} tokens) still exceeds LegalParam context budget (1,500 tokens max).`);
            const err = new Error(`⚠️ Context Window Exceeded: LegalParam context budget is 2,048 tokens (~1,500 tokens max, found ${approxTokens} tokens). Please refine selection in Active-Context Control Matrix or shorten prompt.`);
            err.code = 'CONTEXT_EXCEEDED';
            throw err;
        }
    }

    // Unified single LLM engine port (8090) with hot-swapping
    const targetEndpoint = LLAMAFILE_URL; // Port 8090
    const isLlamafileRunning = await checkLlamafileHealth(targetEndpoint);

    if (config.activeMode === 'lite' || !isLlamafileRunning) {
        const err = new Error(`LLM Engine (Port 8090) is OFFLINE. Click "Start Engine" in Settings to enable full local AI generation.`);
        err.code = 'LITE_MODE';
        throw err;
    }

    if (isLlamafileRunning) {
        console.log(`[LLM Client] Routing query to local Llamafile server (${targetEndpoint})`);
        try {
            yield* streamLlamafile(outboundMessages, targetEndpoint);
            return;
        } catch (e) {
            // Plan 15: Intercept provider-level context overflow and retry with emergency compaction
            if (isContextOverflow(e) && !opts._didEmergencyRetry) {
                console.warn(`[LLM Client] Context overflow detected from engine: "${e.message}". Attempting emergency compaction retry...`);
                const emergency = await emergencyCompact(outboundMessages, { contextWindow: 2048, caseDir: opts.caseDir });
                if (emergency.compacted && emergency.compactedTokens < approxTokens) {
                    console.log(`[LLM Client] Emergency compaction reduced tokens: ${approxTokens} -> ${emergency.compactedTokens}. Retrying stream...`);
                    yield* streamChat(emergency.messages, { ...opts, _didEmergencyRetry: true });
                    return;
                }
            }
            console.error('[LLM Client] Llamafile stream failed:', e.message);
            throw e;
        }
    }
}

async function getChatResponse(messages, opts = {}) {
    const timeoutMs = opts.timeout || 120000;
    
    const fetchPromise = (async () => {
        let fullText = '';
        for await (const chunk of streamChat(messages, opts)) {
            fullText += chunk;
        }
        return fullText;
    })();
    
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('LLM call timed out')), timeoutMs);
    });
    
    return Promise.race([fetchPromise, timeoutPromise]);
}

module.exports = {
    streamChat,
    getChatResponse,
    getEmbedding,
    detectDocumentVectorType,
    warmupEmbeddingPipeline,
    checkLlamafileHealth,
    streamLlamafile,
    checkOllamaHealth,
    streamOllama,
    streamGemini,
    streamOpenAI,
    streamOpenRouter,
    loadLlmConfig,
    repairToolPairing,
    isContextOverflow,
    is_context_overflow: isContextOverflow,
    emergencyCompact
};

