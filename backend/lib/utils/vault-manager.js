'use strict';
/**
 * vault-manager.js
 * ─────────────────────────────────────────────────────────────────
 * Manages vault lifecycle for the Hayagriva client:
 *   - Check for new versions  (GET api.hayagriva.app/vaults/latest.json)
 *   - Download vault zips     (from GitHub Releases URLs in latest.json)
 *   - Verify integrity        (SHA-256 + HMAC sig)
 *   - Install vault           (unzip to ~/Library/.../Hayagriva/vaults/{name}/)
 *   - Hot-swap                (calls reloadVault() / reloadCasesVault())
 *   - Activate license        (POST api.hayagriva.app/activate → Keychain)
 *
 * All download progress is emitted as events so the Settings UI can
 * show a progress bar via SSE (Server-Sent Events from routes.js).
 * ─────────────────────────────────────────────────────────────────
 */

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');
const https  = require('https');
const http   = require('http');
const cp     = require('child_process');
const { EventEmitter } = require('events');

const { reloadVault }       = require('./vault-loader');
const { reloadCasesVault }  = require('./cases-vault-loader');

// ── Constants ─────────────────────────────────────────────────────
const API_BASE   = process.env.HAYAGRIVA_API_URL || 'https://api.hayagriva.app';
const LATEST_URL = `${API_BASE}/vaults/latest.json`;

const VAULTS_ROOT = process.platform === 'win32'
  ? path.join(process.env.APPDATA || os.homedir(), 'Hayagriva', 'vaults')
  : path.join(os.homedir(), 'Library', 'Application Support', 'Hayagriva', 'vaults');

const KEYCHAIN_SERVICE = 'hayagriva';

const VAULT_META = {
    laws:                       { account: 'vault-laws',                  reload: reloadVault },
    cases:                      { account: 'vault-cases',                 reload: reloadCasesVault },
    documents_ibc:              { account: 'vault-documents-ibc',         reload: null },
    documents_pleadings:        { account: 'vault-documents-pleadings',   reload: null },
    documents_corporate:        { account: 'vault-documents-corporate',  reload: null },
    documents_tax_conveyancing: { account: 'vault-documents-tax',        reload: null },
    forms:                      { account: 'vault-forms',                 reload: null },
    suite_cirp:                 { account: 'vault-cirp',                  reload: null },
    suite_liquidation:          { account: 'vault-cilp',                  reload: null },
    suite_voluntary_liquidation:{ account: 'vault-civlp',                 reload: null },
    suite_ppirp:                { account: 'vault-ppirp',                 reload: null },
    suite_personal_guarantor:   { account: 'vault-pg',                    reload: null },
};


// ── EventEmitter for progress ─────────────────────────────────────
const emitter = new EventEmitter();

// ── Helpers ───────────────────────────────────────────────────────

function getLocalVersion(vaultName) {
    const versionFile = path.join(VAULTS_ROOT, vaultName, `${vaultName}-version.json`);
    if (!fs.existsSync(versionFile)) return null;
    try {
        return JSON.parse(fs.readFileSync(versionFile, 'utf8'));
    } catch (_) { return null; }
}

/**
 * Fetches the latest.json manifest from the API server.
 * Returns the parsed JSON or null on failure.
 */
