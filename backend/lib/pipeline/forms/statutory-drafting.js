/**
 * statutory-drafting.js
 * ─────────────────────────────────────────────────────────────────
 * Unified Statutory IBC Form Drafting & Export Engine.
 * 
 * Supports all 51 forms across the 5 IBC Practice Suites:
 *   1. CIRP (Forms A–H)
 *   2. CILP / Liquidation (Forms A_LP–J_LP, Schedule III)
 *   3. CIVLP / Voluntary Liquidation (Forms A_VL–H_VL, Schedule II)
 *   4. PPIRP (Forms P1–P14)
 *   5. Personal Guarantors (IIRP Forms A–C, Bankruptcy Forms A–B)
 * 
 * Functions:
 *   - resolveStatutoryTemplate(formId)
 *   - draftStatutoryForm(caseDir, formId, customData)
 *   - listAvailableStatutoryForms()
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const cp     = require('child_process');
const { readAllKV } = require('../../agents/skills/kv-write');

const SKELETONS_ROOT = path.join(__dirname, 'skeletons', 'ibc_forms');
const PANDOC_BIN     = path.join(__dirname, '..', '..', '..', 'bin', 'pandoc-x64');

const SUITE_DIRS = [
  { id: 'cirp', dir: 'cirp', name: 'Corporate Insolvency Resolution Process (CIRP)' },
  { id: 'liquidation', dir: 'liquidation', name: 'Corporate Insolvency Liquidation Process (CILP)' },
  { id: 'voluntary_liquidation', dir: 'voluntary_liquidation', name: 'Corporate Voluntary Liquidation Process (CIVLP)' },
  { id: 'ppirp', dir: 'ppirp', name: 'Pre-packaged Insolvency Resolution Process for MSMEs (PPIRP)' },
  { id: 'personal_guarantor', dir: 'personal_guarantor', name: 'Personal Guarantors to Corporate Debtors' }
];

/**
 * Normalizes a user-input form name to its canonical slug.
 * e.g. "Form A", "cirp-form-a", "Form_A", "form-a" -> "form-a"
 */
function normalizeFormSlug(input) {
  let slug = String(input || '').trim().toLowerCase();
  slug = slug.replace(/^cirp[_-]/, '').replace(/^liq[_-]/, '').replace(/^vl[_-]/, '');
  slug = slug.replace(/\.docx$/i, '').replace(/\.pdf$/i, '').replace(/\.md$/i, '');
  slug = slug.replace(/\s+/g, '-').replace(/_/g, '-');
  return slug;
}

/**
 * Resolves a form template across all 5 suite directories.
 * @param {string} formIdentifier
 * @returns {Object|null}
 */
function resolveStatutoryTemplate(formIdentifier) {
  const targetSlug = normalizeFormSlug(formIdentifier);
  const rawInput = String(formIdentifier || '').toLowerCase();

  // Suite prioritization based on keywords
  let preferredSuites = [...SUITE_DIRS];
  if (rawInput.includes('voluntary') || rawInput.includes('civlp') || rawInput.includes('_vl') || rawInput.includes('-vl')) {
    preferredSuites.sort((a, b) => (a.id === 'voluntary_liquidation' ? -1 : 1));
  } else if (rawInput.includes('liquidation') || rawInput.includes('cilp') || rawInput.includes('_lp') || rawInput.includes('-lp')) {
    preferredSuites.sort((a, b) => (a.id === 'liquidation' ? -1 : 1));
  } else if (rawInput.includes('prepack') || rawInput.includes('ppirp') || /\bp\d+\b/.test(rawInput)) {
    preferredSuites.sort((a, b) => (a.id === 'ppirp' ? -1 : 1));
  } else if (rawInput.includes('guarantor') || rawInput.includes('bankruptcy') || rawInput.includes('iirp')) {
    preferredSuites.sort((a, b) => (a.id === 'personal_guarantor' ? -1 : 1));
  }

  // Pass 1: Exact slug match
  for (const suite of preferredSuites) {
    const mdDir = path.join(SKELETONS_ROOT, suite.dir, 'markdown');
    if (!fs.existsSync(mdDir)) continue;

    const files = fs.readdirSync(mdDir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const fileSlug = file.replace(/\.md$/, '');
      if (fileSlug === targetSlug) {
        return buildTemplateObj(suite, file, fileSlug, mdDir);
      }
    }
  }

  // Pass 2: Fuzzy/Word-boundary match
  for (const suite of preferredSuites) {
    const mdDir = path.join(SKELETONS_ROOT, suite.dir, 'markdown');
    if (!fs.existsSync(mdDir)) continue;

    const files = fs.readdirSync(mdDir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const fileSlug = file.replace(/\.md$/, '');
      if (rawInput.includes(fileSlug) || fileSlug.includes(targetSlug) || targetSlug.includes(fileSlug)) {
        return buildTemplateObj(suite, file, fileSlug, mdDir);
      }
    }
  }

  return null;
}

