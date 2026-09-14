---
name: claim-verification
description: IBC Creditor Claim Audit, Form B/C/CA Verification, Interest Recalculation, and Disallowance Ledger Sync
compatibility: hayagriva>=1.0.0, antigravity, crewai, deepagents
---

# Claim Verification Skill

## 🏛️ Purpose & Scope
This skill provides automated mathematical and statutory verification of creditor claims submitted during the Corporate Insolvency Resolution Process (CIRP):
1. **Form C (Financial Creditors)**:
   - Recalculates principal debt, contractual interest, and penal charges up to the Insolvency Commencement Date (ICD).
   - Reconciles claimed disbursements against bank statement inflow records.
2. **Form B (Operational Creditors)**:
   - Verifies invoice maturity, GST compliance, and limitation periods (3 years).
   - Disallows unverified interest unless backed by a signed commercial agreement.
3. **Form CA (Class of Creditors / Homebuyers)**:
   - Verifies allotment letters, payment receipts, and RERA registration.

---

## 📐 Core Verification Rules
- Cut-off date is strictly the **Insolvency Commencement Date (ICD)**; post-ICD interest is disallowed.
- Bank statement disbursements must corroborate claimed loans.
- Outputs must sync with `claims_registry.md` and `case_facts.md`.
