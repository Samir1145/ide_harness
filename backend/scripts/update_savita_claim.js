const fs = require('fs');
const path = require('path');

const formCContent = `# FORM C
### SUBMISSION OF CLAIM BY FINANCIAL CREDITORS
*(Under Regulation 8 of the Insolvency and Bankruptcy Board of India (Insolvency Resolution Process for Corporate Persons) Regulations, 2016)*

**Date:** 02 September 2026

**To:**  
**Mr. Dharmendra Kumar Bhasin**  
Interim Resolution Professional  
In the matter of **M/s Zebyte Rental Planet Private Limited** (Corporate Debtor)  
**IBBI Registration No.:** IBBI/IPA-002/IP-N00816/2019-2020/12564  
**Address:** 191, Mamta Enclave, Behind Nimantran Banquet Hall, Dhakoli, Zirakpur, SAS Nagar, Punjab - 140603  
**Email for CIRP Correspondence:** cirp.zebyte@gmail.com  
**Registered Email:** ipdkbhasin@gmail.com  

**From:**  
**Financial Creditor:** SAVITA MITTAL  
**Address for Correspondence:** Sector 35, Chandigarh, 160036, India  
**Email:** savita.mittal@gmail.com  
**PAN:** AKMPM2681F  

**Subject:** Submission of proof of claim under Regulation 8 of the IBBI (Insolvency Resolution Process for Corporate Persons) Regulations, 2016 in the CIRP of **M/s Zebyte Rental Planet Private Limited** [CP(IB) No. 112/ALD/2025 - NCLT Allahabad Bench].

---

### PARTICULARS OF FINANCIAL DEBT

| Sl. No. | Particulars | Details |
| :---: | :--- | :--- |
| **1.** | Name of the Financial Creditor | **SAVITA MITTAL** |
| **2.** | Identification number of the Financial Creditor *(CIN / PAN / Passport)* | **PAN: AKMPM2681F** |
| **3.** | Address and email address of the Financial Creditor for correspondence | Sector 35, Chandigarh, 160036, India<br>**Email:** savita.mittal@gmail.com |
| **4.** | Total amount of claim *(including interest / lease arrears accrued up to the Insolvency Commencement Date of 20.08.2026)* | **₹27,07,856.00**<br>*(Rupees Twenty Seven Lakh Seven Thousand Eight Hundred and Fifty Six Only)*<br><br>*(i) **Principal Capital Investment (41 Cloud Storage Particles):** ₹14,17,487.00*<br>*(ii) **Contractual Monthly Lease Arrears up to ICD (23 Months @ ₹56,103.00/month from 01.10.2024 to 20.08.2026):** ₹12,90,369.00*<br>*(iii) **Penal Charges / Other Interest:** ₹0.00* |
| **5.** | Details of claim if made against Corporate Debtor as **Principal Borrower**:<br>(i) Amount of claim<br>(ii) Amount covered by security interest (nature, value, date)<br>(iii) Amount covered by guarantee<br>(iv) Name and address of the guarantor(s) | **Claim Amount:** ₹27,07,856.00<br>**Security Interest:** First pari-passu charge / hypothecation over underlying Cloud Storage server hardware infrastructure and receivables under the Sale and Leaseback arrangement.<br>**Guarantee Amount:** ₹0.00<br>**Guarantor Details:** Personal Guarantees executed by Promoter Directors. |
| **6.** | Details of claim if made against Corporate Debtor as **Guarantor**:<br>(i) Amount of claim<br>(ii) Amount covered by security interest<br>(iii) Amount covered by guarantee<br>(iv) Name and address of principal borrower | **Guarantor Claim:** N/A (Direct liability of Corporate Debtor as Lessee/Debtor under AMPA and Sale & Leaseback Structure).<br>**Security:** N/A<br>**Principal Borrower:** M/s Zebyte Rental Planet Private Limited (CIN: U74999UP2022PTC172707) / Vuenow Group. |
| **7.** | Details of claim in respect of financial debt covered under clauses (h) and (i) of Section 5(8) | Financial debt arising out of an Assured Return Sale-and-Leaseback transaction having the commercial effect of a borrowing under Section 5(8)(f) of the Code (*Pioneer Urban Land & Infrastructure Ltd. v. Union of India*). Officially recognized by the IRP in the Public Announcement (Form A) as **"Financial Creditor in Class (Cloud Particle Owner under Sale and Lease Back Model)"** under Section 21(6A)(b). |
| **8.** | Details of how and when debt incurred *(Sanction Date, Agreement Dates, Disbursement Details, Default History)* | 1. **Integrated Sale-and-Leaseback Financing:** The Claimant invested total consideration of **₹14,17,487.00** across 3 tranches for the purchase of 41 Cloud Storage Data Particles:<br>   * **Batch 1 (02-NOV-2022):** ₹6,88,117.00 paid towards 20 Particles (\`MCP001467/76-95\`, ASA dated 02-Nov-2022, Inv: \`VMS/22-23/11222\`).<br>   * **Batch 2 (31-JAN-2023):** ₹6,88,117.00 paid towards 20 Particles (\`MCP002198/94-113\`, SLA dated 31-Jan-2023, Inv: \`VMS/22-23/21236\`).<br>   * **Batch 3 (30-JUL-2024):** ₹41,253.00 paid towards 1 Top-Up Unit Purchase.<br><br>2. **Connectedness & Lease Execution (Sec 5(24)):** Under Recital B & Clause 2 of the Asset Monetising Program Agreement (AMPA), the Corporate Debtor (*M/s Zebyte Rental Planet Private Limited*, CIN: U74999UP2022PTC172707) took the Claimant's data particles on lease with guaranteed monthly rental payouts (escalated to ₹56,103.00/month) for a 120-month lock-in period.<br><br>3. **Prior Service & Default Milestone:** The Corporate Debtor serviced monthly returns totaling ₹10,90,710.47 across 24 monthly cycles until the last payment on 01-Oct-2024. Thereafter, the Corporate Debtor completely defaulted.<br><br>4. **Arrears Accrued up to Insolvency Commencement Date (20-Aug-2026):**<br>From the default milestone (01-Oct-2024) to the Insolvency Commencement Date (20-Aug-2026), exactly **23 months** of unpaid lease rentals accrued:<br>$$\\text{Arrears} = 23 \\text{ months} \\times ₹56,103.00 = \\mathbf{₹12,90,369.00}$$<br>5. **Total Admissible Claim:**<br>$$\\text{Total Claim} = \\text{Principal } (₹14,17,487.00) + \\text{Arrears } (₹12,90,369.00) = \\mathbf{₹27,07,856.00}$$ |
| **9.** | Details of any mutual credit, mutual debts, or other mutual dealings which may be set-off against the claim | **Nil.** No mutual credits, debts, or dealings available for set-off. |
| **10.** | Details of the bank account to which the claim amount can be transferred pursuant to a resolution plan | **Bank Name:** IndusInd Bank Limited<br>**Account Number:** \`150010091972\`<br>**IFSC Code:** \`INDB0000318\`<br>**Branch:** Chandigarh Sec 35 Branch |
| **11.** | List of documents attached to prove the existence and non-payment of the financial debt | 1. **Annexure-A:** Copies of Asset Sale Agreements (ASA), Service Level Agreements (SLA), and Invoices.<br>2. **Annexure-B:** Copies of Asset Monetising Program Agreements (AMPA) executed with Zebyte.<br>3. **Annexure-C:** 100% Reconciled Bank Statement Ledger (IndusInd Bank A/c 150010091972) with debit proofs & credit history.<br>4. **Annexure-D:** Public Announcement (Form A) in \`CP(IB) No. 112/ALD/2025\` dated 22.08.2026.<br>5. **Annexure-E:** Special Pleading on Sale-and-Leaseback Financial Debt & Single Economic Enterprise.<br>6. **Annexure-F:** Statutory Affidavit & Verification. |

---

### SIGNATURE OF FINANCIAL CREDITOR / AUTHORISED SIGNATORY

**Signature:** ________________________________________  
**Name (in BLOCK LETTERS):** SAVITA MITTAL  
**Position / Designation:** Individual Financial Creditor (Class of Creditors)  
**Address of Signatory:** Sector 35, Chandigarh, 160036, India  

---

### DECLARATION

I, **SAVITA MITTAL**, currently residing at **Sector 35, Chandigarh, 160036, India**, do hereby declare and state as follows:

1. **M/s Zebyte Rental Planet Private Limited**, the Corporate Debtor was, at the Insolvency Commencement Date (\`20.08.2026\`), actually indebted to the Financial Creditor in the sum of **₹27,07,856.00** (*Rupees Twenty Seven Lakh Seven Thousand Eight Hundred and Fifty Six Only*), comprising ₹14,17,487.00 towards principal capital investment in 41 Cloud Storage Data Particles and ₹12,90,369.00 towards 23 months of accrued and unpaid monthly lease returns up to the Insolvency Commencement Date.
2. In respect of the claim of the said sum or any part thereof, I have relied on the documents specified in Item 11 above.
3. The said documents are true, valid, and genuine to the best of my knowledge, information, and belief, and no material facts have been concealed therefrom.
4. In respect of the said sum or any part thereof, neither I nor any person, by my order, to my knowledge or belief, for my use, had or received any manner of satisfaction or security whatsoever, save and except as disclosed in Item 5.
5. I undertake to update the claim as and when the claim is satisfied, partly or fully, from any source in any manner, after the Insolvency Commencement Date.
6. **Related Party Statement:** The Financial Creditor **is NOT** a related party of the Corporate Debtor, as defined under Section 5(24) of the Insolvency and Bankruptcy Code, 2016.
7. **CoC Eligibility:** The Financial Creditor **is** eligible to join the Committee of Creditors (CoC) as a Financial Creditor in a Class and cast voting share through the Authorized Representative.

**Date:** 02 September 2026  
**Place:** Chandigarh, India  

________________________________________  
*(Signature of the Financial Creditor / Deponent)*

---

### VERIFICATION

I, **SAVITA MITTAL**, the claimant hereinabove, do hereby verify that the contents of this proof of claim (Clauses 1 to 11, Declaration, and Annexures) are true and correct to my knowledge and belief, and no material fact has been concealed therefrom.

Verified at **Chandigarh, India** on this **2nd** day of **September**, **2026**.

________________________________________  
*(Signature of the Financial Creditor / Deponent)*

---

# ANNEXURE - E
## SPECIAL LEGAL PLEADING: SALE-AND-LEASEBACK FINANCIAL DEBT & SINGLE ECONOMIC ENTERPRISE

### 1. Statutory Standing as Financial Creditor under Section 5(8)(f) IBC
The underlying arrangement consists of a structured Sale-and-Leaseback transaction wherein the Claimant disbursed capital funds of ₹14,17,487.00 for the acquisition of IT/server assets (Cloud Data Particles) coupled with a contemporaneous long-term lease yielding guaranteed monthly returns. 
As settled by the Hon'ble Supreme Court of India in *Pioneer Urban Land & Infrastructure Ltd. v. Union of India (2019) 8 SCC 416*, any transaction having the commercial effect of a borrowing constitutes a **Financial Debt** under Section 5(8)(f).

### 2. Official Recognition in Public Announcement (Form A)
The Interim Resolution Professional has officially classified particle holders under Item 12 of the Public Announcement in \`CP(IB) No. 112/ALD/2025\` as:
> **"Financial Creditor in Class (Cloud Particle Owner under Sale and Lease Back Model)"** under Section 21(6A)(b) of the Code.

### 3. Computation of Admissible Arrears up to Insolvency Commencement Date
* **Last Credit Received:** 01-Oct-2024 (Monthly escalated payout: ₹56,103.00)
* **Insolvency Commencement Date (ICD):** 20-Aug-2026
* **Accrued Unpaid Period:** 23 Months (Oct 2024 to Aug 2026)
* **Total Default Arrears:** $23 \\times ₹56,103.00 = \\mathbf{₹12,90,369.00}$
* **Total Admissible Claim:** $\\text{Principal } (₹14,17,487.00) + \\text{Arrears } (₹12,90,369.00) = \\mathbf{₹27,07,856.00}$.
`;

