/**
 * commercial-courts-drafting.js
 * ─────────────────────────────────────────────────────────────────
 * Commercial Courts & Interlocutory Relief Drafter (Plan 26 / Roadmap #49)
 * 
 * Extends Hayagriva into mainstream Commercial Court litigation and
 * interlocutory relief under:
 *   1. Code of Civil Procedure, 1908 (CPC)
 *      - Order XXXVIII Rule 5 (Attachment Before Judgment / Security)
 *      - Order XXXIX Rules 1 & 2 (Temporary Injunction & Status Quo)
 *      - Order VI Rule 15A (Statement of Truth)
 *      - Order XI Rule 1 (Statement of Disclosure & List of Documents)
 *   2. Commercial Courts Act, 2015 (CCA)
 *      - Section 12A Pre-Institution Mediation & Settlement (Form 1)
 *      - Section 12A(1) Proviso Urgency Application (Patil Automation standard)
 *      - Section 12A Non-Starter Report Tracking (Form 3)
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SKELETONS_DIR = path.join(__dirname, 'skeletons', 'commercial_courts');

const COMMERCIAL_FORMS_REGISTRY = [
  {
    id: 'cpc_order_38_rule_5_attachment',
    slug: 'cpc-order38',
    aliases: ['order38', 'order-38', 'order-38-rule-5', 'cpc-order38-attachment', 'cpc_order_38_rule_5_attachment', 'attachment-before-judgment', 'draft-order38'],
    title: 'Attachment Before Judgment (Order XXXVIII Rule 5 CPC)',
    act: 'Code of Civil Procedure, 1908 & Commercial Courts Act, 2015',
    forum: 'Commercial Court / District Court (Commercial Division)',
    relief: 'Direct solvent security deposit, freeze immovable asset alienation, issue red-entry precept to Sub-Registrar',
    precedent: 'Raman Tech & Process Engg. Co. v. Solanki Traders, (2008) 2 SCC 302',
    filename: 'cpc_order_38_rule_5_attachment.md',
    isUrgentInterim: true
  },
  {
    id: 'cpc_order_39_rules_1_2_injunction',
    slug: 'cpc-order39',
    aliases: ['order39', 'order-39', 'order-39-rules-1-2', 'cpc-order39-injunction', 'cpc_order_39_rules_1_2_injunction', 'temporary-injunction', 'draft-order39'],
    title: 'Ad-Interim Temporary Injunction (Order XXXIX Rules 1 & 2 CPC)',
    act: 'Code of Civil Procedure, 1908',
    forum: 'Commercial Court / District Court',
    relief: 'Ex-parte status quo, restraint on alienation, non-creation of 3rd party rights, Order 39 Rule 3 undertaking',
    precedent: 'Dalpat Kumar v. Prahlad Singh, (1992) 1 SCC 719',
    filename: 'cpc_order_39_rules_1_2_injunction.md',
    isUrgentInterim: true
  },
  {
    id: 'cpc_statement_of_truth',
    slug: 'cpc-truth',
    aliases: ['statement-of-truth', 'truth', 'order6', 'order-6-rule-15a', 'cpc_statement_of_truth', 'draft-truth'],
    title: 'Statement of Truth (Order VI Rule 15A CPC)',
    act: 'Code of Civil Procedure, 1908 (Commercial Courts Act Schedule)',
    forum: 'Commercial Court / Commercial Division',
    relief: 'Mandatory verified affidavit, digital records certification under § 63 BSA / § 65B EA',
    filename: 'cpc_statement_of_truth.md',
    isUrgentInterim: false
  },
  {
    id: 'cpc_order_11_statement_of_documents',
    slug: 'cpc-order11',
    aliases: ['order11', 'statement-of-documents', 'documents-list', 'cpc_order_11_statement_of_documents', 'disclosure'],
    title: 'Statement of Documents & Disclosure (Order XI Rule 1 CPC)',
    act: 'Code of Civil Procedure, 1908 (Commercial Courts Act Schedule)',
    forum: 'Commercial Court / Commercial Division',
    relief: 'Mandatory filing of list of documents in possession / not in possession and declaration on oath',
    filename: 'cpc_order_11_statement_of_documents.md',
    isUrgentInterim: false
  },
  {
    id: 'cca_section_12a_pims_form_1',
    slug: 'cca-sec12a-pims',
    aliases: ['pims', 'pims-form-1', 'cca-pims', 'mediation', 'cca_section_12a_pims_form_1', 'form-1-mediation', 'draft-pims'],
    title: 'Pre-Institution Mediation Application (Form 1)',
    act: 'Commercial Courts Act, 2015 (Section 12A)',
    forum: 'Legal Services Authority (DLSA / SLSA / TLSC)',
    relief: 'Initiation of mandatory pre-institution mediation and settlement under Rule 3(1) PIMS Rules, 2018',
    filename: 'cca_section_12a_pims_form_1.md',
    isUrgentInterim: false
  },
  {
    id: 'cca_section_12a_urgency_application',
    slug: 'cca-urgency',
    aliases: ['urgency', 'cca-sec12a-urgency', 'dispense-pims', 'section-12a-exemption', 'cca_section_12a_urgency_application'],
    title: 'Section 12A Exemption Application (Urgent Interim Relief)',
    act: 'Commercial Courts Act, 2015 (Section 12A(1) Proviso)',
    forum: 'Commercial Court',
    relief: 'Dispense with pre-institution mediation on account of contemplating urgent interim relief',
    precedent: 'Patil Automation Pvt. Ltd. v. Rakheja Engineers, (2022) 10 SCC 1',
    filename: 'cca_section_12a_urgency_application.md',
    isUrgentInterim: true
  },
  {
    id: 'cca_section_12a_form_3_non_starter',
    slug: 'cca-nonstarter',
    aliases: ['nonstarter', 'form3', 'form-3-non-starter', 'cca_section_12a_form_3_non_starter'],
    title: 'Non-Starter Report (Form 3)',
    act: 'Commercial Courts Act, 2015 & PIMS Rules, 2018 (Rule 3(4)/(6))',
    forum: 'Legal Services Authority / Commercial Court',
    relief: 'Certification of failed/refused mediation to permit direct commercial suit institution',
    filename: 'cca_section_12a_form_3_non_starter.md',
    isUrgentInterim: false
  },
  {
    id: 'cpc_affidavit_of_correct_email',
    slug: 'cpc-email-affidavit',
    aliases: ['email-affidavit', 'cpc-email', 'affidavit-of-email', 'cpc_affidavit_of_correct_email', 'correct-email', 'draft-email-affidavit'],
    title: 'Affidavit of Correct Email & Mobile Contacts (PIMS Rule 3(2)/(3))',
    act: 'Commercial Courts (Pre-Institution Mediation and Settlement) Rules, 2018',
    forum: 'Mediation Centre / Commercial Court',
    relief: 'Sworn verification of functional email addresses and mobile numbers for electronic service',
    filename: 'cpc_affidavit_of_correct_email.md',
    isUrgentInterim: false
  }
];

/**
 * Lists all available Commercial Court templates.
 */
