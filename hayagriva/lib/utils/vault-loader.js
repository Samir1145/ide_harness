'use strict';
/**
 * vault-loader.js  (Laws Vault)
 * ─────────────────────────────────────────────────────────────────
 * Loads the encrypted laws vault (statutory text) from:
 *   1. ~/Library/Application Support/Hayagriva/vaults/laws/  (user-downloaded)
 *   2. hayagriva/vault/  (bundled fallback)
 *
 * VAULT_KEY is read from the OS Keychain (keytar) when available,
 * with a fallback to process.env.VAULT_KEY for local development.
 * ─────────────────────────────────────────────────────────────────
 */

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const zlib   = require('zlib');
const os     = require('os');

// ── Vault path resolution ─────────────────────────────────────────
// Check the user's Application Support directory first (downloaded vaults),
// then fall back to the bundled vault shipped with the app.

const USER_VAULTS_DIR  = process.platform === 'win32'
  ? path.join(process.env.APPDATA || os.homedir(), 'Hayagriva', 'vaults', 'laws')
  : path.join(os.homedir(), 'Library', 'Application Support', 'Hayagriva', 'vaults', 'laws');

const BUNDLED_VAULT_DIR = path.join(__dirname, '..', '..', 'vault');

function resolveVaultDir() {
  // Prefer user-downloaded vault if manifest exists there
  if (fs.existsSync(path.join(USER_VAULTS_DIR, 'laws-manifest.json'))) {
    return { dir: USER_VAULTS_DIR, prefix: 'laws-' };
  }
  // Bundled fallback (original layout — no prefix)
  return { dir: BUNDLED_VAULT_DIR, prefix: '' };
}

const OVERLAYS_DIR = path.join(BUNDLED_VAULT_DIR, 'user_overlays');

let _vaultDir    = null;
let _prefix      = '';
let _manifestPath = null;
let _dataPath    = null;
let _verPath     = null;

function _resolvePaths() {
  const { dir, prefix } = resolveVaultDir();
  _vaultDir     = dir;
  _prefix       = prefix;
  _manifestPath = path.join(dir, `${prefix}manifest.json`);
  _dataPath     = path.join(dir, `${prefix}laws.vlt.data`);
  _verPath      = path.join(dir, `${prefix}version.json`);
}

_resolvePaths();

// ── State ─────────────────────────────────────────────────────────
let _index       = null;
let _ready       = false;
let _version     = null;
const _overlays  = new Map();

// ── VAULT_KEY via Keychain ────────────────────────────────────────
const KEYCHAIN_SERVICE = 'hayagriva';
const KEYCHAIN_ACCOUNT = 'vault-laws';

async function getVaultKey() {
  // 1. Try OS Keychain (production — user has activated a license)
  try {
    const keytar = require('keytar');
    const keychainKey = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    if (keychainKey && keychainKey.length === 64) return keychainKey;
  } catch (_) {
    // keytar not available (dev environment without native build)
  }
  // 2. Fall back to environment variable (local dev)
  const envKey = process.env.VAULT_KEY || '';
  return envKey.length === 64 ? envKey : null;
}

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

// ── Vector Math ───────────────────────────────────────────────────
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── Transformer Singleton ─────────────────────────────────────────
let _generateEmbeddings = null;

