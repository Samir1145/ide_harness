/**
 * Skill: entity-extract.js
 * Extracts named entities (parties, dates, monetary amounts, companies, persons)
 * from a text block using regex + LLM hybrid extraction.
 *
 * Used by @claims, @avoidance, @timeline, @entity-graph agents.
 */

const { getChatResponse } = require('../../core/llm-client');

// ─── Regex-based fast extractors ──────────────────────────────────────────────

/**
 * Extracts Indian-formatted dates and ISO dates from text.
 * @param {string} text
 * @returns {Array<{raw: string, iso: string|null}>}
 */
function extractDates(text) {
    const patterns = [
        // DD Month YYYY
        /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?,?\s+(\d{4})\b/gi,
        // DD/MM/YYYY or DD-MM-YYYY
        /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/g,
        // YYYY-MM-DD
        /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    ];
    const found = new Set();
    patterns.forEach(p => {
        let m;
        const rx = new RegExp(p.source, p.flags);
        while ((m = rx.exec(text)) !== null) {
            found.add(m[0].trim());
        }
    });
    return Array.from(found).map(raw => ({ raw, type: 'date' }));
}

/**
 * Extracts monetary amounts (INR, lakhs, crores) from text.
 * @param {string} text
 * @returns {Array<{raw: string, type: 'amount'}>}
 */
function extractAmounts(text) {
    const pattern = /(?:Rs\.?|INR|₹)\s*[\d,]+(?:\.\d+)?(?:\s*(?:crore|lakh|lakhs|crores|thousand|million)s?)?|\b[\d,]+(?:\.\d+)?\s*(?:crore|lakh|lakhs|crores)s?\b/gi;
    const found = new Set();
    let m;
    while ((m = pattern.exec(text)) !== null) {
        found.add(m[0].trim());
    }
    return Array.from(found).map(raw => ({ raw, type: 'amount' }));
}

/**
 * Extracts CIN / company registration numbers from text.
 * @param {string} text
 * @returns {Array<{raw: string, type: 'cin'}>}
 */
function extractCINs(text) {
    const pattern = /\b[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b/g;
    const found = [];
    let m;
    while ((m = pattern.exec(text)) !== null) {
        found.push({ raw: m[0], type: 'cin' });
    }
    return found;
}

/**
 * Extracts NCLT/NCLAT/SC case numbers from text.
 * @param {string} text
 * @returns {Array<{raw: string, type: 'case_number'}>}
 */
function extractCaseNumbers(text) {
    const pattern = /(?:CP|IB|CA|MA|TA|CRL)\s*(?:No\.?)?\s*[\d\/\(\)A-Z]+(?:\/\d{4})?/gi;
    const found = new Set();
    let m;
    while ((m = pattern.exec(text)) !== null) {
        found.add(m[0].trim());
    }
    return Array.from(found).map(raw => ({ raw, type: 'case_number' }));
}

// ─── LLM-enhanced entity extraction ─────────────────────────────────────────

/**
 * Uses the LLM to extract structured entities from a text block.
 * Returns parsed JSON with parties, dates, amounts, and facts.
 *
 * @param {string} text     - Text to extract entities from
 * @param {string} caseDir  - For LLM context routing
 * @returns {Promise<Object>} { parties, dates, amounts, companies, key_facts }
 */
async function extractEntities(text, caseDir) {
    // First do fast regex extraction
    const regexDates   = extractDates(text);
    const regexAmounts = extractAmounts(text);
    const regexCINs    = extractCINs(text);
    const regexCaseNos = extractCaseNumbers(text);

    // Then use LLM for structured party/company/fact extraction
    const prompt = `Extract structured legal entities from the following text. Return ONLY valid JSON with these keys:
- "parties": array of party names (petitioner, respondent, creditor, debtor, guarantor, etc.)
- "companies": array of company names mentioned
- "persons": array of individual person names
- "key_facts": array of key factual assertions (1 sentence each, max 5)
- "legal_issues": array of legal issues mentioned (e.g. "date of default", "limitation period")

Text:
"""
${text.substring(0, 1200)}
"""

Return ONLY the JSON object, no explanation.`;

    let llmEntities = { parties: [], companies: [], persons: [], key_facts: [], legal_issues: [] };
    try {
        const raw = await getChatResponse([
            { role: 'system', content: 'You are a precise legal entity extractor. Return only valid JSON.' },
            { role: 'user', content: prompt }
        ], { caseDir });

        // Parse JSON from LLM response
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            llmEntities = JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.error(`[Skill:entityExtract] LLM extraction failed:`, e.message);
    }

    return {
        ...llmEntities,
        dates: regexDates,
        amounts: regexAmounts,
        cins: regexCINs,
        case_numbers: regexCaseNos,
    };
}

module.exports = { extractEntities, extractDates, extractAmounts, extractCINs, extractCaseNumbers };