async function fetchLatestManifest() {
    return new Promise((resolve) => {
        const url = new URL(LATEST_URL);
        const mod = url.protocol === 'https:' ? https : http;
        const req = mod.get(url.href, { timeout: 10000 }, (res) => {
            let data = '';
            res.on('data', d => { data += d; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (_) { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
    });
}

/**
 * Downloads a file from a URL to a local destination path,
 * following redirects and emitting progress events.
 */
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const dest = fs.createWriteStream(destPath);

        function doGet(urlStr) {
            const parsed = new URL(urlStr);
            const mod = parsed.protocol === 'https:' ? https : http;
            mod.get(urlStr, { timeout: 300000 }, (res) => {
                // Follow redirects (GitHub Releases uses multiple redirects)
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return doGet(res.headers.location);
                }
                if (res.statusCode !== 200) {
                    return reject(new Error(`HTTP ${res.statusCode} for ${urlStr}`));
                }

                const total = parseInt(res.headers['content-length'] || '0', 10);
                let received = 0;

                res.on('data', chunk => {
                    dest.write(chunk);
                    received += chunk.length;
                    if (total > 0) {
                        emitter.emit('progress', { received, total, pct: Math.floor(received * 100 / total) });
                    }
                });
                res.on('end', () => { dest.end(); resolve(); });
                res.on('error', reject);
            }).on('error', reject);
        }

        dest.on('error', reject);
        doGet(url);
    });
}

/**
 * SHA-256 hash of a file on disk.
 */
function sha256File(filePath) {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Unzip a zip file to a destination directory using the system `unzip`.
 * Overwrites existing files silently.
 */
function unzip(zipPath, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    const res = cp.spawnSync('unzip', ['-o', zipPath, '-d', destDir], { stdio: 'inherit' });
    if (res.status !== 0) throw new Error(`unzip failed (exit ${res.status})`);
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Check remote latest.json and compare with local versions.
 * Returns an object describing current vs remote state for each vault.
 *
 * {
 *   laws:      { localVersion, remoteVersion, updateAvailable, remoteEntry },
 *   cases:     { ... },
 *   documents: { ... },
 *   forms:     { ... },
 * }
 */
async function getVaultStatus() {
    const remote = await fetchLatestManifest();
    const status = {};
    for (const vaultName of Object.keys(VAULT_META)) {
        const local  = getLocalVersion(vaultName);
        const entry  = remote ? remote[vaultName] : null;
        const localV = local  ? local.version  : null;
        const remoteV = entry ? entry.version : null;
        status[vaultName] = {
            localVersion:    localV,
            remoteVersion:   remoteV,
            updateAvailable: !!(remoteV && remoteV !== 'stub' && remoteV !== localV),
            remoteEntry:     entry || null,
            installed:       !!localV,
        };
    }
    return status;
}

/**
 * Download, verify, and install a vault by name.
 * Emits 'progress' events during download.
 * Calls reloadVault() / reloadCasesVault() after installation.
 *
 * @param {string} vaultName — 'laws' | 'cases' | 'documents' | 'forms'
 * @param {object} remoteEntry — the entry from latest.json for this vault
 */
async function downloadAndInstallVault(vaultName, remoteEntry) {
    if (!remoteEntry || !remoteEntry.url) throw new Error(`No download URL for vault: ${vaultName}`);

    const tmpDir  = path.join(os.tmpdir(), `hayagriva-vault-${vaultName}-${Date.now()}`);
    const tmpZip  = path.join(tmpDir, `${vaultName}.zip`);
    const destDir = path.join(VAULTS_ROOT, vaultName);

    fs.mkdirSync(tmpDir, { recursive: true });

    try {
        // Step 1: Download
        emitter.emit('status', { vault: vaultName, step: 'downloading', message: `Downloading ${vaultName} vault...` });
        await downloadFile(remoteEntry.url, tmpZip);

        // Step 2: Verify SHA-256
        emitter.emit('status', { vault: vaultName, step: 'verifying', message: 'Verifying integrity...' });
        if (remoteEntry.sha256) {
            const actual = sha256File(tmpZip);
            if (actual !== remoteEntry.sha256) {
                throw new Error(`SHA-256 mismatch for ${vaultName} vault. Download may be corrupt.`);
            }
        }

        // Step 3: Install (unzip)
        emitter.emit('status', { vault: vaultName, step: 'installing', message: 'Installing vault...' });
        unzip(tmpZip, destDir);

        // Step 4: Hot-swap
        const meta = VAULT_META[vaultName];
        if (meta && typeof meta.reload === 'function') {
            emitter.emit('status', { vault: vaultName, step: 'reloading', message: 'Reloading vault...' });
            await meta.reload();
        }

        emitter.emit('status', { vault: vaultName, step: 'done', message: `${vaultName} vault updated to ${remoteEntry.version}.` });
        console.log(`[VaultManager] ✓ ${vaultName} vault installed at ${destDir}`);
        return { ok: true, version: remoteEntry.version };

    } finally {
        // Cleanup temp dir
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
}

/**
 * Activate a license key via api.hayagriva.app and store the vault key
 * in the OS Keychain.
 *
 * @param {string} licenseKey — "HAYG-XXXX-XXXX-XXXX"
 * @returns {{ ok: boolean, vaultType?: string, error?: string }}
 */
async function activateLicense(licenseKey) {
    return new Promise((resolve) => {
        const body = JSON.stringify({ licenseKey });
        const url  = new URL(`${API_BASE}/activate`);
        const mod  = url.protocol === 'https:' ? https : http;

        const options = {
            hostname: url.hostname,
            port:     url.port || (url.protocol === 'https:' ? 443 : 80),
            path:     url.pathname,
            method:   'POST',
            headers: {
                'Content-Type':   'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
            timeout: 15000,
        };

        const req = mod.request(options, (res) => {
            let data = '';
            res.on('data', d => { data += d; });
            res.on('end', async () => {
                try {
                    const json = JSON.parse(data);
                    if (json.ok && json.vaultKey && json.vaultType) {
                        // Store in OS Keychain
                        const account = VAULT_META[json.vaultType]?.account;
                        if (account) {
                            try {
                                const keytar = require('keytar');
                                await keytar.setPassword(KEYCHAIN_SERVICE, account, json.vaultKey);
                                console.log(`[VaultManager] ✓ Vault key for "${json.vaultType}" stored in Keychain.`);
                            } catch (e) {
                                console.warn('[VaultManager] keytar unavailable, key not persisted to Keychain:', e.message);
                            }
                        }
                        resolve({ ok: true, vaultType: json.vaultType, latestUrl: json.latestUrl });
                    } else {
                        resolve({ ok: false, error: json.error || 'Activation failed.' });
                    }
                } catch (_) {
                    resolve({ ok: false, error: 'Invalid response from activation server.' });
                }
            });
        });

        req.on('error', (e) => resolve({ ok: false, error: `Network error: ${e.message}` }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Activation request timed out.' }); });
        req.write(body);
        req.end();
    });
}

module.exports = {
    getVaultStatus,
    downloadAndInstallVault,
    activateLicense,
    onProgress: (fn) => emitter.on('progress', fn),
    onStatus:   (fn) => emitter.on('status', fn),
    VAULTS_ROOT,
};
