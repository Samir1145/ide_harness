/**
 * Sub-Agent: claim-workmen.js
 * Specialized Autonomous Agent for Workmen and Employees under Section 9 & Regulation 9.
 * Primary Form: FORM D
 */

const fs = require('fs');
const path = require('path');
const { formatIndianCurrency, numberToIndianWords } = require('../skills/claim-extract');
const { auditCaseClaims } = require('../skills/claim-verify');

class WorkmenClaimSubAgent {
    constructor() {
        this.name = 'WorkmenClaimSubAgent';
        this.claimantType = 'WORKMEN_EMPLOYEE';
        this.primaryForm = 'FORM_D';
    }

    analyze(caseDir, overrides = {}) {
        const audit = auditCaseClaims(caseDir);
        const { claimant, ledger, reconciliation, cirpNotice } = audit;

        const unpaidWages = overrides.unpaidWages !== undefined ? parseFloat(overrides.unpaidWages) : (overrides.principalAmount || 300000.00);
        const gratuity = overrides.gratuity !== undefined ? parseFloat(overrides.gratuity) : 50000.00;
        const leaveEncashment = overrides.leaveEncashment !== undefined ? parseFloat(overrides.leaveEncashment) : 25000.00;
        const totalClaim = unpaidWages + gratuity + leaveEncashment;

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
            unpaidWages,
            gratuity,
            leaveEncashment,
            totalClaim
        };
    }

    async draft(caseDir, overrides = {}) {
        const analysis = this.analyze(caseDir, overrides);
        const { claimant, unpaidWages, gratuity, leaveEncashment, totalClaim, corporateDebtor, corporateDebtorCin, caseNumber, icdDate, irpName, irpRegNo, irpAddress, irpEmail } = analysis;

        const cleanName = (claimant.name || 'WORKMAN / EMPLOYEE').toUpperCase();
        const safeName = cleanName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const now = new Date();
        const claimDateStr = `${String(now.getDate()).padStart(2, '0')} September ${now.getFullYear()}`;
        const dayStr = String(now.getDate());
        const monthStr = now.toLocaleString('en-GB', { month: 'long' });
        const yearStr = String(now.getFullYear());

        const formDMarkdown = `# FORM D
### SUBMISSION OF CLAIM BY A WORKMAN OR AN EMPLOYEE
*(Under Regulation 9 of the Insolvency and Bankruptcy Board of India (Insolvency Resolution Process for Corporate Persons) Regulations, 2016)*

**Date:** ${claimDateStr}

**To:**  
**Mr. ${irpName}**  
Interim Resolution Professional  
In the matter of **${corporateDebtor}** (Corporate Debtor)  
**IBBI Registration No.:** ${irpRegNo}  
**Address:** ${irpAddress}  
**Email:** ${irpEmail}  

**From:**  
**Workman / Employee:** ${cleanName}  
**Address:** ${claimant.address || 'Employee Address'}  
**Email:** ${claimant.email || 'employee@gmail.com'}  
**PAN / Aadhaar:** ${claimant.pan || 'PAN / Aadhaar'}  

**Subject:** Submission of proof of claim under Regulation 9 of the IBBI (Insolvency Resolution Process for Corporate Persons) Regulations, 2016 in the CIRP of **${corporateDebtor}** [${caseNumber}].

---

### PARTICULARS OF CLAIM

| Sl. No. | Particulars | Details |
| :---: | :--- | :--- |
| **1.** | Name of Workman / Employee | **${cleanName}** |
| **2.** | Identification number (PAN / Aadhaar / Passport) | **${claimant.pan || 'PAN / Aadhaar'}** |
| **3.** | Address and email address for correspondence | ${claimant.address || 'Address'}<br>**Email:** ${claimant.email || 'employee@gmail.com'} |
| **4.** | Total amount of claim *(as at ICD ${icdDate})* | **₹${formatIndianCurrency(totalClaim)}**<br>*(Rupees ${numberToIndianWords(totalClaim)})*<br><br>*(i) Unpaid Salaries / Wages (Section 53 Priority): ₹${formatIndianCurrency(unpaidWages)}*<br>*(ii) Gratuity: ₹${formatIndianCurrency(gratuity)}*<br>*(iii) Leave Encashment / Bonus: ₹${formatIndianCurrency(leaveEncashment)}* |
| **5.** | Details of documents substantiating claim | Employment Letter / Contract, Salary Slips, Bank Statement reflecting salary credits, Form 16, PF Statement. |
| **6.** | Details of employment and tenure | Designation, employee code, date of joining, date of cessation / last working day. |
| **7.** | Bank details for resolution plan distribution | **${claimant.bankName || 'Bank Name'}** \| A/c: \`${claimant.bankAccount || '0000000000'}\` \| IFSC: \`${claimant.bankIfsc || 'ABCD0123456'}\` |

---

### VERIFICATION

I, the claimant hereinabove, do hereby verify that the contents of this proof of claim are true and correct to my knowledge and belief.

Verified on this **${dayStr}** day of **${monthStr}**, **${yearStr}**.

________________________________________  
*(Signature of Workman / Employee)*
`;

        const claimsDir = path.join(caseDir, '02_claims', claimant.folderName || safeName);
        if (!fs.existsSync(claimsDir)) fs.mkdirSync(claimsDir, { recursive: true });

        const primaryPath = path.join(caseDir, `CLAIM_${safeName}_FORM_D.md`);
        fs.writeFileSync(primaryPath, formDMarkdown, 'utf8');
        fs.writeFileSync(path.join(claimsDir, `CLAIM_${safeName}_FORM_D.md`), formDMarkdown, 'utf8');

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
        const pMatch = userMessage.match(/(?:wages|salary|amount)\s*(?:of|is|:)?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)/i);
        if (pMatch && pMatch[1]) overrides.unpaidWages = parseFloat(pMatch[1].replace(/,/g, ''));
        return await this.draft(caseDir, overrides);
    }
}

module.exports = WorkmenClaimSubAgent;