function buildTemplateObj(suite, file, fileSlug, mdDir) {
  const fullMdPath = path.join(mdDir, file);
  const mdContent = fs.readFileSync(fullMdPath, 'utf8');
  const sourcesDir = path.join(SKELETONS_ROOT, suite.dir, 'sources');

  // Extract placeholders
  const matches = mdContent.match(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g) || [];
  const placeholders = Array.from(new Set(matches.map(m => m.replace(/\{\{\s*|\s*\}\}/g, '').trim())));

  // Locate matching source binary if exists
  let sourceBinaryPath = null;
  if (fs.existsSync(sourcesDir)) {
    const sources = fs.readdirSync(sourcesDir);
    const found = sources.find(s => s.toLowerCase().replace(/[\s\-_]/g, '').includes(fileSlug.replace(/[\s\-_]/g, '')));
    if (found) sourceBinaryPath = path.join(sourcesDir, found);
  }

  return {
    suiteId: suite.id,
    suiteName: suite.name,
    formSlug: fileSlug,
    markdownFile: file,
    markdownPath: fullMdPath,
    sourceBinaryPath,
    content: mdContent,
    placeholders
  };
}


/**
 * Lists all 51 available statutory forms with suite categorization.
 */
function listAvailableStatutoryForms() {
  const inventory = [];
  for (const suite of SUITE_DIRS) {
    const manifestPath = path.join(SKELETONS_ROOT, suite.dir, 'forms-manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        for (const f of manifest.forms || []) {
          inventory.push({
            suiteId: suite.id,
            suiteName: suite.name,
            formId: f.id,
            title: f.title,
            sourceFile: f.sourceFile,
            markdownFile: f.markdownFile,
            placeholdersCount: f.placeholdersCount
          });
        }
      } catch (_) {}
    }
  }
  return inventory;
}

/**
 * Intelligent dictionary alias resolver.
 * Maps high-variance statutory variable names to standard KV dictionary keys.
 */
