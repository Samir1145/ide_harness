# THE INSOLVENCY PROFESSIONAL’S OPERATIONAL CODEX
## Complete Step-by-Step CIRP Execution & Agent Governance Manual
### Under the Insolvency and Bankruptcy Code, 2016 (IBC 2.0) & IBBI Regulations

---

## 🏛️ OVERVIEW

This Codex is an exhaustive, practitioner-grade operational manual written from scratch to guide an **Insolvency Professional (IP)** through every statutory phase of a Corporate Insolvency Resolution Process (CIRP).

It bridges the gap between **substantive statutory law** and **autonomous digital execution**, documenting:
1. Exactly what information and legal documents the IP receives at each milestone ($T_0 \to T_{180+}$).
2. What operational duties, checklists, and fiduciary standards are expected of the IP.
3. Which **Local Autonomous Agents** (running privately on-device inside Hayagriva) automate the mechanical workload.
4. Which **Global Statutory Intelligence Agents** are dispatched via `@compliance` to ResolutionBazaar (LEXAI API) for pan-India court sweeps, MCA-21 registry cross-linking, and Section 29A negative diligence.

---

## 📚 CODEX CHAPTERS

| Chapter | Phase & Statutory Timeline | Core Subject & Focus |
| :--- | :--- | :--- |
| [**Chapter 0: The Estate Genesis & Intake**](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/ip-cirp-handbook/CHAPTER_00_ESTATE_GENESIS_INTAKE.md) | **$T_0 \to T_3$** | NCLT Admission Order intake, bank mandate freeze (§ 17), Moratorium notification (§ 14), Form A Public Announcement (Reg 6), and initial asset seizure. |
| [**Chapter 1: Claim Intake & Verification**](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/ip-cirp-handbook/CHAPTER_01_CLAIM_INTAKE_VERIFICATION.md) | **$T_3 \to T_{14}$** | Forms B, C, CA, D, F collation, interest cutoff at $T_0$, VDR sanitization & DPDP PII redaction, Swiss Ribbons non-adjudication doctrine. |
| [**Chapter 2: CoC Constitution & Meetings**](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/ip-cirp-handbook/CHAPTER_02_COC_CONSTITUTION_MEETINGS.md) | **$T_{14} \to T_{30}$** | Mathematical voting share calculation, Section 21(2) Related Party disqualification, Authorized Representative protocol, Report on CoC constitution, and 1st CoC meeting. |
| [**Chapter 3: IM, Valuations & Avoidance**](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/ip-cirp-handbook/CHAPTER_03_IM_VALUATIONS_AVOIDANCE.md) | **$T_{30} \to T_{75}$** | Confidential Information Memorandum (IM), Fair Value vs. Liquidation Value secrecy protocol, and forensic investigation of PUFE transactions (§§ 43, 45, 50, 66). |
| [**Chapter 4: Form G, EOI & Section 29A**](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/ip-cirp-handbook/CHAPTER_04_FORM_G_EOI_SECTION_29A.md) | **$T_{75} \to T_{115}$** | Publication of Form G, minimum eligibility criteria formulation, provisional list of PRAs, and the 10-clause Section 29A disqualification firewall inquest. |
| [**Chapter 5: RFRP & Resolution Plan Audit**](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/ip-cirp-handbook/CHAPTER_05_RFRP_EVALUATION_PLAN_AUDIT.md) | **$T_{115} \to T_{165}$** | Evaluation Matrix, Request for Resolution Plans (RFRP), Performance Bank Guarantee (PBG), and the mandatory Section 30(2) & Regulation 38 statutory compliance audit. |
| [**Chapter 6: CoC Voting, Form H & NCLT Approval**](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/ip-cirp-handbook/CHAPTER_06_VOTING_FORM_H_NCLT_APPROVAL.md) | **$T_{165} \to T_{180+}$** | Electronic voting (66% approval threshold), execution of Form H Compliance Certificate, Section 31 Approval Application, Section 32A Clean Slate immunity, and estate handover. |

---

## 📂 BENCHMARK ADMISSION ORDERS REPOSITORY

Three diverse, real-world NCLT Admission Orders have been downloaded from the **IBBI NCLT Portal** into the local repository for automated agent intake and ingestion testing:

1. **[`01_Suryajyoti_Infotech_Sec7_HDB.pdf`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/sample_admission_orders/01_Suryajyoti_Infotech_Sec7_HDB.pdf)**
   * *Bench:* NCLT Hyderabad Bench – II (CP (IB) No. 168/7/HDB/2023).
   * *Applicant:* State Bank of India (Section 7 Financial Creditor).
   * *Profile:* Multi-crore term loan default, clean digital hybrid order sheet, detailed NPA classification.
2. **[`02_Sowcar_Electricals_CHE.pdf`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/sample_admission_orders/02_Sowcar_Electricals_CHE.pdf)**
   * *Bench:* NCLT Chennai Bench (CP (IB) No. 111/CHE/2024).
   * *Profile:* Comprehensive judgment analyzing operational vendor debt disputes.
3. **[`03_Synergybyte_Chd.pdf`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/sample_admission_orders/03_Synergybyte_Chd.pdf)**
   * *Bench:* NCLT Chandigarh Bench (CP (IB) No. 154/Chd/Hry/2023).
   * *Profile:* Compact statutory order with immediate appointment directions and initial IRPC cost deposits.

---

## 🤖 COWORKER ORCHESTRATION ARCHITECTURE

```
                               ┌────────────────────────────────┐
                               │   CIRP ASSIGNMENT INITIATED    │
                               │        ($T_0$: Admission Order) │
                               └───────────────┬────────────────┘
                                               │
               ┌───────────────────────────────┴───────────────────────────────┐
               ▼                                                               ▼
   ┌─────────────────────────────────────────┐                   ┌─────────────────────────────────────────┐
   │         LOCAL AUTONOMOUS AGENTS         │                   │       GLOBAL STATUTORY INTELLIGENCE     │
   │           (100% On-Device / Hayagriva)  │                   │       (ResolutionBazaar / LEXAI API)    │
   ├─────────────────────────────────────────┤                   ├─────────────────────────────────────────┤
   │ • @order: Ingestion & entity extraction │                   │ • RBZ-NCLT-ADMISSION-06: Stay dossier   │
   │ • @timeline: 330-day statutory calendar │ ◄─ Orchestrated ─►│ • RBZ-IRP-ELIGIBILITY-05: AFA check     │
   │ • @forms: Form A, G, H auto-drafting    │        by         │ • RBZ-BENAMI-CROSSHOLDING-07: Group map │
   │ • @claims: Interest cutoff & ledger     │   @compliance     │ • RBZ-CLAIM-AUDIT-08: IU/CERSAI check   │
   │ • @forensic: Bank contra-sweep audit    │                   │ • RBZ-SEC29A-SCREEN-13: Deep background │
   │ • @plan_evaluator: Sec 30(2) math check │                   │ • RBZ-FORM-H-VALIDATOR-17: Exit audit   │
   └─────────────────────────────────────────┘                   └─────────────────────────────────────────┘
```
