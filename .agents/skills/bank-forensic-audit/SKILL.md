---
name: bank-forensic-audit
description: Forensic Multi-Bank Cash Flow Reconciliation, Contra-Sweep Elimination, and IBC Avoidance Inquest (§§ 43, 45, 50, 66)
compatibility: hayagriva>=1.0.0, antigravity, crewai, deepagents
---

# Bank Forensic Audit Skill

## 🏛️ Purpose & Scope
This skill provides automated, court-admissible forensic auditing of multi-bank account statements (Current Accounts, CC/OD, Term Loans, Escrows) across corporate debtor accounts. It reconciles gross banking movements against corporate filings (MCA AOC-4 XBRL), eliminates internal liquidity contra-sweeps, clusters counterparties, and identifies statutory triggers under the Insolvency and Bankruptcy Code (IBC, 2016).

---

## 📐 Core Forensic Doctrines & Rules

### 1. The Contra Neutralization Doctrine
- Internal funds transferred between two accounts of the same Corporate Debtor (e.g. Bank A to Bank B) must be **strictly netted out**.
- Naive summation of gross credits double-counts internal liquidity as external commercial turnover.
- Match conditions:
  - Opposite directions (Debit in Account A, Credit in Account B).
  - Matching amounts (within ₹1.00 tolerance).
  - Same UTR / Reference ID, or internal narration markers (`INTERNAL TRF`, `CONTRA`, `SWEEP`) within a 3-day window.

### 2. The Balance Consistency Mathematical Proof
- For every account ledger, cross-verify:
  $$\text{Opening Balance} + \sum \text{Credits} - \sum \text{Debits} = \text{Closing Balance}$$
- If $\Delta \neq 0$, flag an **Unreconciled Variance** warning indicating potential missing pages or truncated OCR.
- If column headers ("Paid In / Paid Out") are ambiguous, determine transaction type from balance delta:
  - $\Delta \text{Balance} > 0 \implies \text{Credit}$
  - $\Delta \text{Balance} < 0 \implies \text{Debit}$

### 3. Noise Reduction & Furniture Stripping
- Filter out non-transaction banking furniture (`STATEMENT OF ACCOUNT`, `BALANCE CARRIED FORWARD`, `OPENING BALANCE`, `CLEAR BALANCE`, `PAGE NO`, `TOTAL DEBITS`).
- Extract canonical payees from UPI strings (`UPI - <PAYEE> - <REF>`) and strip masked card numbers (`512967XXXXXX8643`).

### 4. Statutory Classification & Avoidance Triggers
Every external outflow is mapped to one of the following forensic categories:
1. **`STATUTORY_DUES`**: GSTN, CBIC, TDS, Income Tax, EPFO, ESIC (`§53(1)(e)` Government Priority).
2. **`UTILITIES_DISCOMS`**: Industrial Power, Gas, Water (Essential CIRP Operational Costs).
3. **`LENDERS_AND_ARCS`**: Financial debt repayments, interest debits (`§53(1)(b)/(d)`).
4. **`INVESTMENT_SPECULATION`**: Capital markets, brokers (Zerodha, Upstox), crypto, bullion ($\rightarrow$ **§66 Siphoning / Diversion of Loan Funds**).
5. **`PERSONAL_PROMOTER_PERKS`**: Luxury hospitality, personal airfare, promoter life policies ($\rightarrow$ **§45 Undervaluation / §66**).
6. **`CASH_DRAIN`**: Self-cheques, ATM cash withdrawals prior to ICD ($\rightarrow$ **§66 / PMLA Inquest**).
7. **`RELATED_PARTY`**: Outflows to verified AS-18 entities without operational invoices ($\rightarrow$ **§43 Preference / §45 Undervalued**).
8. **`TRADE_OPERATIONAL`**: Regular vendor payables, logistics, raw materials.

---

## 📂 Inputs & Output Expectations
- **Inputs**:
  - `docs/bank_statements/` (`.xlsx`, `.xls`, `.csv`)
  - `docs/xbrl/` (MCA AOC-4 XBRL XML)
  - `case_facts.md` (Company CIN, Insolvency Commencement Date)
- **Outputs**:
  - `reports/BANK_FORENSIC_DOSSIER.md` (Court-admissible Markdown dossier with Section 3 Breakdown)
  - `ledgers/bank_forensic_ledger.json` (Structured JSON dataset)
  - Updates `case_facts.md` with verified net cash metrics.
