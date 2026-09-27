/**
 * template-packs-registry.js
 * ─────────────────────────────────────────────────────────────────
 * Master Registry & Manager for Modular Legal Form & Template Packs,
 * Skeletons, and Chamber Custom Overlays (/formats/).
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const SKELETONS_ROOT = path.join(__dirname, '..', 'pipeline', 'forms', 'skeletons');

function resolvePracticeLibraryRoot() {
  const candidates = [
    path.join(__dirname, '..', '..', '..', '..', 'formats', '01_PRACTICE_LIBRARY'),
    path.join(__dirname, '..', '..', '..', 'formats', '01_PRACTICE_LIBRARY'),
    path.join(os.homedir(), 'Desktop', 'HAYAGRIVA', 'formats', '01_PRACTICE_LIBRARY')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

const PRACTICE_LIB_ROOT = resolvePracticeLibraryRoot();

function parseYamlHeader(content) {
  const meta = {};
  if (content.startsWith('---')) {
    const endIdx = content.indexOf('\n---', 3);
    if (endIdx !== -1) {
      const yamlStr = content.slice(3, endIdx).trim();
      for (const line of yamlStr.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx !== -1) {
          const key = trimmed.slice(0, colonIdx).trim();
          const val = trimmed.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
          meta[key] = val;
        }
      }
    }
  }
  return meta;
}

function scanDirForSkeletons(dirPath, packKey, packTitle, domain) {
  if (!fs.existsSync(dirPath)) return [];
  const results = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      results.push(...scanDirForSkeletons(full, packKey, packTitle, domain));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      try {
        const text = fs.readFileSync(full, 'utf8');
        const stat = fs.statSync(full);
        const meta = parseYamlHeader(text);
        const placeholderMatches = text.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) || [];
        const placeholders = [...new Set(placeholderMatches.map(m => m.replace(/^\{\{|\}\}$/g, '')))];
        const cleanId = (meta.instrument_id || entry.name.replace(/\.md$/, '')).toLowerCase();

        results.push({
          id: cleanId,
          instrumentId: meta.instrument_id || cleanId.toUpperCase(),
          title: meta.title || entry.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
          provision: meta.statutory_provision || meta.category || 'Statutory Instrument',
          file: entry.name,
          fullPath: full,
          domain: domain,
          category: meta.category || domain,
          jurisdiction: meta.jurisdiction || 'NCLT / Commercial Court',
          slashCommand: meta.monaco_slash_command || `/${cleanId}`,
          placeholderCount: placeholders.length,
          sizeBytes: stat.size,
          sizeKb: (stat.size / 1024).toFixed(1),
          packKey: packKey,
          packTitle: packTitle,
          isUrgent: text.includes('ad-interim') || text.includes('Order 38') || text.includes('Order 39') || text.includes('Exemption')
        });
      } catch (_) {}
    }
  }
  return results.sort((a, b) => a.file.localeCompare(b.file));
}

const PRACTICE_PACKS = {
  cirp_practice_pack: {
    key: 'cirp_practice_pack',
    cartridge_file: 'cirp_practice_pack.vlt',
    title: 'Corporate Insolvency Resolution Process (CIRP) Sovereign Practice Pack',
    target_market: 'Insolvency Professionals, Liquidators, CoC Counsel',
    domain: 'ibc',
    description: 'Comprehensive 94-instrument statutory CIRP compendium: Sections 7/9/10 admission, claim verification memos, CoC notices & voting, Avoidance inquests (§§ 43, 45, 50, 66), Section 29A due diligence, and Resolution Plan approval.',
    version: '2026.09',
    last_updated: '2026-09-27T08:00:00.000Z',
    upgrade_price_inr: 2499,
    status: 'installed',
    source_subpath: '01_CIRP',
    included_skeletons: []
  },
  personal_guarantors_pack: {
    key: 'personal_guarantors_pack',
    cartridge_file: 'personal_guarantors_pack.vlt',
    title: 'Personal Guarantors & Individual Bankruptcy Sovereign Practice Pack',
    target_market: 'Insolvency Professionals, Debtors, Financial Creditors',
    domain: 'ibc_part_iii',
    description: '68-instrument Part III statutory compendium: Section 94/95 guarantor insolvency, repayment plans, creditor meetings, Section 121 bankruptcy petitions, and trustee asset vesting.',
    version: '2026.09',
    last_updated: '2026-09-27T08:00:00.000Z',
    upgrade_price_inr: 1999,
    status: 'installed',
    source_subpath: '02_Personal_Guarantors',
    included_skeletons: []
  },
  partnership_firms_pack: {
    key: 'partnership_firms_pack',
    cartridge_file: 'partnership_firms_pack.vlt',
    title: 'Partnership Firms Insolvency & Restructuring Sovereign Practice Pack',
    target_market: 'Commercial Insolvency Counsel, Arbitrators',
    domain: 'ibc_part_iii',
    description: '35-instrument Part III compendium for partnership firms and co-extensive partner liability under Section 25 Partnership Act and joint vs separate debts (Section 49).',
    version: '2026.09',
    last_updated: '2026-09-27T08:00:00.000Z',
    upgrade_price_inr: 1499,
    status: 'installed',
    source_subpath: '03_Partnership_Firms',
    included_skeletons: []
  },
  voluntary_liquidation_pack: {
    key: 'voluntary_liquidation_pack',
    cartridge_file: 'voluntary_liquidation_pack.vlt',
    title: 'Voluntary Liquidation Process (Section 59) Sovereign Practice Pack',
    target_market: 'Corporate Liquidators, Company Secretaries, NCLT Practitioners',
    domain: 'voluntary_liquidation',
    description: '35-instrument Section 59 master compendium: Declaration of solvency, special resolutions, creditors approval, liquidator preliminary & final reports, in-specie distribution, and dissolution applications.',
    version: '2026.09',
    last_updated: '2026-09-27T08:00:00.000Z',
    upgrade_price_inr: 1499,
    status: 'installed',
    source_subpath: '04_Voluntary_Liquidation',
    included_skeletons: []
  },
  commercial_litigation_pack: {
    key: 'commercial_litigation_pack',
    cartridge_file: 'commercial_litigation_pack.vlt',
    title: 'Commercial Court & Interlocutory Relief Pack',
    target_market: 'District & High Court Commercial Litigators',
    domain: 'commercial_courts',
    description: 'Court-ready pleadings conforming to Commercial Courts Act 2015 and CPC: Order 38 Rule 5 attachment, Order 39 injunction, Statement of Truth (§ 63 BSA), and Section 12A PIMS mediation.',
    version: '2026.09',
    last_updated: '2026-09-27T08:00:00.000Z',
    upgrade_price_inr: 1499,
    status: 'installed',
    skeletons_subpath: 'commercial_courts',
    included_skeletons: [
      { id: 'cpc-order38', instrumentId: 'CPC-O38', title: 'Attachment Before Judgment (Order XXXVIII Rule 5 CPC)', provision: 'O. 38 R. 5 CPC & § 12A CCA', file: 'cpc_order_38_rule_5_attachment.md', slashCommand: '/cpc-order38', isUrgent: true },
      { id: 'cpc-order39', instrumentId: 'CPC-O39', title: 'Ad-Interim Temporary Injunction (Order XXXIX Rules 1 & 2 CPC)', provision: 'O. 39 R. 1 & 2 CPC', file: 'cpc_order_39_rules_1_2_injunction.md', slashCommand: '/cpc-order39', isUrgent: true },
      { id: 'cpc-truth', instrumentId: 'CPC-TRUTH', title: 'Statement of Truth (Order VI Rule 15A CPC)', provision: 'O. VI R. 15A & § 63 BSA', file: 'cpc_statement_of_truth.md', slashCommand: '/cpc-truth' },
      { id: 'cpc-order11', instrumentId: 'CPC-O11', title: 'Statement of Documents & Disclosure (Order XI Rule 1 CPC)', provision: 'O. XI R. 1 CPC', file: 'cpc_order_11_rule_1_statement_of_documents.md', slashCommand: '/cpc-order11' },
      { id: 'cca-sec12a-pims', instrumentId: 'CCA-12A', title: 'Pre-Institution Mediation Application (Section 12A CCA)', provision: 'Section 12A & Mediation Act 2023', file: 'cca_section_12a_pims_application.md', slashCommand: '/cca-sec12a-pims' },
      { id: 'cca-urgency', instrumentId: 'CCA-URG', title: 'Urgent Interim Relief Exemption Affidavit (Section 12A Proviso)', provision: '§ 12A(1) Proviso (Patil Automation standard)', file: 'cca_section_12a_urgency_application.md', slashCommand: '/cca-urgency', isUrgent: true },
      { id: 'cca-nonstarter', instrumentId: 'CCA-NS', title: 'Non-Starter Report Tracking Memo (Form 3)', provision: 'Commercial Courts Rules & DLSA', file: 'cca_section_12a_non_starter_report.md', slashCommand: '/cca-nonstarter' },
      { id: 'commercial-summary-plaint', instrumentId: 'CPC-O37', title: 'Commercial Summary Plaint (Order XXXVII CPC)', provision: 'Order XXXVII CPC & § 2(1)(c) CCA', file: 'commercial_summary_suit_plaint.md', slashCommand: '/commercial-summary-plaint' }
    ]
  },
  regulatory_compliance_pack: {
    key: 'regulatory_compliance_pack',
    cartridge_file: 'regulatory_compliance_pack.vlt',
    title: 'IBBI Regulatory Compliance & Gazette Pack',
    target_market: 'Insolvency Professionals, Liquidators, Compliance Auditors',
    domain: 'ibbi_regulations',
    description: '7-instrument master regulatory compendium: Gazette notification correlations, master evidence indexes, newspaper tearsheet verifications, and statutory compliance certifications.',
    version: '2026.09',
    last_updated: '2026-09-27T08:00:00.000Z',
    upgrade_price_inr: 999,
    status: 'installed',
    source_subpath: '05_Regulatory_Compliance',
    included_skeletons: []
  }
};

/**
 * Finds user's custom chamber formats located in Desktop/HAYAGRIVA/formats or caseDir/formats.
 */