const formCAContent = `# FORM CA
### SUBMISSION OF CLAIM BY FINANCIAL CREDITORS IN A CLASS
*(Under Regulation 8A of the Insolvency and Bankruptcy Board of India (Insolvency Resolution Process for Corporate Persons) Regulations, 2016)*

**Date:** 02 September 2026

**To:**  
**Mr. Dharmendra Kumar Bhasin**  
Interim Resolution Professional  
In the matter of **M/s Zebyte Rental Planet Private Limited** (Corporate Debtor)  
**IBBI Registration No.:** IBBI/IPA-002/IP-N00816/2019-2020/12564  
**Address:** 191, Mamta Enclave, Behind Nimantran Banquet Hall, Dhakoli, Zirakpur, SAS Nagar, Punjab - 140603  
**Email for CIRP Correspondence:** cirp.zebyte@gmail.com  
**Registered Email:** ipdkbhasin@gmail.com  

**From:**  
**Financial Creditor in Class:** SAVITA MITTAL  
**Address for Correspondence:** Sector 35, Chandigarh, 160036, India  
**Email:** savita.mittal@gmail.com  
**PAN:** AKMPM2681F  

**Subject:** Submission of proof of claim by Financial Creditor in a Class under Regulation 8A of the IBBI (Insolvency Resolution Process for Corporate Persons) Regulations, 2016 in the CIRP of **M/s Zebyte Rental Planet Private Limited** [CP(IB) No. 112/ALD/2025 - NCLT Allahabad Bench].

---

### PARTICULARS OF FINANCIAL DEBT IN A CLASS

| Sl. No. | Particulars | Details |
| :---: | :--- | :--- |
| **1.** | Name of the Financial Creditor | **SAVITA MITTAL** |
| **2.** | Identification number of the Financial Creditor *(CIN / PAN / Passport)* | **PAN: AKMPM2681F** |
| **3.** | Address and email address of the Financial Creditor for correspondence | Sector 35, Chandigarh, 160036, India<br>**Email:** savita.mittal@gmail.com |
| **4.** | Total amount of claim *(including interest / lease arrears accrued up to the Insolvency Commencement Date of 20.08.2026)* | **₹27,07,856.00**<br>*(Rupees Twenty Seven Lakh Seven Thousand Eight Hundred and Fifty Six Only)*<br><br>*(i) **Principal Capital Investment (41 Cloud Storage Particles):** ₹14,17,487.00*<br>*(ii) **Contractual Monthly Lease Arrears up to ICD (23 Months @ ₹56,103.00/month from 01.10.2024 to 20.08.2026):** ₹12,90,369.00*<br>*(iii) **Penal Charges / Other Interest:** ₹0.00* |
| **5.** | Details of how and when debt incurred | Assured Return Sale-and-Leaseback Investment across 3 tranches for 41 Cloud Storage Particles:<br>• Batch 1 (02-Nov-2022): ₹6,88,117.00<br>• Batch 2 (31-Jan-2023): ₹6,88,117.00<br>• Batch 3 (30-Jul-2024): ₹41,253.00<br>Leased to M/s Zebyte Rental Planet Private Limited under AMPA. Regular payments made until 01-Oct-2024 (Total realized: ₹10,90,710.47). Defaulted since 01-Nov-2024. Accrued default arrears up to ICD (20-Aug-2026) = 23 months × ₹56,103.00 = ₹12,90,369.00. |
| **6.** | Details of any mutual credit, mutual debts, or set-off | **Nil.** |
| **7.** | Details of bank account for transfer pursuant to resolution plan | **IndusInd Bank Limited** \| A/c: \`150010091972\` \| IFSC: \`INDB0000318\` \| Chandigarh Sec 35 Branch |
| **8.** | **Name of the Insolvency Professional chosen by the Financial Creditor in Class to act as Authorized Representative (AR)** | **Mr. Harmanjit Singh**<br>*(As nominated in Public Announcement Form A under Item 13)* |
| **9.** | List of documents attached | 1. Copies of Asset Sale Agreements, SLAs, and AMPA Agreements.<br>2. Reconciled Bank Statement Ledger (IndusInd Bank A/c 150010091972).<br>3. Public Announcement Form A copy.<br>4. Statutory Affidavit & Verification. |

---

### DECLARATION & VERIFICATION

I, **SAVITA MITTAL**, do hereby declare that **M/s Zebyte Rental Planet Private Limited** was, at the Insolvency Commencement Date (\`20.08.2026\`), indebted to me in the sum of **₹27,07,856.00**. I confirm I am not a related party of the Corporate Debtor. I vote in favour of **Mr. Harmanjit Singh** as Authorized Representative for our class of creditors.

Verified at **Chandigarh, India** on this **2nd** day of **September**, **2026**.

________________________________________  
*(Signature of the Financial Creditor in Class)*
`;

