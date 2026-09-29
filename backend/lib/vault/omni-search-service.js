'use strict';

/**
 * omni-search-service.js
 * ─────────────────────────────────────────────────────────────────
 * Unified Chamber Omni-Search Resolver for Hayagriva.
 * Powers the Universal Omni-Trigger (`/` and `@`) across Milkdown,
 * Monaco, and document editors in < 20ms.
 *
 * Resolves across:
 *   1. 📌 Case Facts & Entities (case_kv_dictionary.json)
 *   2. 🏛️ Statutory Vaults & Bare Acts (IBC, CPC, CCA, Arbitration, Limitation)
 *   3. 📋 Form & Template Packs / Skeletons (template-packs-registry.js + /formats/)
 *   4. ⚡ Court Actions (export DOCX, export PDF, audit, case graph)
 * ─────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Core curated statutory provisions (air-gapped, zero-latency index)
const CORE_STATUTES = [
  // IBC 2016
  {
    id: 'law:ibc-sec-3-12',
    act: 'IBC, 2016',
    section: 'Section 3(12)',
    title: 'Section 3(12) IBC — Definition of Default',
    subtitle: 'Insolvency & Bankruptcy Code, 2016 • Non-payment of debt when due',
    keywords: ['default', 'debt', 'non-payment', 'due', 'payable', 'ibc', 'sec 3'],
    citation: '> **Section 3(12), Insolvency and Bankruptcy Code, 2016:**\n> "default" means non-payment of debt when whole or any part or instalment of the amount of debt has become due and payable and is not paid by the debtor or the corporate debtor, as the case may be;'
  },
  {
    id: 'law:ibc-sec-7',
    act: 'IBC, 2016',
    section: 'Section 7',
    title: 'Section 7 IBC — Financial Creditor CIRP Initiation',
    subtitle: 'Insolvency & Bankruptcy Code, 2016 • Initiation by Financial Creditor',
    keywords: ['section 7', 'financial creditor', 'default', 'nclt', 'cirp', 'form 1', 'bank loan'],
    citation: '> **Section 7(1), Insolvency and Bankruptcy Code, 2016:**\n> A financial creditor either by itself or jointly with other financial creditors may file an application for initiating corporate insolvency resolution process against a corporate debtor before the Adjudicating Authority when a default has occurred.'
  },
  {
    id: 'law:ibc-sec-8',
    act: 'IBC, 2016',
    section: 'Section 8',
    title: 'Section 8 IBC — Demand Notice by Operational Creditor',
    subtitle: 'Insolvency & Bankruptcy Code, 2016 • Statutory 10-Day Demand Notice (Form 3/4)',
    keywords: ['section 8', 'demand notice', 'operational creditor', 'form 3', 'form 4', '10 days'],
    citation: '> **Section 8(1), Insolvency and Bankruptcy Code, 2016:**\n> An operational creditor may, on the occurrence of a default, deliver a demand notice of unpaid operational debtor copy of an invoice demanding payment of the amount involved in the default to the corporate debtor.'
  },
  {
    id: 'law:ibc-sec-9',
    act: 'IBC, 2016',
    section: 'Section 9',
    title: 'Section 9 IBC — Operational Creditor CIRP Initiation',
    subtitle: 'Insolvency & Bankruptcy Code, 2016 • Petition upon expiry of 10-day notice',
    keywords: ['section 9', 'operational creditor', 'unpaid invoice', 'cirp', 'form 5'],
    citation: '> **Section 9(1), Insolvency and Bankruptcy Code, 2016:**\n> After the expiry of the period of ten days from the date of delivery of the notice or invoice demanding payment under sub-section (1) of section 8, if the operational creditor does not receive payment from the corporate debtor or notice of the dispute, the operational creditor may file an application before the Adjudicating Authority.'
  },
  {
    id: 'law:ibc-sec-14',
    act: 'IBC, 2016',
    section: 'Section 14',
    title: 'Section 14 IBC — Statutory Moratorium',
    subtitle: 'Insolvency & Bankruptcy Code, 2016 • Prohibition of suits, recovery & encumbrance',
    keywords: ['moratorium', 'section 14', 'stay', 'recovery prohibition', 'encumbrance'],
    citation: '> **Section 14(1), Insolvency and Bankruptcy Code, 2016:**\n> Subject to provisions of sub-sections (2) and (3), on the insolvency commencement date, the Adjudicating Authority shall by order declare moratorium for prohibiting the institution of suits or continuation of pending suits or proceedings against the corporate debtor.'
  },
  {
    id: 'law:ibc-sec-29a',
    act: 'IBC, 2016',
    section: 'Section 29A',
    title: 'Section 29A IBC — Resolution Applicant Ineligibility',
    subtitle: 'Insolvency & Bankruptcy Code, 2016 • 10-Gate Statutory Disqualification (Clauses a–j)',
    keywords: ['section 29a', 'ineligibility', 'disqualification', 'wilful defaulter', 'npa 1 year', 'connected person'],
    citation: '> **Section 29A, Insolvency and Bankruptcy Code, 2016:**\n> A person shall not be eligible to submit a resolution plan, if such person, or any other person acting jointly or in concert with such person is an undischarged insolvent, wilful defaulter, or has an account classified as non-performing asset for at least one year.'
  },
  {
    id: 'law:ibc-sec-43',
    act: 'IBC, 2016',
    section: 'Section 43',
    title: 'Section 43 IBC — Preferential Transactions',
    subtitle: 'Insolvency & Bankruptcy Code, 2016 • Avoidance of preferential transfers',
    keywords: ['section 43', 'preferential', 'avoidance', 'clawback', 'lookback period', 'related party'],
    citation: '> **Section 43(2), Insolvency and Bankruptcy Code, 2016:**\n> A corporate debtor shall be deemed to have given a preference if there is a transfer of property or an interest thereof for the benefit of a creditor on account of an antecedent financial debt or operational debt.'
  },
  {
    id: 'law:ibc-sec-45',
    act: 'IBC, 2016',
    section: 'Section 45',
    title: 'Section 45 IBC — Undervalued Transactions',
    subtitle: 'Insolvency & Bankruptcy Code, 2016 • Clawback of gifted or undervalued assets',
    keywords: ['section 45', 'undervalued', 'avoidance', 'gift', 'inadequate consideration'],
    citation: '> **Section 45(1), Insolvency and Bankruptcy Code, 2016:**\n> If the liquidator or the resolution professional determines that certain transactions made during the relevant period were undervalued, he shall make an application to the Adjudicating Authority to declare such transactions void.'
  },
  {
    id: 'law:ibc-sec-66',
    act: 'IBC, 2016',
    section: 'Section 66',
    title: 'Section 66 IBC — Fraudulent or Wrongful Trading',
    subtitle: 'Insolvency & Bankruptcy Code, 2016 • Personal liability of directors for intent to defraud',
    keywords: ['section 66', 'fraudulent trading', 'wrongful trading', 'director liability', 'defraud creditors'],
    citation: '> **Section 66(1), Insolvency and Bankruptcy Code, 2016:**\n> If during the corporate insolvency resolution process or a liquidation process, it is found that any business of the corporate debtor has been carried on with intent to defraud creditors or for any fraudulent purpose, the Adjudicating Authority may direct that any persons who were knowingly parties shall be personally liable.'
  },

  // CPC & Commercial Courts Act
  {
    id: 'law:cpc-o38-r5',
    act: 'CPC, 1908',
    section: 'Order XXXVIII Rule 5',
    title: 'Order XXXVIII Rule 5 CPC — Attachment Before Judgment',
    subtitle: 'Code of Civil Procedure, 1908 • Pre-judgment security & Sub-Registrar red entry',
    keywords: ['order 38', 'order 38 rule 5', 'attachment before judgment', 'cpc', 'red entry', 'absconding'],
    citation: '> **Order XXXVIII Rule 5(1), Code of Civil Procedure, 1908:**\n> Where, at any stage of a suit, the Court is satisfied that the defendant, with intent to obstruct or delay the execution of any decree that may be passed against him, is about to dispose of the whole or any part of his property, the Court may direct the defendant to furnish security.'
  },
  {
    id: 'law:cpc-o39-r1-2',
    act: 'CPC, 1908',
    section: 'Order XXXIX Rules 1 & 2',
    title: 'Order XXXIX Rules 1 & 2 CPC — Temporary Injunction',
    subtitle: 'Code of Civil Procedure, 1908 • 3-Prong Test (Prima facie case, Balance of convenience, Irreparable injury)',
    keywords: ['order 39', 'temporary injunction', 'status quo', 'stay', 'prima facie', 'balance of convenience'],
    citation: '> **Order XXXIX Rule 1, Code of Civil Procedure, 1908:**\n> Where in any suit it is proved by affidavit or otherwise that any property in dispute in a suit is in danger of being wasted, damaged or alienated by any party to the suit, the Court may by order grant a temporary injunction.'
  },
  {
    id: 'law:cpc-o6-r15a',
    act: 'Commercial Courts Act, 2015',
    section: 'Order VI Rule 15A CPC',
    title: 'Order VI Rule 15A CPC — Statement of Truth',
    subtitle: 'Commercial Courts Act, 2015 • Mandatory verification affidavit & § 63 BSA electronic certificate',
    keywords: ['statement of truth', 'order 6 rule 15a', 'verification', 'commercial courts', 'section 63 bsa', '65b ea'],
    citation: '> **Order VI Rule 15A, Code of Civil Procedure, 1908 (as amended by Commercial Courts Act, 2015):**\n> Every pleading in a Commercial Dispute shall be verified by an affidavit in the manner and form specified in the Appendix to this Schedule, namely, by a Statement of Truth.'
  },
  {
    id: 'law:cca-sec-12a',
    act: 'Commercial Courts Act, 2015',
    section: 'Section 12A',
    title: 'Section 12A CCA — Pre-Institution Mediation (PIMS)',
    subtitle: 'Commercial Courts Act, 2015 • Mandatory pre-institution mediation unless urgent interim relief sought',
    keywords: ['section 12a', 'pims', 'mediation', 'pre-institution mediation', 'patil automation', 'urgency', 'form 1'],
    citation: '> **Section 12A(1), Commercial Courts Act, 2015:**\n> A suit, which does not contemplate any urgent interim relief under this Act, shall not be instituted unless the plaintiff exhausts the remedy of pre-institution mediation in accordance with such manner and procedure as may be prescribed.'
  },
  {
    id: 'law:cpc-o11-r1',
    act: 'Commercial Courts Act, 2015',
    section: 'Order XI Rule 1 CPC',
    title: 'Order XI Rule 1 CPC — Statement of Documents & Disclosure',
    subtitle: 'Commercial Courts Act, 2015 • Mandatory disclosure of all documents in power/possession',
    keywords: ['order 11', 'statement of documents', 'disclosure', 'discovery', 'inspection', 'commercial courts'],
    citation: '> **Order XI Rule 1(1), Code of Civil Procedure, 1908 (as amended by Commercial Courts Act, 2015):**\n> Plaintiff shall file a list of all documents and photocopies of all documents, in its power, possession, control or custody, pertaining to the suit, along with the plaint.'
  },
  {
    id: 'law:bsa-sec-63',
    act: 'Bharatiya Sakshya Adhiniyam, 2023',
    section: 'Section 63',
    title: 'Section 63 BSA — Electronic Records Certificate',
    subtitle: 'Bharatiya Sakshya Adhiniyam, 2023 (formerly § 65B Indian Evidence Act) • Hash & device certification',
    keywords: ['section 63 bsa', '65b', 'electronic evidence', 'certificate', 'computer output', 'sha-256 hash'],
    citation: '> **Section 63(4), Bharatiya Sakshya Adhiniyam, 2023:**\n> In any proceeding where it is desired to give a statement in evidence by virtue of this section, a certificate doing any of the following things shall be submitted identifying the electronic record and describing the manner in which it was produced.'
  }
];

// Standard Court Actions
const COURT_ACTIONS = [
  {
    id: 'action:export-docx',
    category: 'action',
    badge: '🏛️ Court Action',
    title: 'Export to Supreme Court DOCX (A4, 14pt)',
    subtitle: 'Compiles continuous pleading with official court margins & paragraph numbering',
    slashCommand: '/export-docx',
    score: 85,
    insertType: 'block',
    payload: {
      actionId: 'exportScDocx',
      displayText: 'Exporting to Supreme Court DOCX...',
      rawMarkdown: ''
    }
  },
  {
    id: 'action:export-pdf',
    category: 'action',
    badge: '🏛️ Court Action',
    title: 'Export to Court PDF & Preview',
    subtitle: 'Renders courtroom-ready PDF with continuous folio numbering',
    slashCommand: '/export-pdf',
    score: 80,
    insertType: 'block',
    payload: {
      actionId: 'exportCourtPdf',
      displayText: 'Exporting to Court PDF...',
      rawMarkdown: ''
    }
  },
  {
    id: 'action:table',
    category: 'action',
    badge: '📊 Visual Grid',
    title: 'Insert Interactive Table Grid',
    subtitle: 'Excel-like editable table cells with tab-key row creation',
    slashCommand: '/table',
    score: 90,
    insertType: 'block',
    payload: {
      actionId: 'insertTable',
      displayText: '| Description | Particulars | Amount (INR) |\n| --- | --- | ---: |\n| Principal Debt | Facility A Sanction | 0.00 |\n| Interest | Accrued @ 12% p.a. | 0.00 |\n| **Total Claim** | | **0.00** |',
      rawMarkdown: '\n| Description | Particulars | Amount (INR) |\n| --- | --- | ---: |\n| Principal Debt | Facility A Sanction | 0.00 |\n| Interest | Accrued @ 12% p.a. | 0.00 |\n| **Total Claim** | | **0.00** |\n\n'
    }
  },
  {
    id: 'action:audit',
    category: 'action',
    badge: '⚖️ Audit Action',
    title: 'Audit Case Facts & Compliance (HITL)',
    subtitle: 'Runs cross-check between claims registry, bank statements & statutory limits',
    slashCommand: '/audit',
    score: 75,
    insertType: 'block',
    payload: {
      actionId: 'runCaseAudit',
      displayText: 'Running Case Compliance Audit...',
      rawMarkdown: ''
    }
  }
];

/**
 * Normalizes and formats raw KV dictionary keys into advocate-friendly titles.
 */
