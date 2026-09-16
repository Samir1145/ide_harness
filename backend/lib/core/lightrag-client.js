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

class LightRagClient {
    constructor() {
        this.config = this._loadConfig();
    }

    _loadConfig() {
        let apiUrl = process.env.LIGHTRAG_API_URL || 'http://localhost:8020';
        let apiKey = process.env.LIGHTRAG_API_KEY || '';

        // Read settings overrides if present
        const settingsPath = path.join(os.homedir(), '.gemini', 'hayagriva_settings.json');
        if (fs.existsSync(settingsPath)) {
            try {
                const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                if (s.lightragApiUrl) apiUrl = s.lightragApiUrl;
                if (s.lightragApiKey || s.advisoryApiKey) apiKey = s.lightragApiKey || s.advisoryApiKey;
            } catch (_) {}
        }

        return { apiUrl: apiUrl.replace(/\/+$/, ''), apiKey };
    }

    reloadConfig() {
        this.config = this._loadConfig();
        return this.config;
    }

    isConfigured() {
        return Boolean(this.config.apiKey && this.config.apiKey.trim().length > 0);
    }

    async checkHealth(timeoutMs = 3000) {
        return new Promise((resolve) => {
            try {
                const parsed = url.parse(`${this.config.apiUrl}/health`);
                const isHttps = parsed.protocol === 'https:';
                const client = isHttps ? https : http;

                const req = client.get(parsed.href, { timeout: timeoutMs }, (res) => {
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
     * Executes a legal precedent query against LightRAG.
     * @param {string} queryText - User's legal research inquiry
     * @param {object} options - { mode: 'hybrid' | 'local' | 'global' | 'naive', top_k: 10 }
     * @returns {Promise<{ success: boolean, answer?: string, references?: Array, mode?: string, error?: string, fallbackNeeded?: boolean }>}
     */
    async queryPrecedents(queryText, options = {}) {
        const mode = options.mode || 'hybrid';
        const top_k = options.top_k || 10;

        const payload = JSON.stringify({
            query: queryText,
            mode: mode,
            stream: false,
            top_k: top_k
        });

        const targetUrl = `${this.config.apiUrl}/query`;
        const parsed = url.parse(targetUrl);
        const isHttps = parsed.protocol === 'https:';
        const client = isHttps ? https : http;

        const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        };

        if (this.config.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
            headers['X-API-Key'] = this.config.apiKey;
        }

        return new Promise((resolve) => {
            const req = client.request({
                hostname: parsed.hostname,
                port: parsed.port || (isHttps ? 443 : 80),
                path: parsed.path,
                method: 'POST',
                headers: headers,
                timeout: options.timeoutMs || 15000
            }, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    if (res.statusCode === 401 || res.statusCode === 403) {
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
                            const refs = parsedData.references || parsedData.context_sources || [];
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
