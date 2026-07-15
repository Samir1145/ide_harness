# Litigation Tracker & Case Law Matching Agent

The **Litigation Tracker & Case Law Matching Agent** scans case records for active disputes, matches statutory claims against latest NCLT/NCLAT/Supreme Court precedents in the Law Vault, and drafts case law briefs.

---

## 1. Context & Information Sources

The Litigation Tracker connects case lawsuits with appellate precedents:
1. **Case Litigation List:** Details of pending lawsuits, claims, and appeals involving the Corporate Debtor.
2. **Appellate Precedent Vault:** Local legal databases containing Supreme Court and NCLAT rulings loaded via [vault-loader.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/utils/vault-loader.js).
3. **Court Orders:** Ingested NCLT/NCLAT court order files (processed in Ingestion Step 1).

---

## 2. Program Execution Flow

The sequence of data flow for litigation tracking and precedent matching:

```mermaid
sequenceDiagram
    participant UI as Chat Web Widget
    participant Tracker as Litigation Agent
    participant SQL as SQLite database
    participant RAG as RAG Core (rag.js)
    participant LLM as LLM Client

    UI->>Tracker: Query case litigation strategy
    Tracker->>SQL: Query active lawsuits and disputed amounts
    SQL-->>Tracker: Return litigation log and parties list
    Tracker->>RAG: Query Law Vault for matching precedents
    RAG-->>Tracker: Return NCLT/NCLAT/SC ruling citations and summaries
    Tracker->>LLM: evaluateStrategying(lawsuits, rulingsContext)
    LLM-->>Tracker: Return case analysis, defense strategies, and relevant rulings
    Tracker-->>UI: Output Litigation Dashboard and Precedent Strategy Brief
```

---

## 3. Inputs & Outputs

### Core Inputs:
* Litigation case summaries and court orders.
* Judicial ruling indices in the Law Vault.

### Core Outputs:
* **Litigation Tracker Matrix:** Summary table of pending disputes, dates, courts, and amounts.
* **Precedent Strategy Brief:** Markdown brief detailing relevant precedent case citations, key holdings, and strategic defense recommendations.
