'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Generates pre-populated requisition assets when only public MCA CIN/DIN is available:
 * 1. 01_dossier/intake_relatives.json (Pre-filled promoter roster)
 * 2. 01_dossier/REQUISITION_LETTER_TO_BIDDER.md (Statutory Demand Letter under IBC Reg 36A(8))
 *
 * @param {string} matterDir - Absolute path to matter directory
 * @param {string} targetCompanyName - Name of the candidate / PRA entity
 * @param {string} targetCin - CIN of the candidate
 * @param {Array}  promoters - Array of { name, din, designation } discovered from MCA
 * @param {object} [options] - Optional RP name, CD name
 * @returns {object} Generated file paths and summary
 */
function generateRequisitionPackage(matterDir, targetCompanyName, targetCin, promoters = [], options = {}) {
  const dossierDir = path.join(matterDir, '01_dossier');
  fs.mkdirSync(dossierDir, { recursive: true });

  const rpName = options.rpName || 'Insolvency Professional';
  const cdName = options.cdName || 'Corporate Debtor';
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  // 1. Generate intake_relatives.json
  const preFilledIntake = {
    matter_name: path.basename(matterDir),
    target_company_name: targetCompanyName,
    target_cin: targetCin,
    generated_at: new Date().toISOString(),
    status: 'AWAITING_RELATIVE_DISCLOSURES',
    instructions: 'Please fill the full name and PAN for each promoter relative under Section 2(77) of the Companies Act, 2013. Once filled, the Section 29A screening engine will verify eligibility automatically.',
    promoters: promoters.map(p => ({
      name: p.name || p.director_name,
      din: p.din || null,
      pan: p.pan || '',
      designation: p.designation || 'Director / Key Promoter',
      relatives_required_under_section_2_77: [
        { relation: 'Spouse', name: '', pan: '' },
        { relation: 'Father', name: '', pan: '' },
        { relation: 'Mother', name: '', pan: '' },
        { relation: 'Brother', name: '', pan: '' },
        { relation: 'Sister', name: '', pan: '' },
        { relation: 'Son', name: '', pan: '' },
        { relation: 'Daughter', name: '', pan: '' },
        { relation: 'Son Wife (Daughter-in-Law)', name: '', pan: '' },
        { relation: 'Daughter Husband (Son-in-Law)', name: '', pan: '' }
      ]
    })),
    shareholders_gt_2pct: [
      {
        entity_name: '',
        cin_pan: '',
        holding_pct: 0.0,
        is_ultimate_beneficial_owner: true
      }
    ]
  };

  const intakePath = path.join(dossierDir, 'intake_relatives.json');
  fs.writeFileSync(intakePath, JSON.stringify(preFilledIntake, null, 2), 'utf8');

  // 2. Generate Formal Statutory Requisition Letter
  const promoterListText = promoters.map((p, i) => `   ${i + 1}. **${p.name || p.director_name}** (DIN: ${p.din || 'N/A'}, Designation: ${p.designation || 'Director'})`).join('\n');

  const requisitionLetterContent = `# STATUTORY REQUISITION NOTICE UNDER REGULATION 36A(8) OF THE IBBI (CIRP) REGULATIONS, 2016
**IN THE MATTER OF CORPORATE INSOLVENCY RESOLUTION PROCESS OF ${cdName.toUpperCase()}**

**Date:** ${dateStr}  
**To:**  
The Board of Directors / Authorized Representative  
**M/s ${targetCompanyName}**  
CIN: ${targetCin}  

---

### SUBJECT: MANDATORY STATUTORY REQUISITION FOR SWORN SECTION 29A AFFIDAVIT & PROMOTER RELATIVE ROSTER UNDER SECTION 2(77) OF COMPANIES ACT, 2013

Dear Sir / Madam,

1. We refer to the Expression of Interest (EOI) submitted by your organization in response to the Form G invitation published in the CIRP of **M/s ${cdName}**.

2. Pursuant to **Section 25(2)(h)** and **Section 30(1)** of the Insolvency and Bankruptcy Code, 2016 ("IBC") read with **Regulation 36A(8)** of the IBBI (Insolvency Resolution Process for Corporate Persons) Regulations, 2016, the Resolution Professional is statutorily mandated to verify that neither the Resolution Applicant nor any "Connected Person" suffers from disqualifications under **Section 29A clauses (a) to (j)**.

3. Under Explanation I to Section 29A(j) read with **Section 5(24A)** and **Section 2(77) of the Companies Act, 2013**, "Connected Persons" includes all promoters, managers, and their relatives (specifically: spouse, father, mother, brother, sister, son, daughter, son's wife, and daughter's husband), as well as significant shareholders holding > 2% equity.

4. Public Ministry of Corporate Affairs (MCA) records identify the following key promoters/directors of your entity:
${promoterListText}

5. **STATUTORY REQUISITION**: You are hereby formally requested to submit within **three (3) business days**:
   - (a) A sworn and notarized **Section 29A Affidavit** on non-judicial stamp paper;
   - (b) Full legal names and Permanent Account Numbers (PAN) of all relatives under Section 2(77) for the promoters listed above;
   - (c) List of all shareholders holding greater than 2% voting rights or significant beneficial ownership (Form MGT-7 / BEN-2);
   - (d) Written self-declaration confirming zero NPA classifications (> 1 year) or invoked personal guarantees.

6. Please take note that non-furnishing of the statutory relative roster and sworn affidavit will preclude your entity from being included in the Provisional List of Eligible Resolution Applicants to be submitted to the Committee of Creditors (CoC).

Yours faithfully,  

**${rpName}**  
Resolution Professional  
In the CIRP of **M/s ${cdName}**  
Registration No: IBBI/IPA-001/IP-P...
`;

  const letterPath = path.join(dossierDir, 'REQUISITION_LETTER_TO_BIDDER.md');
  fs.writeFileSync(letterPath, requisitionLetterContent, 'utf8');

  return {
    intakePath,
    letterPath,
    promotersCount: promoters.length
  };
}

module.exports = {
  generateRequisitionPackage
};