const claimAuditContent = `# ⚖️ Forensic Claim Audit Workpad: SAVITA MITTAL

> **Audit Status:** Certified Forensic Reconciliation (Pre-Submission Final)  
> **Target Corporate Debtor:** \`M/s Zebyte Rental Planet Private Limited\` (CIN: \`U74999UP2022PTC172707\`)  
> **NCLT Bench & Matter:** NCLT Allahabad Bench | \`CP(IB) No. 112/ALD/2025\`  
> **Insolvency Commencement Date (ICD):** \`20.08.2026\`  
> **Claim Submission Deadline:** \`03.09.2026\`  
> **Interim Resolution Professional:** Dharmendra Kumar Bhasin (\`cirp.zebyte@gmail.com\`)  
> **Claimant Identity:** SAVITA MITTAL | PAN: \`AKMPM2681F\` | Bank A/c: \`150010091972 (IndusInd Bank Limited, Chandigarh Sec 35 Branch)\`  

---

## 1. ⚠️ Forensic Reconciliation & Statutory Classification

| # | Parameter | Forensic Fact | Legal / CIRP Standing |
| :-: | :--- | :--- | :--- |
| **1** | **Corporate Debtor Identification** | \`M/s Zebyte Rental Planet Private Limited\` (CIN: \`U74999UP2022PTC172707\`), Regd. Office: Sector 62 Noida. | Correct entity under CIRP per Form A published 22.08.2026. |
| **2** | **Class of Creditor Recognition** | Cloud Particle Owner under Sale & Lease Back Model. | Explicitly recognized as **Financial Creditor in Class** under Sec 21(6A)(b) by IRP. |
| **3** | **Gross Capital Deployed** | **₹14,17,487.00** across 3 tranches (41 Cloud Particles). | Core Financial Debt Principal under Section 5(8)(f). |
| **4** | **Prior Realized Returns** | 24 payments received up to 01-Oct-2024 = **₹10,90,710.47**. | Reconciled against IndusInd Bank A/c 150010091972. |
| **5** | **Default Arrears to ICD** | 23 months unpaid (01-Oct-2024 to 20-Aug-2026) @ ₹56,103/mo = **₹12,90,369.00**. | Accrued contractual debt prior to insolvency commencement. |
| **6** | **Total Admissible Claim** | $\\mathbf{₹14,17,487.00 + ₹12,90,369.00 = ₹27,07,856.00}$. | Final crystallized claim filed under Form C / Form CA. |

---

## 2. 📊 Verified Investment Tranches & Cloud Particle Inventory

| Tranche | Debit Date | Amount Paid (₹) | Underlying Reference | Invoiced Serial Number Range | Particles |
| :---: | :---: | :---: | :--- | :--- | :---: |
| **Batch 1** | **02-NOV-22** | **₹6,88,117.00** | Asset Sale Agreement (VMS/22-23/11222) | \`MCP001467/76-95\` | **20** |
| **Batch 2** | **31-JAN-23** | **₹6,88,117.00** | Service Level Agreement (VMS/22-23/21236) | \`MCP002198/94-113\` | **20** |
| **Batch 3** | **30-JUL-24** | **₹41,253.00** | Top-Up Unit Purchase | \`Unit Top-Up\` | **1** |
| **TOTAL** | | **₹14,17,487.00** | | | **41 Particles** |

---

## 3. 🎯 Final Crystallized Claim Summary

* **Principal Capital Consideration:** ₹14,17,487.00
* **Contractual Lease Arrears (23 mos @ ₹56,103/mo):** ₹12,90,369.00
* **Total Claim Amount:** **₹27,07,856.00** (*Rupees Twenty Seven Lakh Seven Thousand Eight Hundred and Fifty Six Only*)
* **Authorized Representative Choice:** Mr. Harmanjit Singh
`;

