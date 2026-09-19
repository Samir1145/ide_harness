'use strict';

/**
 * RBZAdvisorAgent
 * ----------------
 * Core In-Editor Context-Aware Co-Pilot for Resolution Bazaar Intelligence.
 *
 * Senses active document context (e.g. examining a Prospective Resolution Applicant,
 * multi-bank statement tables, or limitation arguments) and surfaces non-disruptive,
 * high-value recommendations to stage cloud reports into the review queue.
 *
 * Strict Anti-Annoyance Safeguards:
 * 1. 8-second dwell time required before triggering.
 * 2. 10-minute global cooldown between suggestions.
 * 3. Session-level entity dismissal mute set.
 */

const path = require('path');
const { recordPendingTask } = require('../../core/case-billing-store');

class RBZAdvisorAgent {
    constructor() {
        this.name = 'RBZAdvisorAgent';
        this.tag = '@rbz_advisor';
        this.description = 'Context-aware proactive recommender for Resolution Bazaar cloud intelligence.';

        // Anti-Annoyance Memory
        this._lastSuggestionTimestamp = 0;
        this._globalCooldownMs = 10 * 60 * 1000; // 10 minutes
        this._dismissedEntities = new Set();
        this._dismissedFileKeys = new Set();
    }

    /**
     * Resets anti-annoyance memory (useful for testing).
     */
    resetState() {
        this._lastSuggestionTimestamp = 0;
        this._dismissedEntities.clear();
        this._dismissedFileKeys.clear();
    }

    /**
     * Records an entity or file as dismissed by user.
     */
    recordDismissal(targetKey) {
        if (targetKey) {
            this._dismissedEntities.add(targetKey.toLowerCase().trim());
        }
    }

    dismissSuggestion(targetKey) {
        return this.recordDismissal(targetKey);
    }

    _formatSuggestion(data) {
        const res = {
            shouldSuggest: true,
            triggerType: data.triggerType,
            targetKey: data.targetKey,
            toolName: data.toolName,
            tool: data.toolName,
            title: data.title,
            subtitle: data.subtitle,
            message: data.subtitle,
            description: data.description,
            rateInr: data.rateInr,
            gstInr: data.gstInr,
            totalInr: data.totalInr,
            payload: data.payload || {}
        };
        res.suggestion = res;
        return res;
    }

    /**
     * Evaluates current editor context and determines if a suggestion should be shown.
     */
    evaluateContext(caseDirOrContext, maybeContext = {}) {
        const now = Date.now();
        let caseDir = '';
        let contextData = {};

        if (typeof caseDirOrContext === 'string') {
            caseDir = caseDirOrContext;
            contextData = maybeContext || {};
        } else if (typeof caseDirOrContext === 'object' && caseDirOrContext !== null) {
            contextData = caseDirOrContext;
            caseDir = contextData.caseDir || '';
        }

        const filePath = contextData.filePath || contextData.activeFilePath || '';
        const contentSnippet = contextData.contentSnippet || contextData.fileContentSnippet || '';
        const dwellTimeSec = contextData.dwellTimeSec !== undefined
            ? contextData.dwellTimeSec
            : (contextData.dwellTimeMs ? contextData.dwellTimeMs / 1000 : 0);

        // 1. Guard: Dwell time check (>8 seconds required)
        if (dwellTimeSec < 8) {
            return { shouldSuggest: false, reason: 'DWELL_THRESHOLD_NOT_MET', message: 'Dwell time below 8s threshold' };
        }

        // 2. Guard: Global cooldown check (10 minutes)
        const elapsedSinceLast = now - this._lastSuggestionTimestamp;
        if (this._lastSuggestionTimestamp > 0 && elapsedSinceLast < this._globalCooldownMs) {
            const remMin = Math.ceil((this._globalCooldownMs - elapsedSinceLast) / 60000);
            return { shouldSuggest: false, reason: 'COOLDOWN_ACTIVE', message: `Global cooldown active (${remMin}m remaining)` };
        }

        const fileName = path.basename(filePath).toLowerCase();
        const snippetLower = (contentSnippet || '').toLowerCase();

        // 3. Scenario A: Prospective Resolution Applicant (PRA) / Resolution Plan
        // Detects candidate names, DINs, or Section 29A phrases
        const isPraFile = fileName.includes('plan') || fileName.includes('pra') || fileName.includes('applicant') || fileName.includes('eoi');
        const hasPraText = snippetLower.includes('resolution applicant') || snippetLower.includes('section 29a') || snippetLower.includes('prospective resolution applicant') || /din\s*0\d{7}/i.test(contentSnippet);

        if (isPraFile || hasPraText) {
            // Extract potential entity name or fallback
            let entityName = 'Prospective Resolution Applicant';
            const entityMatch = contentSnippet.match(/(?:m\/s\.?|shri|(?:prospective\s+)?resolution\s+applicant(?:\s*\([^)]+\))?|pra|applicant|bidder)\s*[:\-]?\s*([A-Z][A-Za-z0-9\s&.,]{2,50}?(?:pvt\.?\s*ltd\.?|limited|llp|corp|consortium|infra(?:structure)?\s*(?:ltd|limited)?))/i);
            if (entityMatch && entityMatch[1]) {
                entityName = entityMatch[1].trim();
            }

            const entityKey = entityName.toLowerCase();
            if (this._dismissedEntities.has(entityKey)) {
                return { shouldSuggest: false, reason: 'ENTITY_DISMISSED_FOR_SESSION', message: `Entity '${entityName}' was dismissed in this session` };
            }

            this._lastSuggestionTimestamp = now;
            return this._formatSuggestion({
                triggerType: 'PRA_SECTION_29A',
                targetKey: entityKey,
                toolName: 'rbz_section_29a_screening',
                title: '⚡ Section 29A Disqualification Check',
                subtitle: `Recommended for: ${entityName}`,
                description: 'Screen applicant promoters, DINs, and connected entities against MCA wilful defaulters and CIBIL lists.',
                rateInr: 350.00,
                gstInr: 63.00,
                totalInr: 413.00,
                payload: {
                    entity: entityName,
                    documentContext: fileName,
                    inquest: 'SECTION_29A_ELIGIBILITY'
                }
            });
        }

