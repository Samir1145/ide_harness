# THE INSOLVENCY PROFESSIONAL’S OPERATIONAL CODEX
## Complete Statutory & Operational Practice Manual for CIRP Execution
### Under the Insolvency and Bankruptcy Code, 2016 & IBBI Regulations

---

## 📖 PREFACE & MANUAL ARCHITECTURE

This Codex serves as the authoritative, step-by-step statutory and technical operational manual for an Insolvency Professional (IP) appointed as Interim Resolution Professional (IRP) or Resolution Professional (RP). 

Every chapter aligns:
1. **The Statutory Mandate:** Exact IBC Sections, IBBI (CIRP) Regulations, and relevant Supreme Court / NCLAT judicial precedents.
2. **Information & Documentation Inputs:** What legal, corporate, and financial records the IP receives or must seize.
3. **The Professional's Operational Duties:** Strict procedural steps, checklists, and statutory deadlines ($T_0 \to T_{330}$).
4. **Local Autonomous Agent Automation:** What Hayagriva's on-device specialized coworkers execute locally without cloud exposure.
5. **Global Compliance Gatekeeper Requisitions:** What statutory negative assurances, court sweeps, and forensic registries are requisitioned via `@compliance` through ResolutionBazaar (LEXAI API).
6. **Regulatory Penalties & Common Pitfalls:** IBBI Disciplinary Committee precedents, compliance traps, and defense safeguards.

---

## 📑 TABLE OF CONTENTS

