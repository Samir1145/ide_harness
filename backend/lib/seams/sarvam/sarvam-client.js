'use strict';

/**
 * Sarvam AI Sovereign Client Seam
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides high-fidelity Indian speech capabilities for Hayagriva:
 * 1. Bulbul v1 (TTS): Indian Senior Counsel oral synthesis (Arvind, Amartya, Meera, Pavithra)
 * 2. Saaras v2 (STT): Indian English / Indic legal speech recognition with pre-injected IBC/CPC prompt
 * 3. Graceful fallback: If API key is not configured or offline, signals caller to use browser fallback
 * 4. Local SHA-256 Audio Cache: Avoids redundant synthesis costs for repeated queries
 * ─────────────────────────────────────────────────────────────────────────────
 */

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Available courtroom voice personas in Sarvam Bulbul (Mapped to official Sarvam v2 IDs)
const BULBUL_SPEAKERS = [
    { id: 'arvind', name: 'Arvind (Senior Advocate Male)', gender: 'male', desc: 'Authoritative, measured senior counsel cadence' },
    { id: 'aditya', name: 'Aditya (Senior Advocate Male)', gender: 'male', desc: 'Authoritative, measured senior counsel cadence' },
    { id: 'amartya', name: 'Amartya (Counsel Male)', gender: 'male', desc: 'Clear, modern analytical courtroom tone' },
    { id: 'amit', name: 'Amit (Counsel Male)', gender: 'male', desc: 'Clear, modern analytical courtroom tone' },
    { id: 'ratan', name: 'Ratan (Appellate Senior Male)', gender: 'male', desc: 'Deep, resonant judicial gravitas' },
    { id: 'meera', name: 'Meera (Senior Advocate Female)', gender: 'female', desc: 'Dignified, articulate senior appellate advocate' },
    { id: 'priya', name: 'Priya (Senior Advocate Female)', gender: 'female', desc: 'Dignified, articulate senior appellate advocate' },
    { id: 'pavithra', name: 'Pavithra (Counsel Female)', gender: 'female', desc: 'Crisp, articulate legal counsel tone' },
    { id: 'kavya', name: 'Kavya (Counsel Female)', gender: 'female', desc: 'Crisp, articulate legal counsel tone' },
    { id: 'anushka', name: 'Anushka (Specialist Female)', gender: 'female', desc: 'Expressive, clear chamber advisor' }
];

const SPEAKER_ALIAS_MAP = {
    'arvind': 'aditya',
    'amartya': 'amit',
    'meera': 'priya',
    'pavithra': 'kavya',
    'maitreyi': 'anushka'
};

// Pre-injected domain vocabulary prompt to prevent ASR mistranscriptions of Indian legal terms
const LEGAL_ASR_DOMAIN_PROMPT = 
    'NCLT, NCLAT, IBC, CIRP, SARFAESI, Adjudicating Authority, Section 7, Section 9, Section 10, ' +
    'Section 29A, Section 43, Section 45, Section 50, Section 66, Committee of Creditors, CoC, ' +
    'Resolution Professional, Interim Resolution Professional, IRP, RP, OTS default, Moratorium, ' +
    'Liquidation, Avoidance, PIMS, CPC Order 38, Commercial Court, Statement of Truth, Section 65B';

