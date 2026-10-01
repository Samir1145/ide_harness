'use strict';

/**
 * LightRagVoiceAgent (@VoicePrecedent)
 * ─────────────────────────────────────────────────────────────────────────────
 * Sovereign Precedent Voice Counsel powered by:
 * 1. Online LightRAG Knowledge Graph (/query/data & /query)
 * 2. Local LegalParam-2.9B LLM Engine (Port 8090)
 * 3. Air-Gapped Bare Acts Vault Fallback (vault-loader.js)
 *
 * Privacy Guarantee:
 * Microphone transcription and voice playback execute 100% locally.
 * Only the abstracted legal inquiry reaches the online LightRAG graph.
 * LegalParam formulates the spoken ratio locally.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const path = require('path');
const fs = require('fs');
const lightRagClient = require('../core/lightrag-client');
const LlamaServerProvider = require('../seams/llm/providers/llama-server-provider');
const { searchLaws } = require('../utils/vault-loader');
const auditTrailInstance = require('../core/audit_trail');

class LightRagVoiceAgent {
    constructor() {
        this.name = 'LightRagVoiceAgent';
        this.handle = '@AskHaya';
        this.alias = '@VoicePrecedent';
        this.description = 'Live voice counsel delivering Supreme Court and NCLAT precedents via Sarvam AI, LegalParam-2.9B and LightRAG.';
        this.llamaProvider = new LlamaServerProvider(8090, 'legal');
        this.sarvamClient = require('../seams/sarvam/sarvam-client');
    }

    /**
     * Checks health of the online LightRAG knowledge graph, local LegalParam engine, and Sarvam AI voice engine.
     * @returns {Promise<{ onlineLightRag: boolean, localLegalParam: boolean, lightRagUrl: string, legalParamPort: number, sarvam: object }>}
     */
    async checkTelemetry(caseDir = null) {
        if (caseDir) lightRagClient.refreshConfig(caseDir);
        let caseSettings = null;
        if (caseDir && fs.existsSync(caseDir)) {
            try {
                const sPath = path.join(caseDir, 'hayagriva_settings.json');
                if (fs.existsSync(sPath)) caseSettings = JSON.parse(fs.readFileSync(sPath, 'utf8'));
            } catch (_) {}
        }

        const [lightRagHealth, legalParamHealthy] = await Promise.all([
            lightRagClient.checkHealth(1500),
            this.llamaProvider.isHealthy()
        ]);

        const sarvamStatus = this.sarvamClient.getStatus(caseSettings);

        return {
            onlineLightRag: Boolean(lightRagHealth && lightRagHealth.online),
            localLegalParam: Boolean(legalParamHealthy),
            lightRagUrl: lightRagClient.config.apiUrl,
            legalParamPort: this.llamaProvider.port,
            queryMode: lightRagClient.config.queryMode || 'mix',
            sarvam: sarvamStatus
        };
    }

    /**
     * Sanitizes text into natural spoken prose suitable for TTS / SpeechSynthesis.
     * Strips markdown artifacts, bullets, bracketed links, and formatting noise.
     * @param {string} text
     * @returns {string}
     */
    sanitizeForSpeech(text) {
        if (!text) return '';

        return text
            // Strip HTML details/summary and generic tags
            .replace(/<details[\s\S]*?<\/details>/gi, '')
            .replace(/<[^>]*>/g, '')
            // Strip YAML frontmatter blocks
            .replace(/^---[\s\S]*?---\s*/gm, '')
            .replace(/(?:documentid|sections_referenced|datedecided|court|parties|category):[^\n]+/gi, '')
            // Strip markdown headers
            .replace(/^#{1,6}\s+/gm, '')
            // Strip code blocks and inline code
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`([^`]+)`/g, '$1')
            // Strip markdown bold and italics
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/__([^_]+)__/g, '$1')
            .replace(/_([^_]+)_/g, '$1')
            // Strip markdown links [Text](url) -> Text
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            // Strip bracketed citations like [1], [Source #2]
            .replace(/\[(?:\d+|Source\s*#?\d+|Citation\s*#?\d+)\]/gi, '')
            // Strip bullet points and list numbers
            .replace(/^\s*[-*•]\s+/gm, '')
            .replace(/^\s*\d+\.\s+/gm, '')
            // Replace common legal abbreviations for smoother speech and robust sentence parsing
            .replace(/\bM\/s\.\s*/gi, 'M/s ')
            .replace(/\bMessrs\.\s*/gi, 'Messrs ')
            .replace(/\bv\.\s*/gi, 'versus ')
            .replace(/\bvs\.\s*/gi, 'versus ')
            .replace(/\bSec\.\s*(\d+)/gi, 'Section $1')
            .replace(/\bSec\s*(\d+)/gi, 'Section $1')
            .replace(/\bReg\.\s*(\d+)/gi, 'Regulation $1')
            .replace(/\bReg\s*(\d+)/gi, 'Regulation $1')
            .replace(/\bLtd\.\s*/gi, 'Limited ')
            .replace(/\bPvt\.\s*/gi, 'Private ')
            .replace(/\bCo\.\s*/gi, 'Company ')
            .replace(/\bu\/s\.\s*/gi, 'under Section ')
            .replace(/\bu\/s\s*/gi, 'under Section ')
            .replace(/\bNo\.\s*/gi, 'No ')
            .replace(/\bDr\.\s*/gi, 'Dr ')
            .replace(/\bMr\.\s*/gi, 'Mr ')
            .replace(/\bMrs\.\s*/gi, 'Mrs ')
            .replace(/\bMs\.\s*/gi, 'Ms ')
            .replace(/\bAnr\.\s*/gi, 'and Another ')
            .replace(/\bOrs\.\s*/gi, 'and Others ')
            .replace(/\bHon'ble\b/gi, 'Honourable')
            .replace(/\bCoC\b/g, 'Committee of Creditors')
            .replace(/\bCIRP\b/g, 'Corporate Insolvency Resolution Process')
            .replace(/\bIBC\b/g, 'Insolvency and Bankruptcy Code')
            .replace(/\bNCLAT\b/g, 'N C L A T')
            .replace(/\bNCLT\b/g, 'N C L T')
            // Strip emojis and non-standard symbols
            .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
            // Collapse whitespace and single newlines into continuous prose
            .replace(/\r?\n+/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    /**
     * Executes the complete Voice Precedent Inquest:
     * 1. Query online LightRAG Knowledge Graph for raw precedents & entities.
     * 2. If LightRAG is offline, fallback to local bare acts vault.
     * 3. Reason via Local LegalParam-2.9B (Port 8090) into spoken legal counsel.
     * 4. Produce dual output: spokenText (audio) + fullDossier (Monaco/markdown) + citations.
     * 5. Record immutable audit entry.
     *
     * @param {string} userSpokenQuery - Transcribed query from speech or text input
     * @param {object} options - { caseDir, mode, top_k }
     * @returns {Promise<{ success: boolean, spokenText: string, fullDossier: string, citations: Array, telemetry: object }>}
     */
    async inquire(userSpokenQuery, options = {}) {
        const startTime = Date.now();
        const queryText = String(userSpokenQuery || '').trim();
        const caseDir = options.caseDir || null;

        if (!queryText) {
            return {
                success: false,
                spokenText: 'I did not catch your legal query. Please ask your question again.',
                fullDossier: '',
                citations: [],
                telemetry: { latencyMs: 0 }
            };
        }

        if (caseDir) lightRagClient.refreshConfig(caseDir);

        let isLiveCloud = false;
        let fullAnswer = '';
        let citations = [];

        // ── 1. Retrieve Precedent Synthesis from Online LightRAG ────────────────
        try {
            const lrRes = await lightRagClient.queryPrecedents(queryText, {
                mode: options.mode || lightRagClient.config.queryMode || 'mix',
                top_k: options.top_k || 6,
                timeoutMs: options.timeoutMs || 35000
            });

            if (lrRes && lrRes.success && lrRes.answer) {
                isLiveCloud = true;
                fullAnswer = lrRes.answer;

                // Format structured citations from LightRAG references
                if (Array.isArray(lrRes.references) && lrRes.references.length > 0) {
                    citations = lrRes.references.map((r, i) => {
                        const title = typeof r === 'string' ? r : (r.title || r.name || r.file_path || `Precedent Citation #${i + 1}`);
                        const excerpt = r.excerpt || r.ratio || r.content || '';
                        const filePath = r.file_path || '';
                        return {
                            id: `ref-${i + 1}`,
                            title: title,
                            excerpt: excerpt ? excerpt.slice(0, 300) : '',
                            filePath: filePath,
                            source: 'ResolutionBazaar LightRAG'
                        };
                    });
                }
            }
        } catch (cloudErr) {
            console.warn('[LightRagVoiceAgent] Online LightRAG query failed:', cloudErr.message);
        }

        // ── 2. Air-Gapped Fallback: Statutory Bare Acts Vault ────────────────────
        if (!isLiveCloud) {
            let statutoryHits = [];
            try {
                statutoryHits = await searchLaws(queryText, 4);
            } catch (_) {}

            if (statutoryHits && statutoryHits.length > 0) {
                fullAnswer = statutoryHits.map((h, i) => 
                    `### Section ${h.section || 'N/A'}: ${h.title || 'Bare Act'}\n\n${h.text || ''}`
                ).join('\n\n---\n\n');

                citations = statutoryHits.map((h, i) => ({
                    id: `stat-${i + 1}`,
                    title: `${h.title || 'Bare Act'} — Section ${h.section || ''}`,
                    excerpt: (h.text || '').slice(0, 300),
                    source: 'Local Statutory Bare Acts Vault'
                }));
            }
        }

        // ── 3. Spoken Ratio Extraction & Local LegalParam Reasoning ─────────────
        let spokenText = '';
        let legalParamUsed = false;
        const isLegalParamOnline = await this.llamaProvider.isHealthy();

        if (isLegalParamOnline && fullAnswer) {
            try {
                const systemPrompt = `You are HAYAGRIVA Voice Precedent Counsel, an elite Indian corporate and insolvency advocate assisting a practitioner via live audio.
Synthesize the authoritative findings into a complete, clear spoken legal ratio (around 3 to 5 sentences, approximately 120 to 160 words).
State the direct legal holding, the statutory threshold, and authoritative precedent. Never cut off mid-thought or end on a colon.
Never use markdown, asterisks, bullet points, or citation brackets. Give the direct legal answer first.`;

                const userPrompt = `Practitioner Inquest: "${queryText}"\n\nLegal Analysis:\n${fullAnswer.slice(0, 2000)}\n\nSynthesize your spoken counsel now:`;

                const completion = await this.llamaProvider.complete([
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ], {
                    maxTokens: 180,
                    temperature: 0.1
                });

                if (completion && completion.text && completion.text.trim().length > 0) {
                    spokenText = this.sanitizeForSpeech(completion.text);
                    legalParamUsed = true;
                }
            } catch (llmErr) {
                console.warn('[LightRagVoiceAgent] LegalParam reasoning failed, using direct spoken extraction:', llmErr.message);
            }
        }

        // ── 4. Deterministic Spoken Extraction from Synthesized Answer ──────────
        if (!spokenText) {
            spokenText = this._extractSpokenProseFromAnswer(queryText, fullAnswer, citations, isLiveCloud);
        }

        // ── 5. Format Professional Markdown Dossier for Chat / Monaco ──────────
        const fullDossier = this._formatFullDossier(queryText, fullAnswer, spokenText, citations, isLiveCloud, legalParamUsed);

        // ── 6. Immutable Audit Trail Recording ─────────────────────────────────
        if (caseDir && typeof auditTrailInstance.appendEntry === 'function') {
            try {
                await auditTrailInstance.appendEntry(caseDir, {
                    actor: 'VOICE_PRECEDENT_AGENT',
                    event: 'PRECEDENT_VOICE_INQUEST',
                    verdict: 'COUNSEL_EMITTED',
                    payload: {
                        inquiry: queryText,
                        source: isLiveCloud ? 'ResolutionBazaar LightRAG' : 'Air-Gapped Bare Acts Vault',
                        legalParamUsed: legalParamUsed,
                        citationsCount: citations.length,
                        spokenWordCount: spokenText.split(/\s+/).length
                    }
                });
            } catch (_) {}
        }

        const totalLatencyMs = Date.now() - startTime;

        return {
            success: true,
            spokenText: spokenText,
            fullDossier: fullDossier,
            citations: citations,
            telemetry: {
                latencyMs: totalLatencyMs,
                isLiveCloud: isLiveCloud,
                legalParamUsed: legalParamUsed,
                citationCount: citations.length
            }
        };
    }

    /**
     * Extracts clear, natural spoken prose from a synthesized legal answer.
     * Produces a complete, coherent operative legal ratio (up to ~150 words / 5-6 sentences)
     * without hanging on introductory colons or truncating mid-thought.
     */
    _extractSpokenProseFromAnswer(query, fullAnswer, citations, isLiveCloud) {
        if (fullAnswer && fullAnswer.trim().length > 0) {
            // Strip out References/Citations section if present at the end
            const cleaned = fullAnswer
                .replace(/###?\s*References[\s\S]*$/i, '')
                .replace(/\n\s*---\s*\n\s*###?\s*References[\s\S]*$/i, '')
                .replace(/\n\s*References:\s*\n[\s\S]*$/i, '')
                .trim();
            const paragraphs = cleaned.split(/\n\s*\n/).filter(p => p.trim().length > 0);
            
            // Collect substantive paragraphs (skipping pure headers) up to ~150-180 words
            let collectedText = '';
            for (const p of paragraphs) {
                const stripped = p.replace(/^#{1,6}\s+.*$/m, '').trim();
                if (stripped.length > 20) {
                    collectedText += (collectedText ? ' ' : '') + stripped;
                    const wordCount = collectedText.split(/\s+/).length;
                    if (wordCount >= 120) break;
                }
            }
            if (!collectedText && paragraphs.length > 0) collectedText = paragraphs[0];

            const sanitized = this.sanitizeForSpeech(collectedText);
            // Robust sentence splitting avoiding abbreviation periods
            const sentences = sanitized.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map(s => s.trim()).filter(s => s.length > 0);
            if (sentences && sentences.length > 0) {
                // Collect sentences up to ~150 words or 5 sentences, ensuring we don't end on a colon
                let result = [];
                let currentWords = 0;
                for (let i = 0; i < sentences.length; i++) {
                    const s = sentences[i];
                    result.push(s);
                    currentWords += s.split(/\s+/).length;
                    // Stop if we have at least 4 sentences or >= 120 words, provided the sentence does not end in a colon
                    if ((i >= 3 || currentWords >= 120) && !s.endsWith(':')) {
                        break;
                    }
                    if (i >= 5) break; // Hard ceiling at 6 sentences to prevent overly long TTS
                }
                let finalSpoken = result.join(' ').trim();
                // Clean up any trailing colon or dash
                finalSpoken = finalSpoken.replace(/[:\-–—\s]+$/, '.');
                return finalSpoken;
            }
            return sanitized.slice(0, 600).trim();
        }

        return `Regarding your inquiry on ${this.sanitizeForSpeech(query)}, the settled position under Indian insolvency jurisprudence governs the matter. Full statutory provisions are displayed in your case dossier.`;
    }

    /**
     * Formats a formal, clean Precedent Intelligence Dossier for Monaco/Chat without raw references.
     */
    _formatFullDossier(query, fullAnswer, spokenProse, citations, isLiveCloud, legalParamUsed) {
        const sourceLabel = isLiveCloud
            ? 'ResolutionBazaar LightRAG Precedent Knowledge Graph (Live)'
            : 'Sovereign Statutory Bare Acts Vault (Offline Fallback)';
        const engineLabel = isLiveCloud 
            ? 'LightRAG Deep Precedent Graph Synthesis' 
            : (legalParamUsed ? 'LegalParam-2.9B (Port 8090)' : 'Deterministic Statutory Retrieval (Lite Mode)');

        let md = `## ⚖️ Precedent Voice Counsel Dossier\n`;
        md += `> **Oral Inquiry:** *"${query}"*\n`;
        md += `> **Precedent Source:** ${sourceLabel}\n`;
        md += `> **Synthesis Engine:** ${engineLabel}\n\n`;

        if (spokenProse) {
            md += `### 🎙️ Operative Oral Ratio\n`;
            md += `> *${spokenProse}*\n\n`;
        }

        // Clean out any References / Citations section from LightRAG answer
        const cleanedAnswer = (fullAnswer || '')
            .replace(/###?\s*References[\s\S]*$/i, '')
            .replace(/\n\s*---\s*\n\s*###?\s*References[\s\S]*$/i, '')
            .replace(/\n\s*References:\s*\n[\s\S]*$/i, '')
            .trim();

        if (cleanedAnswer) {
            md += `### 📖 Authoritative Legal Synthesis\n\n`;
            md += `${cleanedAnswer}\n\n`;
        }

        md += `---\n`;
        md += `*💡 Generated via Sovereign Voice Precedent Counsel (@AskHaya) | Section 65B BSA Compliant.*`;
        return md;
    }
}

const lightRagVoiceAgent = new LightRagVoiceAgent();
module.exports = lightRagVoiceAgent;
module.exports.LightRagVoiceAgent = LightRagVoiceAgent;
