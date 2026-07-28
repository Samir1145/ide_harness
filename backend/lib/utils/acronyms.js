/**
 * Comprehensive Acronym & Legal Term Normalizer for Hayagriva
 * Maps Indian Insolvency & Bankruptcy Code (IBC), NCLT/NCLAT, Corporate, and Financial acronyms
 * to their full expanded terms and vice versa.
 */

const LEGAL_ACRONYM_MAP = {
    // Core Insolvency Processes
    'cirp': 'corporate insolvency resolution process',
    'cilp': 'corporate insolvency liquidation process',
    'civlp': 'corporate insolvency voluntary liquidation process',
    'pg2cd': 'personal guarantor to corporate debtor',
    'pg': 'personal guarantor',
    'ppirp': 'pre packaged insolvency resolution process',
    'prepack': 'pre packaged insolvency resolution process',
    'fasttrack': 'fast track insolvency resolution process',

    // Key Entities & Roles
    'cd': 'corporate debtor',
    'fc': 'financial creditor',
    'oc': 'operational creditor',
    'irp': 'interim resolution professional',
    'rp': 'resolution professional',
    'ra': 'resolution applicant',
    'pra': 'prospective resolution applicant',
    'ip': 'insolvency professional',
    'ipa': 'insolvency professional agency',
    'iu': 'information utility',
    'coc': 'committee of creditors',
    'scc': 'stakeholders consultation committee',
    'val': 'registered valuer',

    // Documents & Filings
    'im': 'information memorandum',
    'rfrp': 'request for resolution plans',
    'em': 'evaluation matrix',
    'eoi': 'expression of interest',
    'rfp': 'request for proposal',
    'loi': 'letter of intent',
    'loa': 'letter of award',
    'nod': 'notice of default',
    'slp': 'special leave petition',
    'ca': 'chartered accountant',
    'cs': 'company secretary',
    'cma': 'cost and management accountant',

    // Avoidance & PUFE Transactions
    'pufe': 'preferential undervalued defrauding extortionate transactions',
    'pref': 'preferential transaction section 43',
    'uv': 'undervalued transaction section 45',
    'extortionate': 'extortionate credit transaction section 50',
    'fraudulent': 'fraudulent or wrongful trading section 66',

    // Regulators & Tribunals
    'ibbi': 'insolvency and bankruptcy board of india',
    'nclt': 'national company law tribunal',
    'nclat': 'national company law appellate tribunal',
    'sc': 'supreme court of india',
    'sci': 'supreme court of india',
    'hc': 'high court',
    'rbi': 'reserve bank of india',
    'sebi': 'securities and exchange board of india',
    'mca': 'ministry of corporate affairs',
    'drt': 'debt recovery tribunal',
    'drat': 'debt recovery appellate tribunal',
    'sfio': 'serious fraud investigation office',
    'ed': 'enforcement directorate',
    'cbi': 'central bureau of investigation',

    // Banking & Financial Terms
    'npa': 'non performing asset',
    'ncd': 'non convertible debenture',
    'ots': 'one time settlement',
    'cdr': 'corporate debt restructuring',
    'sdr': 'strategic debt restructuring',
    's4a': 'scheme for sustainable structuring of stressed assets',
    'sarfaesi': 'securitisation and reconstruction of financial assets and enforcement of security interest',
    'arc': 'asset reconstruction company',
    'crilc': 'central repository of information on large credits',
    'cibil': 'credit information bureau india limited',

    // Acts & Rules
    'ibc': 'insolvency and bankruptcy code',
    'ca2013': 'companies act 2013',
    'llp': 'limited liability partnership',
    'msme': 'micro small and medium enterprise'
};

// Reverse map for full-phrase to acronym lookup
const REVERSE_ACRONYM_MAP = {};
for (const [acronym, fullForm] of Object.entries(LEGAL_ACRONYM_MAP)) {
    REVERSE_ACRONYM_MAP[fullForm] = acronym;
}

/**
 * Normalizes text by expanding known legal acronyms while retaining word boundaries.
 * Example: "draft cirp c10 for cd" -> "draft corporate insolvency resolution process c10 for corporate debtor"
 */
function expandAcronyms(text) {
    if (!text) return '';
    let normalized = text.toLowerCase();

    for (const [acronym, fullForm] of Object.entries(LEGAL_ACRONYM_MAP)) {
        const regex = new RegExp(`\\b${acronym}\\b`, 'gi');
        normalized = normalized.replace(regex, fullForm);
    }
    return normalized;
}

/**
 * Extracts matching process category key ('cirp', 'liquidation', 'voluntary_liquidation', 'personal_guarantor', 'prepack')
 * from user text, supporting both short acronyms and long statutory titles.
 */
function defMatchCategory(text) {
    if (!text) return null;
    const lower = text.toLowerCase();

    if (/\b(cirp|corporate insolvency resolution process)\b/i.test(lower)) {
        return 'cirp';
    }
    if (/\b(cilp|liquidation|corporate insolvency liquidation process)\b/i.test(lower)) {
        return 'liquidation';
    }
    if (/\b(civlp|voluntary liquidation|corporate insolvency voluntary liquidation process)\b/i.test(lower)) {
        return 'voluntary_liquidation';
    }
    if (/\b(pg2cd|pg|personal guarantor|personal guarantor to corporate debtor|part iii)\b/i.test(lower)) {
        return 'personal_guarantor';
    }
    if (/\b(ppirp|prepack|pre-packaged|pre packaged)\b/i.test(lower)) {
        return 'prepack';
    }
    return null;
}

module.exports = {
    LEGAL_ACRONYM_MAP,
    REVERSE_ACRONYM_MAP,
    expandAcronyms,
    defMatchCategory
};
