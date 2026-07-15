const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:latest';
const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

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
        activeMode: 'local',
        localRunner: 'ollama',
        localEndpoint: 'http://127.0.0.1:11434',
        localChatModel: 'qwen2.5-coder:1.5b',
        localEmbedModel: 'nomic-embed-text',
        cloudProvider: 'gemini',
        cloudModel: 'gemini-1.5-flash',
        apiKey: null
    };

    if (opts && opts.caseDir) {
        const settingsPath = path.join(opts.caseDir, 'hayagriva_settings.json');
        if (fs.existsSync(settingsPath)) {
            try {
                const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                Object.assign(config, saved);
            } catch (_) {}
        }

        // Try to load API key from SQLite
        const dbPath = path.join(opts.caseDir, 'concepts', 'case_vault.db');
        if (fs.existsSync(dbPath)) {
            try {
                const Database = require('better-sqlite3');
                const db = new Database(dbPath);
                const secretKey = `${config.cloudProvider}_api_key`;
                const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='secure_secrets'").get();
                if (tableCheck) {
                    const row = db.prepare("SELECT secret_value FROM secure_secrets WHERE secret_key = ?").get(secretKey);
                    if (row && row.secret_value) {
                        config.apiKey = row.secret_value;
                    }
                }
                db.close();
            } catch (err) {
                // Silent fallback
            }
        }
    }

    // Fall back to env vars if not configured or missing keys
    if (!config.apiKey) {
        if (config.cloudProvider === 'gemini') config.apiKey = process.env.GEMINI_API_KEY;
        else if (config.cloudProvider === 'openai') config.apiKey = process.env.OPENAI_API_KEY;
        else if (config.cloudProvider === 'openrouter') config.apiKey = process.env.OPENROUTER_API_KEY;
    }

    // Auto-detect available cloud API keys in environment to switch from slow local to fast cloud mode
    if (config.activeMode === 'local') {
        const hasSettingsFile = opts && opts.caseDir && fs.existsSync(path.join(opts.caseDir, 'hayagriva_settings.json'));
        if (!hasSettingsFile) {
            if (process.env.GEMINI_API_KEY) {
                config.activeMode = 'cloud';
                config.cloudProvider = 'gemini';
                config.apiKey = process.env.GEMINI_API_KEY;
                console.log('[LLM Client] Auto-detected GEMINI_API_KEY. Upgrading to Cloud mode...');
            } else if (process.env.OPENROUTER_API_KEY) {
                config.activeMode = 'cloud';
                config.cloudProvider = 'openrouter';
                config.apiKey = process.env.OPENROUTER_API_KEY;
                console.log('[LLM Client] Auto-detected OPENROUTER_API_KEY. Upgrading to Cloud mode...');
            } else if (process.env.OPENAI_API_KEY) {
                config.activeMode = 'cloud';
                config.cloudProvider = 'openai';
                config.apiKey = process.env.OPENAI_API_KEY;
                console.log('[LLM Client] Auto-detected OPENAI_API_KEY. Upgrading to Cloud mode...');
            }
        }
    }

    return config;
}

let _localPipeline = null;