function getChamberCustomOverlays(caseDir) {
  const candidateDirs = [
    caseDir ? path.join(caseDir, 'formats') : null,
    path.join(os.homedir(), 'Desktop', 'HAYAGRIVA', 'formats'),
    path.join(os.homedir(), 'Desktop', 'hayagriva', 'formats'),
    path.join(__dirname, '..', '..', '..', 'formats')
  ].filter(Boolean);

  const overlays = [];
  const visitedFiles = new Set();

  for (const cDir of candidateDirs) {
    if (!fs.existsSync(cDir)) continue;
    try {
      const scanDir = (dir, relPrefix = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            scanDir(fullPath, path.join(relPrefix, entry.name));
          } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.docx') || entry.name.endsWith('.txt'))) {
            if (visitedFiles.has(entry.name)) continue;
            visitedFiles.add(entry.name);

            const stat = fs.statSync(fullPath);
            let placeholderCount = 0;
            try {
              if (entry.name.endsWith('.md') || entry.name.endsWith('.txt')) {
                const text = fs.readFileSync(fullPath, 'utf8');
                const matches = text.match(/\{\{([^}]+)\}\}/g);
                placeholderCount = matches ? matches.length : 0;
              }
            } catch (_) {}

            overlays.push({
              name: entry.name,
              title: entry.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
              relPath: path.join(relPrefix, entry.name),
              fullPath,
              sizeBytes: stat.size,
              sizeKb: (stat.size / 1024).toFixed(1),
              lastModified: stat.mtime.toISOString(),
              placeholderCount,
              isChamberOverride: true,
              sourceLocation: cDir
            });
          }
        }
      };
      scanDir(cDir);
    } catch (_) {}
  }

  return overlays;
}

