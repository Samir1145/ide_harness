'use strict';

/**
 * Statutory & Antecedent Basis Drafting Linter for Hayagriva
 * Ported & adapted from OpenPatent domain intelligence with zero Python/WebSocket dependencies.
 */

// Terms exempt from antecedent basis requirements in legal/patent contexts
const EXEMPTED_TERMS = new Set([
    'claim', 'claims', 'invention', 'code', 'act', 'rules', 'regulation', 'regulations',
    'tribunal', 'court', 'bench', 'board', 'applicant', 'respondent', 'corporate', 'debtor',
    'petitioner', 'plaintiff', 'defendant', 'resolution', 'professional', 'liquidator',
    'committee', 'creditors', 'insolvency', 'bankruptcy', 'adjudicating', 'authority',
    'present', 'instant', 'foregoing', 'following', 'undersigned', 'parties', 'agreement',
    'contract', 'schedule', 'annexure', 'exhibit', 'section', 'article', 'sub-section',
    'clause', 'order', 'judgment', 'record', 'matter', 'case', 'dispute', 'evidence'
]);

// Vague / indefinite terms and guidance for statutory definiteness (§112 & Contractual Certainty)
const VAGUE_TERMS = {
    'approximately': 'Indefinite variance. Specify an explicit numerical tolerance (e.g. ±5% or defined minimum/maximum threshold).',
    'substantially': 'Subjective qualifier. Specify concrete physical parameters, tolerances, or functional operational boundaries.',
    'about': 'Ambiguous numerical bound. Define the exact boundary value or permissible percentage variance.',
    'similar to': 'Lacks technical/legal specificity. Detail the precise shared characteristics, structures, or statutory criteria.',
    'user-friendly': 'Subjective marketing term. Define the specific interface metric, latency requirement, or usability standard.',
    'reasonable period': 'Indefinite timeline. Specify an exact duration in calendar or business days, or cite the governing statutory deadline.',
    'reasonable time': 'Ambiguous deadline. Replace with a definitive timeframe (e.g., within 30 days) to prevent dispute.',
    'as mutually agreed': 'Agreement to agree. Define an objective default fallback mechanism if mutual agreement fails.',
    'best efforts': 'Ambiguous standard of performance. Define concrete measurable deliverables or commercial reasonableness benchmarks.',
    'from time to time': 'Indefinite recurrence. Specify the periodic audit frequency, triggering events, or schedule.'
};

/**
 * Checks legal/patent text for missing antecedent basis.
 * When "the [term]" or "said [term]" appears, verifies that "a [term]" or "an [term]"
 * was previously introduced in the text or preceding clauses.
 */
