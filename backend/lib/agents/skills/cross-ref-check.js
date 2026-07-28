/**
 * Skill: cross-ref-check.js
 * Checks a specific factual assertion against ALL indexed case documents.
 * Used by @strength and @counter agents to find supporting or contradicting evidence.
 */
const { ragRetrieve } = require('./rag-retrieve');

/**
 * @param {string} caseDir
 * @param {string} fact      - The factual assertion to verify
 * @param {number} n         - Number of chunks to check
 * @returns {Promise<{supporting: Array, contradicting: Array, uncertain: Array}>}
 */
async function crossReferenceCheck(caseDir, fact, n = 6) {
    const chunks = await ragRetrieve(caseDir, fact, n);
    // Simple heuristic split: chunks from same source as the fact = supporting
    // Chunks with negation keywords near the fact phrase = potentially contradicting
    const supporting = [];
    const contradicting = [];
    const uncertain = [];
    const negationPatterns = /\bnot\b|\bno\b|\bdenied\b|\bcontested\b|\bdisputed\b|\bincorrect\b|\bwrong\b/i;
    
    for (const chunk of chunks) {
        const hasNegation = negationPatterns.test(chunk.content);
        if (hasNegation) contradicting.push(chunk);
        else if (chunk.content.toLowerCase().includes(fact.toLowerCase().substring(0, 20))) supporting.push(chunk);
        else uncertain.push(chunk);
    }
    return { supporting, contradicting, uncertain };
}

module.exports = { crossReferenceCheck };
