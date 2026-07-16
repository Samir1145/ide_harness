# HAYAGRIVA Future Product Roadmap & Shelved Concepts

> The complete vision document for transitioning HAYAGRIVA from an advanced legal text assistant into the legal industry's first true **Legal Development Environment (LDE)** — a compiler-based workspace where legal documents are built, linked, tested, verified, signed, and deployed. It also compiles the advanced concepts, architectural designs, and features discussed and shelved during development for future discussion and implementation.

**Created:** 2026-07-12
**Status:** Living Document — updated as concepts are discussed and implemented.

---

## Phase 1: Core Pipeline Stability & Interactive UX

These items establish baseline reliability, thread-safety, user context configurations, and navigation components for the local workspace.

---

### [Implemented] 30. Asynchronous Ingestion & Task Queue Manager
* **Goal:** Prevent SQLite write lock collisions and event loop freezing during concurrent PDF, DOCX, and OCR ingestion passes.
* **Architecture:**
  * **Task Enqueueing:** The ingestion route enqueues a background task with a UUID and immediately returns a job ID to the client, preventing HTTP timeout errors.
  * **Job State Registry:** Monitor job status (`pending` -> `processing` -> `completed`/`failed`) in the background worker loop.
  * **Polled Ingestion Progress:** The UI queries the status route to display real-time progress indicators (e.g., page 5 of 20 processed) and enables retries on transient processing failures.

---

### [Implemented] 4. Document Rename & Hash Tracking
* **Goal:** Prevent losing manual formatting edits when a user renames or moves a document inside their case folder.
* **Architecture:**
  * **Binary Hashing:** Compute a SHA-256 hash of every uploaded PDF/Word/Excel file and register it in `index.json`.
  * **Rename Detection:** If the file watcher catches a fast deletion (`unlink`) and addition (`add`) of files with matching hashes, intercept the default behavior. Instead of wiping the index and re-converting the file from scratch, rename the corresponding companion `.md` file on disk and update its index metadata path, preserving the user's manual annotations.

---

### 29. Clickable Citation & Preview Pipeline
* **Goal:** Embed clickable, interactive citation anchors in LLM responses that allow lawyers to inspect underlying legal sources without leaving the drafting view.
* **Architecture:**
  * **Prose Citation Standard:** Instruct the LLM in its system prompt to cite sources using raw bracketed IDs, e.g., `[source:doc_123]` or `[note:fact_abc]`.
  * **Markdown Link Mapper:** The client parses the markdown stream to map raw references to inline numbered anchors like `[1](#ref-source-doc_123)` and appends a structured bibliography footer.
  * **Interposed Click Handler:** Override standard link behavior. When an anchor starting with `#ref-` is clicked, trigger a Monaco webview or popup drawer displaying the exact pageindex segment text or vault statute.

---

### 28. Granular Active-Context Control Matrix
* **Goal:** Give lawyers full manual control over the exact statutory overlays, case facts, and notes included in the active LLM context.
* **Architecture:**
  * **UI Control Panel:** A checklist mapping documents (PDFs, wiki pages, notes) to three selection states: "Exclude", "Insights Only" (only parsed bullet points from the concepts index are loaded), and "Full Content".
  * **Dynamic Token Calculator:** Calculate character and token estimates in real-time as the user toggles context configurations.
  * **Context Payload Compiler:** The backend's RAG server reads the selection matrix on each request, dynamically compiling the prompt context to match the specified bounds.

---

## Phase 2: Search Excellence & RAG Maturities

These items strengthen contextual retrieval, semantic search capabilities, and format compatibility for complex spreadsheet layouts and wikis.

---

### 27. Map-Reduce Multi-Query RAG Orchestrator
* **Goal:** Enable broad, multi-layered legal inquiries (e.g., comparing multiple statutes or checking cross-file references) that cannot be resolved in a single query sweep.
* **Architecture:**
  * **Strategy Generation Node:** The user's query is parsed by the LLM to output a JSON strategy planning up to 5 individual sub-queries, each targeting a specific legal focus or document segment.
  * **Parallel Execution Map:** Concurrently search the SQLite FTS5 chunk index and vector float blobs for each sub-query. For each query branch, call the LLM in parallel to draft a localized, context-dense partial answer.
  * **Synthesis Reduce Node:** Aggregate the parallel query results and partial answers into a single, comprehensive final answer, ensuring cross-file compliance and citation tagging.

---

### 1. Lightweight Local GraphRAG (Entity-Relation JSON Index)
* **Goal:** Enhance Retrieval-Augmented Generation (RAG) by representing the case files as a connected network of entities and relationships, rather than flat document chunks. This is highly valuable for legal cases which are inherently relational.
* **Architecture:**
  * **Incremental Background Extraction:** In the background lazy worker, when a text section is indexed, call an LLM prompt to extract entities (name, type, description) and their relationships (source, target, relation, description).
  * **Flat File Graph Database:** Store the nodes and edges in a single local JSON file under the case folder: `concepts/knowledge_graph.json` (no heavy graph database required).
  * **Relational Query Expansion:** In `rag.js`, scan user query text for matching entity keys. If found, pull matching nodes and their 1-hop neighbor relationships from the JSON file and prepend them to the LLM prompt as structured markdown lists:
    ```markdown
    [Case Knowledge Graph Context]:
    - financial_creditor initiates_cirp_against corporate_debtor (Default under Section 7)
    ```

---

### 2. TiddlyWiki Bidirectional Write-Back Sync
* **Goal:** Restore complete portability to `.wiki.html` files. Changes and annotations made to the decomposed Markdown cards (`/concepts/<wiki>/*.md`) inside the IDE should sync back into the single-file HTML wiki.
* **Architecture:**
  * **Save Hook:** Monitor change events on `concepts/<wiki>/*.md` cards. On save (`Cmd+S`), read the card's YAML frontmatter tags/links and markdown body.
  * **JSON Store Injection:** Load the original `.wiki.html` file, parse the JSON array inside the `<script class="tiddlywiki-tiddler-store">` script block, upsert the matching tiddler object (updating `text`, `tags`, and `modified` timestamp), stringify it back with proper script tag escaping (`\u003c`), and rewrite the HTML file.
  * **Clean Deletions:** Sync `unlink` card deletion events to remove the corresponding tiddler object from the original HTML file.

---

### 3. Headless LibreOffice + Gemini Excel Parser Fallback
* **Goal:** Enable pixel-perfect visual parsing for complex spreadsheets (merged header cells, side-by-side tables, embedded charts, color formatting).
* **Architecture:**
  * **Auto-Detection:** Detect if the LibreOffice CLI (`soffice`) is installed on the user's host machine.
  * **Excel-to-PDF Conversion:** Convert the spreadsheet to PDF locally:
    `soffice --headless --convert-to pdf --outdir /tmp file.xlsx`
  * **Visual Ingestion:** Run the resulting PDF through the **Force Gemini Multimodal Visual Parse** pipeline to visually transcribe columns, charts, and tables into clean, structured Markdown.

---

## Phase 3: Compiler Foundations

