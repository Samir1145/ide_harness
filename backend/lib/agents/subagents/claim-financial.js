/**
 * Sub-Agent: claim-financial.js
 * Specialized Autonomous Agent for Standard Financial Creditors under Section 7 & Regulation 8.
 * Primary Form: FORM C
 * Supported Domains: Banks, NBFCs, Institutional Lenders, Inter-Corporate Loans.
 */

const fs = require('fs');
const path = require('path');
const { formatIndianCurrency, numberToIndianWords, readCaseFacts } = require('../skills/claim-extract');
const { auditCaseClaims } = require('../skills/claim-verify');

class FinancialClaimSubAgent {
    constructor() {
        this.name = 'FinancialClaimSubAgent';
        this.claimantType = 'FINANCIAL_CREDITOR';
        this.primaryForm = 'FORM_C';
    }

    analyze(caseDir, overrides = {}) {
        const facts = readCaseFacts(caseDir);
        const audit = auditCaseClaims(caseDir);
        const { claimant: rawClaimant, ledger, reconciliation, cirpNotice } = audit;

        const claimant = {
            name: overrides.claimantName || facts.claimant_name || rawClaimant.name || 'FINANCIAL CREDITOR',
            address: overrides.claimantAddress || facts.claimant_address || rawClaimant.address || 'Correspondence Address',
            pan: overrides.claimantPan || facts.claimant_pan || rawClaimant.pan || 'PAN_NOT_PROVIDED',
            email: overrides.claimantEmail || facts.claimant_email || rawClaimant.email || 'claimant@email.com',
            bankName: overrides.bankName || facts.bank_name || rawClaimant.bankName || 'Bank Limited',
            bankAccount: overrides.bankAccount || facts.bank_account_no || rawClaimant.bankAccount || '1234567890',
            bankIfsc: overrides.bankIfsc || facts.bank_ifsc || rawClaimant.bankIfsc || 'BANK0000001',
            bankBranch: overrides.bankBranch || rawClaimant.bankBranch || 'Main Branch'
        };

        const principal = overrides.principalAmount !== undefined 
            ? parseFloat(overrides.principalAmount) 
            : (facts.principal_amount ? parseFloat(facts.principal_amount) : (ledger.totalOutflow || 1000000.00));

        const interest = overrides.interestAmount !== undefined 
            ? parseFloat(overrides.interestAmount) 
            : (facts.interest_amount ? parseFloat(facts.interest_amount) : 0.00);

        const penalCharges = overrides.penalCharges !== undefined 
            ? parseFloat(overrides.penalCharges) 
            : (facts.penal_charges ? parseFloat(facts.penal_charges) : 0.00);

        const totalClaim = principal + interest + penalCharges;

        const corporateDebtor = overrides.corporateDebtor || facts.company_name || (cirpNotice && cirpNotice.corporateDebtor) || rawClaimant.corporateDebtor || 'Corporate Debtor';
        const corporateDebtorCin = overrides.corporateDebtorCin || facts.cin || (cirpNotice && cirpNotice.cin) || rawClaimant.corporateDebtorCin || '';
        const caseNumber = overrides.caseNumber || (cirpNotice && cirpNotice.caseNumber) || 'CP(IB) No. 112/ALD/2025';
        const icdDate = overrides.icdDate || facts.insolvency_commencement_date || (cirpNotice && cirpNotice.icdDate) || '20.08.2026';
        const irpName = overrides.irpName || facts.irp_name || (cirpNotice && cirpNotice.irpName) || 'Resolution Professional';
        const irpRegNo = overrides.irpRegNo || (cirpNotice && cirpNotice.irpRegNo) || '';
        const irpAddress = overrides.irpAddress || facts.irp_address || (cirpNotice && cirpNotice.irpAddress) || '';
        const irpEmail = overrides.irpEmail || facts.irp_email || (cirpNotice && cirpNotice.irpEmail) || 'rp@resolutionadvisors.in';

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
            penalCharges,
            totalClaim
        };
    }

    async draft(caseDir, overrides = {}) {
        const analysis = this.analyze(caseDir, overrides);
        const { claimant, principal, interest, penalCharges, totalClaim, corporateDebtor, corporateDebtorCin, caseNumber, icdDate, irpName, irpRegNo, irpAddress, irpEmail } = analysis;

        const cleanName = (claimant.name || 'FINANCIAL CREDITOR').toUpperCase();
        const safeName = cleanName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const now = new Date();
        const claimDateStr = `${String(now.getDate()).padStart(2, '0')} September ${now.getFullYear()}`;
        const dayStr = String(now.getDate());
        const monthStr = now.toLocaleString('en-GB', { month: 'long' });
        const yearStr = String(now.getFullYear());

        const formCMarkdown = `# FORM C
### SUBMISSION OF CLAIM BY FINANCIAL CREDITORS
*(Under Regulation 8 of the Insolvency and Bankruptcy Board of India (Insolvency Resolution Process for Corporate Persons) Regulations, 2016)*

**Date of Submission:** ${claimDateStr}

**To:**  
**The Interim Resolution Professional / Resolution Professional**  
**Name:** ${irpName} (${irpRegNo || 'IBBI Registered'})  
**Address:** ${irpAddress}  
**Email:** ${irpEmail}  

**From:**  
**Financial Creditor:** ${cleanName}  
**Address:** ${claimant.address || 'Registered Office Address'}  
**Email:** ${claimant.email || 'contact@bank.com'}  
**PAN:** ${claimant.pan || 'AAAAA0000A'}  

**Subject:** Submission of proof of claim under Regulation 8 of the IBBI (Insolvency Resolution Process for Corporate Persons) Regulations, 2016 in the CIRP of **${corporateDebtor}** [${caseNumber}].

---

### PARTICULARS OF FINANCIAL DEBT

| Sl. No. | Particulars | Details |
| :---: | :--- | :--- |
| **1.** | Name of the Financial Creditor | **${cleanName}** |
| **2.** | Identification number of Financial Creditor | **PAN: ${claimant.pan || 'AAAAA0000A'}** |
| **3.** | Address and email address for correspondence | ${claimant.address || 'Address'}<br>**Email:** ${claimant.email || 'contact@bank.com'} |
| **4.** | Total amount of claim *(including accrued interest up to ICD ${icdDate})* | **₹${formatIndianCurrency(totalClaim)}**<br>*(Rupees ${numberToIndianWords(totalClaim)})*<br><br>*(i) Principal: ₹${formatIndianCurrency(principal)}*<br>*(ii) Contractual Interest: ₹${formatIndianCurrency(interest)}*<br>*(iii) Penal Charges: ₹${formatIndianCurrency(penalCharges)}* |
| **5.** | Details of claim as Principal Borrower | **Claim Amount:** ₹${formatIndianCurrency(totalClaim)}<br>**Security:** Hypothecation over assets / mortgage / charge registered with ROC (Form CHG-1). |
| **6.** | Details of claim as Guarantor | N/A |
| **7.** | Financial debt under Section 5(8) | Financial debt arising out of loan facility / credit facility / commercial borrowing under Section 5(8) of the Code. |
| **8.** | How and when debt incurred | Sanctioned credit facility disbursed pursuant to Loan Agreement. Default occurred upon non-servicing of scheduled installments. |
| **9.** | Mutual credit / set-off | **Nil.** |
| **10.** | Bank details for resolution plan distribution | **${claimant.bankName || 'Bank Name'}** \| A/c: \`${claimant.bankAccount || '0000000000'}\` \| IFSC: \`${claimant.bankIfsc || 'ABCD0123456'}\` |
| **11.** | List of documents attached | 1. Sanction Letter & Loan Agreement.<br>2. Statement of Accounts certified under Bankers' Books Evidence Act.<br>3. ROC Charge Certificate (Form CHG-1).<br>4. NeSL Record of Default / CIBIL Report. |

---

### VERIFICATION

I, the claimant / authorized signatory hereinabove, do hereby verify that the contents of this proof of claim are true and correct to my knowledge and belief.

Verified on this **${dayStr}** day of **${monthStr}**, **${yearStr}**.

________________________________________  
*(Signature of Financial Creditor / Authorised Signatory)*
`;

        const claimAuditMarkdown = `# ⚖️ Forensic Claim Audit Workpad: ${cleanName}

> **Audit Status:** Certified Financial Debt Reconciliation  
> **Target Corporate Debtor:** \`${corporateDebtor}\` (CIN: \`${corporateDebtorCin}\`)  
> **NCLT Bench & Matter:** ${caseNumber}  
> **Insolvency Commencement Date (ICD):** \`${icdDate}\`  
> **Claimant Identity:** ${cleanName} | PAN: \`${claimant.pan || 'N/A'}\`  

---

## 1. 📊 Financial Debt Summary

* **Principal Debt:** ₹${formatIndianCurrency(principal)}
* **Accrued Contractual Interest:** ₹${formatIndianCurrency(interest)}
* **Penal Interest / Other Charges:** ₹${formatIndianCurrency(penalCharges)}
* **Total Claim Filed:** **₹${formatIndianCurrency(totalClaim)}** (*Rupees ${numberToIndianWords(totalClaim)}*)
`;

        const claimsDir = path.join(caseDir, '02_claims', claimant.folderName || safeName);
        if (!fs.existsSync(claimsDir)) fs.mkdirSync(claimsDir, { recursive: true });

        // Save Form C with both canonical naming patterns
        const primaryPath = path.join(caseDir, `CLAIM_${safeName}_FORM_C.md`);
        fs.writeFileSync(primaryPath, formCMarkdown, 'utf8');
        fs.writeFileSync(path.join(caseDir, `CLAIM_${safeName}_FORM-C.md`), formCMarkdown, 'utf8');
        fs.writeFileSync(path.join(claimsDir, `CLAIM_${safeName}_FORM_C.md`), formCMarkdown, 'utf8');

        const draftsDir = path.join(caseDir, 'drafts');
        if (fs.existsSync(draftsDir)) {
            fs.writeFileSync(path.join(draftsDir, `CLAIM_${safeName}_FORM-C.md`), formCMarkdown, 'utf8');
        }

        const claimsSubDir = path.join(caseDir, 'claims');
        if (fs.existsSync(claimsSubDir)) {
            fs.writeFileSync(path.join(claimsSubDir, `CLAIM_${safeName}_FORM-C.md`), formCMarkdown, 'utf8');
        }

        const auditPath = path.join(caseDir, 'CLAIM_AUDIT.md');
        fs.writeFileSync(auditPath, claimAuditMarkdown, 'utf8');
        fs.writeFileSync(path.join(claimsDir, 'CLAIM_AUDIT.md'), claimAuditMarkdown, 'utf8');

        // Update claims_registry.md
        const registryPath = path.join(caseDir, 'claims_registry.md');
        const regRow = `| ${cleanName} | ₹${formatIndianCurrency(totalClaim)} | FORM-C | 📝 DRAFTED (${claimDateStr}) |\n`;
        if (fs.existsSync(registryPath)) {
            fs.appendFileSync(registryPath, regRow, 'utf8');
        } else {
            const initialRegistry = `# claims_registry\n\n| Creditor | Amount | Form Type | Status |\n| --- | --- | --- | --- |\n${regRow}`;
            fs.writeFileSync(registryPath, initialRegistry, 'utf8');
        }

        return {
            primaryPath,
            secondaryPath: null,
            auditPath,
            registryPath,
            data: analysis
        };
    }

    async handleModification(caseDir, userMessage, currentData = {}) {
        const overrides = { ...currentData };
        const pMatch = userMessage.match(/(?:principal|amount)\s*(?:of|is|:)?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)/i);
        if (pMatch && pMatch[1]) overrides.principalAmount = parseFloat(pMatch[1].replace(/,/g, ''));
        const iMatch = userMessage.match(/(?:interest)\s*(?:of|is|:)?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)/i);
        if (iMatch && iMatch[1]) overrides.interestAmount = parseFloat(iMatch[1].replace(/,/g, ''));
        return await this.draft(caseDir, overrides);
    }
}

module.exports = FinancialClaimSubAgent;
