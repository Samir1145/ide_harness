/**
 * cartridge-builder.js
 * ─────────────────────────────────────────────────────────────────
 * Sovereign Modular Cartridge Vault Compiler
 * 
 * Compiles discrete statutory Acts, Codes, and Regulations into
 * modular, AES-256-GCM encrypted, BM25-tokenized "cartridges" (.vlt).
 * 
 * Each cartridge is an isolated legal chamber package:
 *   cartridges/<act_key>/
 *     ├── cartridge.vlt.data      (individually encrypted gzip section blobs)
 *     ├── cartridge.vlt.data.sig  (HMAC SHA-256 integrity signature)
 *     ├── manifest.json           (BM25 tokens, section numbers, offsets)
 *     └── version.json            (Act metadata, India Code ID, build timestamp)
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const zlib   = require('zlib');

const CARTRIDGES_DIR = path.join(__dirname, '..', '..', 'vault', 'cartridges');

// Default reproducible chamber key for development if VAULT_KEY is not set
const DEFAULT_DEV_KEY = crypto.createHash('sha256').update('hayagriva_sovereign_cartridge_chamber_key_2026').digest('hex');

function getVaultKey() {
  const envKey = process.env.VAULT_KEY || '';
  if (envKey.length === 64) return Buffer.from(envKey, 'hex');
  return Buffer.from(DEFAULT_DEV_KEY, 'hex');
}

function encryptChunk(key, plaintext) {
  const iv      = crypto.randomBytes(12);
  const cipher  = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc     = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, enc]);
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

function tokenize(text) {
  return [...new Set(
    (text || '').toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
  )];
}

/**
 * Builds a standalone modular cartridge for a specific Act from its parsed JSON data.
 * 
 * @param {string} actKey - Canonical key (e.g. 'commercial_courts')
 * @param {object} actData - Parsed data with { actMeta, sections, scheduleItems, rules }
 * @param {object} options - Optional overrides (outDir, vaultKey)
 */
