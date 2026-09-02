/**
 * Sub-Agent: claim-operational.js
 * Specialized Autonomous Agent for Operational Creditors under Section 9 & Regulation 7.
 * Primary Form: FORM B
 * Supported Domains: Vendors, Suppliers, Service Providers, Contractors, Landlords.
 */

const fs = require('fs');
const path = require('path');
const { formatIndianCurrency, numberToIndianWords } = require('../skills/claim-extract');
const { auditCaseClaims } = require('../skills/claim-verify');

class OperationalClaimSubAgent {
    constructor() {
        this.name = 'OperationalClaimSubAgent';
        this.claimantType = 'OPERATIONAL_CREDITOR';
        this.primaryForm = 'FORM_B';
    }

    analyze(caseDir, overrides = {}) {
        const audit = auditCaseClaims(caseDir);
        const { claimant, ledger, reconciliation, cirpNotice } = audit;

        const principal = overrides.principalAmount !== undefined 
            ? parseFloat(overrides.principalAmount) 
            : (ledger.totalOutflow || 500000.00);

        const interest = overrides.interestAmount !== undefined 
            ? parseFloat(overrides.interestAmount) 
            : 0.00;

        const totalClaim = principal + interest;

        const corporateDebtor = overrides.corporateDebtor || (cirpNotice && cirpNotice.corporateDebtor) || claimant.corporateDebtor || 'Corporate Debtor';
        const corporateDebtorCin = overrides.corporateDebtorCin || (cirpNotice && cirpNotice.cin) || claimant.corporateDebtorCin || '';
        const caseNumber = overrides.caseNumber || (cirpNotice && cirpNotice.caseNumber) || 'CP(IB) No. ...';
        const icdDate = overrides.icdDate || (cirpNotice && cirpNotice.icdDate) || '20.08.2026';
        const irpName = overrides.irpName || (cirpNotice && cirpNotice.irpName) || 'Resolution Professional';
        const irpRegNo = overrides.irpRegNo || (cirpNotice && cirpNotice.irpRegNo) || '';
        const irpAddress = overrides.irpAddress || (cirpNotice && cirpNotice.irpAddress) || '';
        const irpEmail = overrides.irpEmail || (cirpNotice && cirpNotice.irpEmail) || 'rp@resolutionadvisors.in';

        return {
            claimant,
            ledger,
            reconciliation,
            cirpNotice,
            corporateDebtor,
            corporateDebtorCin,
            caseNumber,
            icdDate,
            irpName,
            irpRegNo,
            irpAddress,
            irpEmail,
            principal,
            interest,
            totalClaim
        };
    }

