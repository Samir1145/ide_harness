'use strict';

/**
 * Conversational Post-Ingest Brief & Interactive Emphasis Engine (Plan 18).
 * Adapted from MindBase and Second-Brain-Skill interactive intake architectures.
 * 
 * Provides:
 * 1. Document classification across statutory insolvency filings.
 * 2. Automated parameter extraction (debtor, applicant/creditor, debt quantum, dates).
 * 3. OCR and low-density scanned page integrity detection.
 * 4. Executive 3–5 bullet post-ingest briefing synthesizer.
 * 5. Actionable Case Action Inbox card creation with focus mode switching.
 */

const fs = require('fs');
const path = require('path');
const caseSession = require('./case-session');
const inboxManager = require('../agents/inbox-manager');

// Standard statutory classification types
const DOC_TYPES = {
    RESOLUTION_PLAN: 'Resolution Plan (§ 30 / Reg 38)',
    CIRP_ADMISSION_ORDER: 'CIRP Admission Order (§§ 7/9/10)',
    FORENSIC_AUDIT: 'Forensic / Avoidance Audit (§§ 43, 45, 50, 66)',
    CLAIM_FORM: 'Creditor Claim Form (Form B/C/CA)',
    COC_MINUTES: 'CoC Meeting Minutes & Voting Record',
    DEMAND_NOTICE: 'Statutory Demand Notice (§ 8 / Form 3)',
    GENERAL_LEGAL_FILING: 'Statutory Case Filing'
};

// Focus modes
const FOCUS_MODES = {
    GENERAL: 'general',
    WATERFALL: 'waterfall',
    S29A: 's29a',
    AVOIDANCE: 'avoidance'
};

/**
 * Classifies document text and filename into a recognized statutory legal archetype.
 * 
 * @param {string} text 
 * @param {string} filename 
 * @returns {Object} { docType, label, confidence }
 */
function classifyDocument(text = '', filename = '') {
    const raw = (text + ' ' + filename).toLowerCase();

    // 1. Resolution Plan
    if (/resolution\s*plan/i.test(raw) && (/regulation\s*38/i.test(raw) || /section\s*30/i.test(raw) || /resolution\s*applicant/i.test(raw) || /resolution_plan/i.test(filename))) {
        return { docType: 'RESOLUTION_PLAN', label: DOC_TYPES.RESOLUTION_PLAN, confidence: 0.95 };
    }

    // 2. Admission Order
    if ((/national\s*company\s*law\s*tribunal/i.test(raw) || /nclt/i.test(raw)) && (/admitted/i.test(raw) || /commencement\s*of\s*cirp/i.test(raw) || /moratorium/i.test(raw) || /admission_order/i.test(filename))) {
        return { docType: 'CIRP_ADMISSION_ORDER', label: DOC_TYPES.CIRP_ADMISSION_ORDER, confidence: 0.92 };
    }

    // 3. Forensic / Avoidance Audit
    if (/forensic\s*audit/i.test(raw) || /transaction\s*audit/i.test(raw) || (/section\s*43/i.test(raw) && /preferential/i.test(raw)) || /avoidance/i.test(raw)) {
        return { docType: 'FORENSIC_AUDIT', label: DOC_TYPES.FORENSIC_AUDIT, confidence: 0.90 };
    }

    // 4. Claim Form
    if (/form\s*[b|c|ca|d|e|f]\b/i.test(raw) || (/proof\s*of\s*claim/i.test(raw) && /creditor/i.test(raw))) {
        return { docType: 'CLAIM_FORM', label: DOC_TYPES.CLAIM_FORM, confidence: 0.90 };
    }

    // 5. CoC Minutes
    if (/committee\s*of\s*creditors/i.test(raw) && (/minutes/i.test(raw) || /voting\s*share/i.test(raw) || /agenda/i.test(raw))) {
        return { docType: 'COC_MINUTES', label: DOC_TYPES.COC_MINUTES, confidence: 0.88 };
    }

    // 6. Demand Notice
    if (/demand\s*notice/i.test(raw) && (/section\s*8/i.test(raw) || /form\s*(?:3|4)\b/i.test(raw))) {
        return { docType: 'DEMAND_NOTICE', label: DOC_TYPES.DEMAND_NOTICE, confidence: 0.85 };
    }

    return { docType: 'GENERAL_LEGAL_FILING', label: DOC_TYPES.GENERAL_LEGAL_FILING, confidence: 0.60 };
}

/**
 * Extracts key insolvency parameters from raw document text.
 * 
 * @param {string} text 
 * @returns {Object} Extracted entities
 */