async function buildCartridge(actKey, actData, options = {}) {
  const key = options.vaultKey ? Buffer.from(options.vaultKey, 'hex') : getVaultKey();
  const baseOutDir = options.outDir || CARTRIDGES_DIR;
  const cartridgeDir = path.join(baseOutDir, actKey);
  
  if (!fs.existsSync(cartridgeDir)) {
    fs.mkdirSync(cartridgeDir, { recursive: true });
  }

  const allProvisions = [];
  
  // 1. Process Sections
  for (const sec of (actData.sections || [])) {
    allProvisions.push({
      id: `${actKey}/sec_${(sec.sectionNumber || '0').toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      type: 'section',
      sectionNumber: sec.sectionNumber,
      title: sec.title || `Section ${sec.sectionNumber}`,
      body: sec.body || '',
      footnotes: sec.footnotes || '',
      parsedFootnotes: sec.parsedFootnotes || [],
      order: sec.order || 0
    });
  }

  // 2. Process Schedule Items
  for (const sch of (actData.scheduleItems || [])) {
    allProvisions.push({
      id: `${actKey}/sch_${sch.order}_${(sch.title || 'item').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30)}`,
      type: 'schedule',
      sectionNumber: `Schedule Order ${sch.order}`,
      title: sch.title || `Schedule Item ${sch.order}`,
      body: sch.body || '',
      footnotes: sch.footnotes || '',
      parsedFootnotes: sch.parsedFootnotes || [],
      order: 1000 + (sch.order || 0)
    });
  }

  // 3. Process Rules
  for (const r of (actData.rules || [])) {
    allProvisions.push({
      id: `${actKey}/rule_${r.order || 0}_${(r.title || 'rule').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30)}`,
      type: 'rule',
      sectionNumber: 'Rule',
      title: r.title || 'Rule',
      body: r.body || '',
      footnotes: '',
      parsedFootnotes: [],
      order: 2000 + (r.order || 0)
    });
  }

  allProvisions.sort((a, b) => a.order - b.order);

  // 4. Encrypt individual section blobs & build manifest index
  const dataChunks = [];
  const indexEntries = [];
  let byteOffset = 0;

  for (const prov of allProvisions) {
    let fullText = `# ${prov.title}\n\n${prov.body}`;
    if (prov.footnotes) {
      fullText += `\n\n*Footnotes:*\n${prov.footnotes}`;
    }

    const compressed = zlib.gzipSync(Buffer.from(fullText, 'utf8'), { level: 6 });
    const encrypted  = encryptChunk(key, compressed);

    const lenBuf = Buffer.allocUnsafe(4);
    lenBuf.writeUInt32LE(encrypted.length, 0);

    dataChunks.push(lenBuf, encrypted);

    // Pre-tokenize title + body for BM25
    const searchInput = `${prov.title} ${prov.body.slice(0, 600)}`;
    const tokens = tokenize(searchInput);

    // Trigger aliases (e.g. "cca/sec 12a", "sec 12a", "section 12a")
    const triggers = [];
    if (prov.sectionNumber && prov.sectionNumber !== 'Rule') {
      const numClean = prov.sectionNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
      triggers.push(`${actKey}/sec ${prov.sectionNumber.toLowerCase()}`);
      triggers.push(`sec ${prov.sectionNumber.toLowerCase()}`);
      triggers.push(`section ${prov.sectionNumber.toLowerCase()}`);
      triggers.push(`s${numClean}`);
    }

    indexEntries.push({
      id: prov.id,
      actKey,
      type: prov.type,
      title: prov.title,
      section: prov.sectionNumber,
      triggers,
      tokens,
      offset: byteOffset,
      length: 4 + encrypted.length,
      wef_dates: prov.parsedFootnotes.map(f => f.wef_date).filter(Boolean)
    });

    byteOffset += 4 + encrypted.length;
  }

  // 5. Write cartridge.vlt.data
  const dataPath = path.join(cartridgeDir, 'cartridge.vlt.data');
  const fullDataBuf = Buffer.concat(dataChunks);
  fs.writeFileSync(dataPath, fullDataBuf);

  // 6. Write HMAC integrity signature
  const sigPath = path.join(cartridgeDir, 'cartridge.vlt.data.sig');
  const dataSig = hmac(key, fullDataBuf);
  fs.writeFileSync(sigPath, dataSig, 'utf8');

  // 7. Write manifest.json
  const manifestPath = path.join(cartridgeDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(indexEntries, null, 2), 'utf8');

  // 8. Write version.json
  const meta = actData.actMeta || {};
  const verPath = path.join(cartridgeDir, 'version.json');
  const versionInfo = {
    cartridge: actKey,
    actName: meta.actName || meta.title || actKey,
    actNumber: meta.actNumber || '',
    actYear: meta.actYear || '',
    totalProvisions: allProvisions.length,
    sectionsCount: (actData.sections || []).length,
    scheduleCount: (actData.scheduleItems || []).length,
    rulesCount: (actData.rules || []).length,
    builtAt: new Date().toISOString(),
    format: 'v2-modular-cartridge',
    sha256: crypto.createHash('sha256').update(fullDataBuf).digest('hex')
  };
  fs.writeFileSync(verPath, JSON.stringify(versionInfo, null, 2), 'utf8');

  return {
    cartridge: actKey,
    cartridgeDir,
    totalProvisions: allProvisions.length,
    dataSizeKb: Math.round(fullDataBuf.length / 1024),
    manifestSizeKb: Math.round(fs.statSync(manifestPath).size / 1024),
    version: versionInfo
  };
}

/**
 * Lists all compiled cartridges in the cartridges directory.
 */
function listCartridges(baseDir = CARTRIDGES_DIR) {
  if (!fs.existsSync(baseDir)) return [];
  const entries = fs.readdirSync(baseDir);
  const cartridges = [];
  for (const entry of entries) {
    const verFile = path.join(baseDir, entry, 'version.json');
    if (fs.existsSync(verFile)) {
      try {
        const ver = JSON.parse(fs.readFileSync(verFile, 'utf8'));
        cartridges.push(ver);
      } catch (_) {}
    }
  }
  return cartridges;
}

module.exports = {
  CARTRIDGES_DIR,
  DEFAULT_DEV_KEY,
  getVaultKey,
  encryptChunk,
  buildCartridge,
  listCartridges
};