const claimsRegistryContent = `# claims_registry

| Creditor | Amount | Form Type | Status |
| --- | --- | --- | --- |
| SAVITA MITTAL | ₹27,07,856.00 | FORM-C / FORM-CA | 📝 DRAFT RECONCILED (Sep 02, 2026) |
`;

const caseDir = '/Users/atulgrover/Desktop/Clients/Savita Mittal Claimant (Vikas Garg)';

// 1. Write Form C
fs.writeFileSync(path.join(caseDir, 'CLAIM_SAVITA_MITTAL_FORM_C.md'), formCContent, 'utf8');
const claimsDir = path.join(caseDir, '02_claims', 'Savita Mittal');
if (!fs.existsSync(claimsDir)) fs.mkdirSync(claimsDir, { recursive: true });
fs.writeFileSync(path.join(claimsDir, 'CLAIM_SAVITA_MITTAL_FORM_C.md'), formCContent, 'utf8');
console.log('✓ Wrote CLAIM_SAVITA_MITTAL_FORM_C.md');

// 2. Write Form CA
fs.writeFileSync(path.join(caseDir, 'CLAIM_SAVITA_MITTAL_FORM_CA.md'), formCAContent, 'utf8');
fs.writeFileSync(path.join(claimsDir, 'CLAIM_SAVITA_MITTAL_FORM_CA.md'), formCAContent, 'utf8');
console.log('✓ Wrote CLAIM_SAVITA_MITTAL_FORM_CA.md');

// 3. Write Claim Audit
fs.writeFileSync(path.join(claimsDir, 'CLAIM_AUDIT.md'), claimAuditContent, 'utf8');
console.log('✓ Wrote CLAIM_AUDIT.md');

// 4. Write Claims Registry
fs.writeFileSync(path.join(claimsDir, 'claims_registry.md'), claimsRegistryContent, 'utf8');
console.log('✓ Wrote claims_registry.md');

// Also write copies into workspace claims folder if exists
const localClaimsDir = path.join(__dirname, '..', '..', 'claims_live_run');
if (fs.existsSync(localClaimsDir)) {
  fs.writeFileSync(path.join(localClaimsDir, 'CLAIM_SAVITA_MITTAL_FORM_C.md'), formCContent, 'utf8');
  fs.writeFileSync(path.join(localClaimsDir, 'CLAIM_SAVITA_MITTAL_FORM_CA.md'), formCAContent, 'utf8');
}

console.log('All claim documents successfully generated and synced.');
