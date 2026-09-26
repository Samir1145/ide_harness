# THE INSOLVENCY PROFESSIONAL’S OPERATIONAL CODEX
## Chapter 6: CoC Voting, Form H Filing & NCLT Approval ($T_{165} \to T_{180+}$)
### Under the Insolvency and Bankruptcy Code, 2016 & IBBI Regulations

---

## 1. Statutory Mandate & Framework
Upon completion of plan discussions and negotiations, the Committee of Creditors votes to approve the final resolution plan. The Resolution Professional must then file **Form H** and apply to the NCLT under **Section 31** for judicial approval.

Key statutory provisions:
* **Section 30(4):** Approval of the resolution plan requires a **vote of not less than 66% of voting share** of the Financial Creditors.
* **Section 31(1):** Approval of the resolution plan by the Adjudicating Authority (NCLT), making it binding on the Corporate Debtor, its employees, members, creditors, guarantors, and Central/State Governments.
* **Regulation 39(4):** The RP must submit the CoC-approved resolution plan to the NCLT at least **15 days before the maximum period for completion of CIRP ($T_{165} \to T_{180}$)** accompanied by **Form H (Compliance Certificate)**.
* **Section 32A:** Immunity of the Corporate Debtor from liability for offences committed prior to the commencement of CIRP (statutory protection against ED, CBI, SFIO attachments).
* **Section 33:** Contingency routing to Liquidation if no resolution plan is approved by 66% voting share before the expiration of the statutory timeline.

---

## 2. CoC Electronic Voting & 66% Statutory Threshold

### A. The Voting Protocol
1. **Presentation:** The RP presents all compliant plans side-by-side along with the evaluation matrix scoring and feasibility reports.
2. **CoC Deliberation:** CoC negotiates with resolution applicants for upward revision of the financial package.
3. **Electronic Voting Window (Regulation 26):**
   * The RP opens an electronic voting portal (minimum 24 hours to 48 hours).
   * Voting options: *Approve / Reject / Abstain*.

### B. The 66% Approval Rule
$$\text{Approved Plan Voting Share} \ge 66.00\%$$
* If multiple plans cross 66%, the plan securing the highest overall voting percentage is declared approved by the CoC.
* If no plan secures 66%, the CoC may vote to request an extension under Section 12 or resolve to liquidate the Corporate Debtor under Section 33.

---

## 3. Form H (Compliance Certificate) Architecture

Under Regulation 39(4), the RP must personally sign and execute **Form H**, certifying under statutory oath that all provisions of the Code and Regulations have been complied with:

```
                            ┌───────────────────────────────┐
                            │     FORM H (REGULATION 39(4)) │
                            │     COMPLIANCE CERTIFICATE    │
                            └───────────────┬───────────────┘
                                            │
     ┌──────────────────┬───────────────────┼───────────────────┬──────────────────┐
     ▼                  ▼                   ▼                   ▼                  ▼
[CIRP Timeline     [Valuation          [Claims Realization [Section 29A &     [Implementation
Chronology]        Summary]            & Haircut Grid]     30(2) Affidavits]   & PBG Deposit]
T0, Form A,        Fair Value,         Amount Claimed,     Negative Checks     10-20% PBG
Form G, CoC Dates  Liquidation Value   Admitted, Paid      Completed           Furnished
```

### Mandatory Certifications in Form H:
1. **Chronological CIRP Calendar:** Full audit trail of $T_0$, Form A publication, 1st CoC meeting, Form G issuance, and plan receipt dates.
2. **Valuation Disclosure:** Disclosure of Fair Value and Liquidation Value determined by the registered valuers (unsealed for NCLT scrutiny).
3. **Distribution Table:** Comprehensive matrix detailing amounts claimed, admitted, and provided for:
   * (a) Insolvency Resolution Process Costs.
   * (b) Secured Financial Creditors (Assenting vs. Dissenting).
   * (c) Unsecured Financial Creditors.
   * (d) Operational Creditors (Workmen, Employees, Suppliers, Government Dues).
   * (e) Other Creditors.
4. **Performance Bank Guarantee (PBG):** Confirmation that the SRA has deposited the required irrevocable Performance Security under Regulation 39(4).
5. **Section 29A & 30(2) Certification:** Explicit confirmation by the RP that the SRA is eligible under Section 29A and the plan satisfies all clauses of Section 30(2).