function extractKeyParameters(text = '') {
    const params = {
        corporate_debtor: null,
        applicant_or_creditor: null,
        debt_quantum: null,
        statutory_sections: [],
        cirp_date: null
    };

    // Corporate Debtor (prefix or suffix)
    const cdMatch = text.match(/(?:corporate\s*debtor|in\s*the\s*matter\s*of|name\s*of\s*the\s*corporate\s*debtor)[:\s]+["']?([A-Z0-9\s.,&()\-]+?(?:limited|pvt|private|corp|llp))/i)
        || text.match(/([A-Z][A-Za-z0-9\s.,&()\-]+?)\s*\(\s*(?:corporate\s*debtor|respondent)\s*\)/i)
        || text.match(/(?:m\/s\.?|shri|smt)\s+([A-Z][A-Za-z0-9\s.,&()\-]+?(?:limited|pvt|private|corp|llp))/i);
    if (cdMatch && cdMatch[1]) {
        params.corporate_debtor = cdMatch[1].trim().replace(/[\r\n\t]+/g, ' ');
    }

    // Applicant or Creditor (prefix or suffix)
    const appMatch = text.match(/(?:resolution\s*applicant|financial\s*creditor|operational\s*creditor|applicant|petitioner)[:\s]+["']?([A-Z0-9\s.,&()\-]+?(?:limited|bank|corp|consortium|ltd|pvt))/i)
        || text.match(/([A-Z][A-Za-z0-9\s.,&()\-]+?)\s*\(\s*(?:financial\s*creditor|operational\s*creditor|resolution\s*applicant|petitioner|applicant)\s*\)/i);
    if (appMatch && appMatch[1]) {
        params.applicant_or_creditor = appMatch[1].trim().replace(/[\r\n\t]+/g, ' ');
    }

    // Debt Quantum or Plan Value
    const quantumMatch = text.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?\s*(?:crore|cr|lakh|lakhs)?)/i)
        || text.match(/(?:admitted\s*debt|total\s*debt|claim\s*amount|plan\s*value|proposed\s*value)[:\s]+(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?\s*(?:crore|cr|lakh)?)/i);
    if (quantumMatch) {
        params.debt_quantum = quantumMatch[0].trim();
    }

    // Statutory Sections
    const secRegex = /section\s*(\d+[A-Z]?(?:\(\d+\)(?:\([a-z]\))?)?)/gi;
    let m;
    const foundSecs = new Set();
    while ((m = secRegex.exec(text)) !== null) {
        foundSecs.add(`§ ${m[1]}`);
        if (foundSecs.size >= 6) break;
    }
    params.statutory_sections = Array.from(foundSecs);

    // Date
    const dateMatch = text.match(/\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4})\b/i);
    if (dateMatch) {
        params.cirp_date = dateMatch[1];
    }

    return params;
}

/**
 * Evaluates text density array to detect scanned or un-OCR'd page sequences.
 * 
 * @param {Array<number>} densityArray Array of char counts per page
 * @returns {Object} { lowDensityPages: Array<number>, avgDensity: number, scannedFlag: boolean }
 */
function detectIntegrityIssues(densityArray = []) {
    if (!Array.isArray(densityArray) || densityArray.length === 0) {
        return { lowDensityPages: [], avgDensity: 0, scannedFlag: false };
    }
    const lowDensityPages = [];
    let sum = 0;
    for (let i = 0; i < densityArray.length; i++) {
        const d = densityArray[i] || 0;
        sum += d;
        if (d < 35) { // Pages with less than 35 characters are typically scanned or images
            lowDensityPages.push(i + 1);
        }
    }
    const avgDensity = Math.round(sum / densityArray.length);
    const scannedFlag = lowDensityPages.length > 0;
    return {
        lowDensityPages,
        avgDensity,
        scannedFlag
    };
}

/**
 * Synthesizes a structured 3–5 bullet post-ingest briefing card for chat and inbox.
 * 
 * @param {string} caseDir 
 * @param {string} filename 
 * @param {Object} [options] { text, pageCount, densityArray }
 * @returns {Object} Brief result
 */
