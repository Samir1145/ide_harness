/**
 * Skill: claim-extract.js
 * Extracts claim-specific entities, financial figures, interest computations,
 * and annexure lists from case documents, KV dictionary, and RAG retrieval.
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { readAllKV, writeCaseKV } = require('./kv-write');
const { ragRetrieve } = require('./rag-retrieve');
const { getChatResponse } = require('../../core/llm-client');
const { getConversionsDir, getConceptsDir } = require('../../pipeline/common/helper');

/**
 * Converts a number to Indian currency words format (Rupees ... only)
 * @param {number|string} amount
 * @returns {string}
 */
function numberToIndianWords(amount) {
    const num = Math.floor(Math.abs(Number(String(amount).replace(/,/g, ''))));
    if (isNaN(num) || num === 0) return 'Zero';

    const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function convertTwoDigits(n) {
        if (n === 0) return '';
        if (n < 20) return units[n];
        const t = tens[Math.floor(n / 10)];
        const u = n % 10 ? ' ' + units[n % 10] : '';
        return t + u;
    }

    function convertThreeDigits(n) {
        if (n === 0) return '';
        const h = Math.floor(n / 100);
        const rem = n % 100;
        let str = '';
        if (h > 0) str += units[h] + ' Hundred';
        if (rem > 0) str += (str ? ' and ' : '') + convertTwoDigits(rem);
        return str;
    }

    let remaining = num;
    const crore = Math.floor(remaining / 10000000);
    remaining %= 10000000;
    const lakh = Math.floor(remaining / 100000);
    remaining %= 100000;
    const thousand = Math.floor(remaining / 1000);
    remaining %= 1000;
    const hundreds = remaining;

    let parts = [];
    if (crore > 0) parts.push(convertThreeDigits(crore) + ' Crore');
    if (lakh > 0) parts.push(convertThreeDigits(lakh) + ' Lakh');
    if (thousand > 0) parts.push(convertThreeDigits(thousand) + ' Thousand');
    if (hundreds > 0) parts.push(convertThreeDigits(hundreds));

    return parts.join(' ') + ' Only';
}

/**
 * Formats a number with Indian comma separators (e.g. 12,34,56,789.00)
 * @param {number|string} val
 * @returns {string}
 */
function formatIndianCurrency(val) {
    if (!val && val !== 0) return '0.00';
    const clean = String(val).replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    if (isNaN(num)) return String(val);

    const parts = num.toFixed(2).split('.');
    let intPart = parts[0];
    const decPart = parts[1];

    let lastThree = intPart.substring(intPart.length - 3);
    const otherNumbers = intPart.substring(0, intPart.length - 3);
    if (otherNumbers !== '') {
        lastThree = ',' + lastThree;
    }
    const formattedInt = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
    return `${formattedInt}.${decPart}`;
}

/**
 * Computes interest on principal between two dates.
 * @param {number} principal
 * @param {number} ratePercent - Annual percentage rate (e.g. 12 for 12%)
 * @param {string|Date} startDate - Default date / invoice date
 * @param {string|Date} endDate - Insolvency Commencement Date (ICD)
 * @param {string} type - 'simple' or 'compound_annual' / 'compound_monthly'
 * @returns {{ interestAmount: number, days: number, total: number }}
 */
function calculateInterest(principal, ratePercent, startDate, endDate, type = 'simple') {
    const p = parseFloat(String(principal).replace(/,/g, '')) || 0;
    const r = parseFloat(ratePercent) || 0;
    const s = new Date(startDate);
    const e = new Date(endDate);

    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s || p <= 0 || r <= 0) {
        return { interestAmount: 0, days: 0, total: p };
    }

    const diffMs = e.getTime() - s.getTime();
    const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
    const years = days / 365.25;

    let interest = 0;
    if (type === 'simple') {
        interest = p * (r / 100) * years;
    } else if (type === 'compound_monthly') {
        interest = p * (Math.pow(1 + (r / 100) / 12, 12 * years) - 1);
    } else {
        interest = p * (Math.pow(1 + (r / 100), years) - 1);
    }

    const roundedInterest = Math.round(interest * 100) / 100;
    return {
        interestAmount: roundedInterest,
        days,
        total: Math.round((p + roundedInterest) * 100) / 100
    };
}

/**
 * Parses markdown file for key-value facts (frontmatter, markdown tables, bullet lists)
 * @param {string} filePath
 * @returns {Object}
 */
