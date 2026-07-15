# Document Agent - Legal Drafting Compiler & Critique Loops

The **Document Agent** compiles legal reports, minutes, resolutions, and contract agreements by interpolating case variables into Markdown templates and running self-correction audits.

---

## 1. Context & Information Sources

The Document Agent coordinates with:
1. **Templates Skeletons:** Markdown document structures and prompts under the `templates/` directory.
2. **Case Variables:** Values fetched from `case_kv_dictionary.json` or `case_facts` SQLite database.
3. **Forms Agent Critique:** Automated peer auditing of drafted variables prior to presentation.

---

## 2. Program Execution Flow (The Self-Correction Critique Loop)

The sequence of data flow for document generation:

```mermaid
sequenceDiagram
    participant UI as Chat Web Widget
    participant Doc as Document Agent (agent.js)
    participant Comp as Drafting Compiler (drafting.js)
    participant Forms as Forms Agent (agent.js)
    participant LLM as LLM Client

    UI->>Doc: Request document draft (e.g. Directors Report)
    Doc->>Comp: draftDocument(caseDir, formatId)
    Comp-->>Doc: Return compiled draft & unresolved placeholders
    Doc->>Forms: Request draft validation audit
    Forms->>Forms: Check mathematical & chronological consistency
    Forms-->>Doc: Return critique warnings (math/date discrepancies)
    Doc->>Doc: Refine draft text and write warnings inside document
    Doc->>Doc: Save versioned draft under drafts/ directory (e.g. v2)
    Doc->>LLM: getChatResponse(messages)
    LLM-->>UI: Output compiled summary, version status, and gap checklist
```

---

## 3. Inputs & Outputs

### Core Inputs:
* Target template format ID (e.g., `directors-report`).
* Dictionary variables (`case_kv_dictionary.json`).
* Sibling critique results.

### Core Outputs:
* **Compiled Draft:** Versioned Markdown documents (e.g., `directors-report_v2.md`) saved under the `drafts/` case directory.
* **Placeholder Index:** Line-by-line list of unresolved placeholders requiring user input.
