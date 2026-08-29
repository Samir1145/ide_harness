/**
 * Skill: claim-form-fill.js
 * Fills IBBI CIRP Claim Forms (Form B, Form C, Form CA, Form D, Form F)
 * from claimant extracted data and persists formatted drafts to drafts/
 */

const fs = require('fs');
const path = require('path');
const { formatIndianCurrency, numberToIndianWords, extractClaimantData } = require('./claim-extract');
const { writeCaseKV } = require('./kv-write');
const { appendTableRow } = require('./md-append');

/**
 * Normalizes form type identifier into canonical form ID
 * e.g. 'c', 'form-c', 'formc', 'financial' -> 'cirp-form-c'
 * @param {string} formType
 * @returns {string}
 */
function normalizeFormType(formType = 'c') {
    const raw = String(formType).toLowerCase().trim().replace(/^form[_-]?/, '');
    switch (raw) {
        case 'b':
        case 'operational':
        case 'vendor':
        case 'supplier':
            return 'cirp-form-b';
        case 'ca':
        case 'class':
        case 'homebuyer':
        case 'allottee':
            return 'cirp-form-ca';
        case 'd':
        case 'workman':
        case 'employee':
        case 'salary':
            return 'cirp-form-d';
        case 'f':
        case 'other':
        case 'statutory':
        case 'tax':
            return 'cirp-form-f';
        case 'c':
        case 'financial':
        case 'bank':
        case 'nbfc':
        default:
            return 'cirp-form-c';
    }
}

/**
 * Populates and writes an IBBI Proof of Claim form.
 * @param {string} caseDir - Active case folder
 * @param {string} formType - 'form-b', 'form-c', 'form-ca', 'form-d', 'form-f'
 * @param {Object} [customData] - Optional overrides
 * @returns {Promise<{ filePath: string, fileName: string, formId: string, claimantName: string, totalClaim: number, markdown: string }>}
 */
