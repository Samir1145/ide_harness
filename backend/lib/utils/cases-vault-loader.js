'use strict';
/**
 * cases-vault-loader.js
 * ─────────────────────────────────────────────────────────────────
 * Loads the encrypted cases vault (judgment summaries) from:
 *   ~/Library/Application Support/Hayagriva/vaults/cases/
 *
 * Exposes the same search API as vault-loader.js but for case law.
 * VAULT_KEY read from OS Keychain under account "vault-cases".
 * ─────────────────────────────────────────────────────────────────
 */

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const zlib   = require('zlib');
const os     = require('os');

// ── Vault path ────────────────────────────────────────────────────
const USER_CASES_DIR = process.platform === 'win32'
  ? path.join(process.env.APPDATA || os.homedir(), 'Hayagriva', 'vaults', 'cases')
  : path.join(os.homedir(), 'Library', 'Application Support', 'Hayagriva', 'vaults', 'cases');

const DESKTOP_VAULTS_DIRS = [
  process.env.HAYAGRIVA_VAULTS_PATH,
  path.join(os.homedir(), 'Desktop', 'HAYAGRIVA', 'vaults', 'output', 'client_vaults', 'dist'),
  path.join(__dirname, '..', '..', '..', '..', 'vaults', 'output', 'client_vaults', 'dist'),
  path.join(os.homedir(), 'Desktop', 'HAYAGRIVA', 'vaults', 'output'),
  path.join(__dirname, '..', '..', '..', '..', 'vaults', 'output'),
  path.join(os.homedir(), 'Desktop', 'HAYAGRIVA', 'vaults'),
  path.join(__dirname, '..', '..', '..', '..', 'vaults'),
  path.join(os.homedir(), 'Desktop', 'ide_vaults', 'output', 'client_vaults', 'dist'),
  path.join(os.homedir(), 'Desktop', 'ide_vaults', 'output'),
  path.join(os.homedir(), 'Desktop', 'ide_vaults')
].filter(Boolean);

const BUNDLED_CASES_DIR = path.join(__dirname, '..', '..', 'vault', 'data_vaults', 'cases');

function resolveCasesDir() {
  if (fs.existsSync(path.join(USER_CASES_DIR, 'cases-manifest.json'))) {
    return USER_CASES_DIR;
  }
  for (const vDir of DESKTOP_VAULTS_DIRS) {
    if (fs.existsSync(path.join(vDir, 'cases-manifest.json'))) {
      return vDir;
    }
  }
  if (fs.existsSync(path.join(BUNDLED_CASES_DIR, 'cases-manifest.json'))) {
    return BUNDLED_CASES_DIR;
  }
  return USER_CASES_DIR;
}

const KEYCHAIN_SERVICE = 'hayagriva';
const KEYCHAIN_ACCOUNT = 'vault-cases';

// ── State ─────────────────────────────────────────────────────────
let _index   = null;
let _ready   = false;
let _version = null;
let _dataPath    = null;
let _manifestPath = null;
let _verPath     = null;

let _generateEmbeddings = null;

// ── Keychain key retrieval ────────────────────────────────────────
async function getVaultKey() {
    try {
        const keytar = require('keytar');
        const k = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
        if (k && k.length === 64) return k;
    } catch (_) {}
    const env = process.env.VAULT_KEY_CASES || process.env.VAULT_KEY || '';
    return env.length === 64 ? env : null;
}

// ── BM25 + cosine helpers (identical to vault-loader) ─────────────
function tokenize(text) {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function bm25Score(qt, docTokens, k1 = 1.5, b = 0.75, avgLen = 200) {
    if (!docTokens || !docTokens.length) return 0;
    let score = 0;
    const dl = docTokens.length;
    for (const term of qt) {
        const tf = docTokens.filter(t => t === term).length;
        if (!tf) continue;
        const idf = Math.log((1000 + 0.5) / (1 + 1) + 1);
        score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgLen));
    }
    return score;
}

function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

async function getEmbedding(text) {
    if (!_generateEmbeddings) {
        const { pipeline, env } = await import('@xenova/transformers');
        env.localModelPath = path.join(__dirname, '..', '..', 'models', 'embeddings', 'legal');
        env.allowLocalModels = true;
        env.allowRemoteModels = false;
        _generateEmbeddings = await pipeline('feature-extraction', 'inlegal-sbert', { quantized: false });
    }
    const out = await _generateEmbeddings(text, { pooling: 'mean', normalize: true });
    return Array.from(out.data);
}

