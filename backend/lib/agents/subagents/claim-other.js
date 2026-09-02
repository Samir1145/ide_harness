/**
 * Sub-Agent: claim-other.js
 * Specialized Autonomous Agent for Other Creditors (Statutory Dues, Tax, Customs, Indemnity) under Regulation 9A.
 * Primary Form: FORM F
 */

const fs = require('fs');
const path = require('path');
const { formatIndianCurrency, numberToIndianWords } = require('../skills/claim-extract');
const { auditCaseClaims } = require('../skills/claim-verify');

class OtherClaimSubAgent {
    constructor() {
        this.name = 'OtherClaimSubAgent';
        this.claimantType = 'OTHER_CREDITOR';
        this.primaryForm = 'FORM_F';
    }

    analyze(caseDir, overrides = {}) {
        const audit = auditCaseClaims(caseDir);
        const { claimant, ledger, reconciliation, cirpNotice } = audit;

        const statutoryDues = overrides.statutoryDues !== undefined ? parseFloat(overrides.statutoryDues) : (overrides.principalAmount || 250000.00);
        const interest = overrides.interestAmount !== undefined ? parseFloat(overrides.interestAmount) : 0.00;
        const totalClaim = statutoryDues + interest;

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
            statutoryDues,
            interest,
            totalClaim
        };
    }

    async draft(caseDir, overrides = {}) {
        const analysis = this.analyze(caseDir, overrides);
        const { claimant, statutoryDues, interest, totalClaim, corporateDebtor, corporateDebtorCin, caseNumber, icdDate, irpName, irpRegNo, irpAddress, irpEmail } = analysis;

        const cleanName = (claimant.name || 'OTHER CREDITOR').toUpperCase();
        const safeName = cleanName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const now = new Date();
        const claimDateStr = `${String(now.getDate()).padStart(2, '0')} September ${now.getFullYear()}`;
        const dayStr = String(now.getDate());
        const monthStr = now.toLocaleString('en-GB', { month: 'long' });
        const yearStr = String(now.getFullYear());

        const formFMarkdown = `# FORM F
### SUBMISSION OF CLAIM BY CREDITORS (OTHER THAN FINANCIAL, OPERATIONAL, WORKMEN AND EMPLOYEES)
*(Under Regulation 9A of the Insolvency and Bankruptcy Board of India (Insolvency Resolution Process for Corporate Persons) Regulations, 2016)*

**Date:** ${claimDateStr}

**To:**  
**Mr. ${irpName}**  
Interim Resolution Professional  
In the matter of **${corporateDebtor}** (Corporate Debtor)  
**IBBI Registration No.:** ${irpRegNo}  
**Address:** ${irpAddress}  
**Email:** ${irpEmail}  

**From:**  
**Creditor:** ${cleanName}  
**Address:** ${claimant.address || 'Address'}  
**Email:** ${claimant.email || 'contact@department.gov.in'}  
**PAN / TAN:** ${claimant.pan || 'PAN / TAN'}  

**Subject:** Submission of proof of claim under Regulation 9A of the IBBI (Insolvency Resolution Process for Corporate Persons) Regulations, 2016 in the CIRP of **${corporateDebtor}** [${caseNumber}].

---

### PARTICULARS OF CLAIM

| Sl. No. | Particulars | Details |
| :---: | :--- | :--- |
| **1.** | Name of the Creditor | **${cleanName}** |
| **2.** | Identification number of Creditor | **${claimant.pan || 'PAN / TAN'}** |
| **3.** | Address and email address for correspondence | ${claimant.address || 'Address'}<br>**Email:** ${claimant.email || 'contact@department.gov.in'} |
| **4.** | Total amount of claim *(as at ICD ${icdDate})* | **₹${formatIndianCurrency(totalClaim)}**<br>*(Rupees ${numberToIndianWords(totalClaim)})*<br><br>*(i) Principal Dues / Assessment: ₹${formatIndianCurrency(statutoryDues)}*<br>*(ii) Statutory Interest / Penalty: ₹${formatIndianCurrency(interest)}* |
| **5.** | Details of documents by which claim substantiated | Statutory Assessment Orders, Demand Notices, Court Decrees, Arbitral Awards. |
| **6.** | Details of how and when claim arose | Statutory tax liability / customs assessment / arbitral award / regulatory demand. |
| **7.** | Bank details for resolution plan distribution | **${claimant.bankName || 'Bank Name'}** \| A/c: \`${claimant.bankAccount || '0000000000'}\` \| IFSC: \`${claimant.bankIfsc || 'ABCD0123456'}\` |

---

### VERIFICATION

I, the claimant / authorized officer hereinabove, do hereby verify that the contents of this proof of claim are true and correct to my knowledge and belief.

Verified on this **${dayStr}** day of **${monthStr}**, **${yearStr}**.

________________________________________  
*(Signature of Creditor / Authorized Officer)*
`;

        const claimsDir = path.join(caseDir, '02_claims', claimant.folderName || safeName);
        if (!fs.existsSync(claimsDir)) fs.mkdirSync(claimsDir, { recursive: true });

        const primaryPath = path.join(caseDir, `CLAIM_${safeName}_FORM_F.md`);
        fs.writeFileSync(primaryPath, formFMarkdown, 'utf8');
        fs.writeFileSync(path.join(claimsDir, `CLAIM_${safeName}_FORM_F.md`), formFMarkdown, 'utf8');

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
        const pMatch = userMessage.match(/(?:amount|dues)\s*(?:of|is|:)?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)/i);
        if (pMatch && pMatch[1]) overrides.statutoryDues = parseFloat(pMatch[1].replace(/,/g, ''));
        return await this.draft(caseDir, overrides);
    }
}

module.exports = OtherClaimSubAgent;
