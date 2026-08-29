/**
 * Skill: claim-extract.js
 * Extracts claim-specific entities, financial figures, interest computations,
 * and annexure lists from case documents, KV dictionary, and RAG retrieval.
 */

const { readAllKV, writeCaseKV } = require('./kv-write');
const { ragRetrieve } = require('./rag-retrieve');
const { getChatResponse } = require('../../core/llm-client');

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
    if (!val) return '0.00';
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
 * Extracts all claim-relevant fields from KV dictionary, case files, and RAG retrieval.
 * @param {string} caseDir
 * @param {string} [specificClaimantName] - Optional claimant name filter
 * @returns {Promise<Object>} Extracted claim data object
 */
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

async function extractClaimantData(caseDir, specificClaimantName = '') {
    const kv = { ...readAllKV(caseDir) };
    const caseFactsPath = path.join(caseDir, 'case_facts.md');
    if (fs.existsSync(caseFactsPath)) {
        try {
            const rawContent = fs.readFileSync(caseFactsPath, 'utf8');
            const parsed = matter(rawContent);
            if (parsed.data && typeof parsed.data === 'object') {
                for (const [k, v] of Object.entries(parsed.data)) {
                    if (!kv[k]) kv[k] = v;
                }
            }
        } catch (_) {}
    }
    const data = {
        claimantName: specificClaimantName || kv['claimant_name'] || kv['creditor_name'] || 'Claimant / Financial Creditor',
        claimantAddress: kv['claimant_address'] || kv['creditor_address'] || '[Insert Registered Address of Creditor]',
        claimantEmail: kv['claimant_email'] || kv['creditor_email'] || 'claims@creditor.com',
        claimantId: kv['claimant_pan'] || kv['claimant_cin'] || kv['creditor_id'] || '[PAN / CIN / Registration No.]',
        corporateDebtorName: kv['company_name'] || kv['corporate_debtor_name'] || 'Corporate Debtor Limited',
        corporateDebtorCin: kv['cin'] || 'U00000DL2015PTC000000',
        irpName: kv['irp_name'] || kv['rp_name'] || 'Interim Resolution Professional',
        irpAddress: kv['irp_address'] || kv['rp_address'] || '[Office of the IRP/RP, IBBI Registration No.]',
        irpEmail: kv['irp_email'] || kv['rp_email'] || 'rp@resolutionadvisors.in',
        icdDate: kv['insolvency_commencement_date'] || kv['icd_date'] || kv['admission_date'] || new Date().toISOString().split('T')[0],
        claimDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        principalAmount: parseFloat(String(kv['principal_amount'] || kv['total_claim_amount'] || '0').replace(/,/g, '')),
        interestAmount: parseFloat(String(kv['interest_amount'] || '0').replace(/,/g, '')),
        penalCharges: parseFloat(String(kv['penal_charges'] || '0').replace(/,/g, '')),
        totalClaimAmount: 0,
        totalClaimAmountWords: '',
        dateOfDefault: kv['date_of_default'] || kv['default_date'] || '',
        interestRate: parseFloat(kv['interest_rate'] || '0'),
        creditFacility: kv['credit_facility_type'] || kv['facility_type'] || 'Term Loan / Working Capital / Trade Invoices',
        securityDetails: kv['security_details'] || 'First pari-passu hypothecation on movable fixed assets & receivables.',
        bankName: kv['bank_name'] || 'State Bank of India',
        bankAccountNo: kv['bank_account_no'] || kv['bank_account'] || '[Insert Bank Account No.]',
        bankIfsc: kv['bank_ifsc'] || 'SBIN0000001',
        bankBranch: kv['bank_branch'] || '[Main Branch]',
        disputeDetails: kv['dispute_details'] || 'No notice of dispute received or pending before any court/arbitration prior to Section 8 demand.',
        isRelatedParty: kv['is_related_party'] === 'true' || kv['is_related_party'] === true,
        signatoryName: kv['signatory_name'] || kv['claimant_representative'] || '[Name of Authorised Signatory]',
        signatoryDesignation: kv['signatory_designation'] || 'Authorised Representative / Chief Manager',
        signatoryAddress: kv['signatory_address'] || kv['claimant_address'] || '[Office Address of Signatory]',
        annexures: []
    };

    // RAG fallback to detect missing financial facts if KV is sparse
    if (data.principalAmount === 0 || !data.dateOfDefault) {
        try {
            const queries = [
                `${data.claimantName} loan amount sanctioned principal outstanding`,
                `${data.claimantName} date of default NPA overdue amount`,
                `${data.claimantName} invoices total claim dues demand notice`
            ];
            for (const q of queries) {
                const chunks = await ragRetrieve(caseDir, q, 2);
                if (chunks.length > 0) {
                    const text = chunks.map(c => c.content).join('\n');
                    // Extract amounts if principal is still 0
                    if (data.principalAmount === 0) {
                        const amountMatch = text.match(/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{2})?)/i);
                        if (amountMatch) {
                            const val = parseFloat(amountMatch[1].replace(/,/g, ''));
                            if (!isNaN(val) && val > 1000) {
                                data.principalAmount = val;
                            }
                        }
                    }
                    // Extract default date if missing
                    if (!data.dateOfDefault) {
                        const dateMatch = text.match(/\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i);
                        if (dateMatch) {
                            data.dateOfDefault = dateMatch[1];
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[ClaimExtract] RAG retrieval error:', e.message);
        }
    }

    // Auto-compute interest if rate and default date exist but interest is 0
    if (data.interestAmount === 0 && data.interestRate > 0 && data.dateOfDefault && data.icdDate) {
        const calc = calculateInterest(data.principalAmount, data.interestRate, data.dateOfDefault, data.icdDate);
        data.interestAmount = calc.interestAmount;
    }

    // Compute total claim amount
    data.totalClaimAmount = data.principalAmount + data.interestAmount + data.penalCharges;
    data.totalClaimAmountWords = numberToIndianWords(data.totalClaimAmount);

    return data;
}

module.exports = {
    numberToIndianWords,
    formatIndianCurrency,
    calculateInterest,
    extractClaimantData
};