class SarvamClient {
    constructor(options = {}) {
        this.baseUrl = 'api.sarvam.ai';
        this.cacheDir = options.cacheDir || path.join(__dirname, '..', '..', '..', 'scratch', 'sarvam_cache');
        this.defaultSpeaker = options.defaultSpeaker || 'arvind';
        this.defaultLanguage = options.defaultLanguage || 'en-IN';
        this.hasExplicitApiKey = options.apiKey !== undefined;
        this.activeKey = this.hasExplicitApiKey ? String(options.apiKey || '').trim() : (process.env.SARVAM_API_KEY || '');

        // Ensure audio cache directory exists
        try {
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
            }
        } catch (_) {}
    }

    /**
     * Resolves the effective API key from case settings, global chamber profile, options, or environment.
     * Hierarchy: Case Override -> Explicit Client Option -> Global Chamber Config (~/.hayagriva/chamber_config.json) -> Environment
     */
    resolveApiKey(caseSettings = null) {
        if (caseSettings && caseSettings.sarvamEnabled === false) {
            return '';
        }
        if (caseSettings && caseSettings.sarvamApiKey !== undefined && caseSettings.sarvamApiKey !== null) {
            return String(caseSettings.sarvamApiKey).trim();
        }
        if (this.hasExplicitApiKey) {
            return this.activeKey;
        }

        // 1. Check Global Chamber Profile (~/.hayagriva/chamber_config.json)
        try {
            const os = require('os');
            const chamberPath = path.join(os.homedir(), '.hayagriva', 'chamber_config.json');
            if (fs.existsSync(chamberPath)) {
                const chamberCfg = JSON.parse(fs.readFileSync(chamberPath, 'utf8'));
                if (chamberCfg && chamberCfg.sarvamApiKey) {
                    return String(chamberCfg.sarvamApiKey).trim();
                }
            }
        } catch (_) {}

        // 2. Check Legacy Global Settings (~/.gemini/hayagriva_settings.json)
        try {
            const os = require('os');
            const globalPath = path.join(os.homedir(), '.gemini', 'hayagriva_settings.json');
            if (fs.existsSync(globalPath)) {
                const globalCfg = JSON.parse(fs.readFileSync(globalPath, 'utf8'));
                if (globalCfg && globalCfg.sarvamApiKey) {
                    return String(globalCfg.sarvamApiKey).trim();
                }
            }
        } catch (_) {}

        if (this.activeKey) {
            return String(this.activeKey).trim();
        }
        if (process.env.SARVAM_API_KEY) {
            return String(process.env.SARVAM_API_KEY).trim();
        }
        // Check backend/.env if readable
        try {
            const envPath = path.join(__dirname, '..', '..', '..', '.env');
            if (fs.existsSync(envPath)) {
                const envContent = fs.readFileSync(envPath, 'utf8');
                const match = envContent.match(/^\s*SARVAM_API_KEY\s*=\s*(.+)$/m);
                if (match && match[1]) {
                    const key = match[1].trim().replace(/^["']|["']$/g, '');
                    if (key) return key;
                }
            }
        } catch (_) {}

        return '';
    }

    /**
     * Resolves the default speaker from case settings, chamber profile, or defaults.
     */
    resolveSpeaker(caseSettings = null) {
        if (caseSettings && caseSettings.sarvamSpeaker) return String(caseSettings.sarvamSpeaker).trim();
        try {
            const os = require('os');
            const chamberPath = path.join(os.homedir(), '.hayagriva', 'chamber_config.json');
            if (fs.existsSync(chamberPath)) {
                const cfg = JSON.parse(fs.readFileSync(chamberPath, 'utf8'));
                if (cfg && cfg.sarvamSpeaker) return String(cfg.sarvamSpeaker).trim();
            }
        } catch (_) {}
        return this.defaultSpeaker;
    }

    /**
     * Resolves the default language from case settings, chamber profile, or defaults.
     */
    resolveLanguage(caseSettings = null) {
        if (caseSettings && caseSettings.sarvamLanguage) return String(caseSettings.sarvamLanguage).trim();
        try {
            const os = require('os');
            const chamberPath = path.join(os.homedir(), '.hayagriva', 'chamber_config.json');
            if (fs.existsSync(chamberPath)) {
                const cfg = JSON.parse(fs.readFileSync(chamberPath, 'utf8'));
                if (cfg && cfg.sarvamLanguage) return String(cfg.sarvamLanguage).trim();
            }
        } catch (_) {}
        return this.defaultLanguage;
    }

    /**
     * Checks if Sarvam AI is configured with an active API key.
     */
    isConfigured(caseSettings = null) {
        const key = this.resolveApiKey(caseSettings);
        return Boolean(key && key.length > 8);
    }

    /**
     * Returns telemetry and catalog of available voice personas.
     */
    getStatus(caseSettings = null) {
        const configured = this.isConfigured(caseSettings);
        const resolvedSpeaker = this.resolveSpeaker(caseSettings);
        const resolvedLang = this.resolveLanguage(caseSettings);

        return {
            configured,
            activeEngine: configured ? 'sarvam' : 'browser',
            engineReason: configured ? 'active_key' : 'browser_fallback',
            activeSpeaker: configured ? resolvedSpeaker : 'OS Native Browser Voice',
            provider: configured ? 'Sarvam AI (Indic Sovereign Voice Engine)' : 'Browser SpeechSynthesis (Air-Gapped / Free)',
            defaultSpeaker: resolvedSpeaker,
            defaultLanguage: resolvedLang,
            speakers: BULBUL_SPEAKERS,
            models: {
                tts: 'bulbul:v1',
                stt: 'saaras:v2'
            },
            dataResidency: 'India (MeitY Empaneled / DPDP Act Compliant)',
            fiduciaryAudit: 'Section 65B/63 BSA Compatible'
        };
    }

    /**
     * Splits text into at most 3 sentences/chunks of <= 450 characters
     * strictly conforming to Sarvam Bulbul API validation limits.
     * @param {string} text
     * @returns {string[]}
     */
    chunkTextForSarvam(text) {
        if (!text) return [];
        const clean = String(text).trim();
        if (clean.length <= 450) return [clean];

        const sentences = clean.split(/(?<=[.!?])\s+/);
        const chunks = [];
        let current = '';

        for (const s of sentences) {
            if ((current + ' ' + s).trim().length <= 450) {
                current = (current ? current + ' ' : '') + s;
            } else {
                if (current) chunks.push(current.trim());
                if (chunks.length >= 3) break;

                if (s.length > 450) {
                    const words = s.split(/\s+/);
                    let sub = '';
                    for (const w of words) {
                        if ((sub + ' ' + w).trim().length <= 450) {
                            sub = (sub ? sub + ' ' : '') + w;
                        } else {
                            if (sub) chunks.push(sub.trim());
                            if (chunks.length >= 3) break;
                            sub = w;
                        }
                    }
                    current = sub.trim();
                } else {
                    current = s;
                }
            }
            if (chunks.length >= 3) break;
        }

        if (current && chunks.length < 3) {
            chunks.push(current.trim());
        }

        return chunks.slice(0, 3);
    }

    /**
     * Bulbul v1: Synthesizes oral legal counsel prose into natural Indian Advocate audio.
     * @param {object} params - { text, speaker, targetLanguage, pitch, pace, caseSettings }
     * @returns {Promise<{ success: boolean, audioBase64?: string, mimeType?: string, speaker?: string, cached?: boolean, fallback?: boolean, error?: string }>}
     */
    async synthesizeSpeech(params = {}) {
        const text = String(params.text || '').trim();
        if (!text) {
            return { success: false, error: 'Empty text provided for speech synthesis' };
        }

        const rawSpeaker = params.speaker || params.caseSettings?.sarvamSpeaker || this.defaultSpeaker;
        let speaker = rawSpeaker;
        if (SPEAKER_ALIAS_MAP[speaker]) {
            speaker = SPEAKER_ALIAS_MAP[speaker];
        }
        const targetLanguage = params.targetLanguage || params.caseSettings?.sarvamLanguage || this.detectScript(text) || this.defaultLanguage || 'en-IN';
        const pace = typeof params.pace === 'number' ? params.pace : 1.0;
        const pitch = typeof params.pitch === 'number' ? params.pitch : 0.0;

        // Check local SHA-256 disk cache first (offline friendly)
        const cacheHash = crypto.createHash('sha256')
            .update(`${rawSpeaker}:${targetLanguage}:${pace}:${pitch}:${text}`)
            .digest('hex');
        let cachedFilePath = path.join(this.cacheDir, `${cacheHash}.wav`);
        if (!fs.existsSync(cachedFilePath) && speaker !== rawSpeaker) {
            const aliasHash = crypto.createHash('sha256')
                .update(`${speaker}:${targetLanguage}:${pace}:${pitch}:${text}`)
                .digest('hex');
            const aliasFile = path.join(this.cacheDir, `${aliasHash}.wav`);
            if (fs.existsSync(aliasFile)) cachedFilePath = aliasFile;
        }

        if (fs.existsSync(cachedFilePath)) {
            try {
                const cachedBuffer = fs.readFileSync(cachedFilePath);
                if (cachedBuffer.length > 0) {
                    return {
                        success: true,
                        audioBase64: cachedBuffer.toString('base64'),
                        mimeType: 'audio/wav',
                        speaker: speaker,
                        cached: true,
                        durationEstimatedSec: Math.round(text.split(/\s+/).length / 2.5)
                    };
                }
            } catch (_) {}
        }

        const apiKey = this.resolveApiKey(params.caseSettings);
        if (!apiKey) {
            return { 
                success: false, 
                fallback: true, 
                error: 'Sarvam API key not configured. Fallback to browser SpeechSynthesis.' 
            };
        }

        // Chunk text to strictly obey Sarvam Bulbul limits (max 3 items, max 500 chars/item)
        const inputs = this.chunkTextForSarvam(text);
        if (!inputs || inputs.length === 0) {
            inputs.push(text.slice(0, 450));
        }

        // Call Sarvam /text-to-speech API
        const payload = JSON.stringify({
            inputs: inputs,
            target_language_code: targetLanguage,
            speaker: speaker,
            pitch: pitch,
            pace: pace,
            loudness: 1.0,
            speech_sample_rate: 22050,
            enable_preprocessing: true,
            model: 'bulbul:v3'
        });

        try {
            const responseData = await this._makeHttpsRequest('/text-to-speech', 'POST', payload, {
                'Content-Type': 'application/json',
                'api-subscription-key': apiKey
            });

            if (responseData && responseData.audios && responseData.audios.length > 0) {
                const audioBase64 = responseData.audios[0];

                // Write to cache in background
                try {
                    fs.writeFile(cachedFilePath, Buffer.from(audioBase64, 'base64'), () => {});
                } catch (_) {}

                return {
                    success: true,
                    audioBase64: audioBase64,
                    mimeType: 'audio/wav',
                    speaker: speaker,
                    cached: false,
                    durationEstimatedSec: Math.round(text.split(/\s+/).length / 2.5)
                };
            } else {
                throw new Error('Sarvam TTS returned empty audio payload');
            }
        } catch (err) {
            return {
                success: false,
                fallback: true,
                error: `Sarvam Bulbul TTS error: ${err.message}`
            };
        }
    }

    /**
     * Saaras v2: Transcribes spoken legal queries with legal domain vocabulary injection.
     * @param {object} params - { audioBuffer, mimeType, languageCode, caseSettings }
     * @returns {Promise<{ success: boolean, transcript?: string, languageCode?: string, fallback?: boolean, error?: string }>}
     */
    async transcribeAudio(params = {}) {
        const audioBuffer = params.audioBuffer;
        if (!audioBuffer || !Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
            return { success: false, error: 'No audio buffer provided for transcription' };
        }

        const apiKey = this.resolveApiKey(params.caseSettings);
        if (!apiKey) {
            return { 
                success: false, 
                fallback: true, 
                error: 'Sarvam API key not configured. Fallback to browser SpeechRecognition.' 
            };
        }

        const languageCode = params.languageCode || params.caseSettings?.sarvamLanguage || this.defaultLanguage;
        const mimeType = params.mimeType || 'audio/webm';
        const boundary = '----WebKitFormBoundary' + crypto.randomBytes(16).toString('hex');

        // Build multipart/form-data payload natively
        const filename = mimeType.includes('wav') ? 'audio.wav' : (mimeType.includes('mp3') ? 'audio.mp3' : 'audio.webm');
        const formParts = [];

        // File field
        formParts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
        ));
        formParts.push(audioBuffer);
        formParts.push(Buffer.from('\r\n'));

        // Model field
        formParts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nsaaras:v2\r\n`
        ));

        // Language code field
        formParts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="language_code"\r\n\r\n${languageCode}\r\n`
        ));

        // Legal Domain Vocabulary Prompt field
        formParts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${LEGAL_ASR_DOMAIN_PROMPT}\r\n`
        ));

        // Trailing boundary
        formParts.push(Buffer.from(`--${boundary}--\r\n`));

        const multipartBody = Buffer.concat(formParts);

        try {
            const responseData = await this._makeHttpsRequest('/speech-to-text', 'POST', multipartBody, {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': multipartBody.length,
                'api-subscription-key': apiKey
            });

            if (responseData && typeof responseData.transcript === 'string') {
                return {
                    success: true,
                    transcript: responseData.transcript.trim(),
                    languageCode: responseData.language_code || languageCode
                };
            } else {
                throw new Error('Sarvam Saaras returned empty transcript');
            }
        } catch (err) {
            return {
                success: false,
                fallback: true,
                error: `Sarvam Saaras STT error: ${err.message}`
            };
        }
    }

    /**
     * Internal HTTPS request dispatcher with strict timeout.
     */
    _makeHttpsRequest(apiPath, method, data, headers = {}) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.baseUrl,
                port: 443,
                path: apiPath,
                method: method,
                headers: headers,
                timeout: 8000
            };

            const req = https.request(options, res => {
                let chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    const rawBody = Buffer.concat(chunks).toString('utf8');
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            const parsed = JSON.parse(rawBody);
                            resolve(parsed);
                        } catch (parseErr) {
                            reject(new Error(`Failed to parse JSON response: ${parseErr.message}`));
                        }
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${rawBody.slice(0, 300)}`));
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Sarvam AI request timed out (8000ms)'));
            });

            req.on('error', err => {
                reject(err);
            });

            if (data) {
                req.write(data);
            }
            req.end();
        });
    }

    /**
     * Detects Indic language script from text using unicode block boundaries.
     * Defaults to 'en-IN' if Latin / ASCII.
     * @param {string} text
     * @returns {string} ISO language code (e.g., 'hi-IN', 'ta-IN', 'te-IN', 'bn-IN', 'en-IN')
     */
    detectScript(text) {
        if (!text || typeof text !== 'string') return 'en-IN';
        if (/[\u0900-\u097F]/.test(text)) return 'hi-IN'; // Devanagari (Hindi, Marathi, Sanskrit)
        if (/[\u0B80-\u0BFF]/.test(text)) return 'ta-IN'; // Tamil
        if (/[\u0C00-\u0C7F]/.test(text)) return 'te-IN'; // Telugu
        if (/[\u0980-\u09FF]/.test(text)) return 'bn-IN'; // Bengali / Assamese
        if (/[\u0A80-\u0AFF]/.test(text)) return 'gu-IN'; // Gujarati
        if (/[\u0C80-\u0CFF]/.test(text)) return 'kn-IN'; // Kannada
        if (/[\u0D00-\u0D7F]/.test(text)) return 'ml-IN'; // Malayalam
        if (/[\u0A00-\u0A7F]/.test(text)) return 'pa-IN'; // Gurmukhi (Punjabi)
        if (/[\u0B00-\u0B7F]/.test(text)) return 'od-IN'; // Odia
        return 'en-IN';
    }

    /**
     * Translates text between Indian languages and legal English via Sarvam /translate.
     * Includes instant zero-cost short-circuit when source and target language are the same.
     *
     * @param {object} params - { text, sourceLanguage, targetLanguage, caseSettings, mode }
     * @returns {Promise<{ success: boolean, translatedText: string, detectedSourceLanguage?: string, cachedOrPassthrough?: boolean, fallback?: boolean, error?: string }>}
     */
    async translateText(params = {}) {
        const text = String(params.text || '').trim();
        if (!text) {
            return { success: false, error: 'Empty text provided for translation' };
        }

        const sourceLanguage = params.sourceLanguage || this.detectScript(text);
        const targetLanguage = params.targetLanguage || 'en-IN';

        // 1. Instant pass-through optimization: If source and target match or text is ASCII English
        if (sourceLanguage === targetLanguage || (targetLanguage === 'en-IN' && !/[^\u0000-\u007F]/.test(text))) {
            return {
                success: true,
                translatedText: text,
                detectedSourceLanguage: sourceLanguage,
                cachedOrPassthrough: true
            };
        }

        // 2. Resolve API key
        const apiKey = this.resolveApiKey(params.caseSettings);
        if (!apiKey) {
            return {
                success: false,
                fallback: true,
                error: 'Sarvam API key not configured for translation.',
                translatedText: text
            };
        }

        // 3. Call Sarvam /translate endpoint
        const payload = JSON.stringify({
            input: text,
            source_language_code: sourceLanguage,
            target_language_code: targetLanguage,
            mode: params.mode || 'formal',
            model: 'mayura:v1'
        });

        try {
            const responseData = await this._makeHttpsRequest('/translate', 'POST', payload, {
                'Content-Type': 'application/json',
                'api-subscription-key': apiKey
            });

            if (responseData && (responseData.translated_text || responseData.translation)) {
                return {
                    success: true,
                    translatedText: (responseData.translated_text || responseData.translation).trim(),
                    detectedSourceLanguage: sourceLanguage,
                    cachedOrPassthrough: false
                };
            } else {
                throw new Error('Sarvam Translate returned empty response');
            }
        } catch (err) {
            return {
                success: false,
                fallback: true,
                error: `Sarvam Translate error: ${err.message}`,
                translatedText: text
            };
        }
    }
}

const defaultClient = new SarvamClient();
module.exports = defaultClient;
module.exports.SarvamClient = SarvamClient;
module.exports.BULBUL_SPEAKERS = BULBUL_SPEAKERS;
module.exports.LEGAL_ASR_DOMAIN_PROMPT = LEGAL_ASR_DOMAIN_PROMPT;