- [Chapter 0: The Estate Genesis & Intake ($T_0 \to T_3$)](#chapter-0-the-estate-genesis--intake-t_0-to-t_3)
- [Chapter 1: Claim Intake, VDR Sanitization & Creditor Verification ($T_3 \to T_{14}$)](#chapter-1-claim-intake-vdr-sanitization--creditor-verification-t_3-to-t_14)
- [Chapter 2: Verification of Claims, CoC Constitution & 1st Meeting ($T_{14} \to T_{30}$)](#chapter-2-verification-of-claims-coc-constitution--1st-meeting-t_14-to-t_30)
- [Chapter 3: Information Memorandum, Valuations & Avoidance Inquest ($T_{30} \to T_{75}$)](#chapter-3-information-memorandum-valuations--avoidance-inquest-t_30-to-t_75)
- [Chapter 4: Form G, Expression of Interest & Section 29A Inquest ($T_{75} \to T_{115}$)](#chapter-4-form-g-expression-of-interest--section-29a-inquest-t_75-to-t_115)
- [Chapter 5: RFRP, Evaluation Matrix & Resolution Plan Audit ($T_{115} \to T_{165}$)](#chapter-5-rfrp-evaluation-matrix--resolution-plan-audit-t_115-to-t_165)
- [Chapter 6: CoC Voting, Form H Filing & NCLT Approval ($T_{165} \to T_{180+}$)](#chapter-6-coc-voting-form-h-filing--nclt-approval-t_165-to-t_180)

---

## CHAPTER 0: THE ESTATE GENESIS & INTAKE ($T_0 \to T_3$)

### 1. The Statutory Trigger: Where the Assignment Begins
The assignment begins on **$T_0$ — The Insolvency Commencement Date (ICD)**. This is the exact date on which the Adjudicating Authority (NCLT Bench) pronounces the **Admission Order** under:
* **Section 7:** Financial Creditor Application (e.g. Banks, NBFCs, Homebuyers).
* **Section 9:** Operational Creditor Application (e.g. Vendors, Suppliers, Employees).
* **Section 10:** Corporate Applicant (Voluntary CIRP by Corporate Debtor itself).

```
[Pre-Appointment: Form 2 Consent & AFA Check]
                      │
                      ▼
        ┌───────────────────────────┐
        │ $T_0$: NCLT Admission      │
        │ Order Pronounced          │
        └─────────────┬─────────────┘
                      │
     ┌────────────────┴────────────────┐
     ▼                                 ▼
[Within 48 Hours]                [Within 72 Hours / $T_3$]
• Handover Demand (§§ 17, 19)    • Public Announcement Form A (Reg 6)
• Bank Debit Mandates Frozen     • IBBI Portal Upload
• Moratorium Served (§ 14)       • Creditor Web Portal Activated
```

---

### 2. Information & Documents Received by the IP
At $T_0$, the IRP must assemble the **Primary Genesis Dossier**:
1. **Certified Copy of the NCLT Admission Order:** Contains Corporate Debtor name, CIN, Bench, Court No., admitted default quantum, IRP appointment name, and IBBI registration number.
2. **Company Petition with All Annexures:**
   * Section 7: Form 1 + Loan Agreement + Sanction Letter + Statement of Accounts + NeSL Record of Default (Form D) + CIBIL Report.
   * Section 9: Form 5 + Invoices + Demand Notice (Form 3/4) + Section 9(3)(b) Bank Affidavit + Section 9(3)(c) NeSL certificate.
3. **Company Master Data:** Extracted from MCA-21 (CIN, ROC jurisdiction, authorized/paid-up capital, list of directors with DINs, charge register).
4. **Form 2 Written Consent:** The consent originally signed by the IRP verifying eligibility and valid Authorisation for Assignment (AFA).

---

### 3. IP’s Statutory Duties & Action Checklist ($T_0 \to T_3$)

#### Task 1: Freeze Bank Accounts & Extinguish Promoters' Mandates (§ 17(1)(d))
* **Action:** Serve an immediate formal notice under Section 17 read with Section 14 to every bank branch holding accounts of the Corporate Debtor.
* **Instruction to Banks:** All existing cheque-signing mandates and net-banking authorisations of erstwhile promoters/directors are immediately extinguished. Credit deposits remain permitted, but debit transactions are blocked without IRP sign-off.
* **Account Transition:** Instruct banks to provide statement of accounts from inception of the financial year and request creation of a new operating account / change of signatory to the IRP.

#### Task 2: Public Announcement in Form A (Regulation 6)
* **Deadline:** Must be dispatched within **72 hours ($T_3$)** of receipt of the order.
* **Publication Channels:**
  * One English newspaper with wide circulation at the Registered Office & Principal Business Office.
  * One Regional language newspaper with wide circulation at the Registered Office.
  * Uploaded to the IBBI Website portal.
  * Hosted on the Corporate Debtor’s corporate website (if functional).
* **Statutory Contents:** Name & CIN of CD, date of closure of CIRP ($T_{180}$), classes of creditors, address & email of IRP for claim submission, and **$T_{14}$ Claim Submission Cutoff**.

#### Task 3: Serve Moratorium Notification (§ 14)
* **Action:** Serve certified copies of the order intimating the statutory stay to:
  * Registrar of Companies (ROC).
  * High Courts, City Civil Courts, and District Courts where recovery suits are pending.
  * Arbitral Tribunals and DRT/DRAT.
  * Tax Authorities (GST, Income Tax, Customs, DGGI) to prohibit attachment of bank accounts or property.
  * Stock Exchanges (BSE, NSE) if the Corporate Debtor is a listed entity.

#### Task 4: Demand Possession & Book Handover (§ 18 & § 19)
* **Action:** Issue formal 48-hour compliance demand letter to erstwhile directors and statutory auditors:
  * Handover of registered office, factories, warehouses, and physical assets.
  * Surrender of digital ERP credentials (SAP, Tally, Zoho), bank credentials, and digital signature certificates (DSC).
  * Delivery of minute books, statutory registers, and audited financials for the last 3 financial years.
* **Remedy if Resisted:** If directors fail to cooperate within 48 hours, immediately file an **Application under Section 19(2)** before the NCLT seeking police assistance and coercive orders against promoters.

---

### 4. Local Autonomous Agent Automation (Hayagriva Core)

| Agent | Module | Automated Deliverable |
| :--- | :--- | :--- |
| **`@order`** | `parsers/order_parser.js` | Ingests NCLT PDF, parses Bench, Court No., CD Name, CIN, Admitted Debt, Default Date, and IRP details into `case_kv_dictionary.json`. |
| **`@timeline`** | `core/timeline.js` | Ingests $T_0$ date, calculates statutory timeline milestones ($T_0 \to T_{330}$), and builds `timeline.md`. |
| **`@forms`** | `pipeline/forms/` | Deterministically generates **Form A (Public Announcement)** ready for newspaper publication. |
| **`@nclt`** | `core/drafting.js` | Generates standardized **Section 14 Moratorium Intimation Notices** for banks, courts, and utilities. |
| **`@document`** | `agents/document-agent` | Drafts the **Section 17/19 Asset & Password Handover Demand Letter** addressed to erstwhile promoters. |

---

### 5. Global Compliance Requisitions via `@compliance` (ResolutionBazaar Gatekeeper)

The moment the Admission Order is registered in the workbench, `@compliance` dispatches three critical requisitions to the **LEXAI / ResolutionBazaar Compliance Gateway**:

```
[Admission Order Ingested]
             │
             ▼
     [@compliance Agent]
             │
             ├──► 1. RBZ-IRP-ELIGIBILITY-05 (Independence Clearance)
             │    - IBBI AFA Validity Screen
             │    - Conflict check vs Petitioner & CD
             │    - Deliverable: A4 Court Certificate
             │
             ├──► 2. RBZ-NCLT-ADMISSION-06 (Moratorium Judicial Sweep)
             │    - Pan-India eCourts, High Court & DRT sweep
             │    - Active attachments & pending auctions
             │    - Deliverable: Moratorium Stay Dossier
             │
             └──► 3. RBZ-BENAMI-CROSSHOLDING-07 (Group Architecture)
                  - MCA-21 corporate cross-holding sweep
                  - Promoters' DIN network & sister concerns
                  - Deliverable: Entity Graph for Avoidance Inquest
```

---

### 6. Regulatory Penalties & Common Pitfalls

> [!CAUTION]
> **IBBI Warning Trap 1: Calculating $T_{14}$ incorrectly in Form A**  
> Under Regulation 6(2)(c), the last date for submission of claims is **14 days from the date of appointment of the IRP**, NOT 14 days from the date of newspaper publication. If the order is dated 12th February, $T_{14}$ is strictly 26th February, even if publication occurs on 15th February. Calculating this incorrectly triggers IBBI show-cause notices.

> [!WARNING]
> **IBBI Warning Trap 2: Failure to notify IBBI within 7 days**  
> Under Regulation 4(2), the IRP must intimate the Board (IBBI) of his appointment along with a copy of the public announcement within 7 days of appointment. This must be completed on the IBBI electronic reporting portal.

> [!IMPORTANT]
> **Judicial Precedent: *Anand Rao Korada v. Varsha Fabrics (Supreme Court 2020)***  
> The Supreme Court held that any auction, attachment, or execution proceeding conducted by any court or tribunal against the corporate debtor after $T_0$ is *void ab initio* under Section 14 moratorium. The IP is legally protected in taking back custody of attached assets.

---
*(Proceed to Chapter 1 for Claim Intake & Virtual Data Room Sanitization)*
