/**
 * Skill: precedent-search.js
 * Searches the local Law Vault for SC/NCLT/NCLAT judgment precedents
 * relevant to a legal issue. Used by @precedent and @advisor agents.
 */
const { vaultSearch } = require('./vault-lookup');

/**
 * Searches for precedents on a specific legal issue.
 * @param {string} issue   - Legal issue description (e.g. "limitation period sec 7 petition")
 * @param {string} caseDir - For future case-specific vault extensions
 * @param {number} n       - Max results
 * @returns {Promise<Array<{id, title, text, court}>>}
 */
async function searchPrecedents(issue, caseDir, n = 4) {
    // Augment query with judgment-specific terms for better vault retrieval
    const augmented = `judgment order held ${issue} Supreme Court NCLT NCLAT precedent`;
    const results = await vaultSearch(augmented, n);
    return results.map(r => ({
        ...r,
        court: detectCourt(r.title || r.id || '')
    }));
}

function detectCourt(text) {
    if (/supreme court|sc\b/i.test(text))  return 'Supreme Court';
    if (/nclat/i.test(text))               return 'NCLAT';
    if (/nclt/i.test(text))                return 'NCLT';
    if (/high court|hc\b/i.test(text))     return 'High Court';
    return 'Tribunal/Court';
}

module.exports = { searchPrecedents };