function formatFactTitle(key, val) {
  const cleanKey = key
    .replace(/^case_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
  return `${cleanKey}: ${val}`;
}

// In-memory caches to guarantee sub-millisecond query responses
let _factsCache = new Map();
let _templatesCache = new Map();
const CACHE_TTL_MS = 5000; // 5 seconds TTL

/**
 * Loads case facts from case_kv_dictionary.json with in-memory caching.
 */
function loadCaseFacts(caseDir) {
  if (!caseDir) return [];
  const now = Date.now();
  const cached = _factsCache.get(caseDir);
  if (cached && (now - cached.time < CACHE_TTL_MS)) {
    return cached.data;
  }

  const kvPath = path.join(caseDir, 'case_kv_dictionary.json');
  if (!fs.existsSync(kvPath)) return [];

  try {
    const raw = JSON.parse(fs.readFileSync(kvPath, 'utf8'));
    const facts = [];
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'object' && value !== null) {
        // Handle nested structures or verified_by_user objects
        const actualVal = value.value !== undefined ? value.value : JSON.stringify(value);
        facts.push({
          key,
          val: String(actualVal),
          verified: !!value.verified_by_user
        });
      } else if (value !== undefined && value !== null && String(value).trim()) {
        facts.push({
          key,
          val: String(value),
          verified: false
        });
      }
    }
    _factsCache.set(caseDir, { data: facts, time: now });
    return facts;
  } catch (e) {
    console.warn('[OmniSearch] Failed reading case_kv_dictionary:', e.message);
    return [];
  }
}