These items build the central parsing capabilities of the LDE to convert raw markdown prose into an Abstract Syntax Tree (AST) with variables validation and LSP compliance.

---

### 6. Legal AST Parser & Monaco Linter Diagnostics (Compile-Time)
* **Goal:** Parse companion Markdown documents into a structural Abstract Syntax Tree (AST) mapping definitions, cross-references, and statutory citations to provide deterministic, compile-time feedback directly within the editor.
* **Architecture:**
  * **Static Syntax Parser:** Develop parser rules (using unified/remark or a custom Tree-sitter grammar) to extract:
    * **Defined Terms:** Terms declared in a "Definitions" section (e.g., `"Effective Date" means...`).
    * **Cross-References:** Internal clause citations (e.g., `"pursuant to Clause 12.2"`).
    * **External Law Citations:** Statutory references using the `@@` namespace (e.g., `@@ibc/cirp/s7`).
  * **Monaco Diagnostics Integration:** Push real-time compilation warnings to the editor via `monaco.editor.setModelMarkers`:
    * `Warning: Term "Effective Date" is used in Clause 8 but never defined.`
    * `Warning: Cross-reference to Clause 12.2 resolves to nothing — clause does not exist.`
    * `Warning: External citation @@ibc/s30(4) not found in the active Law Vault.`

---

### 7. Legal Type System & Variable Schema Enforcement
* **Goal:** Enforce strict data types on extracted variables to prevent cascading calculation errors.
* **Architecture:**
  * **Type Declarations:** Define a type schema for case variables (e.g., `effective_date: Date`, `liquidation_value: Currency(INR)`, `corporate_debtor_name: String`).
  * **Type Checker:** When the AST parser extracts a variable binding from document text, validate its value against the declared type. Flag type mismatches as compiler errors (e.g., `Type Error: 'liquidation_value' expects Currency but received Date string "15/03/2026"`).
  * **Schema Registry:** Store type declarations per form/template in `schema.json` files alongside existing form schemas.

---

### 12. Bi-Directional ORM (Text-to-Data Bridge)
* **Goal:** Establish a real-time, two-way synchronization binding human-readable document prose to structured variables in the case metadata store.
* **Architecture:**
  * **Text-to-Data Sync:** When a user manually edits a value inside document prose (e.g., changing `₹12,00,00,000` to `₹15,00,00,000`), a deterministic regex/AST watcher detects the change and instantly updates the corresponding field in `case_kv_dictionary.json` — without waiting for a slow background LLM extraction pass.
  * **Data-to-Text Compile:** When a user updates a variable in the Case KV Dictionary dashboard, the compiler walks the document's AST, locates every occurrence of that variable's binding, and rewrites the prose in place with the new value.

---

### 17. Legal Language Server Protocol (LSP)
* **Goal:** Standardize all LDE syntax features (diagnostics, autocomplete, hover, go-to-definition, and context menu commands) via the Language Server Protocol (JSON-RPC), making the legal compiler portable to any code editor.
* **Architecture:**
  * **Standalone LSP Server:** Package the Legal AST parser, linter, type checker, and vault connector as a standalone Node.js language server process.
  * **Unified Commands & Code Actions:** Implement context menu actions (such as `Lookup Statute`, `Lookup Judgment`, and `Lookup Case Concept`) as LSP commands (`workspace/executeCommand`) and code actions, allowing users to preview and insert referenced text in any editor.
  * **Cross-Editor Support:** Enable connecting VS Code, Vim, Sublime Text, or even a Microsoft Word extension module directly to the local Law Vault compiler via standard LSP.

---

## Phase 4: Cross-File Linking & Logical Verification

These items resolve dependencies between files, match statutory precedents, and establish unit testing loops to verify logical waterwalls.

---