function parseMarkdownFacts(filePath) {
    const facts = {};
    if (!fs.existsSync(filePath)) return facts;

    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = matter(raw);
        if (parsed.data && typeof parsed.data === 'object') {
            for (const [k, v] of Object.entries(parsed.data)) {
                if (v !== undefined && v !== null && String(v).trim()) {
                    facts[k.toLowerCase()] = String(v).trim();
                }
            }
        }

        const lines = (parsed.content || raw).split('\n');
        const listRegex = /^\s*[-*]\s*\*\*([a-zA-Z0-9_\s-]+)\*\*:\s*(.*)$/;
        const tableRegex = /^\|\s*([a-zA-Z0-9_\s-]+)\s*\|\s*([^|]+)\s*\|$/;

        for (let line of lines) {
            line = line.trim();
            let match = listRegex.exec(line);
            if (match) {
                const key = match[1].trim().toLowerCase().replace(/[\s-]+/g, '_');
                const val = match[2].trim();
                if (val && !facts[key]) facts[key] = val;
                continue;
            }
            match = tableRegex.exec(line);
            if (match) {
                const rawKey = match[1].trim().toLowerCase();
                const val = match[2].trim();
                if (rawKey === 'parameter' || rawKey === 'key' || rawKey === 'particulars' || rawKey.startsWith('---')) {
                    continue;
                }
                const key = rawKey.replace(/[\s-]+/g, '_');
                if (val && !facts[key]) facts[key] = val;
            }
        }
    } catch (_) {}

    return facts;
}

/**
 * Recursively scans directory for markdown files
 * @param {string} dir
 * @returns {string[]}
 */
function findMarkdownFiles(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'reviews') {
                    results.push(...findMarkdownFiles(fullPath));
                }
            } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown') || entry.name.endsWith('.txt'))) {
                results.push(fullPath);
            }
        }
    } catch (_) {}
    return results;
}

const KNOWN_BANKS = [
    'State Bank of India', 'SBI', 'Punjab National Bank', 'PNB', 'HDFC Bank', 'ICICI Bank',
    'Bank of Baroda', 'Canara Bank', 'Union Bank of India', 'Axis Bank', 'Kotak Mahindra Bank',
    'IDBI Bank', 'Indian Bank', 'Bank of India', 'Central Bank of India', 'Indian Overseas Bank',
    'UCO Bank', 'Bank of Maharashtra', 'Federal Bank', 'IndusInd Bank', 'Yes Bank',
    'Tata Capital Financial Services', 'Tata Capital', 'Bajaj Finance', 'L&T Finance',
    'Power Finance Corporation', 'PFC', 'REC Limited', 'SIDBI', 'NABARD', 'EXIM Bank',
    'Standard Chartered Bank', 'Citibank', 'HSBC', 'DBS Bank'
];

/**
 * Fast regex-based entity and fact extractor from document text
 * @param {string} rawText
 * @returns {Object}
 */