    async draft(caseDir, overrides = {}) {
        const analysis = this.analyze(caseDir, overrides);
        const { claimant, principal, interest, totalClaim, corporateDebtor, corporateDebtorCin, caseNumber, icdDate, irpName, irpRegNo, irpAddress, irpEmail } = analysis;

        const cleanName = (claimant.name || 'OPERATIONAL CREDITOR').toUpperCase();
        const safeName = cleanName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const now = new Date();
        const claimDateStr = `${String(now.getDate()).padStart(2, '0')} September ${now.getFullYear()}`;
        const dayStr = String(now.getDate());
        const monthStr = now.toLocaleString('en-GB', { month: 'long' });
        const yearStr = String(now.getFullYear());

        const formBMarkdown = `# FORM B
### SUBMISSION OF CLAIM BY OPERATIONAL CREDITORS EXCEPT WORKMEN AND EMPLOYEES
*(Under Regulation 7 of the Insolvency and Bankruptcy Board of India (Insolvency Resolution Process for Corporate Persons) Regulations, 2016)*

**Date:** ${claimDateStr}

**To:**  
**Mr. ${irpName}**  
Interim Resolution Professional  
In the matter of **${corporateDebtor}** (Corporate Debtor)  
**IBBI Registration No.:** ${irpRegNo}  
**Address:** ${irpAddress}  
**Email:** ${irpEmail}  

**From:**  
**Operational Creditor:** ${cleanName}  
**Address:** ${claimant.address || 'Vendor Address'}  
**Email:** ${claimant.email || 'billing@vendor.com'}  
**PAN / GSTIN:** ${claimant.pan || 'PAN / GSTIN'}  

**Subject:** Submission of proof of claim under Regulation 7 of the IBBI (Insolvency Resolution Process for Corporate Persons) Regulations, 2016 in the CIRP of **${corporateDebtor}** [${caseNumber}].

---

### PARTICULARS OF OPERATIONAL DEBT

| Sl. No. | Particulars | Details |
| :---: | :--- | :--- |
| **1.** | Name of Operational Creditor | **${cleanName}** |
| **2.** | Identification number of Operational Creditor | **${claimant.pan || 'GSTIN / PAN'}** |
| **3.** | Address and email address for correspondence | ${claimant.address || 'Address'}<br>**Email:** ${claimant.email || 'billing@vendor.com'} |
| **4.** | Total amount of claim *(including interest accrued up to ICD ${icdDate})* | **₹${formatIndianCurrency(totalClaim)}**<br>*(Rupees ${numberToIndianWords(totalClaim)})*<br><br>*(i) Principal Invoices: ₹${formatIndianCurrency(principal)}*<br>*(ii) Contractual / MSMED Sec 16 Interest: ₹${formatIndianCurrency(interest)}* |
| **5.** | Details of documents substantiating operational debt | Unpaid Invoices, Purchase Orders, Work Orders, Delivery Challans, Transport Bilty / Proof of Delivery. |
| **6.** | Details of how and when debt incurred | Supply of goods / provision of services rendered pursuant to Purchase Orders / Contract. Invoices raised remained unpaid past due dates. |
| **7.** | Mutual credit / set-off | **Nil.** |
| **8.** | Bank details for resolution plan distribution | **${claimant.bankName || 'Bank Name'}** \| A/c: \`${claimant.bankAccount || '0000000000'}\` \| IFSC: \`${claimant.bankIfsc || 'ABCD0123456'}\` |
| **9.** | List of documents attached | 1. Copies of Unpaid Invoices & Purchase Orders.<br>2. Proof of Delivery / Goods Receipt Notes (GRN).<br>3. Form 3 / Form 4 Statutory Demand Notice & Postal Receipts.<br>4. Bank Statement reflecting non-receipt of payment. |

---

### VERIFICATION

I, the claimant / authorized person hereinabove, do hereby verify that the contents of this proof of claim are true and correct to my knowledge and belief.

Verified on this **${dayStr}** day of **${monthStr}**, **${yearStr}**.

________________________________________  
*(Signature of Operational Creditor / Authorised Signatory)*
`;

        const claimsDir = path.join(caseDir, '02_claims', claimant.folderName || safeName);
        if (!fs.existsSync(claimsDir)) fs.mkdirSync(claimsDir, { recursive: true });

        const primaryPath = path.join(caseDir, `CLAIM_${safeName}_FORM_B.md`);
        fs.writeFileSync(primaryPath, formBMarkdown, 'utf8');
        fs.writeFileSync(path.join(claimsDir, `CLAIM_${safeName}_FORM_B.md`), formBMarkdown, 'utf8');

        return {
            primaryPath,
            secondaryPath: null,
            auditPath: path.join(claimsDir, 'CLAIM_AUDIT.md'),
            registryPath: path.join(claimsDir, 'claims_registry.md'),
            data: analysis
        };
    }

    async handleModification(caseDir, userMessage, currentData = {}) {
        const overrides = { ...currentData };
        const pMatch = userMessage.match(/(?:principal|invoice|amount)\s*(?:of|is|:)?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)/i);
        if (pMatch && pMatch[1]) overrides.principalAmount = parseFloat(pMatch[1].replace(/,/g, ''));
        const iMatch = userMessage.match(/(?:interest)\s*(?:of|is|:)?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)/i);
        if (iMatch && iMatch[1]) overrides.interestAmount = parseFloat(iMatch[1].replace(/,/g, ''));
        return await this.draft(caseDir, overrides);
    }
}

module.exports = OperationalClaimSubAgent;
