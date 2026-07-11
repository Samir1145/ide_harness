# Chapter 8: Compliance Form Filling & Document Drafting

This chapter covers the two-tier incremental fact extraction pipeline, compliance form registries, rules validation, and automated document assembly.

---

## 1. User Perspective

Compliance filings and corporate audits require filling out highly structured portal forms (such as MCA AOC-4 or MGT-7) and drafting corresponding documents (such as Board Reports or Director's Reports). The system automates this through an incremental, verification-first workspace flow.

### Form Filling Review Dashboard
1. Double-clicking any `filled-<formId>.json` review file (or executing the **"Open Form Review Dashboard"** command) launches a custom tabbed dashboard inside the IDE editor area.
2. Form fields are organized by sections matching official filing layouts.
3. Each field displays:
   - Its current value (editable).
   - Extraction **confidence** (High / Medium / Low).
   - **Reasoning**: Explanation of how the LLM extracted or computed the value.
   - **Source Citation**: A clickable link identifying the source document chunk. Clicking it opens the source file to the side and highlights the exact context segment.
   - **Validation Warning**: If programmatic rules (e.g. balance sheet math or signature dates) fail, a warning alert displays below the field.
4. Clicking **"Copy Autofill Bookmarklet"** copies a minified portal injector to your clipboard.
5. Clicking **"Export Preview"** compiles and opens a prefilled offline HTML form for final sign-off.

### Case KV Dictionary Panel
1. The **Case KV Dictionary** serves as the central fact database for the workspace (`reviews/case_kv_dictionary.json`).
2. Selecting **"Case KV Dictionary"** from the menus displays a grid table of all extracted corporate parameters.
3. Users can manually override variables here; manual modifications are preserved across future ingestion passes.

### Sidebar Document Drafting
1. The **Drafting Panel** lists available document templates (e.g., Director's Report).
2. Clicking **"Draft"** triggers the LLM to assemble a custom document utilizing the central Case KV Dictionary and template formatting rules.
3. Once compiled, the new draft is opened in the editor. Unresolved fields (e.g., variables missing from the Case KV Dictionary) are tagged as `[MISSING: FieldName]`.
4. The panel displays a **placeholders checklist**. Clicking any missing item scrolls the editor directly to the corresponding line.
5. If drafting a new version of an existing draft, the system archives the previous draft (e.g., `drafts/draft_directors-report.v1.md`). Clicking **"Compare with previous draft"** opens a side-by-side diff comparing the versions.

---

## 2. Technical Architecture & Lifecycles

```
Case Files Ingestion (Phase 2)
      │
      ▼
extract-file.js (Schema-less LLM facts extraction)
      │
      ▼
reviews/case_kv_dictionary.json
      │
      ├── (populate form) ──► form_mapper.js ──► targeted RAG lookup (fallbacks)
      │                            │
      ▼                            ▼
form_rules_validator.js ◄── (validate) ◄── reviews/filled-<formId>.json
      │
      ├── (export) ──► form_exporter.js ──► exports/filled_<formId>.html
      │                                   └── exports/filled_<formId>_bookmarklet.txt
      │
      └── (draft) ───► drafting.js ──────► drafts/draft_<formatId>.md (archived versions)
```

### Two-Tier Incremental Fact Extraction
1. **Tier 1 (Schema-less Extraction)**: Triggered immediately when a companion Markdown document is processed by `watcher.js`. The module `extract-file.js` asks the LLM to extract any registration numbers, dates, signers, or financial figures into a flat key-value list. These are merged into `reviews/case_kv_dictionary.json`.
2. **Tier 2 (Targeted Mapping & RAG Fallbacks)**: When a form is populated (via `form_mapper.js`), fields are mapped from the dictionary. For any missing fields, the mapper performs a semantic search across the case's index using BM25 and retrieves relevant text context, then queries the LLM specifically for the missing item. Found variables are saved back to the central Case KV Dictionary.

### Rules Engine & Date Valuations
Programmatic validations are executed via `form_rules_validator.js`. It parses mathematical and chronological expressions in `schema.json` (such as `netWorthOfCompany == paidUpCapital + reserves - accumulatedLosses` or `DateOfBoard <= DateOfSigning`).
* Dates represented as standard formats (e.g. `DD/MM/YYYY`) are normalized to millisecond timestamps to validate order constraints.
* Rule violations are injected into form fields and surfaced dynamically in the review UI.

### Hydration Prefills & Bookmarklets
To bypass heavy browser parsing libraries, the exporter uses a client-side hydration injection:
* **Prefilling**: Writes a small `<script>` block containing the flat JSON payload at the end of the cloned HTML template. A DOM listener runs on load to autofill input elements matching the data keys.
* **Bookmarklets**: Combines the autofill fields with standard browser injection scripts, minifying and URI-encoding it to generate `javascript:...` bookmarklets.

---

## 3. Node.js-Native Specialized Agents

To achieve seamless desktop packaging and zero-configuration installation for thousands of users, the AI capabilities are implemented as zero-dependency Node.js modules running inside the backend process:

* **Intent Classification Router (`agent-coordinator.js`)**: Serves as the primary query gate. It runs a fast classification model to analyze the user message and routes the prompt context to the correct specialized subagent.
* **Advisor Agent (`advisor-agent/`)**: Answers laws, regulations, and board chronology questions. It dynamically queries the local law vault index using BM25 RAG tools and injects text citations.
* **Forms Agent (`forms-agent/`)**: Performs form populating and validation audits. It executes equation checks and flags dates that violate chronology.
* **Document Agent (`document-agent/`)**: Assembles markdown files using outline skeletons and prompt rules. It places unresolved placeholder markers `[INSERT PLACEHOLDER]` for manual user review.

The system dynamically loads agent personas and guidelines from companion `.md` markdown files on startup, separating prompts from execution code.

---

## 4. Subsystem File Layout

```
HAYAGRIVA/
├── forms/
│   └── aoc-4/
│       ├── schema.json               — Section field mappings & validation rules
│       ├── template.html             — Standard blank form HTML
│       └── bookmarklet_template.js   — Injector javascript template
├── formats/
│   └── directors-report/
│       ├── format.md                 — Markdown layout template skeleton
│       └── prompt.txt                — Drafting instructions & mapping prompts
├── hayagriva/lib/
│   ├── routes.js                     — Route mapping and endpoint dispatch lists
│   ├── lazy_pdf_worker.js            — Background PDF pagination daemon queue
│   ├── drafting.js                   — Assemblies drafts & archives previous edits
│   ├── agents/                       — Node.js-native specialized agents
│   │   ├── agent-coordinator.js      — Classifier and intent router
│   │   ├── advisor-agent/            — Legal advisory agent runner & markdown instructions
│   │   ├── forms-agent/              — Form reviewer agent runner & markdown instructions
│   │   └── document-agent/           — Document assembler agent runner & markdown instructions
│   ├── ingestion-file/
│   │   ├── extract-file.js           — Schema-less incremental ingestion pass
│   │   ├── form_mapper.js            — Schema compiler & targeted RAG fallback
│   │   └── form_rules_validator.js   — Validation engine for math and dates
│   └── upload-file/
│       └── form_exporter.js          — Offline HTML prefills & bookmarklet minifier
```

---

## 5. API Registry

| Method | Endpoint | Payload / Query | Description |
|---|---|---|---|
| `GET` | `/api/forms/kv-dictionary` | `?case=X` | Load central KV variables dictionary |
| `POST` | `/api/forms/kv-dictionary/update` | `{ case, dictionary }` | Update manually modified dictionary variables |
| `POST` | `/api/forms/populate` | `{ case, formId }` | Run mapper and targeted lookups |
| `GET` | `/api/forms/instance` | `?case=X&formId=Y` | Load compiled form review fields |
| `POST` | `/api/forms/instance/save` | `{ case, formId, fields }` | Save manual review edits & re-run validations |
| `POST` | `/api/forms/instance/export` | `{ case, formId }` | Prefill HTML form & build bookmarklet |
| `GET` | `/api/formats/registry` | N/A | List available document templates |
| `POST` | `/api/formats/draft` | `{ case, formatId }` | Trigger LLM document drafting |
| `POST` | `/api/agents/chat` | `{ case, message, history }` | Call the Agent Coordinator chat stream |
