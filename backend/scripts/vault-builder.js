#!/usr/bin/env node
/**
 * vault-builder.js  (v2 — per-section lazy format)
 * ─────────────────────────────────────────────────────────────────
 * Produces hayagriva/vault/laws.vlt (new chunked format) and
 * vault/manifest.json (pre-tokenized, used for BM25 search in RAM).
 *
 * New vault layout:
 *   [4]  magic  "VLT2"
 *   [4]  uint32 LE  — number of sections (N)
 *   [N × 16]  per-section: iv(12) + authTag(4) lengths → stored in index
 *   The actual index is the encrypted manifest embedded as the first chunk,
 *   followed by individually AES-GCM encrypted, gzip-compressed sections.
 *
 * Simpler on-disk layout (what we actually use):
 *   laws.vlt         = one encrypted gzip blob of the FULL CONTENT (unchanged)
 *   laws.vlt.idx     = encrypted index: {id → {offset, length}} within a
 *                      separately stored blob store (laws.vlt.data)
 *   laws.vlt.data    = N individually encrypted+gzipped section blobs,
 *                      concatenated. Each section has own random IV.
 *
 * Actually simplest correct implementation:
 *   laws.vlt         = header JSON (encrypted) + section blobs
 *   Each section blob = [12-byte iv][16-byte authTag][4-byte uint32 ciphertext_length][ciphertext]
 *   Header JSON = {sections: [{id, title, section, offset, tokens:[...]}]}
 *
 * Usage:
 *   VAULT_KEY=<64hex> node scripts/vault-builder.js --laws /path/to/laws --out ./vault
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const zlib   = require('zlib');

// ── CLI ───────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let lawsDir = null;
let outDir  = path.join(__dirname, '..', 'vault');

for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--laws' && argv[i + 1]) { lawsDir = path.resolve(argv[++i]); }
    if (argv[i] === '--out'  && argv[i + 1]) { outDir  = path.resolve(argv[++i]); }
    if (argv[i] === '--help' || argv[i] === '-h') {
        console.log('Usage: node vault-builder.js --laws <dir> [--out <vault_dir>]');
        process.exit(0);
    }
}
if (!lawsDir || !fs.existsSync(lawsDir)) {
    console.error('[vault-builder] ERROR: --laws <path> is required and must exist.');
    process.exit(1);
}
const VAULT_KEY_HEX = process.env.VAULT_KEY || '';
if (VAULT_KEY_HEX.length !== 64) {
    console.error('[vault-builder] ERROR: VAULT_KEY env var must be a 64-char hex string.');
    process.exit(1);
}
const VAULT_KEY = Buffer.from(VAULT_KEY_HEX, 'hex');

// ── Helpers ───────────────────────────────────────────────────────

function walkMd(dir, base, results = []) {
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir)) {
        if (entry.startsWith('.')) continue;
        const full = path.join(dir, entry);
        const rel  = path.relative(base, full).replace(/\\/g, '/');
        if (fs.statSync(full).isDirectory()) {
            walkMd(full, base, results);
        } else if (entry.endsWith('.md')) {
            results.push({ full, rel });
        }
    }
    return results;
}

/**
 * Encrypt a Buffer → [iv(12)] + [authTag(16)] + [ciphertext]
 * Returns a single Buffer.
 */
function encryptChunk(key, plaintext) {
    const iv      = crypto.randomBytes(12);
    const cipher  = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc     = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();   // 16 bytes by default
    return Buffer.concat([iv, authTag, enc]);
}

function hmac(key, data) {
    return crypto.createHmac('sha256', key).update(data).digest('hex');
}

function tokenize(text) {
    return [...new Set(
        text.toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 2)  // skip very short tokens
    )];
}