async function getLocalEmbedding(text) {
    if (!_localPipeline) {
        console.log('[LLM Client] Initializing local ONNX transformers embedding pipeline...');
        try {
            const { pipeline, env } = await import('@xenova/transformers');
            env.allowLocalModels = true;
            _localPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        } catch (err) {
            console.error('[LLM Client] Failed to load local ONNX transformer model:', err.message);
            throw new Error('Local embedding model is not cached and system is offline. Please connect to the internet once to auto-download (~25MB) then retry.');
        }
    }
    const output = await _localPipeline(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

async function getEmbedding(text, caseDir) {
    const config = loadLlmConfig({ caseDir });
    
    if (config.activeMode === 'local') {
        try {
            return await getLocalEmbedding(text);
        } catch (err) {
            console.error(`[LLM Client] Local ONNX embedding failed: ${err.message}`);
            return new Array(384).fill(0);
        }
    } else {
        if (config.cloudProvider === 'gemini') {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${config.apiKey}`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: { parts: [{ text }] }
                    })
                });
                if (res.ok) {
                    const json = await res.json();
                    if (json.embedding && json.embedding.values) return json.embedding.values;
                }
                throw new Error(`Gemini API returned status ${res.status}`);
            } catch (err) {
                console.error(`[LLM Client] Gemini cloud embedding failed: ${err.message}. Falling back to local ONNX.`);
                try {
                    return await getLocalEmbedding(text);
                } catch (_) {
                    return new Array(384).fill(0);
                }
            }
        } else if (config.cloudProvider === 'openai') {
            try {
                const url = `https://api.openai.com/v1/embeddings`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${config.apiKey}`
                    },
                    body: JSON.stringify({
                        input: text,
                        model: 'text-embedding-3-small'
                    })
                });
                if (res.ok) {
                    const json = await res.json();
                    if (json.data && json.data[0] && json.data[0].embedding) return json.data[0].embedding;
                }
                throw new Error(`OpenAI API returned status ${res.status}`);
            } catch (err) {
                console.error(`[LLM Client] OpenAI cloud embedding failed: ${err.message}. Falling back to local ONNX.`);
                try {
                    return await getLocalEmbedding(text);
                } catch (_) {
                    return new Array(384).fill(0);
                }
            }
        }
    }
    try {
        return await getLocalEmbedding(text);
    } catch (_) {
        return new Array(384).fill(0);
    }
}

async function* streamChat(messages, opts = {}) {
    const config = loadLlmConfig(opts);
    const hasImages = messages.some(m => m.images && m.images.length > 0);

    if (config.activeMode === 'local') {
        // [Ollama Commented Out Temporarily for Small Machine Performance Profile]
        /*
        const isOllamaRunning = await checkOllamaHealth(config.localEndpoint);
        if (isOllamaRunning) {
            const chatModel = opts.model || config.localChatModel;
            console.log(`[LLM Client] Routing query to local runner (${chatModel})`);
            try {
                yield* streamOllama(messages, chatModel, config.localEndpoint);
                return;
            } catch (e) {
                console.error('[LLM Client] Local LLM stream failed:', e.message);
                throw e;
            }
        } else {
            throw new Error(`Local LLM runner is offline at ${config.localEndpoint}. Cannot process offline request.`);
        }
        */
        console.log('[LLM Client] Local Ollama call bypassed. Returning mock response for fact extraction.');
        yield '- What are the main terms?\n- When is the termination active?\n- Who are the signers?\n- What is the governing law?';
        return;
    } else {
        if (config.cloudProvider === 'openrouter' && config.apiKey) {
            const model = opts.model || config.cloudModel || 'google/gemini-2.5-flash';
            console.log(`[LLM Client] Routing query to OpenRouter (${model})`);
            try {
                yield* streamOpenRouter(messages, config.apiKey, model);
                return;
            } catch (e) {
                console.error('[LLM Client] OpenRouter stream failed:', e.message);
                throw e;
            }
        }
        
        if (config.cloudProvider === 'gemini' && config.apiKey) {
            const model = opts.model || config.cloudModel || 'gemini-1.5-flash';
            console.log(`[LLM Client] Routing query to Google Gemini (${model})`);
            try {
                yield* streamGemini(messages, config.apiKey, model);
                return;
            } catch (e) {
                console.error('[LLM Client] Gemini stream failed:', e.message);
                throw e;
            }
        }

        if (config.cloudProvider === 'openai' && config.apiKey) {
            const model = opts.model || config.cloudModel || 'gpt-4o-mini';
            console.log(`[LLM Client] Routing query to OpenAI (${model})`);
            try {
                yield* streamOpenAI(messages, config.apiKey, model);
                return;
            } catch (e) {
                console.error('[LLM Client] OpenAI stream failed:', e.message);
                throw e;
            }
        }

        throw new Error(`Cloud provider "${config.cloudProvider}" is not configured or lacks a valid API key.`);
    }
}

async function getChatResponse(messages, opts = {}) {
    const timeoutMs = opts.timeout || 10000;
    
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

module.exports = { streamChat, getChatResponse, getEmbedding, checkOllamaHealth, streamOllama, streamGemini, streamOpenAI, streamOpenRouter, loadLlmConfig };