/**
 * Loads pleading skeletons & template packs with in-memory caching.
 */
function loadTemplatePacks(caseDir) {
  const cacheKey = caseDir || '__default__';
  const now = Date.now();
  const cached = _templatesCache.get(cacheKey);
  if (cached && (now - cached.time < CACHE_TTL_MS)) {
    return cached.data;
  }

  try {
    const { getTemplateManifest } = require('./template-packs-registry');
    const manifest = getTemplateManifest(caseDir);
    const skeletons = manifest.allSkeletonsList || [];
    const results = skeletons.map(s => ({
      id: `tpl:${s.id || s.file}`,
      category: 'template',
      badge: s.isChamberOverride ? '🏛️ Chamber Override' : '📋 Template',
      title: s.title || s.name || s.file,
      subtitle: s.slashCommand ? `${s.slashCommand} • ${s.provision || s.domain || 'Practice Template'}` : (s.provision || s.domain || 'Practice Template'),
      slashCommand: s.slashCommand || `/${(s.id || s.name || '').replace(/\.md$/, '')}`,
      isUrgent: !!s.isUrgent,
      file: s.file,
      skeletonKey: s.id || s.file,
      packKey: s.packKey || 'commercial_litigation_pack',
      insertType: 'block',
      payload: {
        skeletonKey: s.id || s.file,
        packKey: s.packKey || 'commercial_litigation_pack',
        displayText: `Inserting template: ${s.title}...`,
        rawMarkdown: ''
      }
    }));
    _templatesCache.set(cacheKey, { data: results, time: now });
    return results;
  } catch (e) {
    console.warn('[OmniSearch] Failed loading template manifest:', e.message);
    return [];
  }
}