async function generateClaimForm(caseDir, formType = 'c', customData = {}) {
    const formId = normalizeFormType(formType);
    const skeletonPath = path.join(__dirname, '..', '..', 'pipeline', 'forms', 'skeletons', 'ibc_forms', 'cirp', `${formId}.md`);
    
    let template = '';
    if (fs.existsSync(skeletonPath)) {
        template = fs.readFileSync(skeletonPath, 'utf8');
    } else {
        const fallbackPath = path.join(__dirname, '..', '..', 'pipeline', 'forms', 'skeletons', 'ibc_forms', `${formId}.md`);
        if (fs.existsSync(fallbackPath)) {
            template = fs.readFileSync(fallbackPath, 'utf8');
        } else {
            throw new Error(`Claim form skeleton "${formId}.md" not found.`);
        }
    }

    // Extract facts
    const rawData = await extractClaimantData(caseDir, customData.claimantName || '');
    const data = { ...rawData, ...customData };

    // Ensure totals are calculated correctly even when customData overrides principal/interest
    if (!data.totalClaimAmount || customData.principalAmount !== undefined || customData.interestAmount !== undefined || customData.penalCharges !== undefined) {
        data.principalAmount = parseFloat(String(data.principalAmount || 0).replace(/,/g, '')) || 0;
        data.interestAmount = parseFloat(String(data.interestAmount || 0).replace(/,/g, '')) || 0;
        data.penalCharges = parseFloat(String(data.penalCharges || 0).replace(/,/g, '')) || 0;
        data.totalClaimAmount = data.principalAmount + data.interestAmount + data.penalCharges;
    }
    if (!data.totalClaimAmountWords || customData.principalAmount !== undefined) {
        data.totalClaimAmountWords = numberToIndianWords(data.totalClaimAmount);
    }

    // Format currency strings
    const totalClaimFormatted = formatIndianCurrency(data.totalClaimAmount);
    const principalFormatted = formatIndianCurrency(data.principalAmount);
    const interestFormatted = formatIndianCurrency(data.interestAmount);
    const penalFormatted = formatIndianCurrency(data.penalCharges);

    const now = new Date();
    const day = String(now.getDate());
    const month = now.toLocaleString('en-GB', { month: 'long' });
    const year = String(now.getFullYear());

    // Map template variables
    const replacements = {
        '{{CLAIM_DATE}}': data.claimDate || `${day} ${month} ${year}`,
        '{{IRP_NAME}}': data.irpName,
        '{{IRP_ADDRESS}}': data.irpAddress,
        '{{IRP_EMAIL}}': data.irpEmail,
        '{{CREDITOR_NAME}}': data.claimantName,
        '{{CREDITOR_ADDRESS}}': data.claimantAddress,
        '{{CREDITOR_EMAIL}}': data.claimantEmail,
        '{{CREDITOR_ID_NUMBER}}': data.claimantId,
        '{{CREDITOR_ADDRESS_AND_EMAIL}}': `${data.claimantAddress} | Email: ${data.claimantEmail}`,
        '{{CORPORATE_DEBTOR_NAME}}': data.corporateDebtorName,
        '{{ICD_DATE}}': data.icdDate,
        '{{TOTAL_CLAIM_AMOUNT}}': totalClaimFormatted,
        '{{TOTAL_CLAIM_AMOUNT_WORDS}}': data.totalClaimAmountWords,
        '{{PRINCIPAL_AMOUNT}}': principalFormatted,
        '{{INTEREST_AMOUNT}}': interestFormatted,
        '{{PENAL_CHARGES}}': penalFormatted,
        '{{PRINCIPAL_BORROWER_CLAIM}}': totalClaimFormatted,
        '{{GUARANTEE_AMOUNT}}': '0.00',
        '{{GUARANTOR_DETAILS}}': 'Personal Guarantees executed by Promoter Directors.',
        '{{GUARANTOR_CLAIM}}': 'N/A',
        '{{GUARANTOR_SECURITY}}': 'N/A',
        '{{PRINCIPAL_BORROWER_NAME_ADDRESS}}': `${data.corporateDebtorName}, Reg. Office: ${data.corporateDebtorCin}`,
        '{{SEC_5_8_DETAILS}}': 'N/A',
        '{{DEBT_INCURRED_DETAILS}}': `Credit facility disbursed pursuant to Sanction Letter / Contracts. Date of default: ${data.dateOfDefault || '[Not Specified]'}. Outstanding contractual debt accrued up to ICD (${data.icdDate}).`,
        '{{MUTUAL_DEALINGS_SETOFF}}': 'Nil. No mutual credits, debts, or dealings available for set-off.',
        '{{SECURITY_DETAILS}}': data.securityDetails,
        '{{BANK_NAME}}': data.bankName,
        '{{BANK_ACCOUNT_NO}}': data.bankAccountNo,
        '{{BANK_IFSC}}': data.bankIfsc,
        '{{BANK_BRANCH}}': data.bankBranch,
        '{{SUBSTANTIATING_DOCUMENTS}}': 'Sanction Letters, Loan Agreements, Invoices, Delivery Proofs, Account Ledgers, Demand Notices, and ROC Form CHG-1 Charge Certificates.',
        '{{ATTACHED_DOCUMENTS_LIST}}': '1. Annexure-A: Copy of Sanction Letter / Invoices\n2. Annexure-B: Bank Account Ledger & Interest Calculation Sheet\n3. Annexure-C: ROC Charge Search Report (Form CHG-1)\n4. Annexure-D: Board Resolution / Letter of Authority\n5. Annexure-E: Affidavit & Verification',
        '{{DISPUTE_DETAILS}}': data.disputeDetails,
        '{{SIGNATORY_NAME}}': data.signatoryName,
        '{{SIGNATORY_DESIGNATION}}': data.signatoryDesignation,
        '{{SIGNATORY_ADDRESS}}': data.signatoryAddress,
        '{{DECLARANT_NAME}}': data.signatoryName,
        '{{DECLARANT_ADDRESS}}': data.signatoryAddress,
        '{{VERIFIER_NAME}}': data.signatoryName,
        '{{SIGN_DATE}}': data.claimDate || `${day} ${month} ${year}`,
        '{{SIGN_PLACE}}': data.claimantAddress.split(',')[0] || 'New Delhi',
        '{{VERIFICATION_PLACE}}': data.claimantAddress.split(',')[0] || 'New Delhi',
        '{{VERIFICATION_DAY}}': day,
        '{{VERIFICATION_MONTH}}': month,
        '{{VERIFICATION_YEAR}}': year,
        '{{IS_RELATED_PARTY_TEXT}}': data.isRelatedParty ? 'is' : 'is NOT',
        '{{IS_COC_ELIGIBLE_TEXT}}': data.isRelatedParty ? 'is NOT' : 'is',
        '{{ANNEXURE_LIST}}': '1. Sanction Letter & Credit Facility Agreements.\n2. Statement of Account / Invoices with Computation of Interest.\n3. Certificate of Registration of Charge (ROC CHG-1).',
        '{{SETOFF_EXCEPTIONS}}': 'Nil. No satisfaction or security received save as disclosed in Item 5 & 9.'
    };

    let populated = template;
    for (const [key, val] of Object.entries(replacements)) {
        populated = populated.split(key).join(val || '');
    }

    // Persist to drafts/ directory
    const draftsDir = path.join(caseDir, 'drafts');
    if (!fs.existsSync(draftsDir)) {
        fs.mkdirSync(draftsDir, { recursive: true });
    }

    const safeClaimant = data.claimantName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
    const formCode = formId.replace('cirp-', '').toUpperCase();
    const fileName = `CLAIM_${safeClaimant}_${formCode}.md`;
    const filePath = path.join(draftsDir, fileName);

    fs.writeFileSync(filePath, populated, 'utf8');

    // Update case KV dictionary
    writeCaseKV(caseDir, 'claim_draft_path', filePath, fileName, 'ClaimFormSkill');
    writeCaseKV(caseDir, 'last_claim_amount', String(data.totalClaimAmount), fileName, 'ClaimFormSkill');
    writeCaseKV(caseDir, 'last_claimant_name', data.claimantName, fileName, 'ClaimFormSkill');

    // Append to claims_registry.md
    appendTableRow(
        caseDir,
        'claims_registry.md',
        ['Creditor', 'Amount', 'Form Type', 'Status'],
        [data.claimantName, `₹${totalClaimFormatted}`, formCode, '📝 DRAFT GENERATED'],
        'ClaimFormSkill'
    );

    return {
        filePath,
        fileName,
        formId,
        claimantName: data.claimantName,
        totalClaim: data.totalClaimAmount,
        totalClaimFormatted,
        markdown: populated
    };
}

module.exports = {
    normalizeFormType,
    generateClaimForm
};
