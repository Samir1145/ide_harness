/**
 * template-cartridge-builder.js
 * ─────────────────────────────────────────────────────────────────
 * Sovereign Legal Template & Form Pack Cartridge Compiler
 * 
 * Compiles discrete, vetted legal drafting templates and court forms
 * into modular, AES-256-GCM encrypted, BM25-tokenized .vlt cartridges.
 * 
 * Each template pack cartridge is saved under:
 *   backend/vault/cartridges/<pack_key>/
 *     ├── cartridge.vlt.data      (individually encrypted gzip markdown blobs)
 *     ├── cartridge.vlt.data.sig  (HMAC SHA-256 integrity signature)
 *     ├── manifest.json           (indexed template metadata, offsets, tags, triggers)
 *     └── version.json            (pack metadata, instrument count, build timestamp)
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const zlib   = require('zlib');

const CARTRIDGES_DIR = path.join(__dirname, '..', '..', 'vault', 'cartridges');

function resolveRefinedRoot() {
  const candidates = [
    path.join(__dirname, '..', '..', '..', '..', 'formats', '01_PRACTICE_LIBRARY'),
    path.join(__dirname, '..', '..', '..', 'formats', '01_PRACTICE_LIBRARY'),
    path.join('/Users/atulgrover/Desktop/HAYAGRIVA/formats/01_PRACTICE_LIBRARY'),
    path.join('/Users/atulgrover/Desktop/HAYAGRIVA/formats/02_refined_library')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

const REFINED_ROOT = resolveRefinedRoot();

// Reproducible chamber key for development if VAULT_KEY is not set
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
 * Extracts YAML frontmatter and markdown body from file content.
 */
