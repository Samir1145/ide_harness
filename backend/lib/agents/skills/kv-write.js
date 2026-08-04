/**
 * Skill: kv-write.js
 * Writes agent-discovered facts back to the case_kv_dictionary.json,
 * closing the context enrichment loop: Stage 1 indexes → Stage 3 enriches → next turn is smarter.
 */

const fs = require('fs');
const path = require('path');
const { getConceptsDir } = require('../../pipeline/common/helper');

const KV_FILENAME = 'case_kv_dictionary.json';

/**
 * Reads the current KV dictionary for a case.
 * @param {string} caseDir
 * @returns {Object}
 */
function readKV(caseDir) {
    const kvPath = path.join(getConceptsDir(caseDir), KV_FILENAME);
    if (!fs.existsSync(kvPath)) return {};
    try {
        return JSON.parse(fs.readFileSync(kvPath, 'utf8'));
    } catch (e) {
        console.error(`[Skill:kvWrite] Failed to parse KV dictionary:`, e.message);
        return {};
    }
}

/**
 * Writes a single key-value pair to the case KV dictionary.
 * Adds metadata: source document, agent that wrote it, timestamp.
 * Respects verified_by_user=1 values (will NOT overwrite user-verified values).
 *
 * @param {string} caseDir  - Active case directory
 * @param {string} key      - The fact key (e.g. 'date_of_default', 'corporate_debtor_name')
 * @param {string} value    - The discovered value
 * @param {string} source   - Source document name or agent name
 * @param {string} agentName - Name of the agent writing this fact
 * @returns {boolean} true if written, false if skipped (user-verified value protected)
 */
function writeCaseKV(caseDir, key, value, source, agentName = 'agent') {
    if (!caseDir || !key || value === undefined || value === null) return false;

    const kvPath = path.join(getConceptsDir(caseDir), KV_FILENAME);
    const kv = readKV(caseDir);

    // Protect user-verified values
    if (kv[key] && kv[key].verified_by_user === 1) {
        console.log(`[Skill:kvWrite] Skipping "${key}" — user-verified value is protected.`);
        return false;
    }

    kv[key] = {
        value,
        source,
        agent: agentName,
        updated_at: new Date().toISOString(),
        verified_by_user: 0
    };

    try {
        fs.mkdirSync(path.dirname(kvPath), { recursive: true });
        fs.writeFileSync(kvPath, JSON.stringify(kv, null, 2), 'utf8');
        console.log(`[Skill:kvWrite] Written: "${key}" = "${value}" (source: ${source})`);
        return true;
    } catch (e) {
        console.error(`[Skill:kvWrite] Failed to write KV:`, e.message);
        return false;
    }
}

/**
 * Writes multiple key-value pairs at once.
 * @param {string} caseDir
 * @param {Object} pairs    - { key: value, ... } or { key: { value, source } }
 * @param {string} source
 * @param {string} agentName
 * @returns {number} count of keys written
 */
function writeMultiKV(caseDir, pairs, source, agentName = 'agent') {
    if (!pairs || typeof pairs !== 'object') return 0;
    let written = 0;
    for (const [key, val] of Object.entries(pairs)) {
        const value = (typeof val === 'object' && val.value !== undefined) ? val.value : val;
        const src   = (typeof val === 'object' && val.source)             ? val.source : source;
        if (writeCaseKV(caseDir, key, value, src, agentName)) written++;
    }
    return written;
}

/**
 * Reads a specific key from the KV dictionary.
 * @param {string} caseDir
 * @param {string} key
 * @returns {string|null} the value, or null if not found
 */
function readCaseKV(caseDir, key) {
    const kv = readKV(caseDir);
    return kv[key] ? kv[key].value : null;
}

/**
 * Returns the entire KV dictionary as a flat { key: value } map.
 * @param {string} caseDir
 * @returns {Object}
 */
function readAllKV(caseDir) {
    const kv = readKV(caseDir);
    const flat = {};
    for (const [k, v] of Object.entries(kv)) {
        flat[k] = typeof v === 'object' ? v.value : v;
    }
    return flat;
}

module.exports = { writeCaseKV, writeMultiKV, readCaseKV, readAllKV };
