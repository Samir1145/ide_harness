'use strict';
/**
 * vault-loader.js  (Open Vault — 1-step JSON load)
 * ─────────────────────────────────────────────────────────────────
 */

const path = require('path');
const fs   = require('fs');

const VAULT_DIR  = path.join(__dirname, '..', 'vault');
const OUT_PATH   = path.join(VAULT_DIR, 'laws-open.json');
const VER_PATH   = path.join(VAULT_DIR, 'version.json');

let _index       = null;
const _textMap   = new Map();

let _ready       = false;
let _version     = null;

// ── BM25 scorer ───────────────────────────────────────────────────

function tokenize(text) {
    return text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2);
}

function bm25Score(queryTokens, docTokens) {
    const k1 = 1.5, b = 0.75;
    const avgLen = 80;
    const docLen = docTokens.length;
    const tf = {};
    for (const t of docTokens) tf[t] = (tf[t] || 0) + 1;
    let score = 0;
    for (const qt of queryTokens) {
        const f = tf[qt] || 0;
        if (!f) continue;
        score += (f * (k1 + 1)) / (f + k1 * (1 - b + b * (docLen / avgLen)));
    }
    return score;
}

// ── Public API ────────────────────────────────────────────────────

function loadVault() {
    if (!fs.existsSync(OUT_PATH)) {
        console.warn(`[VaultLoader] No open vault found at ${OUT_PATH} — law completion disabled.`);
        return false;
    }

    try {
        _index = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
    } catch (e) {
        console.error('[VaultLoader] laws-open.json parse error:', e.message);
        return false;
    }

    _textMap.clear();
    for (const entry of _index) {
        _textMap.set(entry.id, entry.text);
    }

    if (fs.existsSync(VER_PATH)) {
        try { _version = JSON.parse(fs.readFileSync(VER_PATH, 'utf8')); } catch (_) {}
    }

    _ready = true;
    console.log(`[VaultLoader] ✓ ${_index.length} laws successfully loaded from open JSON into RAM`);
    return true;
}

function isVaultReady() { return _ready; }

function getVaultVersion() { return _version; }

function getLawText(id) {
    if (!_ready) return null;
    return _textMap.get(id) || null;
}

function searchLaws(query, topN = 5) {
    if (!_ready || !_index) return [];
    const qt = tokenize(query);
    if (!qt.length) return [];

    return _index
        .map(e => ({ e, score: bm25Score(qt, e.tokens) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN)
        .map(({ e }) => ({
            id:      e.id,
            title:   e.title,
            section: e.section,
            text:    getLawText(e.id) || ''
        }));
}

function resolveTrigger(trigger, topN = 3) {
    if (!_ready) return [];

    const secMatch = trigger.match(/(?:sec(?:tion)?\.?\s*|s)(\d+[a-z]?)/i);
    if (secMatch) {
        const secNum = secMatch[1].toLowerCase();
        const direct = _index.filter(e => e.section && e.section.toLowerCase() === secNum);
        if (direct.length) {
            return direct.slice(0, topN).map(e => ({
                title: e.title,
                text:  getLawText(e.id) || '',
                id:    e.id
            }));
        }
    }

    const results = searchLaws(trigger, topN);
    return results.map(r => ({
        title: r.title,
        text:  r.text,
        id:    r.id
    }));
}

module.exports = {
    loadVault,
    isVaultReady,
    getLawText,
    searchLaws,
    resolveTrigger,
    getVaultVersion
};
