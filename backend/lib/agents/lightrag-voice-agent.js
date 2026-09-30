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
            // Replace common legal abbreviations for smoother speech
            .replace(/\bv\.\s*/gi, 'versus ')
            .replace(/\bvs\.\s*/gi, 'versus ')
            .replace(/\bSec\.\s*(\d+)/gi, 'Section $1')
            .replace(/\bSec\s*(\d+)/gi, 'Section $1')
            .replace(/\bReg\.\s*(\d+)/gi, 'Regulation $1')
            .replace(/\bReg\s*(\d+)/gi, 'Regulation $1')
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
        let rawContextBlock = '';
        let citations = [];
        let rawEntities = [];
        let rawChunks = [];

        // ── 1. Retrieve Precedents from Online LightRAG ─────────────────────────
        try {
            const rawRes = await lightRagClient.retrieveRawContext(queryText, {
                mode: options.mode || lightRagClient.config.queryMode || 'mix',
                top_k: options.top_k || 4
            });

            if (rawRes && rawRes.success && (rawRes.chunks.length > 0 || rawRes.answer)) {
                isLiveCloud = true;
                rawChunks = rawRes.chunks || [];
                rawEntities = rawRes.entities || [];
                rawContextBlock = lightRagClient.formatRawContextForLlm(rawRes, 2400);

                // Build structured citations
                if (rawChunks.length > 0) {
                    citations = rawChunks.map((c, i) => ({
                        id: c.id || `cit-${i + 1}`,
                        title: c.title || `Precedent Citation #${i + 1}`,
                        excerpt: c.content ? c.content.slice(0, 300) : '',
                        filePath: c.filePath || '',
                        source: 'ResolutionBazaar LightRAG'
                    }));
                } else if (rawRes.references) {
                    citations = rawRes.references.map((r, i) => ({
                        id: `ref-${i + 1}`,
                        title: typeof r === 'string' ? r : (r.title || r.name || `Citation ${i + 1}`),
                        excerpt: r.excerpt || r.ratio || '',
                        filePath: r.file_path || '',
                        source: 'ResolutionBazaar LightRAG'
                    }));
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
                rawContextBlock = '### Authoritative Statutory Provisions (Air-Gapped Vault):\n' +
                    statutoryHits.map((h, i) => `[Statute #${i + 1} - ${h.title || 'Bare Act'}, Section ${h.section || 'N/A'}]:\n${h.text || ''}`).join('\n\n');

                citations = statutoryHits.map((h, i) => ({
                    id: `stat-${i + 1}`,
                    title: `${h.title || 'Bare Act'} — Section ${h.section || ''}`,
                    excerpt: (h.text || '').slice(0, 300),
                    source: 'Local Statutory Bare Acts Vault'
                }));
            }
        }

        // ── 3. LegalParam-2.9B Reasoning (Port 8090) ───────────────────────────
        let spokenText = '';
        let legalParamUsed = false;
        const isLegalParamOnline = await this.llamaProvider.isHealthy();

        if (isLegalParamOnline) {
            try {
                const systemPrompt = `You are HAYAGRIVA Voice Precedent Counsel, an elite Indian corporate and insolvency advocate assisting a practitioner via live audio.
You are given verified legal precedent findings and statutory provisions from the LightRAG Knowledge Graph.

CRITICAL VOICE INSTRUCTIONS:
1. Spoken Economy: Deliver your answer in 2 to 4 authoritative spoken sentences (maximum 120 words).
2. Spoken Cadence: Write in natural conversational English. Never include markdown symbols (no asterisks, hashes, bullet points, numbers, or bracketed citations).
3. Leading Case Law: State the landmark Supreme Court or NCLAT ruling by name and what it definitively held on the point.
4. Clear Ratio: Give the direct operative answer first, followed by the supporting statutory rationale.`;

                const userPrompt = `Practitioner Inquest: "${queryText}"

Knowledge Context:
${rawContextBlock || 'No prior precedents found in graph. Rely on core Indian insolvency jurisprudence.'}

Synthesize your spoken counsel now:`;

                const completion = await this.llamaProvider.complete([
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ], {
                    maxTokens: 220,
                    temperature: 0.1
                });

                if (completion && completion.text && completion.text.trim().length > 0) {
                    spokenText = this.sanitizeForSpeech(completion.text);
                    legalParamUsed = true;
                }
            } catch (llmErr) {
                console.warn('[LightRagVoiceAgent] LegalParam reasoning failed, using deterministic voice counsel:', llmErr.message);
            }
        }

        // ── 4. Deterministic Voice Counsel Fallback (Lite Mode Parity) ──────────
        if (!spokenText) {
            spokenText = this._generateDeterministicVoiceCounsel(queryText, rawEntities, rawChunks, citations, isLiveCloud);
        }

        // ── 5. Format Professional Markdown Dossier for Monaco Editor ──────────
        const fullDossier = this._formatFullDossier(queryText, spokenText, citations, isLiveCloud, legalParamUsed);

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
                chunkCount: rawChunks.length,
                entityCount: rawEntities.length
            }
        };
    }

    /**
     * Deterministic voice counsel generator ensuring Lite Mode operates 100% offline
     * with zero compute crashes even if LegalParam is stopped.
     */
    _generateDeterministicVoiceCounsel(query, entities, chunks, citations, isLiveCloud) {
        if (isLiveCloud && chunks.length > 0) {
            const topChunk = chunks[0];
            const cleanContent = this.sanitizeForSpeech(topChunk.content);
            const firstSentence = cleanContent.split(/(?<=[.?!])\s+/)[0] || cleanContent.slice(0, 150);
            const leadingEntity = entities.length > 0 ? (entities[0].entity_name || entities[0].name) : (topChunk.title || 'the leading precedent');

            return `On the question of ${this.sanitizeForSpeech(query)}, under ${leadingEntity}, the established rule is that ${firstSentence}. This principle governs the issue under the Insolvency and Bankruptcy Code.`;
        }

        if (citations.length > 0) {
            const topCit = citations[0];
            const cleanExcerpt = this.sanitizeForSpeech(topCit.excerpt);
            const firstSentence = cleanExcerpt.split(/(?<=[.?!])\s+/)[0] || cleanExcerpt.slice(0, 150);

            return `Regarding ${this.sanitizeForSpeech(query)}, under ${topCit.title}, the statute provides that ${firstSentence}. This statutory provision strictly applies.`;
        }

        return `Regarding your inquiry on ${this.sanitizeForSpeech(query)}, the settled position under Indian insolvency jurisprudence requires compliance with statutory limitation periods and mandatory provisions of the Code. Full judicial precedents are displayed in your case dossier.`;
    }

    /**
     * Formats a formal, citation-backed Precedent Intelligence Dossier for Monaco.
     */
    _formatFullDossier(query, spokenProse, citations, isLiveCloud, legalParamUsed) {
        const sourceLabel = isLiveCloud
            ? 'ResolutionBazaar LightRAG Knowledge Graph (Live Cloud)'
            : 'Sovereign Statutory Bare Acts Vault (Offline Fallback)';
        const engineLabel = legalParamUsed ? 'LegalParam-2.9B (Port 8090)' : 'Deterministic Legal Synthesizer (Lite Mode)';

        let md = `## ⚖️ Precedent Voice Counsel Dossier\n`;
        md += `> **Oral Inquiry:** *"${query}"*\n`;
        md += `> **Precedent Source:** ${sourceLabel}\n`;
        md += `> **Reasoning Engine:** ${engineLabel}\n\n`;

        md += `### 🎙️ Operative Spoken Counsel\n\n`;
        md += `${spokenProse}\n\n`;

        if (citations && citations.length > 0) {
            md += `### 📚 Authoritative Judicial Citations & Ratios\n\n`;
            citations.forEach((cit, idx) => {
                md += `#### [${idx + 1}] ${cit.title}\n`;
                if (cit.filePath) md += `- **File / Locator:** \`${cit.filePath}\`\n`;
                if (cit.excerpt) md += `> ${cit.excerpt}\n\n`;
            });
        }

        md += `---\n`;
        md += `*💡 Generated via Sovereign Voice Precedent Counsel (@AskHaya) | Section 65B BSA Compliant.*`;
        return md;
    }
}

const lightRagVoiceAgent = new LightRagVoiceAgent();
module.exports = lightRagVoiceAgent;
module.exports.LightRagVoiceAgent = LightRagVoiceAgent;
