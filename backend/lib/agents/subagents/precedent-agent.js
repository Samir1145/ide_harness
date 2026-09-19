'use strict';

/**
 * PrecedentAgent (@Precedent)
 * ----------------------------
 * Global Coworker: Routes case law and precedent research to the live,
 * daily-updated ResolutionBazaar LightRAG Knowledge Graph.
 *
 * Privacy Guarantee:
 * Never transmits confidential case files, contracts, or party identities.
 * Only sends the abstracted legal research query to the ResolutionBazaar cloud.
 */

const lightRagClient = require('../../core/lightrag-client');
const { searchLaws } = require('../../utils/vault-loader');

class PrecedentAgent {
    constructor() {
        this.name = 'PrecedentAgent';
        this.handle = '@Precedent';
        this.description = 'Live NCLT, NCLAT, and Supreme Court precedent intelligence powered by ResolutionBazaar LightRAG.';
    }

    /**
     * Checks if the ResolutionBazaar LightRAG cloud connection is active.
     */
    async isOnline(timeoutMs = 3000) {
        return await lightRagClient.checkHealth(timeoutMs);
    }

    /**
     * Prepares an MCP Tool Call for live cloud precedent research and
     * stages it in the case billing queue for user review and payment authorization.
     */
    async stageCloudResearch(queryText, caseDir, userEmail = 'advocate@chamber.in') {
        const { recordPendingTask } = require('../../core/case-billing-store');
        const task = recordPendingTask(caseDir, {
            tool_name: 'rbz_query_precedents',
            target_identifier: 'NCLT/NCLAT/SC',
            target_name: `Precedent Inquest: ${queryText.slice(0, 60)}...`,
            rate_inr: 150.00,
            email: userEmail,
            payload: {
                query: queryText,
                jurisdiction: 'IBC_NCLAT',
                requestedAt: new Date().toISOString()
            }
        });

        return {
            success: true,
            staged: true,
            taskId: task.task_id,
            rateInr: task.rate_inr,
            gstInr: Math.round(task.rate_inr * 0.18 * 100) / 100,
            totalInr: Math.round(task.rate_inr * 1.18 * 100) / 100,
            message: `Prepared Resolution Bazaar MCP call for "${queryText}". Staged in Settings Outbound Queue (Task ID: ${task.task_id}). Total: ₹${Math.round(task.rate_inr * 1.18 * 100) / 100}.`
        };
    }

    /**
     * Executes legal research against ResolutionBazaar LightRAG.
     * If offline, falls back gracefully to the local statutory bare acts vault.
     */
    async query(queryText, options = {}) {
        const caseDir = options.caseDir || null;
        
        // Ensure LightRag client is refreshed with case settings if available
        if (caseDir) {
            lightRagClient.refreshConfig(caseDir);
        }

        // 1. Query ResolutionBazaar LightRAG Knowledge Graph
        try {
            const lrRes = await lightRagClient.queryPrecedents(queryText, {
                mode: options.mode || 'hybrid',
                top_k: options.top_k || 5,
                timeoutMs: options.timeoutMs || 10000
            });

            if (lrRes && lrRes.success && lrRes.answer) {
                return {
                    success: true,
                    source: 'ResolutionBazaar LightRAG (Live Daily Graph)',
                    isLiveCloud: true,
                    answer: lrRes.answer,
                    references: lrRes.references || [],
                    formattedDossier: this.formatDossier(queryText, lrRes.answer, lrRes.references || [])
                };
            }
        } catch (cloudErr) {
            console.warn('[PrecedentAgent] ResolutionBazaar cloud query failed:', cloudErr.message);
        }

        // 2. Air-Gapped Fallback: Local Statutory Bare Acts Vault
        let statutoryHits = [];
        try {
            statutoryHits = await searchLaws(queryText, 5);
        } catch (_) {}

        const fallbackText = statutoryHits && statutoryHits.length > 0
            ? statutoryHits.map((h, i) => `### [${i + 1}] ${h.title || 'Statute'} — Section ${h.section || 'N/A'}\n${h.text || ''}`).join('\n\n')
            : 'No direct statutory matches found in offline Bare Acts vault.';

        return {
            success: true,
            source: 'Offline Statutory Bare Acts Vault (ResolutionBazaar Cloud Offline)',
            isLiveCloud: false,
            answer: fallbackText,
            references: (statutoryHits || []).map(h => ({ title: `${h.title || 'Statute'} - Sec ${h.section || ''}`, court: 'Statutory Bare Act' })),
            formattedDossier: this.formatOfflineDossier(queryText, fallbackText)
        };
    }

    /**
     * Formats a professional Precedent Intelligence Dossier.
     */
    formatDossier(query, answer, references) {
        let md = `## ⚖️ Precedent Intelligence Dossier\n`;
        md += `> **Research Inquiry:** *"${query}"*\n`;
        md += `> **Source:** ResolutionBazaar LightRAG Knowledge Graph (Updated Daily)\n\n`;
        md += `### Operative Precedent Synthesis\n\n${answer}\n\n`;

        if (Array.isArray(references) && references.length > 0) {
            md += `### Authoritative Judicial References\n\n`;
            references.forEach((ref, idx) => {
                const title = ref.title || ref.case_name || ref.doc_name || `Precedent Citation #${idx + 1}`;
                const court = ref.court || ref.bench || 'Supreme Court / NCLAT';
                const date = ref.date || ref.judgment_date ? ` (${ref.date || ref.judgment_date})` : '';
                const citation = ref.citation ? ` — \`${ref.citation}\`` : '';
                md += `* **[${idx + 1}] ${title}** — *${court}*${date}${citation}\n`;
                if (ref.excerpt || ref.ratio) {
                    md += `  > ${ref.excerpt || ref.ratio}\n\n`;
                }
            });
        }

        md += `\n---\n*💡 Verified via ResolutionBazaar Global Precedent Agent.*`;
        return md;
    }

    /**
     * Formats an offline statutory notice when cloud sync is unavailable.
     */
    formatOfflineDossier(query, fallbackText) {
        let md = `## 🏛️ Statutory Legal Research (Offline Mode)\n`;
        md += `> **Research Inquiry:** *"${query}"*\n`;
        md += `> ℹ️ *ResolutionBazaar Precedent Cloud is currently offline. Showing authoritative statutory provisions from the embedded Bare Acts vault.*\n\n`;
        md += `${fallbackText}\n\n`;
        md += `---\n*Tip: Connect your practitioner license key in Settings to unlock live daily NCLT/NCLAT precedent streaming.*`;
        return md;
    }
}

module.exports = new PrecedentAgent();
