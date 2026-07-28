/**
 * Skill: vault-lookup.js
 * Queries the local encrypted Law Vault (IBC, Companies Act, IBBI Regulations)
 * for specific section text or keyword-based retrieval.
 * Wraps the existing vault-loader utilities.
 */

const { resolveTrigger, searchLaws } = require('../../utils/vault-loader');

/**
 * Resolves a specific statutory section trigger.
 * @param {string} trigger - e.g. "ibc/sec 7", "co/sec 138", "ibbi/reg 37"
 * @param {number} n       - Max results
 * @returns {Promise<Array<{id, title, text}>>}
 */
async function vaultResolve(trigger, n = 3) {
    try {
        return await resolveTrigger(trigger, n) || [];
    } catch (e) {
        console.error(`[Skill:vaultLookup] resolveTrigger failed for "${trigger}":`, e.message);
        return [];
    }
}

/**
 * Keyword-based search across all law vault provisions.
 * @param {string} query - Natural language or keyword query
 * @param {number} n     - Max results
 * @returns {Promise<Array<{id, title, text}>>}
 */
async function vaultSearch(query, n = 3) {
    try {
        return await searchLaws(query, n) || [];
    } catch (e) {
        console.error(`[Skill:vaultLookup] searchLaws failed for "${query}":`, e.message);
        return [];
    }
}

/**
 * Smart lookup: tries trigger pattern first, falls back to keyword search.
 * @param {string} userMessage - Raw user query string
 * @param {number} n           - Max results
 * @returns {Promise<Array<{id, title, text}>>}
 */
async function vaultLookup(userMessage, n = 3) {
    // Detect direct section triggers from message
    const coMatch = userMessage.match(/(?:sec(?:tion)?\.?\s*|s)(\d+[a-z]?)\s+of\s+companies\s+act/i);
    const ibcMatch = userMessage.match(/(?:sec(?:tion)?\.?\s*|s)(\d+[a-z]?)(?:\s+of\s+ibc)?/i);
    const ibbiMatch = userMessage.match(/(?:reg(?:ulation)?\.?\s*)(\d+[a-z]?)\s+of\s+ibbi/i);

    let trigger = null;
    if (coMatch)   trigger = `co/sec ${coMatch[1]}`;
    else if (ibbiMatch) trigger = `ibbi/reg ${ibbiMatch[1]}`;
    else if (ibcMatch)  trigger = `ibc/sec ${ibcMatch[1]}`;

    let results = [];
    if (trigger) {
        console.log(`[Skill:vaultLookup] Detected trigger: "${trigger}"`);
        results = await vaultResolve(trigger, n);
    }
    if (!results.length) {
        results = await vaultSearch(userMessage, n);
    }
    return results;
}

/**
 * Format vault results for LLM prompt injection.
 * @param {Array} laws
 * @returns {string}
 */
function formatVaultBlock(laws) {
    if (!laws || laws.length === 0) return '';
    let block = 'Relevant Law Vault Provisions:\n';
    laws.forEach((law, idx) => {
        block += `\n[Law ${idx + 1}] (Section: ${law.title} | ID: ${law.id})\n${law.text}\n`;
    });
    return block;
}

module.exports = { vaultLookup, vaultResolve, vaultSearch, formatVaultBlock };