---

## 4. Section 31 Approval Application Before NCLT

### Structure of the NCLT Application:
* **Master Interlocutory Application (IA):** Filed under Section 30(6) read with Section 31(1) praying for approval of the plan.
* **Annexure A:** True copy of the Resolution Plan approved by CoC.
* **Annexure B:** Duly signed and executed **Form H**.
* **Annexure C:** Certified copy of CoC meeting minutes and electronic voting results showing $\ge 66\%$ approval.
* **Annexure D:** Performance Bank Guarantee receipt / bank confirmation letter.
* **Annexure E:** Section 29A affidavit and connected persons diligence docket.

---

## 5. Section 32A Clean Slate & Post-Approval Transition

> [!IMPORTANT]
> **Judicial Precedent: *Manish Kumar v. Union of India (Supreme Court 2021)***  
> The Supreme Court upheld the constitutional validity of **Section 32A**. The Corporate Debtor’s liability ceases for any offence committed prior to CIRP upon approval of the resolution plan by the NCLT, provided the SRA is not a related party. Enforcement agencies (ED, SFIO, Police) **cannot attach properties** of the Corporate Debtor for past crimes of erstwhile management once Section 31 approval is granted.

### Handover to Monitoring Committee & SRA
1. **Creation of Monitoring Committee:** Typically comprises the RP (as Chairman), 2 lender representatives, and 2 SRA nominees.
2. **Payment Distribution:** Upfront cash distributed to creditors strictly as per the approved Section 30(2) schedule.
3. **Board Restructuring:** Erstwhile directors formally vacate office; new directors nominated by the SRA are appointed on MCA-21.
4. **Discharge of RP:** The RP files a final closure intimation with IBBI and hands over complete control, physical keys, and digital assets to the Successful Resolution Applicant.

---

## 6. Local Autonomous Agent Automation (Hayagriva Core)

| Agent | Module | Automated Deliverable |
| :--- | :--- | :--- |
| **`@forms`** | `pipeline/forms/` | Generates the complete, mathematically validated **Form H (Compliance Certificate)** with exact claims reconciliation. |
| **`@nclt`** | `core/drafting.js` | Drafts the **Section 31 Resolution Plan Approval Application** and supporting affidavits ready for NCLT filing. |
| **`@auditor`** | `skills/audit-trail/` | Reconciles final distribution percentages across all creditor classes into `claims_registry.md`. |
| **`@compliance`** | `gatekeeper/` | Audits the final closure docket against all statutory IBBI reporting schedules. |

---

## 7. Global Compliance Requisitions via `@compliance` (ResolutionBazaar Gatekeeper)

```
[CoC Approves Plan by 66%]
            │
            ▼
    [@compliance Agent]
            │
            ├──► 1. RBZ-FORM-H-VALIDATOR-17 (Form H Mathematical Audit)
            │    - Cross-validates Form H distribution against Section 53 waterfall
            │    - Verifies PBG validity and liquidation floor thresholds
            │    - Deliverable: Form H Statutory Verification Certificate
            │
            └──► 2. RBZ-CLOSURE-AUDIT-18 (CIRP Exit & Transition Docket)
                 - Section 32A immunity verification dossier
                 - ROC & MCA-21 post-approval capital reduction filing check
                 - Deliverable: CIRP Estate Handover & Discharge Certificate
```

---

## 8. Summary: The Complete CIRP Lifecycle at a Glance

```
$T_0$ : NCLT Admission Order pronounced (Moratorium declared, IRP appointed)
$T_3$ : Form A Public Announcement published in newspapers & IBBI
$T_{14}$: Cutoff date for submission of claims
$T_{21}$: Verification of claims completed; Report Certifying CoC filed
$T_{30}$: 1st CoC Meeting held; Appointment of RP confirmed
$T_{75}$: Form G published inviting Expression of Interest (EOI)
$T_{95}$: Information Memorandum (IM) issued to eligible PRAs
$T_{115}$: Final list of PRAs issued; Section 29A negative diligence completed
$T_{135}$: RFRP & Evaluation Matrix issued; Section 43/45/66 avoidance applications filed
$T_{165}$: Resolution Plans submitted by PRAs accompanied by EMD
$T_{180}$: CoC approves plan by 66%; Form H executed; Section 31 Application filed with NCLT
```

---
*(End of The Insolvency Professional's Operational Codex)*
