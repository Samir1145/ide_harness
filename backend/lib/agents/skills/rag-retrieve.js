/**
 * Skill: rag-retrieve.js
 * Performs hybrid FTS5 + cosine-vector retrieval against the case SQLite database.
 * Any agent can call this to get the top-N most relevant chunks for a query.
 */

const { retrieveContexts } = require('../../core/rag');

/**
 * @param {string} caseDir - Absolute path to the active case directory
 * @param {string} query   - The search query (natural language)
 * @param {number} n       - Number of results to return (default 4)
 * @returns {Promise<Array<{docName, title, content, score}>>}
 */
async function ragRetrieve(caseDir, query, n = 4) {
    try {
        const contexts = await retrieveContexts(caseDir, query);
        return (contexts || []).slice(0, n);
    } catch (e) {
        console.error(`[Skill:ragRetrieve] Failed for query "${query}":`, e.message);
        return [];
    }
}

/**
 * Formats retrieved contexts as an injection-ready string block for LLM prompts.
 * @param {Array} contexts - Result of ragRetrieve()
 * @param {string} header  - Optional section header label
 * @returns {string}
 */
function formatContextBlock(contexts, header = 'Relevant Case Documents') {
    if (!contexts || contexts.length === 0) return '';
    let block = `${header}:\n`;
    contexts.forEach((ctx, idx) => {
        block += `\n[source:${idx}] (Doc: ${ctx.docName} | Section: ${ctx.title})\n${ctx.content}\n`;
    });
    return block;
}

module.exports = { ragRetrieve, formatContextBlock };
