# THE INSOLVENCY PROFESSIONAL’S OPERATIONAL CODEX
## Chapter 5: RFRP, Evaluation Matrix & Resolution Plan Audit ($T_{115} \to T_{165}$)
### Under the Insolvency and Bankruptcy Code, 2016 & IBBI Regulations

---

## 1. Statutory Mandate & Framework
Within 5 days of issuing the final list of Prospective Resolution Applicants (by **$T_{120}$ / $T_{135}$**), the Resolution Professional issues the **Request for Resolution Plans (RFRP)**, the **Evaluation Matrix**, and grants access to the **Virtual Data Room (VDR)**.

Statutory provisions:
* **Section 25(2)(h):** Present all compliant resolution plans at meetings of the Committee of Creditors.
* **Regulation 36B:** Issue of Request for Resolution Plans (minimum 30 days window for preparation of plans).
* **Section 30(1):** A resolution applicant submits a resolution plan along with an affidavit under Section 29A.
* **Section 30(2):** **The Mandatory Statutory Gate:** Duty of the RP to examine every plan and confirm compliance before submitting it to the CoC.
* **Regulation 37:** Mandatory measures required in a resolution plan (transfer, sale, restructuring, capital reduction).
* **Regulation 38:** Mandatory contents of the resolution plan (priority of payments, feasibility, viability, implementation timelines).
* **Regulation 39(1):** Performance Security (PBG) submitted by the resolution applicant.

---

## 2. RFRP & Evaluation Matrix Architecture

### A. The Request for Resolution Plans (RFRP) Dossier
The RFRP establishes the commercial and legal rules of engagement:
1. **Binding Timeline:** Last date for submission of plans ($T_{165}$), mode of submission (sealed password-protected envelope / encrypted portal).
2. **Earnest Money Deposit (EMD):** Cash deposit or Bank Guarantee (₹50 Lakhs to ₹5 Crores depending on CD scale) securing the bid.
3. **Performance Security (PBG):** Requirement that the Successful Resolution Applicant (SRA) must furnish an unconditional, irrevocable Performance Bank Guarantee (typically 10% to 20% of the total plan value) upon CoC approval.
4. **Virtual Data Room (VDR) & Site Inspection:** Terms under which bidders can conduct physical asset inspections and technical diligence.

### B. The Evaluation Matrix (Regulation 36B(4))
The quantitative and qualitative scoring matrix approved by the CoC:
* **Quantitative Score (e.g. 70-80% Weightage):** Upfront cash component, NPV of deferred payments, infusion of working capital, term loan settlement percentage.
* **Qualitative Score (e.g. 20-30% Weightage):** Bidder track record in the sector, financial strength, turnaround capability, reasonableness of implementation timeline.

---

## 3. The Section 30(2) Mandatory Compliance Audit

The RP is personally and professionally responsible for auditing each submitted plan against the strict non-negotiable requirements of **Section 30(2)**:

```
                      ┌──────────────────────────────────────────┐
                      │    SECTION 30(2) STATUTORY AUDIT GATE    │
                      └────────────────────┬─────────────────────┘
                                           │
     ┌──────────────────┬──────────────────┼──────────────────┬──────────────────┐
     ▼                  ▼                  ▼                  ▼                  ▼
[Clause (a)]       [Clause (b)]       [Clause (c)]       [Clause (d)]       [Clause (e)]
Priority Payment   Equitable Payment  Management of CD   Supervision &      Non-Contravention
of Full IRPC       to OC & Dissenting Post-Approval      Implementation     of Any Prevailing
Process Costs      Financial Creditor (No Promoters)     (Monitoring Comm)  Applicable Law
```

### The Section 30(2) Statutory Checklist:
1. **§ 30(2)(a) — Priority Payment of IRPC:**  
   The plan must provide for payment of all Insolvency Resolution Process Costs (IRPC) in full **in priority over all other debts** before any creditor receives distribution.
2. **§ 30(2)(b) — Minimum Statutory Floors for Operational Creditors:**  
   Operational Creditors must receive payment which shall not be less than:
   * (i) The amount they would have received under Section 53(1) liquidation waterfall, OR
   * (ii) The amount they would have received if the resolution plan value had been distributed in accordance with Section 53(1),  
   **whichever is higher**. Furthermore, this amount must be paid **in priority to Financial Creditors**.
3. **§ 30(2)(b) Proviso — Dissenting Financial Creditor Floor:**  
   Financial Creditors who vote against the plan (dissenting FCs) must be paid an amount not less than the Liquidation Value attributable to them under Section 53(1), and such payment must be made in priority to consenting FCs.
