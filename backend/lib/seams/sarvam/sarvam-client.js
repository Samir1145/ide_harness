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
    { id: 'aditya', name: 'Aditya (Senior Advocate Male)', gender: 'male', desc: 'Authoritative, measured senior counsel cadence' },
    { id: 'amit', name: 'Amit (Counsel Male)', gender: 'male', desc: 'Clear, modern analytical courtroom tone' },
    { id: 'ratan', name: 'Ratan (Appellate Senior Male)', gender: 'male', desc: 'Deep, resonant judicial gravitas' },
    { id: 'priya', name: 'Priya (Senior Advocate Female)', gender: 'female', desc: 'Dignified, articulate senior appellate advocate' },
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
        this.defaultSpeaker = options.defaultSpeaker || 'aditya';
        this.defaultLanguage = options.defaultLanguage || 'en-IN';
        this.activeKey = options.apiKey || process.env.SARVAM_API_KEY || '';

        // Ensure audio cache directory exists
        try {
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
            }
        } catch (_) {}
    }

    /**
     * Resolves the effective API key from options, case settings, or environment.
     */
    resolveApiKey(caseSettings = null) {
        if (caseSettings && caseSettings.sarvamApiKey) {
            return String(caseSettings.sarvamApiKey).trim();
        }
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
        return {
            configured,
            provider: 'Sarvam AI (Indic Sovereign Voice Engine)',
            defaultSpeaker: this.defaultSpeaker,
            defaultLanguage: this.defaultLanguage,
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
     * Bulbul v1: Synthesizes oral legal counsel prose into natural Indian Advocate audio.
     * @param {object} params - { text, speaker, targetLanguage, pitch, pace, caseSettings }
     * @returns {Promise<{ success: boolean, audioBase64?: string, mimeType?: string, speaker?: string, cached?: boolean, fallback?: boolean, error?: string }>}
     */
    async synthesizeSpeech(params = {}) {
        const text = String(params.text || '').trim();
        if (!text) {
            return { success: false, error: 'Empty text provided for speech synthesis' };
        }

        let speaker = params.speaker || params.caseSettings?.sarvamSpeaker || this.defaultSpeaker;
        if (SPEAKER_ALIAS_MAP[speaker]) {
            speaker = SPEAKER_ALIAS_MAP[speaker];
        }
        const targetLanguage = params.targetLanguage || params.caseSettings?.sarvamLanguage || this.defaultLanguage;
        const pace = typeof params.pace === 'number' ? params.pace : 1.0;
        const pitch = typeof params.pitch === 'number' ? params.pitch : 0.0;

        // Check local SHA-256 disk cache first (offline friendly)
        const cacheHash = crypto.createHash('sha256')
            .update(`${speaker}:${targetLanguage}:${pace}:${pitch}:${text}`)
            .digest('hex');
        const cachedFilePath = path.join(this.cacheDir, `${cacheHash}.wav`);

        if (fs.existsSync(cachedFilePath)) {
            try {
                const cachedBuffer = fs.readFileSync(cachedFilePath);
                return {
                    success: true,
                    audioBase64: cachedBuffer.toString('base64'),
                    mimeType: 'audio/wav',
                    speaker: speaker,
                    cached: true,
                    durationEstimatedSec: Math.round(text.split(/\s+/).length / 2.5)
                };
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

        // Call Sarvam /text-to-speech API
        const payload = JSON.stringify({
            inputs: [text],
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
}

const defaultClient = new SarvamClient();
module.exports = defaultClient;
module.exports.SarvamClient = SarvamClient;
module.exports.BULBUL_SPEAKERS = BULBUL_SPEAKERS;
module.exports.LEGAL_ASR_DOMAIN_PROMPT = LEGAL_ASR_DOMAIN_PROMPT;