### 10. The Legal "Linker" (Cross-File Integrity Compiler)
* **Goal:** Verify constraints, definitions, and variables across separate, inter-dependent files in a transaction or litigation bundle.
* **Architecture:**
  * **Symbol Linking:** Resolve defined terms and variable values across multiple files within the same case workspace (e.g., ensuring a Board Resolution's transaction limit matches the payout declared in the main Resolution Plan, or that an Annexure's schedule totals match the main document's summary figures).
  * **Linker Error Engine:** Throw workspace-level diagnostics if boundary parameters between files are violated:
    * `Linker Error: Board Resolution authorizes ₹100Cr but Resolution Plan Clause 4.2 commits ₹120Cr.`

---

### 11. Precedent-Override Semantic Resolution Engine
* **Goal:** Actively monitor drafted text against the Law Vault database to detect when statutory provisions have been overridden, narrowed, or distinguished by judicial precedents.
* **Architecture:**
  * **Precedent Mapping:** Extend the Law Vault manifest to tag each statutory section with associated landmark precedents (e.g., Section 14 → `{overrides: [{case: "Anuj Jain v. Axis Bank", effect: "carved out third-party assets"}]}`).
  * **Conflict Visualizer:** When the AST parser detects a statutory citation in the active document, cross-reference it against the precedent map. If a conflict exists, display an info marker in Monaco: `"Note: This text relies on Section 14 (Moratorium). Supreme Court judgment [Anuj Jain v. Axis Bank] has carved out an exception for third-party assets. Click to refactor."`

---

### 8. Legal Unit Testing Engine (Continuous Integration for Law)
* **Goal:** Create a lightweight framework to execute and assert logical and mathematical compliance checks against the document's compiled data state.
* **Architecture:**
  * **Executable Rules:** Model payment distribution formulas, priority waterfalls, or legal conditions as testable functions derived from document clauses.
  * **Mock Scenario Runner:** Run simulation tests with mock inputs (e.g., `liquidationValue = ₹100Cr`, `cirpCosts = ₹5Cr`) to mathematically assert statutory compliance (e.g., Section 30(2) minimum priority payouts, Section 53 waterfall ordering) before finalized document export.
  * **Test Blocking:** If any assertion fails, the system blocks the "Export" action and surfaces the failure in the Drafting Panel.

---

### 9. Formal Completeness Verification (Constraint Solver)
* **Goal:** Go beyond unit testing to formally prove that a distribution waterfall is mathematically complete — that 100% of a corpus is allocated and no funds leak.
* **Architecture:**
  * **Constraint Modelling:** Express waterfall distribution clauses as a system of linear equations or inequalities.
  * **Solver Integration:** Use a lightweight constraint solver (or LLM-assisted symbolic verification) to verify that the sum of all distribution buckets equals the total corpus value, and that priority ordering constraints are satisfied.
  * **Proof Certificate:** If verification passes, generate a machine-readable proof certificate attached to the compiled build artifact.

---

## Phase 5: Quality of Life (IDE DX) & Governance

These items establish standard software engineering conventions and secure append-only auditing pipelines in the Monaco UI.

---

### 15. Breakpoints & Runtime Logic Tracing (Legal Debugger)
* **Goal:** Provide a visual interface to trace step-by-step logic execution through financial cascades and procedural waterfalls.
* **Architecture:**
  * **Breakpoints:** Allow setting execution pauses on specific logical clauses (e.g., a payout waterfall priority step).
  * **Variable Inspection:** Step line-by-line through calculation stages, inspecting active state variables (e.g., `remaining_corpus`, `secured_creditor_payout`, `operational_creditor_share`) to trace exactly where a logic leak or miscalculation occurs.
  * **Watch Expressions:** Monitor specific variables across execution steps (e.g., watch `operational_creditor_payout >= liquidation_value_share` as the waterfall runs).

---

### 16. Refactoring Engine & "Code-Smell" Detector
* **Goal:** Optimize legal document structures by automatically resolving duplication, unnecessary complexity, and styling anomalies.
* **Architecture:**
  * **Duplicate Logic (DRY):** Scan documents to flag duplicate clause definitions or repeated boilerplate blocks and recommend consolidation into a single defined reference.
  * **Symbol Renaming:** Safely rename a defined term (e.g., `"Effective Date"` → `"Commencement Date"`) across the entire workspace while maintaining link integrity and cross-reference resolution.
  * **Complexity Warnings:** Flag clauses with excessive nesting depth, ambiguous pronoun references, or circular definitions.

---

### 23. Audit Trail & Tamper-Evident Logging
* **Goal:** Maintain a forensic-grade, append-only audit log of every material change to case data, suitable for production as evidence in court proceedings.
* **Architecture:**
  * **Event Log:** Every write operation to `case_kv_dictionary.json`, `index.json`, or any companion `.md` file is recorded with: timestamp, user identity, field name, old value, new value, and source (manual edit / agent extraction / dashboard update).
  * **Cryptographic Chaining:** Each log entry includes a SHA-256 hash of the previous entry, creating a tamper-evident chain (local blockchain-style ledger). Any retroactive modification to an earlier entry breaks the chain and is immediately detectable.
  * **Export for Court:** The audit log can be exported as a certified PDF with hash verification instructions.

---

### 24. Role-Based Access Control (RBAC) & Privilege Tagging
* **Goal:** Enforce document-level and field-level access controls, and prevent accidental disclosure of privileged communications.
* **Architecture:**
  * **Role Definitions:** Define workspace roles (e.g., `Resolution Professional`, `Resolution Applicant`, `Legal Counsel`, `Auditor`) with granular permissions (read, write, export, sign).
  * **Privilege Tags:** Mark documents or sections with attorney-client privilege tags (`<!-- PRIVILEGED -->`). The compiler respects these tags during export — privileged sections are automatically redacted from builds targeting external parties.
  * **Access Isolation:** Resolution Applicants accessing the workspace see only their own submitted plan and relevant public documents — not competing applicants' plans or internal RP communications.

---

## Phase 6: Team Collaboration & Production Deployment

These items govern multiple users, compile court-ready documents, execute signatures, and isolate process runners.

---

### 18. Legal Build System (The Final Compilation Target)
* **Goal:** Define a deterministic, reproducible "build" process that compiles a case workspace into a final deliverable package — and refuses to build if any check fails.
* **Architecture:**
  * **Build Pipeline:** `Lint All Files → Link Cross-References → Run Test Suite → Compile Final Bundle`.
  * **Output Artifacts:** Generate a court-ready PDF/DOCX bundle with auto-generated table of contents, exhibit numbering, annexure indexing, and page references.
  * **Build Gate:** If any lint warning, linker error, or test failure exists, the build fails and surfaces a structured error report — preventing submission of non-compliant documents.

---

### 21. Document Signing & Attestation Pipeline
* **Goal:** Integrate digital signature workflows into the build output so that compiled documents are legally valid and tamper-evident.
* **Architecture:**
  * **DSC Integration:** Support Digital Signature Certificate (DSC) signing of final PDF build artifacts using PKCS#7 or PAdES standards.
  * **Hash Stamping:** Generate a SHA-256 hash of the final build artifact and record it in the case's audit log, allowing any party to verify document integrity later.
  * **Attestation Metadata:** Embed signing timestamps, signer identity, and certificate chain into the document's metadata.

---

### 20. Statutory Deadline & Limitation Period Tracker
* **Goal:** Track and enforce statutory deadlines, limitation periods, and procedural timelines as first-class state-machine timers within the LDE.
* **Architecture:**
  * **Timer Engine:** Model key deadlines as countdown timers linked to case metadata:
    * IBC Section 12: 180-day CIRP period (extendable to 330 days).
    * Limitation Act: Filing deadlines for appeals and applications.
    * CoC voting windows, Section 12A withdrawal deadlines.
  * **Monaco Warnings:** When a clause references a deadline that is approaching or has expired, surface a real-time warning:
    * `⏰ Warning: CIRP timeline for Case_Alpha expires in 14 days (Day 166 of 180).`
  * **Calendar Integration:** Export deadline events to standard `.ics` calendar files for external calendar sync.

---

### 25. Multi-User Collaboration & Review Workflows
* **Goal:** Support team-based legal workflows with structured review, approval, and sign-off processes.
* **Architecture:**
  * **Review Requests:** A junior associate drafts a document and submits a "Review Request" (analogous to a Pull Request). The senior partner receives the request with a semantic diff summary.
  * **Inline Comment Threads:** Reviewers can leave contextual comments anchored to specific clauses. Comment threads are tracked until resolved.
  * **Approval Gates:** Documents progress through a state machine: `Draft → Internal Review → Partner Approval → Client Review → Filed/Executed`. Each transition requires explicit sign-off from the designated role.
  * **Real-Time Co-Editing:** Optional live cursor sharing for simultaneous editing sessions (OT/CRDT-based synchronization).

---

### 26. Conflict of Interest Scanner
* **Goal:** Automatically detect potential conflicts of interest when a new case workspace is created.
* **Architecture:**
  * **Entity Matching:** When a new case is opened, scan all existing case workspaces for overlapping party names, Corporate Identification Numbers (CINs), director identities (DINs), or registered addresses.
  * **Conflict Report:** If overlaps are found, generate a structured conflict report before any work begins:
    * `⚠️ Conflict Alert: Director "Rajesh Kumar" (DIN: 01234567) appears in both Case_Alpha (as Promoter) and Case_Beta (as Independent Director). Review before proceeding.`
  * **Clearance Gate:** Require explicit conflict clearance acknowledgment before the workspace becomes fully operational.

---

### 5. Multi-Agent Process Isolation (KaibanJS Runner)
* **Goal:** Run complex multi-agent teams (like KaibanJS or custom LLM audit chains) safely without freezing or blocking the Electron UI thread.
* **Architecture:**
  * **Spawning Workers:** Spawn the agent orchestration loop inside a separate Node.js child process using `child_process.spawn`.
  * **Standard Stream Piping:** Pipe stdout outputs from the child process. The worker streams real-time status updates as stringified JSON lines (e.g. `{"type": "agent", "name": "Mary", "thought": "..."}`). The parent Electron thread listens to the stream and renders updates dynamically (such as moving cards on a Kanban board) at a smooth 60fps.

---

## Phase 7: Advanced Package Registries & Active Contracts

These items establish external standard dependencies, metrics dashboarding, and compile contracts directly to queryable API endpoints.

---

### 14. Legal Dependency Management & Package Registry (Legal npm)
* **Goal:** Import and manage boilerplate templates, standard clauses, and legal formats as external, versioned dependencies.
* **Architecture:**
  * **Registry Server:** Publish and pull standardized clauses (e.g., Arbitration, Governing Law, Indemnity, Force Majeure) from a central firm-level or industry-level registry.
  * **Dependency Checker:** Alert the lawyer if a document references a stale boilerplate package that has been updated to comply with a new Supreme Court ruling or statutory amendment:
    * `Dependency Update: @firm/arbitration-clause v2.1 available (updated for SC ruling on seat vs. venue distinction). Currently using v1.3.`

---

### 22. Case Analytics & Intelligence Dashboard
* **Goal:** Surface aggregate operational intelligence across all case workspaces.
* **Architecture:**
  * **Cross-Case Metrics:** How many active cases? Average CIRP completion time? Total documents ingested? Most frequently cited statutory sections?
  * **Document Health Scores:** Per-document compilation health (lint warnings, test pass rate, linker status) displayed as a traffic-light dashboard.
  * **Trend Analysis:** Track how case variables evolve over time (e.g., how the proposed payout to financial creditors changed across draft versions).

---

### 19. Contract API Deployment (Legal Runtime Environment)
* **Goal:** Compile finalized, verified legal agreements directly into operational microservice endpoints that external systems can query.
* **Architecture:**
  * **Endpoint Compilation:** A verified contract compiles into a secure API endpoint (e.g., `/api/contract/calculate-late-fee?delay=14` or `/api/lease/penalty-amount?months_overdue=3`).
  * **Operations Integration:** Company ERP, billing, or compliance systems query this API directly, executing the exact compiled logic of the live agreement in production operations — eliminating manual interpretation of contract terms.

---

## Summary: The Full Compiler Toolchain Analogy

| Software Compiler Concept | HAYAGRIVA LDE Equivalent | Roadmap Item |
|---|---|---|
| Source Files | Legal documents (Markdown companions) | Existing |
| Preprocessor | Document Ingestion & OCR | Existing (IMS) |
| Lexer / Tokenizer | Chunker & Inverted Index | Existing (CMS) |
| Queue Runner | Asynchronous Ingestion & Task Queue Manager | **#30** |
| Hash Tracking | Document Rename & Hash Tracking | **#4** |
| Inline Citations | Clickable Citation & Preview Pipeline | **#29** |
| Workspace Context | Granular Active-Context Control Matrix | **#28** |
| Query Parallelization | Map-Reduce Multi-Query RAG Orchestrator | **#27** |
| Symbol Table | Lightweight Local GraphRAG | **#1** |
| Tiddler Sync | TiddlyWiki Write-Back Sync | **#2** |
| Visual Spreadsheet | Headless LibreOffice spreadsheet fallback | **#3** |
| Parser / AST | Legal AST parser & diagnostics | **#6** |
| Type Checker | Variable schema enforcement | **#7** |
| IDE Plugins | Bi-directional ORM (Text-to-Data Bridge) | **#12** |
| Language Server (LSP) | Standalone LSP server | **#17** |
| Linker | Cross-file integrity compiler | **#10** |
| Precedent Map | Precedent-Override Semantic Resolution | **#11** |
| Unit Tests | Legal unit testing engine | **#8** |
| Formal Verification | Constraint solver completeness proofs | **#9** |
| Debugger | Breakpoints & waterfall logic tracing | **#15** |
| Refactoring Tools | Symbol renaming & DRY detection | **#16** |
| Audit Logs | Tamper-evident cryptographic chain | **#23** |
| Access Control | RBAC & privilege tagging | **#24** |
| Build System | Legal build pipeline & export gate | **#18** |
| CI/CD Pipeline | Deadline tracking & attestation | **#20, #21** |
| Code Review | Multi-user approval workflows | **#25** |
| Dependency Scanning | Conflict of interest scanner | **#26** |
| Process Runner | Multi-agent process runner | **#5** |
| Package Manager | Legal dependency registry | **#14** |
| Analytics | Case Analytics dashboard | **#22** |
| Runtime / Deployment | Contract API endpoints | **#19** |

---

## Appendix A: The 12-System Architecture

Implementing the full roadmap expands HAYAGRIVA from its original 6 management systems to a **12-system architecture**. The 6 existing systems absorb incremental enhancements. 6 entirely new systems are introduced to support the compiler, verification, build, registry, lifecycle, and governance layers.

### System Dependency Map

```
                             ┌──────────────────────────┐
                             │   Workspace (WMS)        │  Case Sandboxing & Server
                             └────────────┬─────────────┘
                                           │
            ┌─────────────────────────────┼─────────────────────────────┐
            ▼                             ▼                             ▼
     ┌──────────────┐              ┌──────────────┐              ┌──────────────┐
     │  Ingestion   │              │   Context    │              │    Vault     │
     │  (IMS)       │              │   (CMS)      │              │    (VMS)     │
     └──────┬───────┘              └──────┬───────┘              └──────┬───────┘
            │                             │                             │
            └─────────────────────────────┼─────────────────────────────┘
                                           │
                              ┌────────────┴─────────────┐
                              │    Compiler (CompMS)      │  AST, Types, Linker, LSP
                              └────────────┬─────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
         ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
         │  Verification    │   │    Drafting       │   │    Registry      │
         │  (VerMS)         │   │    (DMS)          │   │    (RegMS)       │
         └────────┬─────────┘   └────────┬─────────┘   └──────────────────┘
                  │                      │
                  └──────────┬───────────┘
                             ▼
                  ┌──────────────────┐
                  │  Build & Deploy  │  Build → Sign → Deploy API
                  │  (BDMS)          │
                  └────────┬─────────┘
                           │
            ┌─────────────┼─────────────┐
            ▼                           ▼
     ┌──────────────────┐        ┌──────────────────┐
     │   Lifecycle      │        │   Governance &   │
     │   (LMS)          │        │   Collaboration  │
     └──────────────────┘        │   (GovMS)        │
                                 └──────────────────┘
                  ┌──────────────────┐
                  │    Agents (AMS)  │  Subagents & Theia AI
                  └──────────────────┘
```

---

### Existing Systems (1–6) — Enhancements Only

---

#### System 1: Workspace Management System (WMS)

* **Description:** Manages the active case context, workspace directory isolation, local API routing, central configurations, and background worker loops.
* **Existing Key Files:**
  - `hayagriva/lib/api-server.js` — Server hosting and port lock management.
  - `reviews/case_kv_dictionary.json` — Central variables overlay store.
  - `/Documents/Case_<Name>/` — Sanitized case isolation directories.
* **Roadmap Enhancements Absorbed:**
  - **#4 Document Rename & Hash Tracking:** SHA-256 binary hashing of uploaded files. Debounced `unlink`/`add` detection to intercept renames and update companion `.md` paths without losing manual annotations.

---

#### System 2: Ingestion Management System (IMS)

* **Description:** Parses raw client files (PDF, Word, Excel, TiddlyWiki) and outputs structured companion Markdown logs. Manages Pandoc fallback routing and multimodal visual OCR.
* **Existing Key Files:**
  - `hayagriva/lib/pipeline/pdf/upload.js` — PDF text extraction, table parsing, footer stripping, and Gemini vision OCR fallback.
  - `hayagriva/lib/pipeline/docx/` & `hayagriva/lib/pipeline/xls/upload.js` — Mammoth/XLSX conversion with merged-cell filling and grid cleaning.
  - `hayagriva/lib/pipeline/wiki/upload.js` — TiddlyWiki JSON store blocks scraper.
* **Roadmap Enhancements Absorbed:**
  - **#2 TiddlyWiki Bidirectional Write-Back Sync:** Save-hook monitoring on `concepts/<wiki>/*.md` cards to sync edits back into the original `.wiki.html` JSON store blocks. Clean deletion sync on `unlink` events.
  - **#3 Headless LibreOffice + Gemini Excel Fallback:** Auto-detect `soffice` CLI to convert complex spreadsheets to headless PDFs, then feed into the multimodal visual parse pipeline for pixel-perfect table transcription.
  - **#30 Asynchronous Ingestion & Task Queue Manager:** Enqueue background jobs for document uploads to prevent SQLite lock collisions and HTTP timeouts, tracking ingestion tasks through background status polling.

---

#### System 3: Context Management System (CMS)

* **Description:** Manages text chunking (parent-child splits), pageindex tree layouts, BM25 inverted index postings, and RAG retrieval pipelines (hybrid keyword + semantic vector search).
* **Existing Key Files:**
  - `hayagriva/lib/core/rag.js` — Keyword/semantic vector retrievers.
  - `hayagriva/lib/pipeline/common/helper.js` — Tree layouts parser.
  - `hayagriva/lib/pipeline/common/text_ingest.js` — Section splitting and BM25 tokenization.
  - `concepts/bm25_index.json` — Inverted BM25 term index per case.
* **Roadmap Enhancements Absorbed:**
  - **#1 Lightweight Local GraphRAG:** Incremental entity-relation extraction during background indexing. Flat-file JSON graph database (`concepts/knowledge_graph.json`). Relational query expansion prepending 1-hop neighbor context to LLM prompts.
  - **#12 Bi-Directional ORM (Text-to-Data Bridge):** Real-time two-way synchronization between document prose and `case_kv_dictionary.json`. Text edits instantly update structured variables; dashboard variable changes compile back into document text via AST-walking.
  - **#27 Map-Reduce Multi-Query RAG Orchestrator:** Parallelized sub-query generation and execution with Map-Reduce answer synthesis for complex, cross-file inquiries.
  - **#28 Granular Active-Context Control Matrix:** Let users check/uncheck sources/notes to set the boundary and mode (Insights vs. Full) of RAG context before query execution, calculating token sizes dynamically.

---

#### System 4: Vault Management System (VMS)

* **Description:** Manages encrypted statutory databases, RAM decryption/decompression pipelines, user overlays, Monaco completion/hover providers, and relational case maps.
* **Existing Key Files:**
  - `hayagriva/lib/utils/vault-loader.js` — AES-256-GCM offset-based segment decryption, `zlib.gunzipSync` decompression, user overlay merge bypass.
  - `hayagriva-extension/src/browser/extension.ts` — Monaco completion, hover, and webview managers.
  - `hayagriva-extension/src/browser/templates.ts` — D3.js force-directed 3D Case Graph Viewer template.
* **Roadmap Enhancements Absorbed:**
  - **#11 Precedent-Override Semantic Resolution Engine:** Extend the vault manifest to tag each statutory section with associated landmark precedents and their effects (overridden, narrowed, distinguished). Cross-reference active document citations against the precedent map and surface Monaco info/warning markers when conflicts exist.
  - **Zero-Syntax Monaco Context Lookups:** Monaco context menu actions (`Lookup Statute`, `Lookup Judgment`, and `Lookup Case Concept`) executing unified "Read & Insert" prompts. Allows users to view hover definitions and inject referenced templates, precedents, and facts directly at their cursor.
  - **#29 Clickable Citation & Preview Pipeline:** Standardize LLM output bracketed references (`[source:id]`, `[note:id]`) and map them to interactive Monaco webviews and hover previews when clicked in editor panels.

---

#### System 5: Drafting Management System (DMS)

* **Description:** Manages legal document layout templates (skeletons and prompts), unresolved gap/placeholder parsing, and version history archiving.
* **Existing Key Files:**
  - `hayagriva/lib/core/drafting.js` — Document compilation, placeholders checklist compiler, version archiving.
  - `templates/` — Layout templates and prompts dictionary.
  - `drafts/` — Archived `.v1.md` revisions and comparisons.
* **Roadmap Enhancements Absorbed:**
  - No new roadmap items are absorbed. DMS continues to serve as the template engine and draft version manager, consuming compiled output from CompMS and VerMS.

---

#### System 6: Agent Management System (AMS)

* **Description:** Coordinates specialized subagents (Advisor, Forms, Document) and structures agent-to-agent critique loops via Eclipse Theia AI's ChatAgent registry and native delegation APIs.
* **Existing Key Files:**
  - `hayagriva/lib/agents/agent-coordinator.js` — Router classifying query intents.
  - `hayagriva/lib/agents/advisor-agent/`, `forms-agent/`, `document-agent/` — Agent prompts and configurations.
  - Theia AI `ChatAgentService` — Native delegation loop host.
* **Roadmap Enhancements Absorbed:**
  - **#5 Multi-Agent Process Isolation:** Spawn agent orchestration loops inside separate Node.js child processes using `child_process.spawn`. Stream real-time status updates as stringified JSON lines. Parent Electron thread renders updates dynamically without blocking the UI.

---

### New Systems (7–12) — Full Specifications

---

#### System 7: Compiler Management System (CompMS)

* **Description:** The central compiler for legal documents. Parses raw Markdown text into a structural Legal Abstract Syntax Tree (AST), enforces type schemas on extracted variables, resolves cross-file symbol references, provides safe refactoring operations, and exposes all diagnostics via a standardized Language Server Protocol (LSP).
* **Owns Roadmap Items:** #6, #7, #10, #16, #17
* **Responsibilities:**
  1. **Legal AST Parser (#6):**
     * Parse companion Markdown documents to extract a structured tree of:
       * **Defined Terms:** Terms declared in a "Definitions" section (e.g., `"Effective Date" means the date on which...`). Each definition becomes a named symbol in the AST.
       * **Cross-References:** Internal clause citations (e.g., `"pursuant to Clause 12.2"`, `"as defined in Section 3(a) above"`). Each reference becomes a pointer that must resolve to an existing AST node.
       * **External Law Citations:** Statutory references using the `@@` namespace (e.g., `@@ibc/cirp/s7`, `@@companies-act/s134`). Each citation is validated against the active Law Vault manifest.
     * Surface unresolved references as Monaco diagnostics via `editor.setModelMarkers`:
       * `Warning: Term "Effective Date" is used in Clause 8 but never defined.`
       * `Warning: Cross-reference to Clause 12.2 resolves to nothing — clause does not exist.`
       * `Warning: External citation @@ibc/s30(4) not found in the active Law Vault.`
       * `Info: Defined term "Liquidation Value" is declared but never referenced (dead definition).`
  2. **Legal Type System (#7):**
     * Enforce strict data types on extracted variables:
       * `effective_date: Date` — rejects currency strings.
       * `liquidation_value: Currency(INR)` — rejects date strings.
       * `corporate_debtor_name: String` — rejects numeric values.
       * `cirp_duration_days: Integer` — rejects fractional numbers.
     * Validate every variable binding extracted from document text against its declared type schema. Flag mismatches as compiler errors:
       * `Type Error: 'liquidation_value' expects Currency(INR) but received Date string "15/03/2026".`
     * Store type declarations per form/template in `schema.json` files alongside existing form schemas.
  3. **Cross-File Linker (#10):**
     * Resolve symbols and constraints across multiple files within the same case workspace:
       * Ensure a Board Resolution's authorized transaction limit matches the payout declared in the main Resolution Plan.
       * Verify that Annexure schedule totals match main document summary figures.
       * Confirm that defined terms used across separate documents (e.g., a term defined in the main agreement but referenced in a side letter) resolve correctly.
     * Throw workspace-level linker diagnostics:
       * `Linker Error: Board Resolution authorizes ₹100Cr but Resolution Plan Clause 4.2 commits ₹120Cr.`
       * `Linker Warning: Term "Effective Date" defined differently in Agreement.md (Line 42) and Side Letter.md (Line 8).`
  4. **Refactoring Engine (#16):**
     * **Symbol Renaming:** Safely rename a defined term (e.g., `"Effective Date"` → `"Commencement Date"`) across the entire workspace while maintaining link integrity and cross-reference resolution. Preview all affected locations before committing.
     * **Duplicate Logic Detection (DRY):** Scan documents to flag duplicate clause definitions or repeated boilerplate blocks and recommend consolidation into a single defined reference.
     * **Complexity Warnings:** Flag clauses with excessive nesting depth, ambiguous pronoun references, or circular definitions.
  5. **Legal Language Server Protocol (#17):**
     * Package the Legal AST parser, linter, type checker, linker, and vault connector as a standalone Node.js language server process communicating via JSON-RPC.
     * Expose standard LSP capabilities: `textDocument/publishDiagnostics`, `textDocument/completion`, `textDocument/hover`, `textDocument/definition`, `textDocument/rename`, `textDocument/codeAction`.
     * Enable connecting VS Code, Vim, Sublime Text, or even a Microsoft Word extension module directly to the local Law Vault compiler.
* **Proposed Key Files:**
  - `hayagriva/lib/compiler/ast-parser.js` — Markdown-to-Legal-AST parser.
  - `hayagriva/lib/compiler/type-checker.js` — Variable type schema validator.
  - `hayagriva/lib/compiler/linker.js` — Cross-file symbol resolver.
  - `hayagriva/lib/compiler/refactor.js` — Safe rename and DRY detection engine.
  - `hayagriva/lib/compiler/lsp-server.js` — Standalone LSP server process.
  - `hayagriva-extension/src/browser/diagnostics.ts` — Monaco diagnostics bridge.

---

#### System 8: Verification Management System (VerMS)

* **Description:** The quality assurance layer for legal documents. Consumes the AST produced by CompMS and runs unit tests, formal verification proofs, and interactive debugging sessions against the document's compiled logic.
* **Owns Roadmap Items:** #8, #9, #15
* **Responsibilities:**
  1. **Legal Unit Testing Engine (#8):**
     * Model payment distribution formulas, priority waterfalls, or legal conditions as testable functions derived from document clauses.
     * Define mock scenarios as JSON test fixtures:
       ```json
       {
         "scenario": "Section 30(2) Compliance Check",
         "inputs": {
           "liquidationValue": 10000000000,
           "cirpCosts": 500000000,
           "securedCreditorClaims": 8000000000,
           "operationalCreditorClaims": 3000000000
         },
         "assertions": [
           { "rule": "operationalCreditorPayout >= liquidationValueShare", "section": "IBC S.30(2)(b)" },
           { "rule": "securedCreditorPayout >= liquidationValueShare", "section": "IBC S.30(2)(b)" },
           { "rule": "cirpCostsPaid == cirpCosts", "section": "IBC S.30(2)(a)" }
         ]
       }
       ```
     * Run simulation tests to mathematically assert statutory compliance before finalized document export.
     * **Test Blocking:** If any assertion fails, the system blocks the "Export" action in the Build System (BDMS) and surfaces the failure in the Drafting Panel.
  2. **Formal Completeness Verification (#9):**
     * Express waterfall distribution clauses as a system of linear equations or inequalities.
     * Use a lightweight constraint solver (or LLM-assisted symbolic verification) to formally prove:
       * **Exhaustive Allocation:** The sum of all distribution buckets equals the total corpus value (no funds leak).
       * **Priority Ordering:** Higher-priority creditor classes are fully satisfied before lower-priority classes receive any allocation.
       * **Non-Negativity:** No payout variable is negative.
     * Generate a machine-readable proof certificate attached to the compiled build artifact.
  3. **Legal Debugger (#15):**
     * **Breakpoints:** Allow setting execution pauses on specific logical clauses (e.g., a payout waterfall priority step). The user clicks a gutter icon next to a clause to set a breakpoint.
     * **Variable Inspection:** Step line-by-line through calculation stages, inspecting active state variables:
       * `remaining_corpus: ₹95,00,00,000`
       * `secured_creditor_payout: ₹76,00,00,000`
       * `operational_creditor_share: ₹9,50,00,000`
     * **Watch Expressions:** Monitor specific variables or boolean conditions across execution steps (e.g., watch `operational_creditor_payout >= liquidation_value_share` as the waterfall runs).
     * **Call Stack:** Show the cascade of clause dependencies that led to the current calculation state.
* **Proposed Key Files:**
  - `hayagriva/lib/verification/test-runner.js` — Mock scenario executor and assertion engine.
  - `hayagriva/lib/verification/constraint-solver.js` — Formal completeness prover.
  - `hayagriva/lib/verification/debugger.js` — Breakpoint manager and variable inspector.
  - `hayagriva/tests/legal/` — Directory for legal document test fixtures (`.test.json`).
  - `hayagriva-extension/src/browser/debugger-panel.ts` — Debugger UI webview.

---

#### System 9: Build & Deployment Management System (BDMS)

* **Description:** Owns the output pipeline — from compilation through signing to operational API deployment. Defines a deterministic, reproducible "build" process that refuses to produce output if any check fails.
* **Owns Roadmap Items:** #18, #19, #21
* **Responsibilities:**
  1. **Legal Build System (#18):**
     * Execute a deterministic build pipeline:
       1. **Lint:** Run CompMS AST parser and type checker across all workspace files.
       2. **Link:** Run CompMS cross-file linker to resolve all inter-document symbols.
       3. **Test:** Run VerMS unit test suite and formal verification checks.
       4. **Compile:** If all checks pass, generate the final output bundle.
     * **Output Artifacts:** Court-ready PDF/DOCX bundle with:
       * Auto-generated table of contents.
       * Exhibit numbering (Exhibit A, B, C...).
       * Annexure indexing with page references.
       * Cross-reference hyperlinks within the PDF.
     * **Build Gate:** If any lint warning, linker error, or test failure exists, the build fails and surfaces a structured error report — preventing submission of non-compliant documents.
     * **Build Manifest:** Generate a `build-manifest.json` recording: build timestamp, files included, lint/test results, signer identity, and output hash.
  2. **Contract API Deployment (#19):**
     * Compile finalized, verified legal agreements directly into operational microservice endpoints:
       * A commercial lease contract compiles to `/api/contract/calculate-late-fee?delay=14`.
       * A distribution waterfall compiles to `/api/waterfall/run?corpus=100000000`.
     * Company ERP, billing, or compliance systems query these APIs directly, executing the exact compiled logic of the live agreement in production operations.
     * API endpoints are versioned and immutable once deployed. A new contract version deploys a new API version.
  3. **Document Signing & Attestation Pipeline (#21):**
     * **DSC Integration:** Support Digital Signature Certificate (DSC) signing of final PDF build artifacts using PKCS#7 or PAdES standards.
     * **Hash Stamping:** Generate a SHA-256 hash of the final build artifact and record it in the case's audit log, allowing any party to verify document integrity later.
     * **Attestation Metadata:** Embed signing timestamps, signer identity, and certificate chain into the document's metadata.
     * **Verification Endpoint:** Expose a local `/api/verify-document` endpoint that accepts a PDF and confirms whether its hash matches the signed build record.
* **Proposed Key Files:**
  - `hayagriva/lib/build/pipeline.js` — Orchestrates lint → link → test → compile sequence.
  - `hayagriva/lib/build/bundler.js` — PDF/DOCX output generator with TOC, exhibits, and annexures.
  - `hayagriva/lib/build/signer.js` — DSC integration and hash stamping.
  - `hayagriva/lib/build/deploy.js` — Contract API endpoint compiler and Express route generator.
  - `build-manifest.json` — Per-build metadata and hash records.

---

#### System 10: Registry Management System (RegMS)

* **Description:** A standalone registry for importing, publishing, and versioning reusable legal components — boilerplate clauses, template skeletons, compliance checklists, and standard legal patterns.
* **Owns Roadmap Items:** #14
* **Responsibilities:**
  1. **Legal Dependency Management & Package Registry (#14):**
     * **Publishing:** Standardized clauses (e.g., Arbitration, Governing Law, Indemnity, Force Majeure) are packaged as versioned modules with metadata:
       ```json
       {
         "name": "@firm/arbitration-clause",
         "version": "2.1.0",
         "description": "Standard arbitration clause compliant with 2024 SC ruling on seat vs. venue",
         "author": "Legal Standards Team",
         "jurisdiction": "India",
         "lastVerified": "2026-06-15",
         "dependencies": [],
         "content": "arbitration.md"
       }
       ```
     * **Importing:** Documents declare dependencies in a `legal-deps.json` file at the case root:
       ```json
       {
         "dependencies": {
           "@firm/arbitration-clause": "^2.0.0",
           "@firm/force-majeure": "^1.3.0",
           "@ibc/waterfall-template": "^3.0.0"
         }
       }
       ```
     * **Dependency Checker:** Alert the lawyer if a document references a stale boilerplate package that has been updated:
       * `Dependency Update: @firm/arbitration-clause v2.1 available (updated for SC ruling on seat vs. venue distinction). Currently using v1.3.`
     * **Registry Server:** A local or firm-hosted HTTP registry server for publishing and pulling packages. Supports private firm registries and public industry-level registries.
     * **Lock File:** Generate a `legal-deps-lock.json` to ensure reproducible builds across team members.
* **Proposed Key Files:**
  - `hayagriva/lib/registry/client.js` — Package fetcher, version resolver, and lock file manager.
  - `hayagriva/lib/registry/server.js` — Local/firm registry HTTP server.
  - `hayagriva/lib/registry/publisher.js` — Package packaging and publishing tool.
  - `legal-deps.json` — Per-case dependency declaration file.
  - `legal-deps-lock.json` — Locked dependency versions for reproducible builds.

---

#### System 11: Lifecycle Management System (LMS)

* **Description:** Manages the temporal dimension of legal work — how cases, documents, deadlines, and versions evolve over time. Tracks statutory countdown timers, provides aggregate analytics, and supports structural version control.
* **Owns Roadmap Items:** #13, #20, #22
* **Responsibilities:**
  1. **Semantic Version Control & Conflict Resolution (#13):**
     * **Semantic Diffs:** Instead of showing "line 42 changed," produce structural diffs:
       * `"Clause 4 payout increased from ₹12Cr to ₹15Cr. This changes the operational creditor distribution ratio from 12% to 10%."`
     * **Logical Merge Conflicts:** When merging branches (e.g., a junior associate's edits into the partner's main branch), detect and halt merges if competing branches produce conflicting logical variables or break test assertions on the target branch.
     * **Review Diffs:** Generate side-by-side comparison views annotated with impact analysis (which test cases are affected, which linked files are impacted).
  2. **Statutory Deadline & Limitation Period Tracker (#20):**
     * **Timer Engine:** Model key deadlines as first-class countdown timers linked to case metadata:
       * IBC Section 12: 180-day CIRP period (extendable to 330 days).
       * Limitation Act: Filing deadlines for appeals and applications.
       * CoC voting windows, Section 12A withdrawal deadlines.
       * NCLT hearing dates, compliance filing due dates.
     * **Monaco Warnings:** When a clause references a deadline that is approaching or has expired, surface a real-time warning:
       * `⏰ Warning: CIRP timeline for Case_Alpha expires in 14 days (Day 166 of 180).`
       * `🔴 Expired: Section 12A withdrawal window closed 3 days ago.`
     * **Calendar Integration:** Export deadline events to standard `.ics` calendar files for external calendar sync (Apple Calendar, Google Calendar, Outlook).
     * **Dashboard Widget:** A countdown panel in the sidebar showing all active deadlines across all open cases, sorted by urgency.
  3. **Case Analytics & Intelligence Dashboard (#22):**
     * **Cross-Case Metrics:**
       * How many cases are active?
       * Average CIRP completion time across historical cases.
       * Total documents ingested, total concept cards generated.
       * Most frequently cited statutory sections across all cases.
     * **Document Health Scores:** Per-document compilation health (lint warnings, test pass rate, linker status) displayed as a traffic-light dashboard:
       * 🟢 Clean — 0 warnings, all tests pass.
       * 🟡 Warnings — Non-critical lint warnings present.
       * 🔴 Failing — Linker errors or test failures blocking build.
     * **Trend Analysis:** Track how case variables evolve over time (e.g., how the proposed payout to financial creditors changed across draft versions v1 → v2 → v3).
     * **Export Reports:** Generate PDF analytics reports for internal management review.
* **Proposed Key Files:**
  - `hayagriva/lib/lifecycle/semantic-diff.js` — Structural diff engine and impact analyzer.
  - `hayagriva/lib/lifecycle/deadline-tracker.js` — Statutory timer engine and calendar export.
  - `hayagriva/lib/lifecycle/analytics.js` — Cross-case metrics aggregator and health scorer.
  - `hayagriva-extension/src/browser/deadline-panel.ts` — Countdown timer sidebar widget.
  - `hayagriva-extension/src/browser/analytics-panel.ts` — Analytics dashboard webview.

---

#### System 12: Governance & Collaboration Management System (GovMS)

* **Description:** Owns the human governance layer — who can see what, who changed what, who approved what, and whether any conflicts of interest exist. Ensures that the LDE operates within the ethical and regulatory boundaries required of legal practice.
* **Owns Roadmap Items:** #23, #24, #25, #26
* **Responsibilities:**
  1. **Audit Trail & Tamper-Evident Logging (#23):**
     * **Event Log:** Every material write operation is recorded with:
       * Timestamp (ISO 8601).
       * User identity (name, role).
       * Target file and field name.
       * Old value → New value.
       * Source: `manual_edit` | `agent_extraction` | `dashboard_update` | `merge_commit`.
     * **Cryptographic Chaining:** Each log entry includes a SHA-256 hash of the previous entry, creating a tamper-evident chain (local blockchain-style ledger). Any retroactive modification to an earlier entry breaks the chain and is immediately detectable:
       ```json
       {
         "seq": 47,
         "timestamp": "2026-07-12T08:30:00Z",
         "user": "Atul Grover",
         "role": "Resolution Professional",
         "action": "update_variable",
         "file": "reviews/case_kv_dictionary.json",
         "field": "liquidation_value",
         "oldValue": "₹100,00,00,000",
         "newValue": "₹120,00,00,000",
         "source": "manual_edit",
         "prevHash": "a3f8c2d1e4b5...",
         "hash": "7b2e9f0a1c3d..."
       }
       ```
     * **Chain Verification:** A background validator periodically checks the integrity of the hash chain and alerts if tampering is detected.
     * **Export for Court:** The audit log can be exported as a certified PDF with hash verification instructions, suitable for production as evidence in court proceedings.
  2. **Role-Based Access Control & Privilege Tagging (#24):**
     * **Role Definitions:** Define workspace roles with granular permissions:
       * `Resolution Professional` — Full read/write/export/sign on all files.
       * `Resolution Applicant` — Read/write only on their own submitted plan; read-only on public documents.
       * `Legal Counsel` — Full read/write; can tag sections as privileged.
       * `Auditor` — Read-only across all files; full access to audit logs.
       * `Observer` — Read-only on non-privileged public documents.
     * **Privilege Tags:** Mark documents or sections with attorney-client privilege markers:
       ```markdown
       <!-- PRIVILEGED: Attorney-Client Communication -->
       The legal counsel advises that the proposed payout structure...
       <!-- /PRIVILEGED -->
       ```
     * **Privilege-Aware Build:** The Build System (BDMS) respects these tags during export — privileged sections are automatically redacted from builds targeting external parties. Internal builds retain full content.
     * **Access Isolation:** Resolution Applicants accessing the workspace see only their own submitted plan and relevant public documents — not competing applicants' plans or internal RP communications.
  3. **Multi-User Collaboration & Review Workflows (#25):**
     * **Review Requests:** A junior associate drafts a document and submits a "Review Request" (analogous to a Pull Request). The senior partner receives the request with a semantic diff summary produced by LMS.
     * **Inline Comment Threads:** Reviewers can leave contextual comments anchored to specific clauses. Each comment thread tracks:
       * Author and timestamp.
       * Resolution status (Open / Resolved / Won't Fix).
       * Linked clause reference in the AST.
     * **Approval Gates:** Documents progress through a state machine:
       ```
       Draft → Internal Review → Partner Approval → Client Review → Filed/Executed
       ```
       Each transition requires explicit sign-off from the designated role. The Build System (BDMS) checks approval status before allowing final export.
     * **Real-Time Co-Editing:** Optional live cursor sharing for simultaneous editing sessions using OT (Operational Transform) or CRDT-based synchronization. Each user's cursor is color-coded and labeled with their name.
  4. **Conflict of Interest Scanner (#26):**
     * **Entity Matching:** When a new case workspace is created, automatically scan all existing case workspaces for overlapping:
       * Party names (fuzzy matching to handle variations).
       * Corporate Identification Numbers (CINs).
       * Director Identification Numbers (DINs).
       * Registered addresses.
       * Related-party relationships.
     * **Conflict Report:** If overlaps are found, generate a structured conflict report before any work begins:
       * `⚠️ Conflict Alert: Director "Rajesh Kumar" (DIN: 01234567) appears in both Case_Alpha (as Promoter) and Case_Beta (as Independent Director). Review before proceeding.`
     * **Clearance Gate:** Require explicit conflict clearance acknowledgment (with reason documentation) before the workspace becomes fully operational. The clearance decision is recorded in the audit log.
* **Proposed Key Files:**
  - `hayagriva/lib/governance/audit-logger.js` — Append-only tamper-evident event logger with hash chaining.
  - `hayagriva/lib/governance/rbac.js` — Role definitions, permission checker, and privilege tag parser.
  - `hayagriva/lib/governance/review-workflow.js` — Review request, comment thread, and approval gate manager.
  - `hayagriva/lib/governance/conflict-scanner.js` — Cross-case entity overlap detector.
  - `hayagriva-extension/src/browser/review-panel.ts` — Review request and comment UI.
  - `case-roles.json` — Per-case role assignments and access control lists.
  - `audit-log.jsonl` — Append-only, hash-chained event log per case.

---

### System Ownership Summary Table

| System | Abbrev. | Status | Roadmap Items Owned | Core Responsibility |
|---|---|---|---|---|
| Workspace Management | WMS | Existing | #4 | Case isolation, API server, config |
| Ingestion Management | IMS | Existing | #2, #3, #30 | Document parsing, OCR, format conversion |
| Context Management | CMS | Existing | #1, #12, #27, #28 | Indexing, search, retrieval, variable binding |
| Vault Management | VMS | Existing | #11, #29 | Encrypted law databases, Monaco providers, precedent resolution |
| Drafting Management | DMS | Existing | — | Templates, placeholders, version archiving |
| Agent Management | AMS | Existing | #5 | Subagents, delegation, process isolation |
| **Compiler Management** | **CompMS** | **New** | **#6, #7, #10, #16, #17** | **AST, types, linker, refactoring, LSP** |
| **Verification Management** | **VerMS** | **New** | **#8, #9, #15** | **Unit tests, formal proofs, debugger** |
| **Build & Deployment** | **BDMS** | **New** | **#18, #19, #21** | **build pipeline, signing, API deployment** |
| **Registry Management** | **RegMS** | **New** | **#14** | **Package registry, dependency management** |
| **Lifecycle Management** | **LMS** | **New** | **#13, #20, #22** | **Semantic git, deadlines, analytics** |
| **Governance & Collaboration** | **GovMS** | **New** | **#23, #24, #25, #26** | **Audit trail, RBAC, reviews, conflict scanning** |
