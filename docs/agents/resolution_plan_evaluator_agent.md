# Resolution Plan Compliance Evaluator Agent

The **Resolution Plan Compliance Evaluator Agent** audits incoming resolution plans submitted by bidders against statutory compliance checklists (specifically Section 30(2) of the IBC) to ensure the plan is legally compliant before submission to the Committee of Creditors (CoC).

---

## 1. Context & Information Sources

The Plan Evaluator connects resolution plan details with insolvency parameters:
1. **Submitted Plan Markdown:** Companion Markdown documents of resolution plan files (processed in Ingestion Step 1).
2. **IBC Section 30(2) Compliance Rules:** Standard statutory requirements defining minimum payout thresholds.
3. **Claims & Valuation Database:** Retrieves total admitted claims and liquidation values to calculate liquidation payouts.

---

## 2. Program Execution Flow

The sequence of data flow for plan evaluation:

```mermaid
sequenceDiagram
    participant UI as Chat Web Widget
    participant Eval as Plan Evaluator Agent
    participant RAG as RAG Core (rag.js)
    participant SQL as SQLite database
    participant LLM as LLM Client

    UI->>Eval: Request evaluation of Plan PDF
    Eval->>RAG: Scan plan text for CIRP costs, operational payouts, and dissent allocations
    RAG-->>Eval: Return plan payment clauses and proposed payout amounts
    Eval->>SQL: Query claims registry totals & liquidation asset values
    SQL-->>Eval: Return liquidation values and priorities
    Eval->>Eval: Calculate minimum statutory payouts (liquidation ratio benchmark)
    Eval->>Eval: Compare plan payouts against statutory minima (Sec 30(2) check)
    Eval->>LLM: evaluatePlanCompliance(planContext, statutoryBenchmarks)
    LLM-->>Eval: Return audit findings and compliance score
    Eval-->>UI: Output Compliance Evaluation Matrix (Pass/Fail indicators)
```

---

## 3. Section 30(2) Compliance Checks

* **CIRP Cost Priority:** Checks if the plan provides for payment of insolvency process costs in priority to all other payments.
* **Operational Creditor Payout:** Asserts that operational creditor allocations meet or exceed the liquidation value they would receive under Section 53 waterfall hierarchy.
* **Dissenting Creditor Payout:** Asserts that dissenting financial creditors are allocated payments not less than the liquidation value due to them.
* **Implementation Supervision:** Verifies that a monitoring committee or supervising authority is designated.

---

## 4. Inputs & Outputs

### Core Inputs:
* Submitted resolution plan texts.
* Admitted claims and liquidation values.

### Core Outputs:
* **Section 30(2) Compliance Matrix:** Markdown checklist showing Pass/Fail alerts for each statutory rule.
* **Payment Allocation Summary:** Comparative table of claimed vs. proposed plan payouts.