/**
 * Returns complete manifest of Practice Packs, Skeletons, and Chamber Overlays.
 */
function getTemplateManifest(caseDir) {
  const customOverlays = getChamberCustomOverlays(caseDir);
  const packs = JSON.parse(JSON.stringify(PRACTICE_PACKS));

  // Dynamically populate included_skeletons for packs with source_subpath
  for (const pack of Object.values(packs)) {
    if (pack.source_subpath) {
      const pSub = path.join(PRACTICE_LIB_ROOT, pack.source_subpath);
      pack.included_skeletons = scanDirForSkeletons(pSub, pack.key, pack.title, pack.domain);
    }
  }

  // Compute total unique skeletons
  let totalSkeletonsCount = 0;
  const allSkeletonsList = [];

  for (const pack of Object.values(packs)) {
    for (const skel of pack.included_skeletons) {
      // Check if user has an override matching this file or id
      const override = customOverlays.find(o => 
        o.name === skel.file || 
        o.name.startsWith(skel.id) ||
        o.title.toLowerCase().includes(skel.id)
      );

      skel.hasChamberOverride = !!override;
      skel.overridePath = override ? override.fullPath : null;
      skel.packKey = pack.key;
      skel.packTitle = pack.title;
      skel.domain = pack.domain;

      // Check if file exists on disk
      if (!skel.fullPath && pack.skeletons_subpath) {
        const filePath = path.join(SKELETONS_ROOT, pack.skeletons_subpath, skel.file);
        skel.fullPath = filePath;
      }

      if (skel.fullPath && fs.existsSync(skel.fullPath)) {
        skel.existsOnDisk = true;
        try {
          const stat = fs.statSync(skel.fullPath);
          skel.sizeBytes = stat.size;
          skel.sizeKb = (stat.size / 1024).toFixed(1);
        } catch (_) {}
      }

      if (!allSkeletonsList.some(s => s.id === skel.id && s.file === skel.file)) {
        allSkeletonsList.push(skel);
      }
    }
  }

  totalSkeletonsCount = allSkeletonsList.length;

  return {
    success: true,
    packs,
    customOverlays,
    allSkeletonsList,
    stats: {
      totalPacks: Object.keys(packs).length,
      totalSkeletons: totalSkeletonsCount,
      totalChamberOverlays: customOverlays.length,
      activePack: 'commercial_litigation_pack'
    }
  };
}

