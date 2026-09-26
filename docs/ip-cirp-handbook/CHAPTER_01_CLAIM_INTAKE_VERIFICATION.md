# THE INSOLVENCY PROFESSIONAL’S OPERATIONAL CODEX
## Chapter 1: Claim Intake, VDR Sanitization & Creditor Verification ($T_3 \to T_{14}$)
### Under the Insolvency and Bankruptcy Code, 2016 & IBBI Regulations

---

## 1. Statutory Mandate & Framework
Following the publication of Form A at $T_3$, creditors of all tiers submit proofs of claim up to **$T_{14}$** (14 days from the Insolvency Commencement Date). 

The statutory framework governing claim receipt and verification includes:
* **Section 18(1)(b):** Duty of the IRP to receive and collate all claims submitted by creditors.
* **Section 25(2)(e):** Maintain an updated list of claims.
* **Regulation 7:** Operational Creditors (Form B).
* **Regulation 8:** Financial Creditors (Form C).
* **Regulation 8A:** Financial Creditors in a Class (Form CA) — e.g. Homebuyers, Real Estate Allottees, Debenture Holders.
* **Regulation 9:** Workmen and Employees (Form D).
* **Regulation 9A:** Creditors other than Financial / Operational Creditors (Form F) — e.g. Government Dues, Statutory Authorities, Guarantee Claimants.
* **Regulation 12:** Submission of proof of claims.
* **Regulation 15:** Determination of amount of claim (Foreign currency converted at RBI reference rate on $T_0$).

---

## 2. Information & Proofs Received by the IP
During the $T_3 \to T_{14}$ window, the IP receives claims across five statutory schedules:

```
                          ┌───────────────────────────┐
                          │   CREDITOR CLAIMS INTAKE  │
                          │        ($T_3 \to T_{14}$)  │
                          └─────────────┬─────────────┘
                                        │
     ┌──────────────┬───────────────────┼───────────────────┬──────────────┐
     ▼              ▼                   ▼                   ▼              ▼
  [Form B]       [Form C]           [Form CA]            [Form D]       [Form F]
Operational     Financial       Class of Creditors       Workmen       Other Claims
 Creditors      Creditors          (Homebuyers)        & Employees    (Govt/Taxes)
```

### Claim Dossier Components per Creditor
1. **Duly Executed Claim Form:** Signed by the authorized representative with board resolution / Power of Attorney (POA).
2. **Affidavit & Verification:** Duly sworn affidavit on non-judicial stamp paper verifying truthfulness of claim.
3. **Substantiating Proof Documents:**
   * *Financial Creditors:* Loan agreements, sanction letters, balance confirmation, mortgage deed, CERSAI search report, NeSL IU record of default (Form D).
   * *Operational Creditors:* Invoices, delivery challans, purchase orders, lorry receipts (LR), GST GSTR-1/GSTR-3B filings, demand notices.
   * *Homebuyers:* Builder-Buyer Agreement (BBA), payment receipts, bank sanction, possession allotment letter.
   * *Workmen/Employees:* Appointment letter, salary slips, provident fund (PF/ESIC) records, form 16.

---

## 3. IP's Operational Duties & Verification Protocols

#### Rule 1: The "Verification, Not Adjudication" Principle (Supreme Court Doctrine)
> [!IMPORTANT]
> **Judicial Precedent: *Swiss Ribbons Pvt. Ltd. v. Union of India (Supreme Court 2019)***  
> The Supreme Court held that the Resolution Professional has **only administrative and facilitative powers** to verify and collate claims, NOT quasi-judicial adjudicatory powers. The IP cannot decide disputes, determine damages, or assess complex unliquidated contract breaches. If a claim is supported by books and prima facie documentation, it must be verified; if disputed without record, it must be admitted provisionally or relegated to the Adjudicating Authority.

#### Rule 2: Strict Interest Cutoff at $T_0$
* **The Rule:** No interest, penal interest, or compounding charges can accrue after **$T_0$ (Insolvency Commencement Date)**.
* **Action:** The IP must review every claim calculation sheet. Any interest calculated from $T_0$ onward must be strictly disallowed.