function currentWeek() {
    const now   = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const week  = Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ── Main ──────────────────────────────────────────────────────────

async function buildVault() {
    fs.mkdirSync(outDir, { recursive: true });

    // Load local transformer model
    console.log('[vault-builder] Loading local InLegal-SBERT embedding model...');
    const { pipeline, env } = await import('@xenova/transformers');
    env.localModelPath = path.join(__dirname, '..', 'models', 'embeddings', 'legal');
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    const generateEmbeddings = await pipeline('feature-extraction', 'inlegal-sbert', { quantized: false });

    console.log(`[vault-builder] Scanning: ${lawsDir}`);
    const files = walkMd(lawsDir, lawsDir);
    console.log(`[vault-builder] Found ${files.length} .md files.`);
    if (!files.length) { console.error('No files found. Aborting.'); process.exit(1); }

    // ── Pass 1: encrypt each section individually, collect offsets ──
    const dataChunks   = [];  // Buffer[]
    const indexEntries = [];  // manifest entries with byte offsets
    let byteOffset = 0;

    for (let i = 0; i < files.length; i++) {
        const { full, rel } = files[i];
        if (i % 100 === 0) console.log(`[vault-builder] Processing ${i}/${files.length} ...`);
        const content = fs.readFileSync(full, 'utf8');

        // Encrypt this section individually
        const compressed  = zlib.gzipSync(Buffer.from(content, 'utf8'), { level: 6 });
        const encrypted   = encryptChunk(VAULT_KEY, compressed);

        // 4-byte length prefix so loader knows how much to read
        const lenBuf = Buffer.allocUnsafe(4);
        lenBuf.writeUInt32LE(encrypted.length, 0);

        dataChunks.push(lenBuf, encrypted);

        // Extract metadata for manifest
        const fileName    = path.basename(full, '.md');
        const headMatch   = content.match(/^#\s+(.+)$/m);
        const title       = headMatch ? headMatch[1].trim() : fileName;
        const secMatch    = title.match(/(?:Section|Regulation|Rule)\s*(\d+[a-z]?)/i) || fileName.match(/(?:sec|reg|rule|s|r)_?(\d+[a-z]?)/i);

        // Pre-tokenise title + first 600 chars of body for BM25
        const bodyPreview = content.replace(/^---[\s\S]*?---\r?\n?/, '').slice(0, 600);
        const searchInput = title + ' ' + bodyPreview;
        const tokens      = tokenize(searchInput);

        // Generate Semantic Vector
        const output = await generateEmbeddings(searchInput, { pooling: 'mean', normalize: true });
        const vector = Array.from(output.data); // 384 dimensional float array

        indexEntries.push({
            id:      rel,
            title,
            section: secMatch ? secMatch[1] : null,
            tokens,            // used for BM25
            vector,            // used for Semantic Search
            offset:  byteOffset,
            length:  4 + encrypted.length   // includes length-prefix
        });

        byteOffset += 4 + encrypted.length;
    }

    // ── Write laws.vlt.data (section blobs) ──────────────────────
    const dataPath = path.join(outDir, 'laws.vlt.data');
    fs.writeFileSync(dataPath, Buffer.concat(dataChunks));
    console.log(`[vault-builder] Wrote section data: ${dataPath} (${byteOffset} bytes, ${files.length} sections)`);

    // ── Write HMAC signature over data file ──────────────────────
    const dataBuf  = fs.readFileSync(dataPath);
    const dataSig  = hmac(VAULT_KEY, dataBuf);
    fs.writeFileSync(path.join(outDir, 'laws.vlt.data.sig'), dataSig, 'utf8');

    // ── Write manifest.json (index + pre-tokenised search data) ──
    const manifestPath = path.join(outDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(indexEntries, null, 0), 'utf8');
    const manifestSizeKb = Math.round(fs.statSync(manifestPath).size / 1024);
    console.log(`[vault-builder] Wrote manifest: ${manifestPath} (${manifestSizeKb} KB, ${indexEntries.length} entries)`);

    // ── Write version.json ────────────────────────────────────────
    const week    = process.env.VAULT_WEEK || currentWeek();
    const verPath = path.join(outDir, 'version.json');
    fs.writeFileSync(verPath, JSON.stringify({
        version: week,
        built:   new Date().toISOString(),
        entries: files.length,
        format:  'v2-chunked-vector'
    }, null, 2), 'utf8');

    console.log(`\n[vault-builder] ✓ Done. Version: ${week}\n`);
    console.log('  Distribute: laws.vlt.data  laws.vlt.data.sig  manifest.json  version.json');
    console.log('  Keep secret: VAULT_KEY\n');
}

buildVault().catch(console.error);