function generatePostIngestBrief(caseDir, filename, options = {}) {
    let text = options.text || '';
    let pageCount = options.pageCount || 1;
    let densityArray = options.densityArray || [];

    // If text not provided directly, attempt to load companion markdown
    if (!text && caseDir && filename) {
        const companionName = filename.replace(/\.[^.]+$/, '.md');
        const companionPath = path.join(caseDir, companionName);
        if (fs.existsSync(companionPath)) {
            try {
                text = fs.readFileSync(companionPath, 'utf8');
            } catch (_) {}
        }
    }

    const { docType, label, confidence } = classifyDocument(text, filename);
    const params = extractKeyParameters(text);
    const integrity = detectIntegrityIssues(densityArray);

    const bullets = [];

    // Bullet 1: Classification
    bullets.push(`**Classification:** ${label} (Confidence: ${Math.round(confidence * 100)}%)`);

    // Bullet 2: Key Parties
    const parties = [];
    if (params.corporate_debtor) parties.push(`Debtor: *${params.corporate_debtor}*`);
    if (params.applicant_or_creditor) parties.push(`Party: *${params.applicant_or_creditor}*`);
    if (parties.length > 0) {
        bullets.push(`**Key Parties:** ${parties.join(' | ')}`);
    }

    // Bullet 3: Financial & Statutory Quantum
    const financials = [];
    if (params.debt_quantum) financials.push(`Quantum: **${params.debt_quantum}**`);
    if (params.statutory_sections.length > 0) financials.push(`Provisions: ${params.statutory_sections.slice(0, 4).join(', ')}`);
    if (financials.length > 0) {
        bullets.push(`**Filing Scope:** ${financials.join(' | ')}`);
    }

    // Bullet 4: Integrity / OCR flags
    if (integrity.scannedFlag) {
        const pageList = integrity.lowDensityPages.slice(0, 5).join(', ');
        bullets.push(`⚠️ **Integrity Flag:** Pages ${pageList}${integrity.lowDensityPages.length > 5 ? '…' : ''} have low text density (<35 chars/page) and appear to contain scanned tables.`);
    } else {
        bullets.push(`✓ **Document Quality:** High text density across ${pageCount} pages. 100% vector searchable.`);
    }

    // Available Emphasis Options based on document type
    const focusOptions = [
        { id: FOCUS_MODES.WATERFALL, label: 'Financial Waterfall (§ 53 / Reg 38)', desc: 'Prioritizes payout schedules & liquidation waterfalls' },
        { id: FOCUS_MODES.S29A, label: 'Section 29A Eligibility', desc: 'Prioritizes promoter conflicts & disqualifications' },
        { id: FOCUS_MODES.AVOIDANCE, label: 'Avoidance Scrutiny (§§ 43/45/66)', desc: 'Prioritizes contra-sweeps & suspicious transactions' },
        { id: FOCUS_MODES.GENERAL, label: 'Standard Balanced Focus', desc: 'Uniform rank fusion across all chapters' }
    ];

    // Markdown formatted representation
    const markdownLines = [
        `### 📄 Ingestion Brief: \`${filename}\` (${pageCount} pages)`,
        '',
        ...bullets.map(b => `- ${b}`),
        '',
        `*Select an intake emphasis mode to guide search priority for this document.*`
    ];

    return {
        filename,
        docType,
        title: label,
        bullets,
        markdown: markdownLines.join('\n'),
        integrity,
        params,
        focusOptions
    };
}

/**
 * Creates an actionable card in the Case Action Inbox for the newly ingested document.
 * 
 * @param {string} caseDir 
 * @param {Object} brief 
 * @returns {Object} Inbox card item
 */
function postBriefToInbox(caseDir, brief) {
    if (!caseDir || !brief) return null;

    const actions = [
        {
            id: 'set_focus_waterfall',
            label: '🎯 Financial Waterfall',
            type: 'button',
            endpoint: '/api/hayagriva/ingest/set-emphasis',
            payload: { focus: FOCUS_MODES.WATERFALL, filename: brief.filename }
        },
        {
            id: 'set_focus_s29a',
            label: '⚖️ S.29A Eligibility',
            type: 'button',
            endpoint: '/api/hayagriva/ingest/set-emphasis',
            payload: { focus: FOCUS_MODES.S29A, filename: brief.filename }
        },
        {
            id: 'set_focus_avoidance',
            label: '🔍 Avoidance Scrutiny',
            type: 'button',
            endpoint: '/api/hayagriva/ingest/set-emphasis',
            payload: { focus: FOCUS_MODES.AVOIDANCE, filename: brief.filename }
        }
    ];

    const item = inboxManager.createItem(caseDir, {
        kind: 'INGEST_BRIEF',
        title: `Ingestion Brief: ${brief.filename}`,
        body: brief.bullets.join('\n'),
        options: actions,
        metadata: {
            filename: brief.filename,
            docType: brief.docType,
            params: brief.params,
            integrity: brief.integrity
        }
    });

    return item;
}

module.exports = {
    DOC_TYPES,
    FOCUS_MODES,
    classifyDocument,
    extractKeyParameters,
    detectIntegrityIssues,
    generatePostIngestBrief,
    postBriefToInbox
};