/**
 * Resolves the raw markdown content of a skeleton (checking chamber override first, then system skeleton).
 */
function getSkeletonContent(skeletonKey, packKey, caseDir) {
  // 1. Check Chamber Overlays first
  const overlays = getChamberCustomOverlays(caseDir);
  const matchedOverlay = overlays.find(o => 
    o.name === skeletonKey || 
    o.name === `${skeletonKey}.md` ||
    o.title.toLowerCase().replace(/[-_\s]/g, '') === skeletonKey.toLowerCase().replace(/[-_\s]/g, '')
  );

  if (matchedOverlay && fs.existsSync(matchedOverlay.fullPath)) {
    return {
      success: true,
      isChamberOverride: true,
      path: matchedOverlay.fullPath,
      title: matchedOverlay.title,
      content: fs.readFileSync(matchedOverlay.fullPath, 'utf8')
    };
  }

  // 2. Search inside Practice Library (01_PRACTICE_LIBRARY)
  if (fs.existsSync(PRACTICE_LIB_ROOT)) {
    const searchLib = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const res = searchLib(full);
          if (res) return res;
        } else if (entry.isFile() && (entry.name === skeletonKey || entry.name === `${skeletonKey}.md` || entry.name.toLowerCase().startsWith(skeletonKey.toLowerCase()))) {
          return {
            success: true,
            isChamberOverride: false,
            path: full,
            title: entry.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
            content: fs.readFileSync(full, 'utf8')
          };
        }
      }
      return null;
    };
    const foundInLib = searchLib(PRACTICE_LIB_ROOT);
    if (foundInLib) return foundInLib;
  }

  // 3. Search inside Skeletons root
  const subdirs = ['commercial_courts', 'carkgupta', 'ibc_forms', 'ibc_precedents'];
  for (const sub of subdirs) {
    const candidates = [
      path.join(SKELETONS_ROOT, sub, `${skeletonKey}.md`),
      path.join(SKELETONS_ROOT, sub, skeletonKey)
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return {
          success: true,
          isChamberOverride: false,
          path: c,
          title: path.basename(c, '.md').replace(/[-_]/g, ' '),
          content: fs.readFileSync(c, 'utf8')
        };
      }
    }
  }

  // 3. Fallback check inside packs
  for (const pack of Object.values(PRACTICE_PACKS)) {
    const item = pack.included_skeletons.find(s => s.id === skeletonKey || s.file === skeletonKey);
    if (item) {
      const p = path.join(SKELETONS_ROOT, pack.skeletons_subpath, item.file);
      if (fs.existsSync(p)) {
        return {
          success: true,
          isChamberOverride: false,
          path: p,
          title: item.title,
          content: fs.readFileSync(p, 'utf8')
        };
      }
    }
  }

  // 4. Fallback check inside compiled cartridges via vaultLoader
  try {
    const vaultLoader = require('../utils/vault-loader');
    const decrypted = vaultLoader.getLawText(skeletonKey);
    if (decrypted) {
      return {
        success: true,
        isChamberOverride: false,
        path: `vault:cartridge/${skeletonKey}`,
        title: skeletonKey.replace(/[-_]/g, ' '),
        content: decrypted
      };
    }
  } catch (_) {}

  return {
    success: false,
    error: `Skeleton "${skeletonKey}" not found.`
  };
}

module.exports = {
  PRACTICE_PACKS,
  getChamberCustomOverlays,
  getTemplateManifest,
  getSkeletonContent
};
