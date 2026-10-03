/**
 * LightRAG Precedents Knowledge Graph Client
 * ─────────────────────────────────────────────────────────────────
 * Connects the IDE to the hosted LightRAG Precedents Cloud API
 * serving 43,000+ Supreme Court, NCLAT, NCLT, and High Court judgments.
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const url = require('url');
const os = require('os');

const DEFAULT_CLOUD_LIGHTRAG_URL = 'http://20.198.0.59:9621';
const DEFAULT_CLOUD_LIGHTRAG_KEY = '20b8aa6253d9e09e9c70417d4938f8c7';

class LightRagClient {
    constructor() {
        this.config = this._loadConfig();
    }

    _loadConfig(caseDir = null) {
        // Automatically read backend/.env if environment variables are not yet populated
        const envPath = path.join(__dirname, '..', '..', '.env');
        if (fs.existsSync(envPath)) {
            try {
                const lines = fs.readFileSync(envPath, 'utf8').split('\n');
                for (const line of lines) {
                    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
                    if (match) {
                        const key = match[1];
                        let value = (match[2] || '').trim();
                        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                            value = value.slice(1, -1);
                        }
                        if (!process.env[key]) process.env[key] = value.trim();
                    }
                }
            } catch (_) {}
        }

        let apiUrl = process.env.LIGHTRAG_API_URL || process.env.LIGHTRAG_URL || DEFAULT_CLOUD_LIGHTRAG_URL;
        let apiKey = process.env.LIGHTRAG_API_KEY || (apiUrl === DEFAULT_CLOUD_LIGHTRAG_URL ? DEFAULT_CLOUD_LIGHTRAG_KEY : '');
        let workspace = process.env.LIGHTRAG_WORKSPACE || '';
        let queryMode = process.env.LIGHTRAG_QUERY_MODE || 'mix';

        // Read case settings overrides if present
        if (caseDir && fs.existsSync(path.join(caseDir, 'hayagriva_settings.json'))) {
            try {
                const cs = JSON.parse(fs.readFileSync(path.join(caseDir, 'hayagriva_settings.json'), 'utf8'));
                if (cs.lightragApiUrl || cs.resolutionbazaar_url) apiUrl = cs.lightragApiUrl || cs.resolutionbazaar_url;
                if (cs.lightragApiKey !== undefined) {
                    apiKey = cs.lightragApiKey;
                } else if (cs.resolutionbazaar_key || cs.advisoryApiKey) {
                    apiKey = cs.resolutionbazaar_key || cs.advisoryApiKey;
                }
                if (cs.lightragWorkspace) workspace = cs.lightragWorkspace;
                if (cs.lightragQueryMode) queryMode = cs.lightragQueryMode;
            } catch (_) {}
        }

        // 1. Read Global Chamber Profile (~/.hayagriva/chamber_config.json)
        const chamberConfigPath = path.join(os.homedir(), '.hayagriva', 'chamber_config.json');
        if (fs.existsSync(chamberConfigPath)) {
            try {
                const s = JSON.parse(fs.readFileSync(chamberConfigPath, 'utf8'));
                if (s.lightragApiUrl || s.resolutionbazaar_url) apiUrl = s.lightragApiUrl || s.resolutionbazaar_url;
                if (s.lightragApiKey !== undefined) {
                    apiKey = s.lightragApiKey;
                } else if (s.resolutionbazaar_key || s.advisoryApiKey) {
                    apiKey = s.resolutionbazaar_key || s.advisoryApiKey;
                }
                if (s.lightragWorkspace) workspace = s.lightragWorkspace;
                if (s.lightragQueryMode) queryMode = s.lightragQueryMode;
            } catch (_) {}
        }

        // 2. Read Legacy global settings overrides if present (~/.gemini/hayagriva_settings.json)
        const settingsPath = path.join(os.homedir(), '.gemini', 'hayagriva_settings.json');
        if (fs.existsSync(settingsPath)) {
            try {
                const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                // Only use legacy settings if not explicitly overridden by environment
                if (!process.env.LIGHTRAG_API_URL && (s.lightragApiUrl || s.resolutionbazaar_url)) {
                    apiUrl = s.lightragApiUrl || s.resolutionbazaar_url;
                }
                if (!process.env.LIGHTRAG_API_KEY) {
                    if (s.lightragApiKey !== undefined && s.lightragApiKey !== '') {
                        apiKey = s.lightragApiKey;
                    } else if (s.resolutionbazaar_key || s.advisoryApiKey) {
                        apiKey = s.resolutionbazaar_key || s.advisoryApiKey;
                    }
                }
                if (!workspace && s.lightragWorkspace) workspace = s.lightragWorkspace;
                if (s.lightragQueryMode && queryMode === 'mix') queryMode = s.lightragQueryMode;
            } catch (_) {}
        }

        // Auto-supply default key if pointing to production cloud and key is missing
        if (apiUrl.includes('20.198.0.59') && !apiKey) {
            apiKey = DEFAULT_CLOUD_LIGHTRAG_KEY;
        }

        return {
            apiUrl: apiUrl.replace(/\/+$/, ''),
            apiKey: String(apiKey || '').trim(),
            workspace: String(workspace || '').trim(),
            queryMode: String(queryMode || 'mix').trim()
        };
    }

    reloadConfig(caseDir = null) {
        this.config = this._loadConfig(caseDir);
        return this.config;
    }

    refreshConfig(caseDir = null) {
        return this.reloadConfig(caseDir);
    }

    isConfigured() {
        return Boolean(this.config.apiKey && this.config.apiKey.length > 0);
    }

    _buildHeaders(extra = {}) {
        const headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...extra
        };
        const isLocal = this.config.apiUrl.includes('127.0.0.1') || this.config.apiUrl.includes('localhost');
        const isMockKey = Boolean(this.config.apiKey && this.config.apiKey.startsWith('rb_live'));
        if (this.config.apiKey && (!isLocal || !isMockKey) && !extra.forceNoAuth) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
            headers['X-API-Key'] = this.config.apiKey;
        }
        if (this.config.workspace) {
            headers['LIGHTRAG-WORKSPACE'] = this.config.workspace;
        }
        return headers;
    }

    async checkHealth(timeoutMs = 3000) {
        return new Promise((resolve) => {
            try {
                const targetUrl = new URL(`${this.config.apiUrl}/health`);
                const client = targetUrl.protocol === 'https:' ? https : http;

                const req = client.get(targetUrl, {
                    timeout: timeoutMs,
                    headers: this._buildHeaders()
                }, (res) => {
                    if (res.statusCode >= 200 && res.statusCode < 400) {
                        resolve({ online: true, statusCode: res.statusCode });
                    } else {
                        resolve({ online: false, error: `HTTP ${res.statusCode}` });
                    }
                });

                req.on('error', (err) => {
                    resolve({ online: false, error: err.message });
                });

                req.on('timeout', () => {
                    req.destroy();
                    resolve({ online: false, error: 'TIMEOUT' });
                });
            } catch (err) {
                resolve({ online: false, error: err.message });
            }
        });
    }

    /**
     * Retrieves raw knowledge graph entities, relationships, and context chunks from LightRAG /query/data.
     * Pattern borrowed from qwen-audio-agent knowledge provider.
     * @param {string} queryText - Research query
     * @param {object} options - { mode: 'mix' | 'hybrid' | 'local' | 'global', top_k: 5, chunk_top_k: 5, timeoutMs: 15000 }
     * @returns {Promise<{ success: boolean, chunks: Array, entities: Array, relationships: Array, references: Array, error?: string, fallbackNeeded?: boolean }>}
     */
    async retrieveRawContext(queryText, options = {}) {
        const mode = options.mode || this.config.queryMode || 'mix';
        const top_k = Math.max(1, Math.min(10, Number(options.top_k) || 5));
        const chunk_top_k = Math.max(1, Math.min(10, Number(options.chunk_top_k) || top_k));

        const payload = JSON.stringify({
            query: String(queryText || '').trim(),
            mode: mode,
            top_k: top_k,
            chunk_top_k: chunk_top_k
        });

        const targetUrl = new URL(`${this.config.apiUrl}/query/data`);
        const isHttps = targetUrl.protocol === 'https:';
        const client = isHttps ? https : http;

        const headers = this._buildHeaders({
            'Content-Length': Buffer.byteLength(payload)
        });

        return new Promise((resolve) => {
            const req = client.request(targetUrl, {
                method: 'POST',
                headers: headers,
                timeout: options.timeoutMs || 20000
            }, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', async () => {
                    if (res.statusCode === 401 || res.statusCode === 403) {
                        return resolve({
                            success: false,
                            error: 'SUBSCRIPTION_EXPIRED_OR_INVALID_KEY',
                            fallbackNeeded: true,
                            chunks: [],
                            entities: [],
                            relationships: []
                        });
                    }

                    // If /query/data is not found (HTTP 404), fall back to standard /query synthesis
                    if (res.statusCode === 404) {
                        const fallbackRes = await this.queryPrecedents(queryText, options);
                        return resolve({
                            success: fallbackRes.success,
                            fallbackFromQueryData: true,
                            answer: fallbackRes.answer,
                            chunks: fallbackRes.answer ? [{ id: 'fallback-chunk-1', content: fallbackRes.answer }] : [],
                            entities: [],
                            relationships: [],
                            references: fallbackRes.references || []
                        });
                    }

                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            const parsedData = JSON.parse(body);
                            const data = parsedData.data || parsedData;
                            const rawChunks = Array.isArray(data.chunks) ? data.chunks : [];
                            const rawEntities = Array.isArray(data.entities) ? data.entities : [];
                            const rawRelationships = Array.isArray(data.relationships) ? data.relationships : [];
                            const rawRefs = Array.isArray(data.references) ? data.references : [];

                            const refMap = new Map();
                            for (const ref of rawRefs) {
                                if (ref && ref.reference_id) refMap.set(ref.reference_id, ref);
                            }

                            const normalizedChunks = rawChunks.map((chunk, idx) => {
                                const ref = chunk.reference_id ? refMap.get(chunk.reference_id) : null;
                                const filePath = chunk.file_path || (ref && ref.file_path) || '';
                                const title = (ref && ref.title) || (filePath ? path.basename(filePath) : `Precedent Fragment #${idx + 1}`);
                                return {
                                    id: chunk.chunk_id || `chunk-${idx + 1}`,
                                    content: String(chunk.content || '').trim(),
                                    referenceId: chunk.reference_id || '',
                                    filePath: filePath,
                                    title: title,
                                    score: chunk.score || null
                                };
                            }).filter(c => c.content.length > 0);

                            resolve({
                                success: true,
                                chunks: normalizedChunks,
                                entities: rawEntities,
                                relationships: rawRelationships,
                                references: rawRefs,
                                mode: mode
                            });
                        } catch (parseErr) {
                            resolve({
                                success: false,
                                error: `JSON_PARSE_ERROR: ${parseErr.message}`,
                                fallbackNeeded: true,
                                chunks: [],
                                entities: [],
                                relationships: []
                            });
                        }
                    } else {
                        resolve({
                            success: false,
                            error: `HTTP_${res.statusCode}`,
                            body: body,
                            fallbackNeeded: true,
                            chunks: [],
                            entities: [],
                            relationships: []
                        });
                    }
                });
            });

            req.on('error', (err) => {
                resolve({
                    success: false,
                    error: err.message,
                    fallbackNeeded: true,
                    chunks: [],
                    entities: [],
                    relationships: []
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({
                    success: false,
                    error: 'NETWORK_TIMEOUT',
                    fallbackNeeded: true,
                    chunks: [],
                    entities: [],
                    relationships: []
                });
            });

            req.write(payload);
            req.end();
        });
    }

    /**
     * Executes a legal precedent query against LightRAG.
     * @param {string} queryText - User's legal research inquiry
     * @param {object} options - { mode: 'hybrid' | 'mix' | 'local' | 'global' | 'naive', top_k: 10 }
     * @returns {Promise<{ success: boolean, answer?: string, references?: Array, mode?: string, error?: string, fallbackNeeded?: boolean }>}
     */
    async queryPrecedents(queryText, options = {}) {
        const mode = options.mode || this.config.queryMode || 'hybrid';
        const top_k = options.top_k || 10;

        const payload = JSON.stringify({
            query: queryText,
            mode: mode,
            stream: false,
            top_k: top_k
        });

        const targetUrl = new URL(`${this.config.apiUrl}/query`);
        const isHttps = targetUrl.protocol === 'https:';
        const client = isHttps ? https : http;

        const headers = this._buildHeaders({
            'Content-Length': Buffer.byteLength(payload)
        });

        return new Promise((resolve) => {
            const req = client.request(targetUrl, {
                method: 'POST',
                headers: headers,
                timeout: options.timeoutMs || 15000
            }, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    if (res.statusCode === 401 || res.statusCode === 403) {
                        const isLocal = targetUrl.hostname === '127.0.0.1' || targetUrl.hostname === 'localhost';
                        if (isLocal && headers['Authorization'] && !options._retriedWithoutAuth) {
                            console.log('[LightRagClient] Retrying local query without Authorization header...');
                            return this.queryPrecedents(queryText, { ...options, _retriedWithoutAuth: true, forceNoAuth: true }).then(resolve);
                        }
                        return resolve({
                            success: false,
                            error: 'SUBSCRIPTION_EXPIRED_OR_INVALID_KEY',
                            fallbackNeeded: true
                        });
                    }

                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            const parsedData = JSON.parse(body);
                            const answer = parsedData.response || parsedData.answer || parsedData.result || body;
                            const refs = parsedData.references || parsedData.context_sources || (parsedData.data && parsedData.data.references) || [];
                            resolve({
                                success: true,
                                answer: answer,
                                references: refs,
                                mode: mode
                            });
                        } catch (_) {
                            resolve({
                                success: true,
                                answer: body,
                                references: [],
                                mode: mode
                            });
                        }
                    } else {
                        resolve({
                            success: false,
                            error: `HTTP_${res.statusCode}`,
                            body: body,
                            fallbackNeeded: true
                        });
                    }
                });
            });

            req.on('error', (err) => {
                resolve({
                    success: false,
                    error: err.message,
                    fallbackNeeded: true
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({
                    success: false,
                    error: 'NETWORK_TIMEOUT',
                    fallbackNeeded: true
                });
            });

            req.write(payload);
            req.end();
        });
    }

    /**
     * Formats raw LightRAG chunks and entity relationships into a compact prompt block
     * strictly optimized for LegalParam-2.9B's working context window (~1,200 tokens).
     */
    formatRawContextForLlm(rawResult, maxChars = 2800) {
        if (!rawResult || !rawResult.success) return '';

        let block = '';

        // 1. Entities
        if (Array.isArray(rawResult.entities) && rawResult.entities.length > 0) {
            const entSummary = rawResult.entities.slice(0, 6)
                .map(e => `• ${e.entity_name || e.name}: ${e.description || e.entity_type || ''}`)
                .join('\n');
            block += `### Relevant Legal Entities & Doctrine:\n${entSummary}\n\n`;
        }

        // 2. Chunks
        if (Array.isArray(rawResult.chunks) && rawResult.chunks.length > 0) {
            block += `### Authoritative Precedent Rulings (Knowledge Graph Chunks):\n`;
            for (let i = 0; i < rawResult.chunks.length; i++) {
                const chunk = rawResult.chunks[i];
                const header = `[Precedent Source #${i + 1}${chunk.title ? ` - ${chunk.title}` : ''}]:\n`;
                const content = chunk.content.length > 600 ? chunk.content.slice(0, 600) + '...' : chunk.content;
                const entry = `${header}${content}\n\n`;

                if (block.length + entry.length > maxChars) {
                    break;
                }
                block += entry;
            }
        }

        return block.trim();
    }

    formatAsPrecedentDossier(lightRagResponse) {
        if (!lightRagResponse || !lightRagResponse.answer) return '';
        let md = `### ⚖️ Precedent Intelligence Dossier (LightRAG Knowledge Graph)\n\n`;
        md += `${lightRagResponse.answer}\n\n`;
        if (Array.isArray(lightRagResponse.references) && lightRagResponse.references.length > 0) {
            md += `#### 📚 Authority Citations & Sources:\n`;
            for (let i = 0; i < lightRagResponse.references.length; i++) {
                const r = lightRagResponse.references[i];
                const title = typeof r === 'string' ? r : (r.title || r.name || `Citation ${i + 1}`);
                md += `- **[${i + 1}]** ${title}\n`;
            }
        }
        return md;
    }
}

module.exports = new LightRagClient();