function checkAntecedentBasis(text) {
    if (!text || typeof text !== 'string') return [];

    const lines = text.split(/\r?\n/);
    const introducedTerms = new Set();
    const errors = [];

    // Pre-populate with exemptions
    for (const term of EXEMPTED_TERMS) {
        introducedTerms.add(term.toLowerCase());
    }

    lines.forEach((line, lineIdx) => {
        // Strip markdown headings or line formatting
        const cleanLine = line.replace(/^[#\-*>\d.]+\s*/, ' ');

        // 1. Discover newly introduced nouns: "a [word]" or "an [word]"
        const introRegex = /\b(?:a|an)\s+([a-zA-Z]{3,})\b/gi;
        let introMatch;
        while ((introMatch = introRegex.exec(cleanLine)) !== null) {
            introducedTerms.add(introMatch[1].toLowerCase());
        }

        // 2. Scan for references: "the [word]" or "said [word]"
        const refRegex = /\b(?:the|said)\s+([a-zA-Z]{3,})\b/gi;
        let refMatch;
        while ((refMatch = refRegex.exec(cleanLine)) !== null) {
            const word = refMatch[1].toLowerCase();
            if (!introducedTerms.has(word)) {
                const startCol = refMatch.index + 1;
                const endCol = startCol + refMatch[0].length;
                errors.push({
                    line: lineIdx + 1,
                    startCol,
                    endCol,
                    word: refMatch[0],
                    severity: 'Warning',
                    category: 'antecedent_basis',
                    message: `Lacks antecedent basis: '${refMatch[0]}' used without prior introduction ('a ${refMatch[1]}' or 'an ${refMatch[1]}').`
                });
            }
        }
    });

    return errors;
}

/**
 * Scans text for dangerous/vague statutory words that cause indefiniteness or disputes.
 */
function checkVagueLanguage(text) {
    if (!text || typeof text !== 'string') return [];

    const lines = text.split(/\r?\n/);
    const issues = [];

    lines.forEach((line, lineIdx) => {
        for (const [vagueWord, suggestion] of Object.entries(VAGUE_TERMS)) {
            const regex = new RegExp(`\\b${vagueWord.replace(/ /g, '\\s+')}\\b`, 'gi');
            let match;
            while ((match = regex.exec(line)) !== null) {
                const startCol = match.index + 1;
                const endCol = startCol + match[0].length;
                issues.push({
                    line: lineIdx + 1,
                    startCol,
                    endCol,
                    word: match[0],
                    severity: 'Information',
                    category: 'statutory_definiteness',
                    message: `Indefinite term '${match[0]}': ${suggestion}`
                });
            }
        }
    });

    return issues;
}

/**
 * Splits a claim or legal covenant into atomic elements (limitation level).
 */
function splitAtomicElements(text) {
    if (!text || typeof text !== 'string') return [];

    // Strip leading claim/paragraph numbering (e.g., "1. ", "Clause 2: ")
    const clean = text.replace(/^\s*(?:claim\s+\d+|clause\s+\d+|\d+)\s*[:.]\s*/i, '').trim();

    // Delimiters separating claim limitations or sub-covenants
    const delimiters = /;\s*(?:and\s+)?|\bcomprising\b:?|\bincluding\b:?|\balso\s+comprising\b|\bfurther\s+comprising\b|\bwherein\b|\bprovided\s+that\b/gi;

    const rawElements = clean.split(delimiters);
    return rawElements
        .map(el => el.trim().replace(/^,\s*/, '').replace(/,\s*$/, ''))
        .filter(el => el.length > 0);
}

/**
 * Computes simple lexical overlap similarity between a claim limitation and an evidence passage.
 */
function calculateLimitationCoverage(elementText, evidenceText) {
    if (!elementText || !evidenceText) return { similarity: 0, status: 'NOVELTY_OR_UNSUPPORTED' };

    const words1 = new Set((elementText.toLowerCase().match(/\b[a-zA-Z]{3,}\b/g) || []));
    const words2 = new Set((evidenceText.toLowerCase().match(/\b[a-zA-Z]{3,}\b/g) || []));

    if (words1.size === 0 || words2.size === 0) {
        return { similarity: 0, status: 'NOVELTY_OR_UNSUPPORTED' };
    }

    let overlap = 0;
    for (const w of words1) {
        if (words2.has(w)) overlap++;
    }

    const similarity = Math.round((overlap / words1.size) * 100);
    return {
        similarity,
        status: similarity >= 50 ? 'SUPPORTED_OVERLAP' : 'NOVELTY_OR_UNSUPPORTED'
    };
}

/**
 * High-level lintDraft function that aggregates diagnostics.
 */
function lintDraft(text, options = {}) {
    const antecedentErrors = checkAntecedentBasis(text);
    const vagueErrors = checkVagueLanguage(text);
    const allDiagnostics = [...antecedentErrors, ...vagueErrors].sort((a, b) => {
        if (a.line !== b.line) return a.line - b.line;
        return a.startCol - b.startCol;
    });

    return {
        diagnostics: allDiagnostics,
        stats: {
            totalIssues: allDiagnostics.length,
            antecedentCount: antecedentErrors.length,
            vagueCount: vagueErrors.length
        }
    };
}

module.exports = {
    EXEMPTED_TERMS,
    VAGUE_TERMS,
    checkAntecedentBasis,
    checkVagueLanguage,
    splitAtomicElements,
    calculateLimitationCoverage,
    lintDraft
};
