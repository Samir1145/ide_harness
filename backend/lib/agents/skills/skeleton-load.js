/**
 * Skill: skeleton-load.js + placeholder-fill.js
 * Loads DMS skeleton templates and auto-fills {{ PLACEHOLDER }} gaps
 * using the case KV dictionary + RAG retrieval.
 *
 * Used by @document and @nclt agents.
 */

const fs = require('fs');
const path = require('path');
const { ragRetrieve } = require('./rag-retrieve');
const { readAllKV } = require('./kv-write');
const { getChatResponse } = require('../../core/llm-client');

const os = require('os');

// DMS skeletons directory (relative to repo root)
const SKELETONS_SUBPATH = path.join('backend', 'lib', 'pipeline', 'forms', 'skeletons');

function getSkeletonSearchDirs(repoRoot) {
    const dirs = [];
    if (repoRoot) {
        dirs.push(path.join(repoRoot, SKELETONS_SUBPATH));
    }
    dirs.push(path.join(__dirname, '..', '..', 'pipeline', 'forms', 'skeletons'));

    const candidatePacksDirs = [
        process.env.HAYAGRIVA_AGENTS_PATH,
        path.join(os.homedir(), 'Desktop', 'ide_agents', 'packs'),
        path.join(os.homedir(), 'Desktop', 'ide_agents', 'suites', 'ibc_forms'),
        path.join(os.homedir(), 'Library', 'Application Support', 'Hayagriva', 'agents')
    ].filter(Boolean);

    for (const pDir of candidatePacksDirs) {
        if (!fs.existsSync(pDir)) continue;
        dirs.push(pDir);
        try {
            const entries = fs.readdirSync(pDir);
            for (const entry of entries) {
                const packForms = path.join(pDir, entry, 'forms');
                if (fs.existsSync(packForms)) {
                    dirs.push(packForms);
                }
            }
        } catch (_) {}
    }

    return [...new Set(dirs)].filter(d => fs.existsSync(d));
}

function getAllSkeletonFiles(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            results = results.concat(getAllSkeletonFiles(fullPath));
        } else if (item.name.endsWith('.md')) {
            results.push({ name: item.name, filePath: fullPath });
        }
    }
    return results;
}

/**
 * Locates and reads a skeleton template by name across all search directories.
 * Tries exact match first, then fuzzy match.
 *
 * @param {string} templateName - e.g. 'sec7-petition', 'cirp-form-c'
 * @param {string} repoRoot     - Absolute path to repo root
 * @returns {{ name: string, content: string, filePath: string } | null}
 */
function loadSkeleton(templateName, repoRoot) {
    const searchDirs = getSkeletonSearchDirs(repoRoot);
    let allFiles = [];
    for (const dir of searchDirs) {
        allFiles = allFiles.concat(getAllSkeletonFiles(dir));
    }

    // Deduplicate by name preferring earlier matches
    const seen = new Set();
    const uniqueFiles = [];
    for (const f of allFiles) {
        if (!seen.has(f.name)) {
            seen.add(f.name);
            uniqueFiles.push(f);
        }
    }

    const targetName = templateName.endsWith('.md') ? templateName : `${templateName}.md`;

    // Exact match
    const exact = uniqueFiles.find(f => f.name === targetName);
    if (exact) {
        return { name: exact.name, content: fs.readFileSync(exact.filePath, 'utf8'), filePath: exact.filePath };
    }

    // Fuzzy match
    const slug = templateName.toLowerCase().replace(/[\s_]/g, '-');
    const fuzzy = uniqueFiles.find(f => f.name.toLowerCase().includes(slug));
    if (fuzzy) {
        return { name: fuzzy.name, content: fs.readFileSync(fuzzy.filePath, 'utf8'), filePath: fuzzy.filePath };
    }

    console.warn(`[Skill:skeletonLoad] Template "${templateName}" not found. Available count: ${uniqueFiles.length}`);
    return null;
}

/**
 * Returns a list of all available skeleton template names across all packs.
 * @param {string} repoRoot
 * @returns {string[]}
 */