4. **§ 30(2)(c) — Management of the Affairs Post-Approval:**  
   The plan must specify the new Board of Directors, management credentials, and confirm that erstwhile promoters retain no operational control.
5. **§ 30(2)(d) — Implementation & Supervision Mechanism:**  
   The plan must establish an actionable implementation schedule, establish a **Monitoring Committee** (comprising the RP, representatives of lenders, and the SRA), and identify statutory approvals required (CCI, SEBI, RBI).
6. **§ 30(2)(e) — Non-Contravention of Any Law:**  
   The plan must not violate any prevailing Indian statute (e.g. FEMA for foreign bidders, SEBI Takeover Regulations, Competition Act 2002).

---

## 4. Regulation 38: Mandatory Technical & Economic Feasibility

Under Regulation 38, the RP must verify:
* **Feasibility and Viability:** Concrete mathematical demonstration that the business model is economically viable and projected cash flows are sufficient to service the proposed payments.
* **Effective Date:** Specific date from which the plan becomes operational.
* **Treatment of Avoidance Recoveries:** The plan must explicitly state whether any recoveries from pending Section 43, 45, 50, and 66 clawback applications will accrue to the benefit of the creditors or the SRA.

---

## 5. Landmark Supreme Court Jurisprudence

> [!IMPORTANT]
> **1. *Committee of Creditors of Essar Steel India Ltd. v. Satish Kumar Gupta (Supreme Court 2019)***  
> The Supreme Court held that:
> * The **"Commercial Wisdom of the CoC"** is supreme in approving financial distribution.
> * The RP and NCLT have no jurisdiction to question the commercial deal or dictate equal treatment between secured and unsecured creditors.
> * However, the judicial review by the RP and NCLT is strictly confined to ensuring that the statutory floors of **Section 30(2)** have not been violated.

> [!IMPORTANT]
> **2. *Ghanashyam Mishra and Sons Pvt. Ltd. v. Edelweiss Asset Reconstruction Co. Ltd. (Supreme Court 2021)***  
> The **"Clean Slate Doctrine"**: Once a resolution plan is approved by the NCLT under Section 31, all past claims, tax dues, penalties, and criminal liabilities of the Corporate Debtor that were not part of the resolution plan stand extinguished. No surprise tax demands can be levied on the successful bidder.

---

## 6. Local Autonomous Agent Automation (Hayagriva Core)

| Agent | Module | Automated Deliverable |
| :--- | :--- | :--- |
| **`@plan_evaluator`** | `subagents/plan_evaluator.js` | Parses resolution plan PDF and financial model, executes mathematical Section 30(2) checks, and flags statutory shortfalls. |
| **`@auditor`** | `skills/audit-trail/` | Compiles the comparative **Evaluation Matrix Scoring Sheet** across all competing bidders. |
| **`@document`** | `agents/document-agent` | Drafts the formal **Section 30(2) Compliance Audit Memorandum** presented to the CoC. |

---

## 7. Global Compliance Requisitions via `@compliance` (ResolutionBazaar Gatekeeper)

```
[Resolution Plan Submitted]
             │
             ▼
     [@compliance Agent]
             │
             ├──► 1. RBZ-PLAN-COMPLIANCE-15 (Section 30(2) Statutory Engine)
             │    - Validates priority distribution mechanics
             │    - Liquidation value floor verification for OCs & Dissenting FCs
             │    - Deliverable: Section 30(2) Verification Certificate
             │
             └──► 2. RBZ-MACRO-FEASIBILITY-16 (Sector Viability Screening)
                  - Competition Commission of India (CCI) threshold check
                  - Foreign exchange (FDI/FEMA) sectoral cap validation
                  - Deliverable: Regulatory Approvals Readiness Dossier
```

---

## 8. Regulatory Penalties & Common Pitfalls

> [!CAUTION]
> **IBBI Warning Trap 1: Submitting Non-Compliant Plan to CoC**  
> Under Section 30(3), the RP must submit ONLY those plans to the CoC which comply with Section 30(2). Submitting a plan that fails to provide the minimum statutory liquidation value to operational creditors makes the RP directly liable for disciplinary action.

> [!WARNING]
> **IBBI Warning Trap 2: Failure to Secure Competition Commission (CCI) Approval Prior to CoC Vote**  
> Under the IBC Amendment Act, 2018 (proviso to § 31(4)), if a resolution plan requires merger clearance from the Competition Commission of India (CCI), such approval MUST be obtained by the resolution applicant **prior to the approval of the plan by the CoC**.

---
*(Proceed to Chapter 6 for CoC Voting, Form H Filing & NCLT Approval)*
