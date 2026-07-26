const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

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

let _legalPipeline = null;
let _financePipeline = null;

async function getEmbedding(text, caseDir) {
    let vertical = 'legal';
    try {
        const { pipeline, env } = await import('@xenova/transformers');
        env.allowLocalModels = true;
        env.allowRemoteModels = false;

        // 1. Resolve case vertical
        if (caseDir) {
            const caseConfigPath = path.join(caseDir, 'concepts', 'case_metadata.json');
            if (fs.existsSync(caseConfigPath)) {
                try {
                    const caseMeta = JSON.parse(fs.readFileSync(caseConfigPath, 'utf8'));
                    vertical = caseMeta.vertical || 'legal';
                } catch (_) {}
            } else if (caseDir.toLowerCase().includes('ibc') || caseDir.toLowerCase().includes('finance')) {
                vertical = 'finance';
            }
        }

        // 2. Load the appropriate model pipeline
        if (vertical === 'finance') {
            if (!_financePipeline) {
                const modelPath = path.join(__dirname, '..', '..', 'models', 'embeddings', 'finance', 'finance-embeddings-investopedia');
                console.log(`[LLM Client] Loading local Finance ONNX embedding model (768d) from: ${modelPath}`);
                _financePipeline = await pipeline('feature-extraction', modelPath, { quantized: false });
            }
            const output = await _financePipeline(text, { pooling: 'mean', normalize: true });
            return Array.from(output.data);
        } else {
            if (!_legalPipeline) {
                console.log('[LLM Client] Loading Legal ONNX embedding model ("Xenova/all-MiniLM-L6-v2")...');
                _legalPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
            }
            const output = await _legalPipeline(text, { pooling: 'mean', normalize: true });
            return Array.from(output.data);
        }
    } catch (err) {
        console.error(`[LLM Client] Local ONNX embedding failed for ${vertical}: ${err.message}`);
        // Return 768d zero vector fallback
        return new Array(768).fill(0);
    }
}

async function* streamChat(messages, opts = {}) {
    const config = loadLlmConfig(opts);
    // Strict 1,500 token input budget pre-flight check
    const totalChars = messages.reduce((acc, m) => acc + (m.content ? m.content.length : 0), 0);
    const approxTokens = Math.ceil(totalChars / 4);
    if (approxTokens > 1500) {
        console.warn(`[LLM Client] Warning: Prompt size (~${approxTokens} tokens) exceeds LegalParam context budget (1,500 tokens max).`);
        const err = new Error(`⚠️ Context Window Exceeded: LegalParam context budget is 2,048 tokens (~1,500 tokens max). Please refine selection or shorten prompt.`);
        err.code = 'CONTEXT_EXCEEDED';
        throw err;
    }

    // Resolve case vertical to set correct Llamafile port endpoint
    let targetEndpoint = LLAMAFILE_URL; // Default: Port 8090 (legalparam)
    if (opts.caseDir) {
        const caseConfigPath = path.join(opts.caseDir, 'concepts', 'case_metadata.json');
        let vertical = 'legal';
        if (fs.existsSync(caseConfigPath)) {
            try {
                const caseMeta = JSON.parse(fs.readFileSync(caseConfigPath, 'utf8'));
                vertical = caseMeta.vertical || 'legal';
            } catch (_) {}
        } else if (opts.caseDir.toLowerCase().includes('ibc') || opts.caseDir.toLowerCase().includes('finance')) {
            vertical = 'finance';
        }
        
        if (vertical === 'finance') {
            targetEndpoint = 'http://127.0.0.1:8091'; // Port 8091 (financeparam)
        }
    }

    const isLlamafileRunning = await checkLlamafileHealth(targetEndpoint);

    if (config.activeMode === 'lite' || !isLlamafileRunning) {
        const targetPort = targetEndpoint.replace('http://127.0.0.1:', '');
        const err = new Error(`LLM Engine (Port ${targetPort}) is OFFLINE. Click "Start Engine" in Settings to enable full local AI generation.`);
        err.code = 'LITE_MODE';
        throw err;
    }

    if (isLlamafileRunning) {
        console.log(`[LLM Client] Routing query to local Llamafile server (${targetEndpoint})`);
        try {
            yield* streamLlamafile(messages, targetEndpoint);
            return;
        } catch (e) {
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

module.exports = { streamChat, getChatResponse, getEmbedding, checkLlamafileHealth, streamLlamafile, checkOllamaHealth, streamOllama, streamGemini, streamOpenAI, streamOpenRouter, loadLlmConfig };
