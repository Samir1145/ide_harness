# Claims Verification Agent - Insolvency Claims Auditing

The **Claims Verification Agent** evaluates and audits claims submitted by creditors (Financial, Operational, Employees) during Corporate Insolvency Resolution Processes (CIRP) under the IBC.

---

## 1. Context & Information Sources

The Claims Verification Agent queries multiple financial and legal documents:
1. **Submitted Claim Forms:** Markdown transcriptions of Form B (Operational), Form C (Financial), Form D (Employees).
2. **Supporting Invoices & Ledgers:** Invoices, bank ledger sheets, and corporate transaction logs.
3. **Contracts & Loan Agreements:** Scans loan terms, credit facility contracts, and parses interest rates, default conditions, and penalty clauses.

---

## 2. Program Execution Flow

The sequence of data flow for verifying claims:

```mermaid
sequenceDiagram
    participant UI as Chat Web Widget
    participant Claims as Claims Agent
    participant RAG as RAG Core (rag.js)
    participant Calc as Math Calculator
    participant SQL as SQLite database

    UI->>Claims: Request verification of claims for Case
    Claims->>RAG: Scan invoices, loan contracts, and claim forms
    RAG-->>Claims: Return claim amounts, contract interest rates, and bank statements
    Claims->>Calc: Cross-check invoice records with bank ledger matching payments
    Calc-->>Claims: Calculate admitted principal, calculated interest, and default penalties
    Claims->>SQL: Insert admitted totals into claims registry table
    SQL-->>Claims: Confirm database update
    Claims-->>UI: Output Claim Verification Sheet showing admitted vs. rejected balances
```

---

## 3. Inputs & Outputs

### Core Inputs:
* Scanned claim forms (Form B/C/D) and bank transaction receipts.
* Contract agreements detailing interest rules.

### Core Outputs:
* **Claims Verification Matrix:** A structured breakdown showing:
  * Claimed Amount
  * Admitted Principal
  * Admitted Interest
  * Rejected Amount (with detailed rejection codes/reasons)
* **SQLite Claims Table:** Updated records inside the `claims_registry` SQLite table.