/**
 * Main High-Speed Universal Omni-Search Handler.
 *
 * @param {Object} options
 * @param {string} options.query - User search string (after '/' or '@')
 * @param {string} options.context - 'block' (newline) or 'inline' (mid-sentence)
 * @param {string} options.caseDir - Absolute path to active case directory
 * @param {number} options.limit - Max items to return (default: 20)
 * @returns {Array<Object>} Categorized, scored, and ranked suggestions
 */
function searchOmni({ query = '', context = 'inline', caseDir = '', limit = 20 }) {
  const cleanQ = query.trim().replace(/^[/@]/, '').toLowerCase();
  const isBlock = context === 'block';
  const tokens = cleanQ.split(/\s+/).filter(Boolean);

  const results = [];

  // ── 1. Process 📌 Case Facts ──────────────────────────────────────────
  const facts = loadCaseFacts(caseDir);
  for (const f of facts) {
    const keyLower = f.key.toLowerCase();
    const valLower = f.val.toLowerCase();
    let score = 0;

    if (!cleanQ) {
      score = 45; // baseline presence
    } else {
      let matches = 0;
      for (const tok of tokens) {
        if (keyLower.startsWith(tok) || valLower.startsWith(tok)) {
          matches += 2;
        } else if (keyLower.includes(tok) || valLower.includes(tok)) {
          matches += 1;
        }
      }
      if (matches > 0) {
        score = 50 + (matches * 15);
        if (keyLower === cleanQ || valLower === cleanQ) score += 30;
      }
    }

    if (score > 0) {
      // Inline context gives a 2.5x multiplier to facts
      const finalScore = isBlock ? score : Math.round(score * 2.5);
      results.push({
        id: `fact:${f.key}`,
        category: 'fact',
        badge: f.verified ? '✓ Verified Fact' : '📌 Case Fact',
        title: formatFactTitle(f.key, f.val),
        subtitle: `Variable: {{${f.key}}}${f.verified ? ' • Verified by Practitioner' : ''}`,
        score: finalScore,
        insertType: 'inline',
        payload: {
          variableKey: f.key,
          displayText: f.val,
          rawMarkdown: f.val
        }
      });
    }
  }

  // ── 2. Process 🏛️ Statutory Provisions ─────────────────────────────────
  for (const stat of CORE_STATUTES) {
    const titleLower = stat.title.toLowerCase();
    const subLower = stat.subtitle.toLowerCase();
    const secLower = stat.section.toLowerCase();
    let score = 0;

    if (!cleanQ) {
      score = 40;
    } else {
      let matches = 0;
      for (const tok of tokens) {
        if (secLower.startsWith(tok) || stat.keywords.some(k => k.startsWith(tok))) {
          matches += 2.5;
        } else if (titleLower.includes(tok) || subLower.includes(tok) || stat.keywords.some(k => k.includes(tok))) {
          matches += 1.5;
        }
      }
      if (matches > 0) {
        score = 45 + (matches * 15);
      }
    }

    if (score > 0) {
      const finalScore = isBlock ? Math.round(score * 1.2) : Math.round(score * 2.2);
      results.push({
        id: stat.id,
        category: 'law',
        badge: '🏛️ Statute',
        title: stat.title,
        subtitle: stat.subtitle,
        score: finalScore,
        insertType: 'block',
        payload: {
          displayText: stat.citation,
          rawMarkdown: stat.citation
        }
      });
    }
  }

  // ── 3. Process 📋 Skeletons & Practice Templates ───────────────────────
  const templates = loadTemplatePacks(caseDir);
  for (const tpl of templates) {
    const titleLower = tpl.title.toLowerCase();
    const subLower = tpl.subtitle.toLowerCase();
    const slashLower = tpl.slashCommand.toLowerCase();
    let score = 0;

    if (!cleanQ) {
      score = tpl.isUrgent ? 60 : 45;
    } else {
      let matches = 0;
      for (const tok of tokens) {
        if (slashLower.startsWith('/' + tok) || slashLower.includes(tok)) {
          matches += 3.0;
        } else if (titleLower.startsWith(tok)) {
          matches += 2.0;
        } else if (titleLower.includes(tok) || subLower.includes(tok)) {
          matches += 1.0;
        }
      }
      if (matches > 0) {
        score = 50 + (matches * 15);
        if (tpl.isUrgent) score += 15;
      }
    }

    if (score > 0) {
      // Block context gives a 2.5x multiplier to templates
      const finalScore = isBlock ? Math.round(score * 2.5) : Math.round(score * 1.0);
      results.push({
        ...tpl,
        score: finalScore
      });
    }
  }

  // ── 4. Process ⚡ Court Actions ─────────────────────────────────────────
  for (const act of COURT_ACTIONS) {
    const titleLower = act.title.toLowerCase();
    const slashLower = act.slashCommand.toLowerCase();
    let score = 0;

    if (!cleanQ) {
      score = isBlock ? 65 : 30;
    } else {
      let matches = 0;
      for (const tok of tokens) {
        if (slashLower.startsWith('/' + tok)) {
          matches += 3.0;
        } else if (titleLower.includes(tok)) {
          matches += 1.5;
        }
      }
      if (matches > 0) {
        score = 50 + (matches * 15);
      }
    }

    if (score > 0) {
      const finalScore = isBlock ? Math.round(score * 2.2) : Math.round(score * 0.8);
      results.push({
        ...act,
        score: finalScore
      });
    }
  }

  // ── Sort by Score Descending ──────────────────────────────────────────
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}

module.exports = {
  searchOmni,
  CORE_STATUTES,
  COURT_ACTIONS
};