function listSkeletons(repoRoot) {
    const searchDirs = getSkeletonSearchDirs(repoRoot);
    let allFiles = [];
    for (const dir of searchDirs) {
        allFiles = allFiles.concat(getAllSkeletonFiles(dir));
    }
    const seen = new Set();
    for (const f of allFiles) {
        seen.add(f.name.replace('.md', ''));
    }
    return Array.from(seen);
}


/**
 * Extracts all {{ PLACEHOLDER }} tokens from a skeleton content string.
 * @param {string} content
 * @returns {string[]} Array of unique placeholder names
 */
function extractPlaceholders(content) {
    const matches = content.match(/\{\{\s*([A-Z_]+)\s*\}\}/g) || [];
    const names = matches.map(m => m.replace(/\{\{\s*|\s*\}\}/g, '').trim());
    return [...new Set(names)];
}

/**
 * Fills a skeleton template by:
 * 1. Reading values from case_kv_dictionary.json (fast, zero LLM calls)
 * 2. RAG-retrieving values for remaining unfilled placeholders (LLM-assisted)
 *
 * @param {string} skeletonContent - Raw skeleton template string
 * @param {string} caseDir         - Active case directory
 * @param {string} repoRoot        - Repo root for LLM client
 * @returns {Promise<{ filled: string, placeholders: Array<{name, value, source, filled: boolean}> }>}
 */
async function fillPlaceholders(skeletonContent, caseDir, repoRoot) {
    const placeholderNames = extractPlaceholders(skeletonContent);
    const kv = readAllKV(caseDir);
    const results = [];
    let filled = skeletonContent;

    for (const name of placeholderNames) {
        const kvKey = name.toLowerCase();
        let value = null;
        let source = null;

        // Step 1: Check KV dictionary first (instant, no LLM)
        if (kv[kvKey] !== undefined) {
            value = kv[kvKey];
            source = 'kv_dictionary';
        }
        // Try common aliases
        else if (name === 'CORPORATE_DEBTOR_NAME' && kv['company_name']) {
            value = kv['company_name']; source = 'kv_alias';
        } else if (name === 'AMOUNT_CLAIMED' && kv['total_claim_amount']) {
            value = kv['total_claim_amount']; source = 'kv_alias';
        } else if (name === 'DATE_OF_DEFAULT' && kv['date_of_default']) {
            value = kv['date_of_default']; source = 'kv_alias';
        }

        // Step 2: RAG + LLM fill for unfilled placeholders (bypassed in Lite Mode)
        const { loadLlmConfig } = require('../../core/llm-client');
        const config = loadLlmConfig({ caseDir });
        if (!value && config.activeMode !== 'lite') {
            const query = name.toLowerCase().replace(/_/g, ' ');
            const chunks = await ragRetrieve(caseDir, query, 2);
            if (chunks.length > 0) {
                const context = chunks.map(c => c.content).join('\n\n');
                try {
                    const prompt = `From the following case document excerpt, extract the value for: "${name.replace(/_/g, ' ')}".
Return ONLY the extracted value as a short phrase or date. If not found, return null.

Excerpt:
"""
${context.substring(0, 800)}
"""`;
                    const raw = await getChatResponse([
                        { role: 'system', content: 'Extract the requested value. Return only the value or null.' },
                        { role: 'user', content: prompt }
                    ], { caseDir });

                    const cleaned = (raw || '').trim().replace(/^["']|["']$/g, '');
                    if (cleaned && cleaned.toLowerCase() !== 'null' && cleaned.length < 200) {
                        value = cleaned;
                        source = chunks[0].docName;
                    }
                } catch (e) { /* non-fatal */ }
            }
        }

        const isFilled = !!value;
        results.push({ name, value: value || `[${name}]`, source, filled: isFilled });

        // Replace in the skeleton
        const token = new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g');
        filled = filled.replace(token, value || `⚠️ [${name}: NEEDS REVIEW]`);
    }

    return { filled, placeholders: results };
}

module.exports = { loadSkeleton, listSkeletons, extractPlaceholders, fillPlaceholders };
