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

    let cleanPlace = 'New Delhi';
    if (data.claimantAddress && !data.claimantAddress.startsWith('[')) {
        const parts = data.claimantAddress.split(',').map(s => s.trim()).filter(Boolean);
        if (parts.length > 0) {
            const city = parts[parts.length - 1].replace(/\d+/g, '').replace(/[-–]/g, '').trim() || parts[0];
            if (city.length > 1) cleanPlace = city;
        }
    }

    let debtIncurredDetails = `Credit facility disbursed pursuant to Sanction Letter / Contracts. Date of default: ${data.dateOfDefault || '[Not Specified]'}. Outstanding contractual debt accrued up to ICD (${data.icdDate}).`;
    
    // Construct specialized Box 8 brief for Assured Return / Multi-Tranche Sale and Leaseback claims
    if (data.tranches && data.tranches.length > 0) {
        debtIncurredDetails = `1. **Integrated Sale-and-Leaseback Financing:** The Claimant invested total capital consideration of ₹${principalFormatted} across ${data.tranches.length} tranches for purchase of ${data.tranches.reduce((s, t) => s + (t.particleCount || 20), 0)} Cloud Storage Data Particles:\n`;
        data.tranches.forEach((t, i) => {
            debtIncurredDetails += `   * **Batch ${i + 1} (${t.debitDate}):** ₹${formatIndianCurrency(t.debitAmount)} paid towards ${t.serials} (${t.contractType}, Inv: ${t.invoice || 'N/A'}).\n`;
        });
        debtIncurredDetails += `2. **Connectedness & Single Economic Enterprise (Sec 5(24)):** Under Recital B and Clause 2 of the Asset Monetising Program Agreement (AMPA), the Corporate Debtor (Zebyte Infotech Pvt. Ltd.) expressly partnered with Vuenow Marketing Services Pvt. Ltd. to lease the Claimant's particles for minimum guaranteed monthly rentals of ₹53,550.00/month for 120 months.\n`;
        debtIncurredDetails += `3. **Default Milestone:** The Corporate Debtor serviced regular monthly lease returns totaling ₹${formatIndianCurrency(data.totalInflow || 0)} until default on ${data.dateOfDefault || '01-Nov-2024'}.\n`;
        debtIncurredDetails += `4. **Claim for Total Integrated Financial Debt:** Relying on *SBI v. Videocon Industries Ltd.* and Section 5(8)(f) of the Code, the Corporate Debtor is jointly and substantively liable for the refund of the capital principal of ₹${principalFormatted} along with accrued defaulted rentals.`;
    }

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
        '{{DEBT_INCURRED_DETAILS}}': debtIncurredDetails,
        '{{MUTUAL_DEALINGS_SETOFF}}': 'Nil. No mutual credits, debts, or dealings available for set-off.',
        '{{SECURITY_DETAILS}}': data.securityDetails,
        '{{BANK_NAME}}': data.bankName,
        '{{BANK_ACCOUNT_NO}}': data.bankAccountNo,
        '{{BANK_IFSC}}': data.bankIfsc,
        '{{BANK_BRANCH}}': data.bankBranch,
        '{{SUBSTANTIATING_DOCUMENTS}}': 'Asset Sale Agreements, Service Level Agreements, AMPA Lease Agreements, Reconciled Bank Statement, Invoices, and CLAIM_AUDIT.md Forensic Ledger.',
        '{{ATTACHED_DOCUMENTS_LIST}}': '1. Annexure-A: Copy of Asset Sale Agreements & SLAs\n2. Annexure-B: Asset Monetising Program Agreements (AMPA)\n3. Annexure-C: 100% Reconciled Bank Ledger & CLAIM_AUDIT.md\n4. Annexure-D: Pleading of Single Economic Enterprise & IBC Sec 5(24)\n5. Annexure-E: Affidavit & Verification',
        '{{DISPUTE_DETAILS}}': data.disputeDetails,
        '{{SIGNATORY_NAME}}': data.signatoryName,
        '{{SIGNATORY_DESIGNATION}}': data.signatoryDesignation,
        '{{SIGNATORY_ADDRESS}}': data.signatoryAddress,
        '{{DECLARANT_NAME}}': data.signatoryName,
        '{{DECLARANT_ADDRESS}}': data.signatoryAddress,
        '{{VERIFIER_NAME}}': data.signatoryName,
        '{{SIGN_DATE}}': data.claimDate || `${day} ${month} ${year}`,
        '{{SIGN_PLACE}}': cleanPlace,
        '{{VERIFICATION_PLACE}}': cleanPlace,
        '{{VERIFICATION_DAY}}': day,
        '{{VERIFICATION_MONTH}}': month,
        '{{VERIFICATION_YEAR}}': year,
        '{{IS_RELATED_PARTY_TEXT}}': data.isRelatedParty ? 'is' : 'is NOT',
        '{{IS_COC_ELIGIBLE_TEXT}}': data.isRelatedParty ? 'is NOT' : 'is',
        '{{ANNEXURE_LIST}}': '1. Sanction Letter & Credit Facility Agreements.\n2. Statement of Account / Invoices with Computation of Interest.\n3. Certificate of Registration of Charge (ROC CHG-1).',
        '{{SETOFF_EXCEPTIONS}}': 'Nil. No satisfaction or security received save as disclosed in Item 5 & 9.',
        '{{UNIT_NUMBER}}': data.unitNumber || data.flatNumber || '[Unit / Flat No.]',
        '{{PROJECT_NAME}}': data.projectName || '[Project Name]',
        '{{TOWER_BLOCK}}': data.towerBlock || '[Tower / Block]',
        '{{AUTHORISED_REPRESENTATIVE_NAME}}': data.authorisedRepresentative || data.arName || '[Name of Insolvency Professional selected as AR]',
        '{{SALARY_ARREARS}}': formatIndianCurrency(data.salaryArrears || data.principalAmount),
        '{{GRATUITY_AMOUNT}}': formatIndianCurrency(data.gratuityAmount || 0),
        '{{PF_AMOUNT}}': formatIndianCurrency(data.pfAmount || 0),
        '{{EMPLOYMENT_START_DATE}}': data.employmentStartDate || '[Joining Date]',
        '{{EMPLOYMENT_END_DATE}}': data.employmentEndDate || data.icdDate
    };

    let populated = template;
    for (const [key, val] of Object.entries(replacements)) {
        populated = populated.split(key).join(val || '');
    }

    // Determine target claims directory (default to 02_claims/ or drafts/ if present, or customData.targetDir, or caseDir)
    let targetDir = customData.targetDir || customData.folder;
    if (!targetDir || !fs.existsSync(targetDir)) {
        const candidates = ['02_claims', '02_Claims', 'claims', 'Claims', 'drafts', 'Drafts'];
        for (const cand of candidates) {
            const candidatePath = path.join(caseDir, cand);
            if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isDirectory()) {
                targetDir = candidatePath;
                break;
            }
        }
    }
    if (!targetDir || !fs.existsSync(targetDir)) {
        targetDir = caseDir;
    }

    const safeClaimant = data.claimantName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
    const formCode = formId.replace('cirp-', '').toUpperCase();
    const fileName = `CLAIM_${safeClaimant}_${formCode}.md`;
    const filePath = path.join(targetDir, fileName);

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