function resolveStatutoryValue(varName, kv, customData = {}) {
  // 1. Explicit override from customData has highest priority
  if (customData[varName] !== undefined) return String(customData[varName]);
  const lowerVar = varName.toLowerCase();
  if (customData[lowerVar] !== undefined) return String(customData[lowerVar]);

  // 2. Direct match in KV
  if (kv[varName] !== undefined) return typeof kv[varName] === 'object' ? kv[varName].value : kv[varName];
  if (kv[lowerVar] !== undefined) return typeof kv[lowerVar] === 'object' ? kv[lowerVar].value : kv[lowerVar];

  // Helper to test any of candidate keys across both customData and KV
  const getAny = (...keys) => {
    for (const k of keys) {
      if (customData && customData[k] !== undefined) return String(customData[k]);
      const lk = k.toLowerCase();
      if (customData && customData[lk] !== undefined) return String(customData[lk]);
      if (kv && kv[k] !== undefined) return typeof kv[k] === 'object' ? kv[k].value : kv[k];
      if (kv && kv[lk] !== undefined) return typeof kv[lk] === 'object' ? kv[lk].value : kv[lk];
    }
    return null;
  };


  // 3. Corporate Debtor Name
  if (/CORPORATE_DEBTOR|COMPANY_NAME|CD_NAME/i.test(varName)) {
    const val = getAny('company_name', 'corporate_debtor_name', 'corporate_debtor', 'cd_name');
    if (val) return String(val);
  }

  // 4. Insolvency Commencement Date
  if (/COMMENCEMENT_DATE|DATE_OF_INITIATION/i.test(varName)) {
    const val = getAny('insolvency_commencement_date', 'commencement_date', 'cirp_commencement_date', 'initiation_date');
    if (val) return String(val);
  }

  // 5. Last Date for Claims
  if (/LAST_DATE.*SUBMISSION.*CLAIM|CLAIM.*LAST.*DATE|FOURTEEN_DAYS/i.test(varName)) {
    const val = getAny('claims_last_date', 'last_date_for_claims', 'claims_cutoff_date');
    if (val) return String(val);
    // Dynamic fallback: Commencement Date + 14 days
    const cDate = getAny('insolvency_commencement_date', 'commencement_date');
    if (cDate) {
      try {
        const d = new Date(cDate);
        if (!isNaN(d.getTime())) {
          d.setDate(d.getDate() + 14);
          return d.toISOString().split('T')[0];
        }
      } catch (_) {}
    }
  }

  // 6. Estimated Closure Date (T + 180 days)
  if (/ESTIMATED.*CLOSURE.*DATE|CLOSURE_DATE/i.test(varName)) {
    const cDate = getAny('insolvency_commencement_date', 'commencement_date');
    if (cDate) {
      try {
        const d = new Date(cDate);
        if (!isNaN(d.getTime())) {
          d.setDate(d.getDate() + 180);
          return d.toISOString().split('T')[0];
        }
      } catch (_) {}
    }
  }

  // 7. Insolvency Professional / Liquidator Name & Reg Number
  if (/INSOLVENCY_PROFESSIONAL|IRP_NAME|RP_NAME|LIQUIDATOR/i.test(varName)) {
    if (/REGISTRATION_NUMBER|REG_NO/i.test(varName)) {
      const val = getAny('ip_registration_number', 'rp_registration_number', 'ip_reg_no', 'registration_number');
      if (val) return String(val);
    }
    const val = getAny('ip_name', 'rp_name', 'liquidator_name', 'irp_name');
    if (val) return String(val);
  }

  // 8. Financial / Operational Creditor Name
  if (/CREDITOR.*NAME|FINANCIAL_CREDITOR|OPERATIONAL_CREDITOR/i.test(varName)) {
    const val = getAny('creditor_name', 'financial_creditor_name', 'bank_name', 'operational_creditor_name');
    if (val) return String(val);
  }

  // 9. Claim Amounts
  if (/CLAIM.*AMOUNT|TOTAL_AMOUNT|AMOUNT_CLAIMED|TOTAL_DEBT/i.test(varName)) {
    const val = getAny('total_claim_amount', 'amount_claimed', 'principal_amount', 'total_debt');
    if (val) return String(val);
  }

  // 10. CIN / LLPIN
  if (/CIN|LLPIN|CORPORATE_IDENTITY/i.test(varName)) {
    const val = getAny('cin', 'llpin', 'corporate_identity_number');
    if (val) return String(val);
  }

  // 11. Registered Address
  if (/REGISTERED_OFFICE|ADDRESS.*REGISTERED/i.test(varName)) {
    const val = getAny('registered_office', 'registered_office_address', 'company_address');
    if (val) return String(val);
  }

  // 12. Generic Date
  if (varName === 'DATE') {
    return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  return null;
}

/**
 * Drafts a statutory form, auto-filling placeholders, writing draft markdown,
 * and compiling to DOCX.
 * 
 * @param {string} caseDir - Active case workspace directory
 * @param {string} formIdentifier - e.g. 'form-a', 'cirp-form-c', 'form-b-lp', 'form-p1'
 * @param {Object} [customData] - Optional manual override values
 * @returns {Promise<Object>}
 */
async function draftStatutoryForm(caseDir, formIdentifier, customData = {}) {
  const template = resolveStatutoryTemplate(formIdentifier);
  if (!template) {
    throw new Error(`Statutory form template not found for: "${formIdentifier}".`);
  }

  const kv = readAllKV(caseDir);
  let filledMarkdown = template.content;
  const diagnostics = {
    filled: [],
    unfilled: []
  };

  for (const ph of template.placeholders) {
    const value = resolveStatutoryValue(ph, kv, customData);
    const tokenRegex = new RegExp(`\\{\\{\\s*${ph}\\s*\\}\\}`, 'g');

    if (value) {
      filledMarkdown = filledMarkdown.replace(tokenRegex, value);
      diagnostics.filled.push({ variable: ph, value });
    } else {
      const placeholderIndicator = `⚠️ [${ph}: NEEDS REVIEW]`;
      filledMarkdown = filledMarkdown.replace(tokenRegex, placeholderIndicator);
      diagnostics.unfilled.push({ variable: ph });
    }
  }

  // Prepare drafts directory in workspace
  const draftsDir = path.join(caseDir, 'drafts');
  fs.mkdirSync(draftsDir, { recursive: true });

  const baseName = `draft_${template.formSlug}`;
  const draftMdPath = path.join(draftsDir, `${baseName}.md`);
  const draftDocxPath = path.join(draftsDir, `${baseName}.docx`);

  // Version archiving if existing draft exists
  if (fs.existsSync(draftMdPath)) {
    const files = fs.readdirSync(draftsDir);
    const vRegex = new RegExp(`^${baseName}\\.v(\\d+)\\.md$`);
    let maxV = 0;
    for (const f of files) {
      const m = f.match(vRegex);
      if (m) maxV = Math.max(maxV, parseInt(m[1], 10));
    }
    const archivePath = path.join(draftsDir, `${baseName}.v${maxV + 1}.md`);
    fs.copyFileSync(draftMdPath, archivePath);
  }

  // Write populated markdown
  fs.writeFileSync(draftMdPath, filledMarkdown, 'utf8');

  // Export to DOCX via pandoc-x64
  let docxCompiled = false;
  if (fs.existsSync(PANDOC_BIN)) {
    try {
      const cmd = [PANDOC_BIN, '-f', 'gfm', '-t', 'docx', draftMdPath, '-o', draftDocxPath];
      cp.execFileSync(PANDOC_BIN, ['-f', 'gfm', '-t', 'docx', draftMdPath, '-o', draftDocxPath], { stdio: 'pipe' });
      docxCompiled = fs.existsSync(draftDocxPath);
    } catch (e) {
      console.warn(`[StatutoryDrafting] Pandoc DOCX compilation warning:`, e.message);
    }
  }

  return {
    success: true,
    suiteId: template.suiteId,
    suiteName: template.suiteName,
    formSlug: template.formSlug,
    draftMdPath,
    draftDocxPath: docxCompiled ? draftDocxPath : null,
    totalPlaceholders: template.placeholders.length,
    filledCount: diagnostics.filled.length,
    unfilledCount: diagnostics.unfilled.length,
    diagnostics
  };
}

module.exports = {
  resolveStatutoryTemplate,
  listAvailableStatutoryForms,
  draftStatutoryForm,
  normalizeFormSlug
};