async function getEmbedding(text) {
    if (!_generateEmbeddings) {
        console.log('[VaultLoader] Initializing local semantic embedding pipeline...');
        const { pipeline, env } = await import('@xenova/transformers');
        env.allowLocalModels = true;
        _generateEmbeddings = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    const output = await _generateEmbeddings(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

// ── Public API ────────────────────────────────────────────────────

function loadOverlays() {
    _overlays.clear();
    if (!fs.existsSync(OVERLAYS_DIR)) {
        try {
            fs.mkdirSync(OVERLAYS_DIR, { recursive: true });
        } catch (_) {}
        return;
    }

    try {
        const files = fs.readdirSync(OVERLAYS_DIR).filter(f => f.endsWith('.json'));
        for (const file of files) {
            const filePath = path.join(OVERLAYS_DIR, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);
            const entries = Array.isArray(data) ? data : [data];

            for (const entry of entries) {
                if (entry && entry.id) {
                    _overlays.set(entry.id, entry.text || '');
                    
                    const tokens = tokenize(entry.text || '');
                    const existingIdx = _index.findIndex(e => e.id === entry.id);
                    const manifestEntry = {
                        id: entry.id,
                        title: entry.title || entry.id,
                        section: entry.section || '',
                        tokens: tokens,
                        offset: -1,
                        length: -1
                    };

                    if (existingIdx !== -1) {
                        _index[existingIdx] = {
                            ..._index[existingIdx],
                            ...manifestEntry
                        };
                    } else {
                        _index.push(manifestEntry);
                    }
                }
            }
        }
        if (_overlays.size > 0) {
            console.log(`[VaultLoader] Loaded ${_overlays.size} custom user law overlays`);
        }
    } catch (e) {
        console.error('[VaultLoader] Error loading user overlays:', e.message);
    }
}

function loadVault() {
    _resolvePaths();

    if (!fs.existsSync(_manifestPath)) {
        console.warn(`[VaultLoader] No manifest found at ${_manifestPath} — law completion disabled.`);
        return false;
    }

    // Vault key is fetched async; loadVault() triggers a background resolve.
    // The vault will only be fully ready once _getVaultKeyAndFinish completes.
    _getVaultKeyAndFinish();
    return true; // partial init — _ready set async
}

async function _getVaultKeyAndFinish() {
    const vaultKeyHex = await getVaultKey();
    if (!vaultKeyHex) {
        console.warn('[VaultLoader] VAULT_KEY not available (no Keychain entry, no env var) — law completion disabled.');
        return;
    }

    if (!fs.existsSync(_dataPath)) {
        console.warn(`[VaultLoader] No data file found at ${_dataPath} — law completion disabled.`);
        return;
    }

    try {
        _index = JSON.parse(fs.readFileSync(_manifestPath, 'utf8'));
    } catch (e) {
        console.error('[VaultLoader] manifest.json parse error:', e.message);
        return;
    }

    loadOverlays();

    if (fs.existsSync(_verPath)) {
        try { _version = JSON.parse(fs.readFileSync(_verPath, 'utf8')); } catch (_) {}
    }

    _ready = true;
    console.log(`[VaultLoader] ✓ ${_index.length} law entries loaded from ${_vaultDir}`);
    getEmbedding('init').catch(() => {});
}

function isVaultReady() { return _ready; }

function getVaultVersion() { return _version; }

async function getLawTextAsync(id) {
    const vaultKeyHex = await getVaultKey();
    if (!vaultKeyHex) return null;
    return _getLawTextWithKey(id, vaultKeyHex);
}

function getLawText(id) {
    if (!_ready || !_index) return null;

    if (_overlays.has(id)) {
        return _overlays.get(id);
    }

    const entry = _index.find(e => e.id === id);
    if (!entry || typeof entry.offset !== 'number' || typeof entry.length !== 'number') {
        return null;
    }
    if (entry.offset === -1) {
        return null;
    }

    const vaultKeyHex = process.env.VAULT_KEY || '';
    if (!vaultKeyHex || vaultKeyHex.length !== 64) return null;
    return _getLawTextWithKey(id, vaultKeyHex);
}

function _getLawTextWithKey(id, vaultKeyHex) {
    if (!_ready || !_index) return null;

    if (_overlays.has(id)) return _overlays.get(id);

    const entry = _index.find(e => e.id === id);
    if (!entry || typeof entry.offset !== 'number' || typeof entry.length !== 'number') return null;
    if (entry.offset === -1) return null;

    try {
        const fd = fs.openSync(_dataPath, 'r');
        const buffer = Buffer.alloc(entry.length);
        fs.readSync(fd, buffer, 0, entry.length, entry.offset);
        fs.closeSync(fd);

        const storedLength = buffer.readUInt32LE(0);
        if (storedLength !== entry.length - 4) {
            console.error(`[VaultLoader] Length mismatch for id ${id}`);
            return null;
        }

        const iv = buffer.subarray(4, 16);
        const authTag = buffer.subarray(16, 32);
        const ciphertext = buffer.subarray(32);

        const key = Buffer.from(vaultKeyHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return zlib.gunzipSync(decrypted).toString('utf8');
    } catch (err) {
        console.error(`[VaultLoader] Failed to decrypt/unzip id ${id}:`, err.message);
        return null;
    }
}

async function searchLaws(query, topN = 5, customIndex = null) {
    if (!_ready || !_index) return [];
    const qt = tokenize(query);
    if (!qt.length) return [];

    const indexToSearch = customIndex || _index;
    
    // Generate semantic query vector
    let queryVector = null;
    try {
        queryVector = await getEmbedding(query);
    } catch(e) {
        console.error('[VaultLoader] Embedding failed, falling back to pure BM25', e.message);
    }

    return indexToSearch
        .map(e => {
            const bm25 = bm25Score(qt, e.tokens);
            // Normalize BM25 roughly between 0 and 1
            const normalizedBm25 = Math.min(bm25 / 10, 1.0); 
            
            let semantic = 0;
            if (queryVector && e.vector) {
                semantic = cosineSimilarity(queryVector, e.vector);
            }
            
            // Hybrid Formula: 50% BM25, 50% Semantic
            // Give a massive boost if BM25 finds an exact section match
            let score = (normalizedBm25 * 0.4) + (semantic * 0.6);
            if (bm25 > 20) score += 2.0; 

            return { e, score, semantic, bm25 };
        })
        .filter(x => x.score > 0.1) // Noise threshold
        .sort((a, b) => b.score - a.score)
        .slice(0, topN)
        .map(({ e }) => ({
            id:      e.id,
            title:   e.title,
            section: e.section,
            text:    getLawText(e.id) || ''
        }));
}

async function resolveTrigger(trigger, topN = 3) {
    if (!_ready) return [];

    let prefix = null;
    let actualTrigger = trigger;

    const parts = trigger.split('/');
    if (parts.length > 1) {
        prefix = parts[0].trim().toLowerCase();
        actualTrigger = parts.slice(1).join('/').trim();
    }

    let searchIndex = _index;
    if (prefix) {
        searchIndex = _index.filter(e => e.id.toLowerCase().startsWith(prefix + '/'));
    }

    const secMatch = actualTrigger.match(/(?:sec(?:tion)?\.?\s*|s)(\d+[a-z]?)/i);
    if (secMatch) {
        const secNum = secMatch[1].toLowerCase();
        const direct = searchIndex.filter(e => e.section && e.section.toLowerCase() === secNum);
        if (direct.length) {
            return direct.slice(0, topN).map(e => ({
                title: e.title,
                text:  getLawText(e.id) || '',
                id:    e.id
            }));
        }
    }

    const results = await searchLaws(actualTrigger, topN, searchIndex);
    return results.map(r => ({
        title: r.title,
        text:  r.text,
        id:    r.id
    }));
}

/**
 * reloadVault() — hot-swap: clear state and re-initialize from disk.
 * Called by VaultManager after a new vault is downloaded and installed.
 */
async function reloadVault() {
    console.log('[VaultLoader] Hot-swapping laws vault...');
    _index   = null;
    _ready   = false;
    _version = null;
    _overlays.clear();
    _generateEmbeddings = null;
    _resolvePaths();
    loadVault();
}

module.exports = {
    loadVault,
    reloadVault,
    isVaultReady,
    getLawText,
    searchLaws,
    resolveTrigger,
    getVaultVersion
};