function listAvailableCommercialCourtForms() {
  return COMMERCIAL_FORMS_REGISTRY.map(f => ({
    id: f.id,
    slug: f.slug,
    title: f.title,
    act: f.act,
    forum: f.forum,
    relief: f.relief,
    precedent: f.precedent || null,
    isUrgentInterim: !!f.isUrgentInterim
  }));
}

/**
 * Resolves a template based on slug, id, or alias.
 */
function resolveCommercialCourtTemplate(identifier) {
  if (!identifier) return null;
  const raw = String(identifier).trim().toLowerCase().replace(/^\//, '');
  const clean = raw.replace(/\.md$/, '').replace(/\.docx$/, '');

  for (const item of COMMERCIAL_FORMS_REGISTRY) {
    if (item.id.toLowerCase() === clean || item.slug.toLowerCase() === clean) {
      return item;
    }
    if (item.aliases.some(a => a.toLowerCase() === clean)) {
      return item;
    }
  }

  // Fuzzy match
  for (const item of COMMERCIAL_FORMS_REGISTRY) {
    if (clean.includes(item.slug) || item.slug.includes(clean)) {
      return item;
    }
    for (const a of item.aliases) {
      if (clean.includes(a) || a.includes(clean)) {
        return item;
      }
    }
  }

  return null;
}

/**
 * Converts a numeric amount to Indian English words.
 */
function numberToIndianWords(num) {
  if (num === null || num === undefined || isNaN(num)) return 'Zero';
  num = Math.floor(Math.abs(Number(num)));
  if (num === 0) return 'Zero';

  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
             'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n) {
    if (n < 20) return a[n];
    return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
  }

  function convertThreeDigits(n) {
    let str = '';
    if (Math.floor(n / 100) > 0) {
      str += a[Math.floor(n / 100)] + ' Hundred';
      if (n % 100 !== 0) str += ' ';
    }
    if (n % 100 !== 0) {
      str += convertTwoDigits(n % 100);
    }
    return str;
  }

  let crore = Math.floor(num / 10000000);
  num %= 10000000;
  let lakh = Math.floor(num / 100000);
  num %= 100000;
  let thousand = Math.floor(num / 1000);
  num %= 1000;
  let hundred = num;

  let res = [];
  if (crore > 0) res.push(convertThreeDigits(crore) + ' Crore');
  if (lakh > 0) res.push(convertTwoDigits(lakh) + ' Lakh');
  if (thousand > 0) res.push(convertTwoDigits(thousand) + ' Thousand');
  if (hundred > 0) res.push(convertThreeDigits(hundred));

  return res.join(' ') + ' Only';
}

