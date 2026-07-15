# Information Memorandum (IM) Compiler Agent

The **Information Memorandum (IM) Compiler Agent** aggregates company profiles, financial balance sheets, asset lists, claims registries, and pending litigations to compile the formal Information Memorandum required under Regulation 36 of the CIRP Regulations.

---

## 1. Context & Information Sources

The IM Compiler Agent aggregates information from across the active workspace:

```mermaid
graph TD
    IM[IM Compiler Agent] --> WMS[Workspace Scans: Company profile, operations]
    IM[IM Compiler Agent] --> Claims[Claims Registry: verified totals]
    IM[IM Compiler Agent] --> SQLite[SQLite: Asset inventories, valuation logs]
    IM[IM Compiler Agent] --> RAG[RAG: Pending litigation court cases]
```

1. **Company Profiles & Operations:** Scans general company descriptions, corporate registrations, and business assets.
2. **Claims Registry:** Pulls admitted and verified claim totals from the SQLite databases.
3. **Asset Valuations:** Extracts asset summaries and liquidation values from valuation spreadsheets.
4. **Litigations:** Queries RAG for pending NCLT and appellate litigation case logs.

---

## 2. Program Execution Flow

The sequence of data flow for IM compilation:

```mermaid
sequenceDiagram
    participant UI as Chat Web Widget
    participant IM as IM Compiler Agent
    participant SQL as SQLite database
    participant RAG as RAG Core (rag.js)
    participant Comp as Drafting Compiler (drafting.js)

    UI->>IM: Request IM Compilation
    IM->>SQL: Query claims registry totals & asset lists
    SQL-->>IM: Return claims & assets records
    IM->>RAG: Query pending litigation and court records
    RAG-->>IM: Return litigation briefs and dates
    IM->>Comp: compileIMTemplate(caseDir, dataPayload)
    Comp->>Comp: Interpolate data into Regulation 36 IM Template
    Comp-->>IM: Return drafted IM Markdown file
    IM->>IM: Save document under drafts/im_draft_v1.md
    IM-->>UI: Confirm compilation and return IM table of contents
```

---

## 3. Inputs & Outputs

### Core Inputs:
* Balance sheets, valuation reports, and audit statements.
* Claims registry data.
* List of active lawsuits.

### Core Outputs:
* **Regulation 36 IM Draft:** Structured Markdown document containing:
  * Company Overview & Capital Structure
  * Financial Statements Summary
  * Verified Claims Registry Summary
  * Asset Inventory Schedules
  * Litigation & Statutory Liabilities Log