function parseFrontmatterAndContent(content) {
  const meta = {};
  let body = content;

  if (content.startsWith('---')) {
    const endIdx = content.indexOf('\n---', 3);
    if (endIdx !== -1) {
      const yamlStr = content.slice(3, endIdx).trim();
      body = content.slice(endIdx + 4).trim();

      const lines = yamlStr.split('\n');
      let currentArrayKey = null;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        if (trimmed.startsWith('- ') && currentArrayKey) {
          meta[currentArrayKey].push(trimmed.slice(2).trim().replace(/^['"]|['"]$/g, ''));
          continue;
        }

        const colonIdx = trimmed.indexOf(':');
        if (colonIdx !== -1) {
          const key = trimmed.slice(0, colonIdx).trim();
          const val = trimmed.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
          if (val === '') {
            meta[key] = [];
            currentArrayKey = key;
          } else {
            meta[key] = val;
            currentArrayKey = null;
          }
        }
      }
    }
  }

  return { meta, body };
}

/**
 * Parses an individual template markdown file into structured metadata and content.
 */
function parseTemplateFile(filePath, filename, packConfig) {
  const rawContent = fs.readFileSync(filePath, 'utf8');
  const { meta, body } = parseFrontmatterAndContent(rawContent);

  // Commercial Court skeleton definitions fallback map
  const COMMERCIAL_MAP = {
    'cpc_order_38_rule_5_attachment.md': {
      id: 'cpc-order38', title: 'Attachment Before Judgment (Order XXXVIII Rule 5 CPC)', provision: 'Order XXXVIII Rule 5 & Section 151 CPC', triggers: ['/cpc-order38', '/order38', '/attachment-before-judgment']
    },
    'cpc_order_39_rules_1_2_injunction.md': {
      id: 'cpc-order39', title: 'Ad-Interim Temporary Injunction (Order XXXIX Rules 1 & 2 CPC)', provision: 'Order XXXIX Rules 1 & 2 CPC', triggers: ['/cpc-order39', '/order39', '/injunction']
    },
    'cpc_statement_of_truth.md': {
      id: 'cpc-truth', title: 'Statement of Truth (Order VI Rule 15A CPC)', provision: 'Order VI Rule 15A CPC & Section 63 BSA', triggers: ['/cpc-truth', '/statement-of-truth']
    },
    'cpc_order_11_statement_of_documents.md': {
      id: 'cpc-order11', title: 'Statement of Documents & Disclosure (Order XI Rule 1 CPC)', provision: 'Order XI Rule 1 CPC', triggers: ['/cpc-order11', '/statement-of-documents']
    },
    'cca_section_12a_pims_form_1.md': {
      id: 'cca-sec12a-pims', title: 'Pre-Institution Mediation Application (Section 12A CCA Form 1)', provision: 'Section 12A Commercial Courts Act, 2015', triggers: ['/cca-sec12a-pims', '/sec12a', '/pims']
    },
    'cca_section_12a_urgency_application.md': {
      id: 'cca-urgency', title: 'Urgent Interim Relief Exemption Affidavit (Section 12A Proviso)', provision: 'Section 12A(1) Proviso CCA & Patil Automation standard', triggers: ['/cca-urgency', '/urgent-interim-relief']
    },
    'cca_section_12a_form_3_non_starter.md': {
      id: 'cca-nonstarter', title: 'Non-Starter Report Tracking Memo (Form 3)', provision: 'Commercial Courts Rules & DLSA Mediation', triggers: ['/cca-nonstarter', '/non-starter']
    },
    'cpc_affidavit_of_correct_email.md': {
      id: 'cpc-email-affidavit', title: 'Affidavit of Valid Electronic Service / Email', provision: 'Order V CPC & Commercial Court Practice Directions', triggers: ['/cpc-email-affidavit', '/electronic-service']
    }
  };

  const commOverride = COMMERCIAL_MAP[filename];

  // Extract ID
  let id = meta.instrument_id || commOverride?.id || '';
  if (!id) {
    const idMatch = filename.match(/^([A-Za-z]+-[0-9]+)/i);
    id = idMatch ? idMatch[1] : filename.replace(/\.md$/, '');
  }

  // Extract Title
  let title = meta.title || commOverride?.title || '';
  if (!title) {
    const h1Match = rawContent.match(/^#\s+([^\n]+)/m);
    if (h1Match) {
      title = h1Match[1].replace(/^[A-Za-z0-9_-]+\s*[-—]\s*/, '').trim();
    } else {
      title = filename.replace(/\.md$/, '').replace(/[-_]/g, ' ');
    }
  }

  // Extract Statutory Provision
  let provision = meta.statutory_provision || commOverride?.provision || '';
  if (!provision) {
    const provMatch = rawContent.match(/\*\*Statutory Authority:\*\*\s*([^\n]+)/i);
    if (provMatch) {
      provision = provMatch[1].trim();
    }
  }

  // Extract Mustache placeholders
  const placeholderMatches = rawContent.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) || [];
  const placeholders = [...new Set(placeholderMatches.map(m => m.replace(/^\{\{|\}\}$/g, '')))];

  // Generate Triggers
  const cleanId = id.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const triggers = [
    `/${cleanId}`,
    `/${packConfig.alias}/${cleanId}`
  ];
  if (meta.monaco_slash_command) {
    triggers.push(meta.monaco_slash_command);
  }

  // Add standard alias triggers (e.g. /form-1, /sec-7, /reg-39-4)
  const formMatch = title.match(/Form\s+([A-Za-z0-9]+)/i);
  if (formMatch) {
    triggers.push(`/form-${formMatch[1].toLowerCase()}`);
  }
  const secMatch = provision.match(/Section\s+([0-9A-Za-z]+)/i);
  if (secMatch) {
    triggers.push(`/sec-${secMatch[1].toLowerCase()}`);
  }

  if (commOverride?.triggers) {
    triggers.push(...commOverride.triggers);
  }

  if (Array.isArray(meta.monaco_aliases)) {
    triggers.push(...meta.monaco_aliases);
  }

  const uniqueTriggers = [...new Set(triggers.filter(Boolean))];

  return {
    id: `${packConfig.packKey}/${cleanId}`,
    rawId: id,
    filename,
    title,
    statutoryProvision: provision,
    category: meta.category || packConfig.domain,
    jurisdiction: meta.jurisdiction || 'National Company Law Tribunal (NCLT) / High Court',
    triggers: uniqueTriggers,
    placeholders,
    fullContent: rawContent,
    sizeBytes: Buffer.byteLength(rawContent, 'utf8')
  };
}

function getMarkdownFilesRecursive(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getMarkdownFilesRecursive(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push({ filename: entry.name, fullPath: full });
    }
  }
  return results;
}

/**
 * Builds a template pack cartridge (.vlt) from a directory of markdown templates.
 */
async function buildTemplateCartridge(packConfig, options = {}) {
  const key = options.vaultKey ? Buffer.from(options.vaultKey, 'hex') : getVaultKey();
  const baseOutDir = options.outDir || CARTRIDGES_DIR;
  const cartridgeDir = path.join(baseOutDir, packConfig.packKey);

  if (!fs.existsSync(cartridgeDir)) {
    fs.mkdirSync(cartridgeDir, { recursive: true });
  }

  const srcDir = packConfig.srcDir;
  if (!fs.existsSync(srcDir)) {
    throw new Error(`Source directory not found: ${srcDir}`);
  }

  const files = getMarkdownFilesRecursive(srcDir).sort((a, b) => a.filename.localeCompare(b.filename));

  const parsedTemplates = files.map(item => {
    return parseTemplateFile(item.fullPath, item.filename, packConfig);
  });

  const dataChunks = [];
  const indexEntries = [];
  let byteOffset = 0;

  for (const tpl of parsedTemplates) {
    // 1. Gzip compress
    const compressed = zlib.gzipSync(Buffer.from(tpl.fullContent, 'utf8'), { level: 6 });
    // 2. AES-256-GCM encrypt
    const encrypted  = encryptChunk(key, compressed);

    // 3. Write 4-byte length prefix + ciphertext
    const lenBuf = Buffer.allocUnsafe(4);
    lenBuf.writeUInt32LE(encrypted.length, 0);
    dataChunks.push(lenBuf, encrypted);

    // 4. Tokenize for BM25 search
    const searchCorpus = `${tpl.title} ${tpl.statutoryProvision} ${tpl.rawId} ${tpl.placeholders.join(' ')}`;
    const tokens = tokenize(searchCorpus);

    indexEntries.push({
      id: tpl.id,
      actKey: packConfig.packKey,
      type: 'template',
      templateId: tpl.rawId,
      filename: tpl.filename,
      title: tpl.title,
      section: tpl.statutoryProvision,
      category: tpl.category,
      jurisdiction: tpl.jurisdiction,
      triggers: tpl.triggers,
      tokens,
      placeholders: tpl.placeholders,
      placeholderCount: tpl.placeholders.length,
      offset: byteOffset,
      length: 4 + encrypted.length,
      rawSizeBytes: tpl.sizeBytes
    });

    byteOffset += 4 + encrypted.length;
  }

  // 5. Write cartridge.vlt.data
  const fullDataBuf = Buffer.concat(dataChunks);
  const dataPath = path.join(cartridgeDir, 'cartridge.vlt.data');
  fs.writeFileSync(dataPath, fullDataBuf);

  // 6. Write cartridge.vlt.data.sig (HMAC SHA-256)
  const sigPath = path.join(cartridgeDir, 'cartridge.vlt.data.sig');
  const dataSig = hmac(key, fullDataBuf);
  fs.writeFileSync(sigPath, dataSig, 'utf8');

  // 7. Write manifest.json
  const manifestPath = path.join(cartridgeDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(indexEntries, null, 2), 'utf8');

  // 8. Write version.json
  const verPath = path.join(cartridgeDir, 'version.json');
  const versionInfo = {
    cartridge: packConfig.packKey,
    packTitle: packConfig.title,
    alias: packConfig.alias,
    aliases: packConfig.aliases || [packConfig.alias],
    domain: packConfig.domain,
    description: packConfig.description,
    totalTemplates: parsedTemplates.length,
    builtAt: new Date().toISOString(),
    format: 'v2-modular-cartridge',
    sha256: crypto.createHash('sha256').update(fullDataBuf).digest('hex')
  };
  fs.writeFileSync(verPath, JSON.stringify(versionInfo, null, 2), 'utf8');

  return {
    packKey: packConfig.packKey,
    cartridgeDir,
    totalTemplates: parsedTemplates.length,
    dataSizeKb: Math.round(fullDataBuf.length / 1024),
    manifestSizeKb: Math.round(fs.statSync(manifestPath).size / 1024),
    version: versionInfo
  };
}

/**
 * Master compilation of all 4 sovereign template packs into vault cartridges.
 */
async function compileAllPacks() {
  const packs = [
    {
      packKey: 'cirp_practice_pack',
      title: 'Corporate Insolvency Resolution Process (CIRP) Sovereign Practice Pack',
      alias: 'cirp',
      aliases: ['cirp', 'cirp_pack', 'ibc_cirp', 'cirp_insolvency_pack'],
      domain: 'ibc',
      description: 'Comprehensive 94-instrument statutory CIRP compendium: Sections 7/9/10 admission, claims verification memos, CoC notices & voting, Avoidance inquests (§§ 43, 45, 50, 66), Section 29A due diligence, and Resolution Plan approval.',
      srcDir: path.join(REFINED_ROOT, '01_CIRP')
    },
    {
      packKey: 'personal_guarantors_pack',
      title: 'Personal Guarantors & Individual Bankruptcy Sovereign Practice Pack',
      alias: 'pg',
      aliases: ['pg', 'personal_guarantors', 'pg_pack'],
      domain: 'ibc_part_iii',
      description: '68-instrument Part III statutory compendium: Section 94/95 guarantor insolvency, repayment plans, creditor meetings, Section 121 bankruptcy petitions, and trustee asset vesting.',
      srcDir: path.join(REFINED_ROOT, '02_Personal_Guarantors')
    },
    {
      packKey: 'partnership_firms_pack',
      title: 'Partnership Firms Insolvency & Restructuring Sovereign Practice Pack',
      alias: 'firm',
      aliases: ['firm', 'partnership_firms', 'firm_pack'],
      domain: 'ibc_part_iii',
      description: '35-instrument Part III compendium for partnership firms and co-extensive partner liability under Section 25 Partnership Act and joint vs separate debts (Section 49).',
      srcDir: path.join(REFINED_ROOT, '03_Partnership_Firms')
    },
    {
      packKey: 'voluntary_liquidation_pack',
      title: 'Voluntary Liquidation Process (Section 59) Sovereign Practice Pack',
      alias: 'vl',
      aliases: ['vl', 'voluntary_liquidation', 'vl_pack', 'section59'],
      domain: 'voluntary_liquidation',
      description: '35-instrument Section 59 master compendium: Declaration of solvency, special resolutions, creditors approval, liquidator preliminary & final reports, in-specie distribution, and dissolution applications.',
      srcDir: path.join(REFINED_ROOT, '04_Voluntary_Liquidation')
    },
    {
      packKey: 'commercial_litigation_pack',
      title: 'Commercial Court & Interlocutory Relief Pack',
      alias: 'cca',
      aliases: ['cca', 'commercial', 'commercial_courts', 'cpc'],
      domain: 'commercial_courts',
      description: 'Court-ready pleadings conforming to Commercial Courts Act 2015 and CPC: Order 38 Rule 5 attachment, Order 39 injunction, Statement of Truth (§ 63 BSA), and Section 12A PIMS mediation.',
      srcDir: path.join(__dirname, '..', 'pipeline', 'forms', 'skeletons', 'commercial_courts')
    },
    {
      packKey: 'regulatory_compliance_pack',
      title: 'IBBI Regulatory Compliance, Evidence & Gazette Pack',
      alias: 'reg',
      aliases: ['reg', 'regulatory', 'ibbi_compliance'],
      domain: 'ibbi_regulations',
      description: '7-instrument master regulatory compendium: Gazette notification correlations, master evidence indexes, newspaper tearsheet verifications, and statutory compliance certifications.',
      srcDir: path.join(REFINED_ROOT, '05_Regulatory_Compliance')
    }
  ];

  console.log('─────────────────────────────────────────────────────────────────');
  console.log('🏛️  Compiling Sovereign Legal Template Packs into Vault Cartridges');
  console.log('─────────────────────────────────────────────────────────────────');

  const results = [];
  let grandTotal = 0;

  for (const pack of packs) {
    console.log(`\n📦 Compiling "${pack.title}"...`);
    const res = await buildTemplateCartridge(pack);
    results.push(res);
    grandTotal += res.totalTemplates;
    console.log(`   ✓ ${res.totalTemplates} templates encrypted & indexed`);
    console.log(`   ✓ Data: ${res.dataSizeKb} KB | Manifest: ${res.manifestSizeKb} KB | SHA: ${res.version.sha256.slice(0, 16)}...`);
  }

  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log(`✨ Re-Vaulting Complete: ${grandTotal} high-grade instruments compiled across ${packs.length} cartridges!`);
  console.log('─────────────────────────────────────────────────────────────────\n');

  return { results, grandTotal };
}

if (require.main === module) {
  compileAllPacks().catch(err => {
    console.error('Compilation failed:', err);
    process.exit(1);
  });
}

module.exports = {
  buildTemplateCartridge,
  compileAllPacks,
  parseFrontmatterAndContent,
  parseTemplateFile
};