#### Rule 3: Reversal of Penalties & Liquidated Damages
* Unsubstantiated contractual penal charges (penal interest over baseline, liquidated damages not crystalized by a court or arbitral decree) must be excised from the admitted claim quantum.

#### Rule 4: Regulation 15 Foreign Currency Conversion
* All foreign currency debt (e.g. USD External Commercial Borrowings or Euro supplier credit) must be converted into Indian Rupees (INR) at the **official RBI reference exchange rate prevailing on $T_0$**.

#### Rule 5: Cross-Verification against Corporate Debtor Books (§ 18(1)(b))
* Compare claim amounts against the Corporate Debtor’s audited balance sheet, Tally/SAP ledgers, and GSTR-2B inward supplies.
* If a creditor claims ₹10 Crores but the company books show only ₹7 Crores:
  1. Admit ₹7 Crores as **Admitted Claim**.
  2. Mark ₹3 Crores as **Under Verification / Disallowed**, issue a requisition email, and grant 7 days to produce missing reconciliation proofs.

---

## 4. Virtual Data Room (VDR) & PII Redaction Protocols

Under the **Digital Personal Data Protection Act, 2023 (DPDP Act)** and NCLT Practice Directions, unredacted claim forms cannot be uploaded to open creditor portals or public dockets.

### Mandatory Redaction Matrix
* **PII Redacted for Public Inspection:** Aadhaar numbers, PAN numbers, personal residential addresses, personal bank account numbers, personal phone numbers, and director specimen signatures.
* **Preserved Legal Metadata:** Legal corporate names, registered office, admitted claim quantum, security interest details, and voting share percentage.

---

## 5. Local Autonomous Agent Automation (Hayagriva Core)

| Agent | Module | Automated Deliverable |
| :--- | :--- | :--- |
| **`@claims`** | `subagents/claim-financial.js` | Parses Form B/C/CA/D/F PDF and Excel submissions into normalized JSON records. |
| **`@claim_verify`** | `skills/claim-verification/` | Cross-verifies claims against company books, recalculates interest stopping strictly at $T_0$, and computes disallowances. |
| **`@redactor`** | `skills/pii-redaction/` | Automatically redacts PAN, Aadhaar, bank details, and personal mobile numbers generating **Court/VDR-Compliant Public Claim Exhibits**. |
| **`@auditor`** | `skills/audit-trail/` | Synchronizes admitted numbers directly into `claims_registry.md` and updates `case_kv_dictionary.json`. |

---

## 6. Global Compliance Requisitions via `@compliance` (ResolutionBazaar Gatekeeper)

During the claim verification window, `@compliance` dispatches two critical external screening requisitions:

```
[Creditor Claims Submitted]
            │
            ▼
    [@compliance Agent]
            │
            ├──► 1. RBZ-CLAIM-AUDIT-08 (IU & Registry Counter-Verification)
            │    - Queries NeSL Information Utility for Form D default certificates
            │    - CERSAI charge verification for secured financial creditors
            │    - Deliverable: Negative Pledge & Priority of Charge Dossier
            │
            └──► 2. RBZ-WILFUL-DEFAULT-03 (Creditor Related Party Audit)
                 - Screens claimed creditors against Corporate Debtor promoter web
                 - Identifies claims filed by related parties or benami entities
                 - Deliverable: Section 21(2) Disqualification Report
```

---

## 7. Regulatory Penalties & Common Pitfalls

> [!CAUTION]
> **IBBI Warning Trap 1: Rejection of Claims without Giving Reasons**  
> Under IBBI Disciplinary Precedents, an IP who rejects or reduces a creditor’s claim without providing a written, itemized communication detailing why the amount was disallowed commits professional misconduct. The IP must maintain a transparent `Disallowance Ledger`.

> [!WARNING]
> **IBBI Warning Trap 2: Failure to verify CERSAI Charges**  
> Classifying a creditor as a "Secured Financial Creditor" solely on their claim statement without verifying CERSAI registration and Form CHG-1 filing at ROC violates Section 77 of the Companies Act, 2013 and IBC Section 52. Unregistered charges are void against the liquidator/IRP.

---
*(Proceed to Chapter 2 for CoC Constitution & 1st Meeting Procedures)*