        // 4. Scenario B: Multi-Bank Statements & Cash Flows
        // Detects bank account files, statement sheets, or avoidance transactions
        const isBankFile = filePath.includes('bank_statements') || fileName.includes('statement') || fileName.endsWith('.xlsx') || fileName.endsWith('.csv');
        const hasBankText = snippetLower.includes('contra') || snippetLower.includes('rtgs') || snippetLower.includes('neft') || snippetLower.includes('dishonour') || snippetLower.includes('cheque bounce');

        if (isBankFile || hasBankText) {
            const fileKey = `file_${fileName}`;
            if (this._dismissedEntities.has(fileKey)) {
                return { shouldSuggest: false, reason: 'ENTITY_DISMISSED_FOR_SESSION', message: `Bank file '${fileName}' was dismissed in this session` };
            }

            this._lastSuggestionTimestamp = now;
            return this._formatSuggestion({
                triggerType: 'BANK_FORENSIC_INQUEST',
                targetKey: fileKey,
                toolName: 'rbz_multibank_inquest',
                title: '🔍 Multi-Bank Contra & Avoidance Inquest',
                subtitle: `Audit: ${fileName}`,
                description: 'Eliminate circular contra-sweeps and uncover §§ 43, 45, 50 & 66 avoidance transactions.',
                rateInr: 1200.00,
                gstInr: 216.00,
                totalInr: 1416.00,
                payload: {
                    sourceFile: fileName,
                    inquest: 'SECTIONS_43_45_66_FORENSIC'
                }
            });
        }

        // 5. Scenario C: Legal Research & Limitation Pleadings
        // Detects Section 7/9 limitation, debt acknowledgment, or article 137 disputes
        const hasLimitationText = snippetLower.includes('article 137') || snippetLower.includes('limitation act') || snippetLower.includes('acknowledgment of debt') || snippetLower.includes('section 18') || (snippetLower.includes('section 7') && snippetLower.includes('date of default'));

        if (hasLimitationText) {
            const queryKey = 'limitation_precedent';
            if (this._dismissedEntities.has(queryKey)) {
                return { shouldSuggest: false, reason: 'ENTITY_DISMISSED_FOR_SESSION', message: 'Limitation precedent was dismissed in this session' };
            }

            this._lastSuggestionTimestamp = now;
            return this._formatSuggestion({
                triggerType: 'PRECEDENT_MEMO',
                targetKey: queryKey,
                toolName: 'rbz_query_precedents',
                title: '⚖️ NCLAT Limitation Precedent Memo',
                subtitle: 'Judicial Ratio on IBC Limitation & Section 18',
                description: 'Pull binding Supreme Court and NCLAT rulings on debt acknowledgment and Article 137 applicability.',
                rateInr: 150.00,
                gstInr: 27.00,
                totalInr: 177.00,
                payload: {
                    query: 'IBC Section 7 Limitation Period and Section 18 Acknowledgment of Debt',
                    jurisdiction: 'NCLAT_SC'
                }
            });
        }

        return { shouldSuggest: false, reason: 'NO_CONTEXTUAL_TRIGGER', message: 'No matching contextual trigger in active document' };
    }

    /**
     * One-click stages the suggested task into the case billing queue for review in Settings.
     */
    stageSuggestedTask(caseDirOrOptions, maybeSuggestion, maybeEmail = 'advocate@chamber.in') {
        let caseDir = '';
        let suggestionData = {};
        let userEmail = maybeEmail;

        if (typeof caseDirOrOptions === 'object' && caseDirOrOptions !== null) {
            caseDir = caseDirOrOptions.caseDir || '';
            suggestionData = caseDirOrOptions.suggestion || caseDirOrOptions.suggestionData || {};
            userEmail = caseDirOrOptions.userEmail || userEmail;
        } else {
            caseDir = caseDirOrOptions;
            suggestionData = maybeSuggestion || {};
        }

        const task = recordPendingTask(caseDir, {
            tool_name: suggestionData.toolName || suggestionData.tool,
            target_identifier: suggestionData.targetKey || '',
            target_name: suggestionData.title || suggestionData.toolName,
            rate_inr: suggestionData.rateInr || 150.00,
            email: userEmail,
            payload: suggestionData.payload || {}
        });

        // Add to dismissed set so we don't prompt again for the same target
        if (suggestionData.targetKey) {
            this._dismissedEntities.add(suggestionData.targetKey.toLowerCase());
        }

        return {
            success: true,
            taskId: task.task_id,
            toolName: task.tool_name,
            totalInr: Math.round(task.rate_inr * 1.18 * 100) / 100,
            message: `Task ${task.task_id} successfully staged in Settings Outbound Queue.`
        };
    }
}

module.exports = new RBZAdvisorAgent();