/**
 * Loads facts from case_kv_dictionary.json
 */
function loadCaseFacts(caseDir) {
  if (!caseDir) return {};
  const kvPath = path.join(caseDir, 'reviews', 'case_kv_dictionary.json');
  if (fs.existsSync(kvPath)) {
    try {
      return JSON.parse(fs.readFileSync(kvPath, 'utf8'));
    } catch (_) {}
  }
  return {};
}

/**
 * Drafts a Commercial Court form using case facts and custom overrides.
 * 
 * @param {string} caseDir - Absolute case directory path
 * @param {string} identifier - e.g. 'cpc-order38', 'cpc-order39', 'cca-sec12a-pims'
 * @param {Object} overrides - Key-value overrides
 * @returns {Promise<Object>}
 */
async function draftCommercialCourtForm(caseDir, identifier, overrides = {}) {
  const templateMeta = resolveCommercialCourtTemplate(identifier);
  if (!templateMeta) {
    throw new Error(`Commercial Court template not recognized for identifier: "${identifier}". Use listAvailableCommercialCourtForms() to view options.`);
  }

  const skeletonPath = path.join(SKELETONS_DIR, templateMeta.filename);
  if (!fs.existsSync(skeletonPath)) {
    throw new Error(`Commercial Court skeleton file missing at: ${skeletonPath}`);
  }

  let templateContent = fs.readFileSync(skeletonPath, 'utf8');
  const caseFacts = loadCaseFacts(caseDir);
  const now = new Date();
  const dateFormatted = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;

  // Default values
  const defaults = {
    COURT_NAME: caseFacts.court_name || 'District Judge (Commercial Division) / Commercial Court',
    SUIT_TYPE: caseFacts.suit_type || 'Commercial Suit',
    SUIT_NUMBER: caseFacts.suit_number || '_____',
    SUIT_YEAR: caseFacts.suit_year || String(now.getFullYear()),
    PETITIONER_NAME: caseFacts.corporate_debtor || caseFacts.company_name || caseFacts.petitioner_name || 'M/s P.D. Hotels Private Limited',
    PETITIONER_ADDRESS: caseFacts.petitioner_address || 'House No. 1634, Sector 18-D, Chandigarh',
    PETITIONER_REP: caseFacts.petitioner_rep || caseFacts.rp_name || caseFacts.director_name || 'Shri Atul Grover',
    PETITIONER_CIN_REG: caseFacts.cin || caseFacts.petitioner_cin || 'U55101CH2005PTC028456',
    PETITIONER_PHONE: caseFacts.petitioner_phone || '0172-2780000',
    PETITIONER_MOBILE: caseFacts.petitioner_mobile || '98XXXXXXXX',
    PETITIONER_EMAIL: caseFacts.petitioner_email || 'legal@pdhotels.com',
    RESPONDENT_NAME: caseFacts.respondent_name || 'M/s P.R. Hospitality',
    RESPONDENT_ADDRESS: caseFacts.respondent_address || 'LCR No. 165-166, Sector 43-B, Chandigarh',
    TARGET_RESPONDENT_NAME: caseFacts.target_respondent_name || caseFacts.promoter_name || 'Shri Prem Pal Singh',
    TARGET_RESPONDENT_ADDRESS: caseFacts.target_respondent_address || 'House No. 1576, Sector 33, Chandigarh',
    RESPONDENT_CIN_REG: caseFacts.respondent_cin_reg || 'Registration No. 43/2017 (Partnership Firm)',
    RESPONDENT_PHONE: caseFacts.respondent_phone || '0172-2600000',
    RESPONDENT_MOBILE: caseFacts.respondent_mobile || '98XXXXXXXX',
    RESPONDENT_EMAIL: caseFacts.respondent_email || 'prhospitality@gmail.com',
    DISPUTED_QUANTUM: caseFacts.disputed_quantum || caseFacts.total_claim_admitted || '3,00,00,000',
    INTEREST_RATE: caseFacts.contractual_interest_rate || '18',
    AGREEMENT_DATE: caseFacts.agreement_date || '30.04.2017',
    AGREEMENT_TYPE: caseFacts.agreement_type || 'Commercial Lease Deed',
    DUE_DATE: caseFacts.payment_due_date || '01.04.2026',
    NOTICE_DATE: caseFacts.notice_date || '15.05.2026',
    SCHEDULE_PROPERTY_DESCRIPTION: caseFacts.schedule_property_description || 'Residential Property bearing House No. 1576, Sector 33, Chandigarh, measuring 1 Kanal (500 Sq. Yards)',
    SUB_REGISTRAR_JURISDICTION: caseFacts.sub_registrar_jurisdiction || 'Sub-Registrar / Estate Officer, UT Chandigarh',
    NATURE_OF_COMMERCIAL_DISPUTE: caseFacts.nature_of_commercial_dispute || 'Commercial lease arrears, unauthorized alterations and building misuse charges under Section 2(1)(c)(vii) of Commercial Courts Act, 2015',
    PLACE: caseFacts.place || 'Chandigarh',
    DATE: dateFormatted,
    ADVOCATE_NAME: caseFacts.advocate_name || 'Pradeep Bedi',
    ADVOCATE_ADDRESS: caseFacts.advocate_address || 'Advocate, Chamber No. 42, District Courts Complex, Chandigarh',
    DEPONENT_AGE: caseFacts.deponent_age || '48',
    DEPONENT_RESIDENCE: caseFacts.deponent_residence || 'House No. 1634, Sector 18-D, Chandigarh',
    DEPONENT_FATHER_NAME: caseFacts.deponent_father_name || 'Late Shri R.K. Grover',
    BOARD_RESOLUTION_DATE: caseFacts.board_resolution_date || '10.08.2026',
    LAST_FACT_PARA: '7',
    LEGAL_START_PARA: '8',
    LEGAL_END_PARA: '10',
    LEGAL_SERVICES_AUTHORITY_NAME: caseFacts.legal_services_authority_name || 'State Legal Services Authority / DLSA, Chandigarh',
    LEGAL_SERVICES_AUTHORITY_ADDRESS: caseFacts.legal_services_authority_address || 'New Additional Deluxe Building, Sector 9-D, Chandigarh',
    ACCRUED_INTEREST: caseFacts.accrued_interest || '58,54,000',
    TOTAL_SPECIFIED_VALUE: caseFacts.total_specified_value || '3,58,54,000',
    TOTAL_SPECIFIED_VALUE_WORDS: 'Three Crores Fifty-Eight Lakhs Fifty-Four Thousand Only',
    NON_STARTER_REPORT_NUMBER: `NSR/${now.getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`,
    FORM_1_APPLICATION_DATE: caseFacts.form_1_application_date || '01.06.2026',
    FIRST_NOTICE_APPEARANCE_DATE: caseFacts.first_notice_appearance_date || '20.06.2026',
    FINAL_NOTICE_APPEARANCE_DATE: caseFacts.final_notice_appearance_date || '05.07.2026',
    NOTICE_ISSUED_DATE: caseFacts.notice_issued_date || '05.06.2026',
    BANK_STATEMENT_PERIOD: '01.04.2025 to 31.03.2026',
    PROPERTY_RECORD_DATE: '12.09.2026',
    RESPONDENT_1_NAME: caseFacts.respondent_1_name || caseFacts.target_respondent_name || 'Shri Saral Maghan',
    RESPONDENT_1_ADDRESS: caseFacts.respondent_1_address || 'House No. 28, Sector 19-A, Chandigarh',
    RESPONDENT_1_MOBILE: caseFacts.respondent_1_mobile || '9216627666',
    RESPONDENT_1_EMAIL: caseFacts.respondent_1_email || 'saralmaghan@gmail.com',
    RESPONDENT_2_NAME: caseFacts.respondent_2_name || 'Shri Raman Maggo',
    RESPONDENT_2_ADDRESS: caseFacts.respondent_2_address || 'House No. A-13, Rama Park, Uttam Nagar, New Delhi',
    RESPONDENT_2_MOBILE: caseFacts.respondent_2_mobile || '9818138459',
    RESPONDENT_2_EMAIL: caseFacts.respondent_2_email || 'ramanmaggo22@gmail.com',
    RESPONDENT_3_NAME: caseFacts.respondent_3_name || 'Punjab Small Industries & Export Corporation Ltd. (PSIEC)',
    RESPONDENT_3_ADDRESS: caseFacts.respondent_3_address || 'Udyog Bhawan, Sector 17-A, Chandigarh',
    RESPONDENT_3_PHONE: caseFacts.respondent_3_phone || '0172-2704756',
    RESPONDENT_3_EMAIL: caseFacts.respondent_3_email || 'md-psiec@punjab.gov.in',
    REPLY_DATE: caseFacts.reply_date || '11.11.2023',
    EARNEST_MONEY_FORFEITED: caseFacts.earnest_money_forfeited || '2,00,01,000',
    BALANCE_CONSIDERATION: caseFacts.balance_consideration || '4,00,00,000',
    UNPAID_TRANSFER_FEE: caseFacts.unpaid_transfer_fee || '17,50,000',
    MESNE_PROFITS_MONTHLY: caseFacts.mesne_profits_monthly || '2,00,000',
    TOTAL_MESNE_PROFITS_DAMAGES: caseFacts.total_mesne_profits_damages || '1,00,00,000'
  };

  // Convert raw quantum to words if not explicitly given
  if (!defaults.DISPUTED_QUANTUM_WORDS) {
    const rawNum = parseFloat(String(defaults.DISPUTED_QUANTUM).replace(/,/g, ''));
    defaults.DISPUTED_QUANTUM_WORDS = numberToIndianWords(rawNum);
  }

  // Merge overrides
  const context = Object.assign({}, defaults, overrides);

  // Variable replacement
  let filledCount = 0;
  const filledText = templateContent.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
    if (context[key] !== undefined && context[key] !== '') {
      filledCount++;
      return context[key];
    }
    return match;
  });

  // Track remaining unfilled placeholders
  const remainingMatches = filledText.match(/\{\{([A-Z0-9_]+)\}\}/g) || [];
  const unfilledVars = Array.from(new Set(remainingMatches.map(m => m.replace(/[\{\}]/g, ''))));

  // Determine output draft directory
  const draftsDir = path.join(caseDir || process.cwd(), 'drafts');
  if (!fs.existsSync(draftsDir)) {
    fs.mkdirSync(draftsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').substring(0, 14);
  const draftFilename = `${templateMeta.slug}_${timestamp}.md`;
  const draftMdPath = path.join(draftsDir, draftFilename);

  fs.writeFileSync(draftMdPath, filledText, 'utf8');

  // Run statutory checklist validation on the generated draft
  const checklistDiagnostics = validateCommercialPleading(filledText, templateMeta.slug);

  return {
    success: true,
    template: templateMeta,
    draftPath: draftMdPath,
    draftName: draftFilename,
    filledCount,
    unfilledCount: unfilledVars.length,
    unfilledPlaceholders: unfilledVars,
    checklistDiagnostics
  };
}

/**
 * Validates a commercial court pleading against mandatory statutory checklists.
 * 
 * Rules:
 *   CC_01: Statement of Truth (Order VI Rule 15A verification)
 *   CC_02: Specific Schedule of Property (Order 38 Rule 5)
 *   CC_03: Section 12A Exemption Urgency Grounds (Patil Automation standard)
 *   CC_04: Sub-Registrar / Land Revenue Red Entry Notification Prayer
 *   CC_05: Order 39 Rule 3 Proviso 24-Hour Undertaking
 */
function validateCommercialPleading(content, formSlug) {
  const text = String(content || '');
  const issues = [];
  const slug = String(formSlug || '').toLowerCase();

  // Rule CC_01: Check for Statement of Truth verification
  if (slug.includes('truth') || slug.includes('order6')) {
    if (!text.includes('STATEMENT OF TRUTH') || !text.includes('Order VI Rule 15A')) {
      issues.push({
        ruleId: 'CC_01',
        severity: 'ERROR',
        message: 'Statement of Truth must explicitly reference Order VI Rule 15A CPC as amended by Commercial Courts Act, 2015.'
      });
    }
    if (!text.includes('Bharatiya Sakshya Adhiniyam') && !text.includes('65B') && !text.includes('Electronic Records')) {
      issues.push({
        ruleId: 'CC_01_E_RECORD',
        severity: 'WARNING',
        message: 'Statement of Truth lacks digital / electronic record verification clause (§ 63 BSA / § 65B EA).'
      });
    }
  }

  // Rule CC_02 & CC_04: Order 38 Rule 5 Attachment checks
  if (slug.includes('order38') || slug.includes('attachment')) {
    if (!text.includes('SCHEDULE OF PROPERTY') && !text.includes('Schedule of Property')) {
      issues.push({
        ruleId: 'CC_02',
        severity: 'ERROR',
        message: 'Order XXXVIII Rule 5 applications must contain a specific, identifiable Schedule of Property (not abstract assets).'
      });
    }
    if (!text.includes('Sub-Registrar') && !text.includes('Tehsildar') && !text.includes('red entry') && !text.includes('red note')) {
      issues.push({
        ruleId: 'CC_04',
        severity: 'WARNING',
        message: 'Recommended practice: Include a specific prayer directing the Sub-Registrar / Revenue Authority to record a lis-pendens red note.'
      });
    }
    if (!text.includes('Raman Tech') && !text.includes('obstruct or delay')) {
      issues.push({
        ruleId: 'CC_02_RAMAN_TECH',
        severity: 'WARNING',
        message: 'Grounds must satisfy the Raman Tech standard demonstrating active intent to obstruct or delay execution.'
      });
    }
  }

  // Rule CC_05: Order 39 Rule 3 Proviso compliance undertaking
  if (slug.includes('order39') || slug.includes('injunction')) {
    if (!text.includes('Order XXXIX Rule 3') && !text.includes('24 hours') && !text.includes('Rule 3 of Order XXXIX')) {
      issues.push({
        ruleId: 'CC_05',
        severity: 'ERROR',
        message: 'Applications for ad-interim ex-parte injunction must contain the mandatory undertaking under the proviso to Order XXXIX Rule 3 CPC (serving copies within 24 hours).'
      });
    }
  }

  // Rule CC_03: Section 12A PIMS Urgency Check
  if (slug.includes('urgency') || slug.includes('dispense')) {
    if (!text.includes('12A(1)') && !text.includes('Patil Automation')) {
      issues.push({
        ruleId: 'CC_03',
        severity: 'WARNING',
        message: 'Section 12A exemption application should cite the Section 12A(1) Proviso and Supreme Court dictum in Patil Automation.'
      });
    }
  }

  return {
    valid: issues.filter(i => i.severity === 'ERROR').length === 0,
    totalIssues: issues.length,
    issues
  };
}

module.exports = {
  listAvailableCommercialCourtForms,
  resolveCommercialCourtTemplate,
  draftCommercialCourtForm,
  validateCommercialPleading,
  numberToIndianWords,
  COMMERCIAL_FORMS_REGISTRY
};