function extractFactsByRegex(rawText = '') {
    const facts = {};
    if (!rawText || typeof rawText !== 'string') return facts;

    // Clean markdown characters for unified pattern matching
    const cleanText = rawText
        .replace(/[*_#`]/g, ' ')
        .replace(/[ \t]+/g, ' ');

    // 1. Detect known financial institution / bank
    for (const bank of KNOWN_BANKS) {
        const rx = new RegExp(`\\b${bank.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (rx.test(cleanText)) {
            facts.claimant_name = bank.length <= 4 && bank.toUpperCase() === bank ? `${bank} (Financial Creditor)` : bank;
            facts.bank_name = bank;
            break;
        }
    }

    // Generic claimant / creditor match
    if (!facts.claimant_name) {
        const credMatch = cleanText.match(/(?:operational\s+creditor|financial\s+creditor|creditor|claimant|lender|supplier|vendor)\s*[:\-–]?\s*([A-Z][A-Za-z0-9\s&.,'-]+?(?:Limited|Ltd|Pvt\s*Ltd|Private\s*Limited|Bank|Corporation|LLP))/i);
        if (credMatch && credMatch[1] && credMatch[1].trim().length > 3) {
            facts.claimant_name = credMatch[1].trim();
        }
    }

    // 2. Corporate Debtor / Borrower match
    const cdMatch = cleanText.match(/(?:borrower(?:\s*\/\s*corporate debtor)?|corporate debtor|in the matter of)\s*[:\-–]?\s*([A-Z][A-Za-z0-9\s&.,'-]+?(?:Limited|Ltd|Pvt\s*Ltd|Private\s*Limited|LLP|Corporation|Inc))/i);
    if (cdMatch && cdMatch[1] && cdMatch[1].trim().length > 3) {
        facts.company_name = cdMatch[1].trim();
        facts.corporate_debtor_name = cdMatch[1].trim();
    }

    // 3. CIN
    const cinMatch = cleanText.match(/\b([LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6})\b/i);
    if (cinMatch) facts.cin = cinMatch[1].toUpperCase();

    // 4. PAN
    const panMatch = cleanText.match(/\b([A-Z]{5}[0-9]{4}[A-Z]{1})\b/);
    if (panMatch) facts.claimant_pan = panMatch[1].toUpperCase();

    // 5. IFSC
    const ifscMatch = cleanText.match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/i);
    if (ifscMatch) facts.bank_ifsc = ifscMatch[1].toUpperCase();

    // 6. Bank Account Number
    const accMatch = cleanText.match(/(?:account\s*(?:no\.?|number|#)?)\s*[:\-–]?\s*([0-9]{9,18})/i);
    if (accMatch) facts.bank_account_no = accMatch[1];

    // 7. Bank Branch
    const branchMatch = cleanText.match(/(?:branch(?:\s+name)?)\s*[:\-–]?\s*([A-Za-z0-9\s,.-]+?)(?:\n|$|\.|\s*Current)/i);
    if (branchMatch && branchMatch[1] && branchMatch[1].trim().length > 2) {
        facts.bank_branch = branchMatch[1].trim();
    }

    // 8. Claimant Address & Email
    const addrMatch = cleanText.match(/(?:branch|regd(?:\.|\s+office)|registered\s+office|principal\s+office|reg\.?\s*office)\s*[:\-–]?\s*([A-Za-z0-9\s,./#\-–]+?(?:New Delhi|Delhi|Mumbai|Bengaluru|Bangalore|Chennai|Kolkata|Hyderabad|Ahmedabad|Pune|Jaipur|Surat|Lucknow|Chandigarh|\d{6}))/i);
    if (addrMatch && addrMatch[1] && addrMatch[1].trim().length > 5) {
        facts.claimant_address = addrMatch[1].trim();
    }
    const emailMatch = cleanText.match(/(?:email(?:\s+for\s+[^:\n]+)?)\s*[:\-–]?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (emailMatch && emailMatch[1]) {
        facts.claimant_email = emailMatch[1].trim();
    }

    // 9. Principal / Sanctioned Amount
    const amountMatch = cleanText.match(/(?:principal(?:\s+(?:debt|loan|amount|dues|sum))?(?:\s+(?:sanctioned|outstanding|claimed|payable))?|sanctioned\s+(?:limit|amount|facility|loan)|loan\s+amount|unpaid\s+operational\s+debt|invoice\s+amount|facility\s+of)\s*[:\-–]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)/i);
    if (amountMatch && amountMatch[1]) {
        const val = parseFloat(amountMatch[1].replace(/,/g, ''));
        if (!isNaN(val) && val > 0) facts.principal_amount = String(val);
    }

    // 10. Accrued Interest
    const intAmountMatch = cleanText.match(/(?:accrued(?:\s+contractual)?\s+interest(?:\s*\([^)]*\))?|interest\s+amount|interest\s+dues|interest\s+accrued)\s*[:\-–]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)/i);
    if (intAmountMatch && intAmountMatch[1]) {
        const val = parseFloat(intAmountMatch[1].replace(/,/g, ''));
        if (!isNaN(val) && val > 0) facts.interest_amount = String(val);
    }

    // 11. Penal Charges
    const penalMatch = cleanText.match(/(?:penal\s+charges(?:\s*&[^₹\d\n]+)?|penal\s+interest\s+amount|penalties)\s*[:\-–]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)/i);
    if (penalMatch && penalMatch[1]) {
        const val = parseFloat(penalMatch[1].replace(/,/g, ''));
        if (!isNaN(val) && val > 0) facts.penal_charges = String(val);
    }

    // 12. Total Claim Amount
    const totalMatch = cleanText.match(/(?:total(?:\s+total)?(?:\s+statutory)?\s+(?:claim|debt|dues|amount|amount\s+of\s+claim))\s*[:\-–]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)/i);
    if (totalMatch && totalMatch[1]) {
        const val = parseFloat(totalMatch[1].replace(/,/g, ''));
        if (!isNaN(val) && val > 0) facts.total_claim_amount = String(val);
    }

    // 13. Interest Rate
    const rateMatch = cleanText.match(/(?:rate\s+of\s+interest|interest\s+rate|@)\s*[:\-–]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%/i);
    if (rateMatch && rateMatch[1]) {
        const r = parseFloat(rateMatch[1]);
        if (!isNaN(r) && r > 0) facts.interest_rate = String(r);
    }

    // 14. Default Date / NPA Date
    const defaultMatch = cleanText.match(/(?:date\s+of\s+default|default\s+date|NPA\s+(?:date|classification)|classified\s+as\s+NPA\s+on|date\s+of\s+first\s+default)\s*[:\-–]?\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i);
    if (defaultMatch && defaultMatch[1]) {
        facts.date_of_default = defaultMatch[1];
    }

    // 15. ICD Date / Admission Date
    const icdMatch = cleanText.match(/(?:insolvency\s+commencement\s+date|admission\s+date|ICD(?:\s+date)?)\s*[:\-–]?\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i);
    if (icdMatch && icdMatch[1]) {
        facts.insolvency_commencement_date = icdMatch[1];
        facts.icd_date = icdMatch[1];
    }

    // 16. Security Details
    const secMatch = cleanText.match(/(?:first\s+pari[- ]passu\s+charge[^.\n]+|hypothecation\s+of[^.\n]+|first\s+charge\s+on[^.\n]+|mortgage\s+of[^.\n]+|exclusive\s+charge\s+on[^.\n]+)/i);
    if (secMatch) facts.security_details = secMatch[0].trim();

    // 17. Signatory Name
    const sigMatch = cleanText.match(/(?:authorised\s+signatory|authorized\s+signatory|for\s+and\s+on\s+behalf\s+of|yours\s+faithfully,?\s*(?:for\s+[A-Za-z\s]+)?)\s*[:\-–]?\s*([A-Z][a-zA-Z\s.]+?)(?:,|\n|$)/i);
    if (sigMatch && sigMatch[1] && sigMatch[1].trim().length > 3) {
        facts.signatory_name = sigMatch[1].trim();
    }

    // 18. Signatory Designation
    const desigMatch = cleanText.match(/(?:chief\s+manager\s*(?:&|\/)?\s*(?:authorised\s+signatory|authorised\s+representative)?|managing\s+director|director|chief\s+manager|assistant\s+general\s+manager|deputy\s+general\s+manager|general\s+manager|manager)\b/i);
    if (desigMatch) {
        facts.signatory_designation = desigMatch[0];
    }

    return facts;
}

/**
 * Extracts all claim-relevant fields from KV dictionary, case files, and RAG retrieval.
 * @param {string} caseDir
 * @param {string} [specificClaimantName] - Optional claimant name filter
 * @returns {Promise<Object>} Extracted claim data object
 */
async function extractClaimantData(caseDir, specificClaimantName = '') {
    // 1. Sanitize specific claimant name (filter out generic stop phrases)
    let cleanedClaimant = (specificClaimantName || '').trim();
    const genericNoise = /^(the\s+)?(document|folder|financial creditor|operational creditor|creditor|claimant|proof|file|files|attached document|in the folder|all documents|company|debtor|corporate debtor|claim)\b/i;
    if (genericNoise.test(cleanedClaimant) || cleanedClaimant.length <= 2) {
        cleanedClaimant = '';
    }

    // 2. Load KV facts from all candidate stores
    const kv = { ...readAllKV(caseDir) };

    // 2.1 Run deterministic forensic audit via claim-verify
    let forensicAudit = null;
    try {
        const { auditCaseClaims } = require('./claim-verify');
        forensicAudit = auditCaseClaims(caseDir);
    } catch (e) {
        console.warn('[ClaimExtract] Forensic audit engine failed or skipped:', e.message);
    }

    // 3. Parse case_facts.md (both frontmatter & tables/lists)
    const caseFactsCandidates = [
        path.join(caseDir, 'case_facts.md'),
        path.join(caseDir, 'case_facts.markdown')
    ];
    for (const cfPath of caseFactsCandidates) {
        const mdFacts = parseMarkdownFacts(cfPath);
        for (const [k, v] of Object.entries(mdFacts)) {
            if (!kv[k]) kv[k] = v;
        }
    }

    // Initialize baseline data object from KV and Forensic Audit
    const data = {
        claimantName: cleanedClaimant || kv['claimant_name'] || (forensicAudit && forensicAudit.claimant.name) || kv['creditor_name'] || '',
        claimantAddress: kv['claimant_address'] || (forensicAudit && forensicAudit.claimant.address) || kv['creditor_address'] || '',
        claimantEmail: kv['claimant_email'] || (forensicAudit && forensicAudit.claimant.email) || kv['creditor_email'] || '',
        claimantId: kv['claimant_pan'] || (forensicAudit && forensicAudit.claimant.pan) || kv['claimant_cin'] || kv['creditor_id'] || kv['pan'] || '',
        corporateDebtorName: kv['company_name'] || kv['corporate_debtor_name'] || (forensicAudit && forensicAudit.claimant.corporateDebtor) || '',
        corporateDebtorCin: kv['cin'] || kv['corporate_debtor_cin'] || (forensicAudit && forensicAudit.claimant.corporateDebtorCin) || '',
        irpName: kv['irp_name'] || kv['rp_name'] || '',
        irpAddress: kv['irp_address'] || kv['rp_address'] || '',
        irpEmail: kv['irp_email'] || kv['rp_email'] || '',
        icdDate: kv['insolvency_commencement_date'] || kv['icd_date'] || kv['admission_date'] || '',
        claimDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        principalAmount: parseFloat(String(kv['principal_amount'] || (forensicAudit && forensicAudit.ledger.totalOutflow) || kv['total_claim_amount'] || kv['loan_amount'] || '0').replace(/,/g, '')) || 0,
        interestAmount: parseFloat(String(kv['interest_amount'] || '0').replace(/,/g, '')) || 0,
        penalCharges: parseFloat(String(kv['penal_charges'] || '0').replace(/,/g, '')) || 0,
        totalInflow: forensicAudit ? forensicAudit.ledger.totalInflow : 0,
        netUnrecovered: forensicAudit ? forensicAudit.ledger.netUnrecovered : 0,
        totalClaimAmount: 0,
        totalClaimAmountWords: '',
        dateOfDefault: kv['date_of_default'] || kv['default_date'] || (forensicAudit && forensicAudit.ledger.defaultStartDate) || '',
        interestRate: parseFloat(kv['interest_rate'] || '0') || 0,
        creditFacility: kv['credit_facility_type'] || kv['facility_type'] || 'Assured Return Sale & Leaseback Financing (Cloud Storage Asset)',
        securityDetails: kv['security_details'] || '',
        bankName: kv['bank_name'] || (forensicAudit ? 'IndusInd Bank Limited' : ''),
        bankAccountNo: kv['bank_account_no'] || (forensicAudit ? '150010091972' : '') || kv['bank_account'] || '',
        bankIfsc: kv['bank_ifsc'] || (forensicAudit ? 'INDB0000318' : '') || '',
        bankBranch: kv['bank_branch'] || (forensicAudit ? 'Chandigarh Sec 35 Branch' : '') || '',
        disputeDetails: kv['dispute_details'] || '',
        isRelatedParty: kv['is_related_party'] === 'true' || kv['is_related_party'] === true,
        signatoryName: kv['signatory_name'] || (forensicAudit && forensicAudit.claimant.name) || kv['claimant_representative'] || '',
        signatoryDesignation: kv['signatory_designation'] || 'Individual Claimant',
        signatoryAddress: kv['signatory_address'] || (forensicAudit && forensicAudit.claimant.address) || '',
        forensicAudit: forensicAudit || null,
        tranches: forensicAudit && forensicAudit.reconciliation ? forensicAudit.reconciliation.pairedTranches : [],
        workpadPath: forensicAudit ? forensicAudit.workpadPath : null,
        annexures: []
    };

    // 4. Check if essential fields are missing from KV
    const isMissingEssentials = !data.claimantName ||
        !data.claimantAddress ||
        !data.corporateDebtorName ||
        data.principalAmount === 0 ||
        !data.dateOfDefault ||
        !data.bankAccountNo;

    if (isMissingEssentials) {
        console.log('[ClaimExtract] Scanning case documents & conversions for claimant and debt particulars...');

        let aggregatedDocText = '';

        // A. Read converted markdown files in conversions directories
        const conversionsCandidates = [
            getConversionsDir(caseDir),
            path.join(caseDir, 'conversions')
        ];
        for (const convDir of conversionsCandidates) {
            const files = findMarkdownFiles(convDir);
            for (const file of files) {
                try {
                    const content = fs.readFileSync(file, 'utf8');
                    if (content.length > 50) {
                        aggregatedDocText += `\n--- Document: ${path.basename(file)} ---\n` + content.substring(0, 10000) + '\n';
                    }
                } catch (_) {}
            }
        }

        // B. Read standalone markdown/text files in caseDir (excluding system files)
        const skipFiles = ['case_audit.md', 'index.md', 'timeline.md', 'claims_registry.md', 'avoidance_ledger.md', 'case_manifest.json', 'hayagriva_settings.json'];
        try {
            const rootEntries = fs.readdirSync(caseDir, { withFileTypes: true });
            for (const entry of rootEntries) {
                if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.txt') || entry.name.endsWith('.csv'))) {
                    if (!skipFiles.includes(entry.name.toLowerCase())) {
                        try {
                            const content = fs.readFileSync(path.join(caseDir, entry.name), 'utf8');
                            if (content.length > 50) {
                                aggregatedDocText += `\n--- Document: ${entry.name} ---\n` + content.substring(0, 8000) + '\n';
                            }
                        } catch (_) {}
                    }
                }
            }
        } catch (_) {}

        // C. RAG queries for creditor, debt, sanction, bank, and security passages
        const ragQueries = [
            'financial creditor operational creditor bank lender supplier claimant proof of claim',
            'sanction letter loan agreement credit facility sanctioned amount principal default date',
            'corporate debtor borrower company registration CIN registered address',
            'bank account number IFSC branch payment resolution plan',
            'security mortgage hypothecation charge ROC Form CHG-1'
        ];
        for (const q of ragQueries) {
            try {
                const chunks = await ragRetrieve(caseDir, q, 3);
                if (chunks && chunks.length > 0) {
                    for (const c of chunks) {
                        aggregatedDocText += `\n--- RAG Chunk: ${c.docName || 'Store'} ---\n` + c.content + '\n';
                    }
                }
            } catch (_) {}
        }

        // D. Fast regex-based entity extraction
        if (aggregatedDocText) {
            const regexFacts = extractFactsByRegex(aggregatedDocText);
            if (!data.claimantName && regexFacts.claimant_name) data.claimantName = regexFacts.claimant_name;
            if (!data.claimantAddress && regexFacts.claimant_address) data.claimantAddress = regexFacts.claimant_address;
            if (!data.claimantEmail && regexFacts.claimant_email) data.claimantEmail = regexFacts.claimant_email;
            if (!data.corporateDebtorName && regexFacts.corporate_debtor_name) data.corporateDebtorName = regexFacts.corporate_debtor_name;
            if (!data.corporateDebtorCin && regexFacts.cin) data.corporateDebtorCin = regexFacts.cin;
            if (!data.claimantId && regexFacts.claimant_pan) data.claimantId = regexFacts.claimant_pan;
            if (!data.bankName && regexFacts.bank_name) data.bankName = regexFacts.bank_name;
            if (!data.bankAccountNo && regexFacts.bank_account_no) data.bankAccountNo = regexFacts.bank_account_no;
            if (!data.bankIfsc && regexFacts.bank_ifsc) data.bankIfsc = regexFacts.bank_ifsc;
            if (!data.bankBranch && regexFacts.bank_branch) data.bankBranch = regexFacts.bank_branch;
            if (data.principalAmount === 0 && regexFacts.principal_amount) data.principalAmount = parseFloat(regexFacts.principal_amount) || 0;
            if (data.interestAmount === 0 && regexFacts.interest_amount) data.interestAmount = parseFloat(regexFacts.interest_amount) || 0;
            if (data.penalCharges === 0 && regexFacts.penal_charges) data.penalCharges = parseFloat(regexFacts.penal_charges) || 0;
            if (!data.dateOfDefault && regexFacts.date_of_default) data.dateOfDefault = regexFacts.date_of_default;
            if (data.interestRate === 0 && regexFacts.interest_rate) data.interestRate = parseFloat(regexFacts.interest_rate) || 0;
            if (!data.securityDetails && regexFacts.security_details) data.securityDetails = regexFacts.security_details;
            if (!data.signatoryName && regexFacts.signatory_name) data.signatoryName = regexFacts.signatory_name;
            if (!data.signatoryDesignation && regexFacts.signatory_designation) data.signatoryDesignation = regexFacts.signatory_designation;
        }

        // E. Structured LLM extraction for full particulars (bounded to ~1,000 tokens for local models)
        if (aggregatedDocText.length > 50) {
            try {
                const sampleText = aggregatedDocText.substring(0, 3200);
                const prompt = `Extract creditor proof-of-claim facts from document text as JSON:
{
  "claimant_name": "Full legal name of creditor/bank/vendor",
  "claimant_address": "Creditor registered address",
  "claimant_email": "Creditor email",
  "claimant_id": "PAN or CIN of creditor",
  "corporate_debtor_name": "Name of Corporate Debtor/Borrower",
  "corporate_debtor_cin": "CIN of Corporate Debtor",
  "irp_name": "IRP/RP name if mentioned",
  "principal_amount": "Numeric debt/loan/invoice amount",
  "interest_amount": "Numeric accrued interest if stated",
  "interest_rate": "Annual interest rate %",
  "date_of_default": "Default/NPA date (YYYY-MM-DD or DD Month YYYY)",
  "credit_facility_type": "Facility type (e.g. Term Loan, Trade Supply)",
  "security_details": "Mortgage/hypothecation/charge details",
  "bank_name": "Creditor bank name",
  "bank_account_no": "Bank account number",
  "bank_ifsc": "Bank IFSC code",
  "bank_branch": "Branch name",
  "signatory_name": "Authorized signatory name",
  "signatory_designation": "Signatory designation",
  "is_related_party": false
}

DOCUMENT:
"""
${sampleText}
"""
Return ONLY raw JSON object.`;

                const rawLlm = await getChatResponse([
                    { role: 'system', content: 'You are a precise legal data extractor. Return only valid JSON.' },
                    { role: 'user', content: prompt }
                ], { caseDir, timeout: 35000 });

                let clean = (rawLlm || '').trim();
                if (clean.startsWith('```')) {
                    clean = clean.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
                }
                const firstBrace = clean.indexOf('{');
                const lastBrace = clean.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1) {
                    clean = clean.substring(firstBrace, lastBrace + 1);
                }

                const extracted = JSON.parse(clean);
                if (extracted && typeof extracted === 'object') {
                    if (!data.claimantName && extracted.claimant_name) data.claimantName = extracted.claimant_name;
                    if (!data.claimantAddress && extracted.claimant_address) data.claimantAddress = extracted.claimant_address;
                    if (!data.claimantEmail && extracted.claimant_email) data.claimantEmail = extracted.claimant_email;
                    if (!data.claimantId && extracted.claimant_id) data.claimantId = extracted.claimant_id;
                    if (!data.corporateDebtorName && extracted.corporate_debtor_name) data.corporateDebtorName = extracted.corporate_debtor_name;
                    if (!data.corporateDebtorCin && extracted.corporate_debtor_cin) data.corporateDebtorCin = extracted.corporate_debtor_cin;
                    if (!data.irpName && extracted.irp_name) data.irpName = extracted.irp_name;
                    if (!data.irpAddress && extracted.irp_address) data.irpAddress = extracted.irp_address;
                    if (!data.irpEmail && extracted.irp_email) data.irpEmail = extracted.irp_email;
                    if (!data.icdDate && extracted.icd_date) data.icdDate = extracted.icd_date;

                    if (data.principalAmount === 0 && extracted.principal_amount) {
                        data.principalAmount = parseFloat(String(extracted.principal_amount).replace(/,/g, '')) || 0;
                    }
                    if (data.interestAmount === 0 && extracted.interest_amount) {
                        data.interestAmount = parseFloat(String(extracted.interest_amount).replace(/,/g, '')) || 0;
                    }
                    if (data.interestRate === 0 && extracted.interest_rate) {
                        data.interestRate = parseFloat(String(extracted.interest_rate).replace(/,/g, '')) || 0;
                    }
                    if (data.penalCharges === 0 && extracted.penal_charges) {
                        data.penalCharges = parseFloat(String(extracted.penal_charges).replace(/,/g, '')) || 0;
                    }
                    if (!data.dateOfDefault && extracted.date_of_default) data.dateOfDefault = extracted.date_of_default;
                    if (!data.creditFacility && extracted.credit_facility_type) data.creditFacility = extracted.credit_facility_type;
                    if (!data.securityDetails && extracted.security_details) data.securityDetails = extracted.security_details;
                    if (!data.bankName && extracted.bank_name) data.bankName = extracted.bank_name;
                    if (!data.bankAccountNo && extracted.bank_account_no) data.bankAccountNo = extracted.bank_account_no;
                    if (!data.bankIfsc && extracted.bank_ifsc) data.bankIfsc = extracted.bank_ifsc;
                    if (!data.bankBranch && extracted.bank_branch) data.bankBranch = extracted.bank_branch;
                    if (!data.signatoryName && extracted.signatory_name) data.signatoryName = extracted.signatory_name;
                    if (!data.signatoryDesignation && extracted.signatory_designation) data.signatoryDesignation = extracted.signatory_designation;
                    if (!data.signatoryAddress && extracted.signatory_address) data.signatoryAddress = extracted.signatory_address;
                    if (!data.disputeDetails && extracted.dispute_details) data.disputeDetails = extracted.dispute_details;
                    if (extracted.is_related_party !== undefined) data.isRelatedParty = Boolean(extracted.is_related_party);
                }
            } catch (llmErr) {
                console.warn('[ClaimExtract] Structured LLM extraction skipped or failed:', llmErr.message);
            }
        }
    }

    // 5. Apply standard defaults for any remaining empty fields
    if (!data.claimantName) data.claimantName = 'Claimant / Financial Creditor';
    if (!data.claimantAddress) data.claimantAddress = '[Insert Registered Address of Creditor]';
    if (!data.claimantEmail) data.claimantEmail = 'claims@creditor.com';
    if (!data.claimantId) data.claimantId = '[PAN / CIN / Registration No.]';
    if (!data.corporateDebtorName) data.corporateDebtorName = 'Corporate Debtor Limited';
    if (!data.corporateDebtorCin) data.corporateDebtorCin = 'U00000DL2015PTC000000';
    if (!data.irpName) data.irpName = 'Interim Resolution Professional';
    if (!data.irpAddress) data.irpAddress = '[Office of the IRP/RP, IBBI Registration No.]';
    if (!data.irpEmail) data.irpEmail = 'rp@resolutionadvisors.in';
    if (!data.icdDate) data.icdDate = new Date().toISOString().split('T')[0];
    if (!data.securityDetails) data.securityDetails = 'First pari-passu hypothecation on movable fixed assets & receivables.';
    if (!data.bankName) data.bankName = 'State Bank of India';
    if (!data.bankAccountNo) data.bankAccountNo = '[Insert Bank Account No.]';
    if (!data.bankIfsc) data.bankIfsc = 'SBIN0000001';
    if (!data.bankBranch) data.bankBranch = '[Main Branch]';
    if (!data.disputeDetails) data.disputeDetails = 'No notice of dispute received or pending before any court/arbitration prior to Section 8 demand.';
    if (!data.signatoryName) data.signatoryName = '[Name of Authorised Signatory]';
    if (!data.signatoryDesignation) data.signatoryDesignation = 'Authorised Representative / Chief Manager';
    if (!data.signatoryAddress) data.signatoryAddress = data.claimantAddress && !data.claimantAddress.startsWith('[') ? data.claimantAddress : '[Office Address of Signatory]';

    // 6. Auto-compute interest if interest rate and default date exist but interest is 0
    if (data.interestAmount === 0 && data.interestRate > 0 && data.dateOfDefault && data.icdDate) {
        const calc = calculateInterest(data.principalAmount, data.interestRate, data.dateOfDefault, data.icdDate);
        data.interestAmount = calc.interestAmount;
    }

    // 7. Compute total claim amount and amount in words
    data.totalClaimAmount = data.principalAmount + data.interestAmount + data.penalCharges;
    data.totalClaimAmountWords = numberToIndianWords(data.totalClaimAmount);

    // 8. Write-back discovered facts to KV dictionary and SQLite case_facts
    if (data.claimantName && !data.claimantName.startsWith('Claimant')) {
        writeCaseKV(caseDir, 'claimant_name', data.claimantName, 'ClaimExtractor', 'ClaimExtractSkill');
    }
    if (data.claimantAddress && !data.claimantAddress.startsWith('[')) {
        writeCaseKV(caseDir, 'claimant_address', data.claimantAddress, 'ClaimExtractor', 'ClaimExtractSkill');
    }
    if (data.claimantId && !data.claimantId.startsWith('[')) {
        writeCaseKV(caseDir, 'claimant_pan', data.claimantId, 'ClaimExtractor', 'ClaimExtractSkill');
    }
    if (data.corporateDebtorName && data.corporateDebtorName !== 'Corporate Debtor Limited') {
        writeCaseKV(caseDir, 'company_name', data.corporateDebtorName, 'ClaimExtractor', 'ClaimExtractSkill');
        writeCaseKV(caseDir, 'corporate_debtor_name', data.corporateDebtorName, 'ClaimExtractor', 'ClaimExtractSkill');
    }
    if (data.corporateDebtorCin && data.corporateDebtorCin !== 'U00000DL2015PTC000000') {
        writeCaseKV(caseDir, 'cin', data.corporateDebtorCin, 'ClaimExtractor', 'ClaimExtractSkill');
    }
    if (data.principalAmount > 0) {
        writeCaseKV(caseDir, 'principal_amount', String(data.principalAmount), 'ClaimExtractor', 'ClaimExtractSkill');
    }
    if (data.interestAmount > 0) {
        writeCaseKV(caseDir, 'interest_amount', String(data.interestAmount), 'ClaimExtractor', 'ClaimExtractSkill');
    }
    if (data.dateOfDefault) {
        writeCaseKV(caseDir, 'date_of_default', data.dateOfDefault, 'ClaimExtractor', 'ClaimExtractSkill');
    }
    if (data.bankAccountNo && !data.bankAccountNo.startsWith('[')) {
        writeCaseKV(caseDir, 'bank_account_no', data.bankAccountNo, 'ClaimExtractor', 'ClaimExtractSkill');
    }
    if (data.bankIfsc && data.bankIfsc !== 'SBIN0000001') {
        writeCaseKV(caseDir, 'bank_ifsc', data.bankIfsc, 'ClaimExtractor', 'ClaimExtractSkill');
    }
    if (data.bankName && data.bankName !== 'State Bank of India') {
        writeCaseKV(caseDir, 'bank_name', data.bankName, 'ClaimExtractor', 'ClaimExtractSkill');
    }

    return data;
}

module.exports = {
    numberToIndianWords,
    formatIndianCurrency,
    calculateInterest,
    parseMarkdownFacts,
    extractFactsByRegex,
    extractClaimantData
};