// ── Load ──────────────────────────────────────────────────────────
function loadCasesVault() {
    const dir = resolveCasesDir();
    _manifestPath = path.join(dir, 'cases-manifest.json');
    _dataPath     = path.join(dir, 'cases.vlt.data');
    _verPath      = path.join(dir, 'cases-version.json');

    if (!fs.existsSync(_manifestPath)) {
        return false;
    }

    _loadAsync();
    return true;
}

async function _loadAsync() {
    const vaultKeyHex = await getVaultKey();
    if (!vaultKeyHex) {
        console.warn('[CasesVaultLoader] No VAULT_KEY for cases — activate a license first.');
        return;
    }
    if (!fs.existsSync(_dataPath)) {
        console.warn('[CasesVaultLoader] cases.vlt.data not found — vault incomplete.');
        return;
    }
    try {
        _index = JSON.parse(fs.readFileSync(_manifestPath, 'utf8'));
    } catch (e) {
        console.error('[CasesVaultLoader] manifest parse error:', e.message);
        return;
    }
    if (fs.existsSync(_verPath)) {
        try { _version = JSON.parse(fs.readFileSync(_verPath, 'utf8')); } catch (_) {}
    }
    _ready = true;
    console.log(`[CasesVaultLoader] ✓ ${_index.length} case entries loaded.`);
    getEmbedding('init').catch(() => {});
}

// ── Text retrieval ────────────────────────────────────────────────
async function getCaseText(id) {
    if (!_ready || !_index) return null;
    const entry = _index.find(e => e.id === id);
    if (!entry || entry.offset === -1) return null;

    const vaultKeyHex = await getVaultKey();
    if (!vaultKeyHex) return null;

    try {
        const fd     = fs.openSync(_dataPath, 'r');
        const buffer = Buffer.alloc(entry.length);
        fs.readSync(fd, buffer, 0, entry.length, entry.offset);
        fs.closeSync(fd);

        const storedLen = buffer.readUInt32LE(0);
        if (storedLen !== entry.length - 4) return null;

        const iv         = buffer.subarray(4, 16);
        const authTag    = buffer.subarray(16, 32);
        const ciphertext = buffer.subarray(32);

        const key      = Buffer.from(vaultKeyHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return zlib.gunzipSync(decrypted).toString('utf8');
    } catch (err) {
        console.error(`[CasesVaultLoader] Decrypt error for ${id}:`, err.message);
        return null;
    }
}

// ── Search ────────────────────────────────────────────────────────
async function searchCases(query, topN = 10) {
    if (!_ready || !_index) return [];
    const qt = tokenize(query);
    if (!qt.length) return [];

    let queryVector = null;
    try { queryVector = await getEmbedding(query); } catch (_) {}

    const scored = _index
        .map(e => {
            const bm25     = bm25Score(qt, e.tokens);
            const normBm25 = Math.min(bm25 / 10, 1.0);
            const semantic = queryVector && e.vector ? cosineSimilarity(queryVector, e.vector) : 0;
            let score = (normBm25 * 0.4) + (semantic * 0.6);
            if (bm25 > 20) score += 2.0;
            return { e, score };
        })
        .filter(x => x.score > 0.1)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);

    const results = [];
    for (const { e } of scored) {
        const text = await getCaseText(e.id);
        results.push({ id: e.id, title: e.title, section: e.section || null, text: text || '' });
    }
    return results;
}

// ── Hot-swap ──────────────────────────────────────────────────────
async function reloadCasesVault() {
    console.log('[CasesVaultLoader] Hot-swapping cases vault...');
    _index              = null;
    _ready              = false;
    _version            = null;
    _generateEmbeddings = null;
    loadCasesVault();
}

function isCasesVaultReady()   { return _ready; }
function getCasesVaultVersion() { return _version; }

module.exports = {
    loadCasesVault,
    reloadCasesVault,
    isCasesVaultReady,
    getCasesVaultVersion,
    getCaseText,
    searchCases,
};
