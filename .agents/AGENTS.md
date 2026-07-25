# Workspace Rules & Session Learnings (HAYAGRIVA)

These guidelines document key architectural decisions and term alignments to keep subsequent sessions aligned.

---

## 1. System Terminology Alignment
* **Context Management System (CMS):** Manages document slicing, pageindex hierarchy indexing, companion markdown conversion, and keyword/semantic text retrieval.
* **Vault Management System (VMS):** Manages local encrypted legal databases, RAM decryption/decompression pipelines, user overlays, Monaco completion and hover providers, and the D3.js 3D Case Graph Viewer.
* **Agent Management System (AMS):** Manages specialized Node.js-native subagents (Advisor Agent, Forms Agent, Document Agent) and their programmatic integration via Eclipse Theia AI's ChatAgent registry and delegation.
* **Ingestion Management System (IMS):** Manages document parsing pipelines (PDF, Word, Excel, TiddlyWiki), Pandoc fallback routing, and multimodal visual OCR.
* **Drafting Management System (DMS):** Manages legal document templates (skeletons and prompts), unresolved gap/placeholder parsing, and version history archiving.
* **Workspace Management System (WMS):** Manages case directories isolation, local API server hosting, central variable dictionary overlays, and background worker loops.

---

## 2. Agent Design Decisions
* **Single Specialist Preference:** Do not introduce heavy multi-agent frameworks (e.g. KaibanJS) for deterministic template tasks. Keeping execution single-turn is faster and more reliable.
* **Critique Loops:** Implement self-correction loops using **Theia AI Framework native delegation APIs** (`ChatAgentService.delegateToAgent`). The `DocumentAgent` delegates drafts to `FormsAgent` for auditing, and refines the draft based on critique before showing it to the user.

---

## 3. Future Roadmap Specifications
Refer to the following plans saved in the workspace:
* **Plan 1 (Asynchronous Ingestion Queue):** Enqueues ingestion jobs in a task queue to prevent database write lock collisions during concurrent document parsing. (Roadmap #30)
* **Plan 2 (Rename Sync & Hash Tracking):** Debounces `unlink` for 200ms and checks newly added file hashes to auto-rename directories instead of re-converting from scratch. (Roadmap #4)
* **Plan 3 (Clickable Citation Preview):** Maps raw LLM references (e.g. `[source:id]`) to interactive numbered links that trigger popup drawers displaying preview segments. (Roadmap #29)
* **Plan 4 (Active-Context Control Matrix):** Provides a UI checklist mapping documents to active selection states (Exclude/Insights/Full) with dynamic token count calculation. (Roadmap #28)
* **Plan 5 (Map-Reduce Multi-Query RAG):** Generates parallelized sub-queries to query SQLite FTS5/vector indices concurrently and synthesizes a single unified response. (Roadmap #27)
* **Plan 6 (LibreOffice PDF OCR Fallback):** Auto-detects `soffice`, converts complex sheets to headless PDFs, renders pages, and transcribes visual cell layouts using Gemini Pro vision prompting. (Roadmap #3)
* **Plan 7 (Dual-Vector Search Loop):** Enables hybrid cases containing both legal files and financial sheets to run parallel retrievals against the correct model's vector subsets. (Roadmap #31)


---

## 4. Build Pipelines & Context Menu Guidelines
* **Theia Context Menu Group Paths:** When registering submenus or menu actions on context menus (such as the Explorer navigator right-click menu), you must explicitly target a valid group (e.g. `[...NavigatorContextMenu.NAVIGATION]`). Omitting the group path prevents Eclipse Theia/Lumino from mounting and displaying the submenus.
* **Electron Bundle Rebuilds:** Code updates in `theia-extensions/` are not automatically picked up by `./start.command` inside the Electron application. You must explicitly run the rebuild script:
  ```bash
  yarn --cwd ide/applications/electron build
  ```
  This packages the new extension changes into the Electron frontend bundle.
* **Standard Editor APIs:** Do not use Monaco-specific text selection methods like `.getSelectedText()` or `.replaceSelection(...)` on a `TextEditor` instance. Instead, utilize standard Theia APIs:
  * Reading selection: `activeEditor.editor.document.getText(activeEditor.editor.selection)`
  * Replacing selection: `activeEditor.editor.executeEdits([{ range: activeEditor.editor.selection, newText: ... }])`

---

## 5. Core Architectural Pitfalls & Regressions (Historical Post-Mortems)
* **Portability & Derived Pathing (B002):** Never hardcode absolute path parameters in configuration/launcher scripts. Always derive the workspace/project root directory dynamically from `__dirname` or script locations.
* **Relative Path Depth Resolution (B005):** Moving files deeper/shallower in the folder structure changes relative import depths. Verify all `path.join(__dirname, ...)` depths. Core references:
  * `lib/` uses `../..` to get to root.
  * `lib/core/` and `lib/utils/` use `../../..` to get to root.
  * `lib/pipeline/forms/` uses `../../../../` to get to root.
* **Proxy Server Ingestion Context (B003, B007):** Do not run the backend via raw `npm start` or with positional folders as arguments. It corrupts the active cases workspace path. Always run the proxy daemon using `./start.command` or via `node cli.js --watch-all` so it defaults cases resolution under `~/Documents`.
* **Sidebar Active Listeners (B008):** To prevent sidebars from loading stale or incorrect case files when switching workspace folders, always bind active workspace folder listeners (`workspaceService.onWorkspaceLocationChanged`) to refresh the widget context.
* **PDF Ingestion Concurrency & DB Safety (B011):** Protect multi-page vision OCR pipelines and PDF processing loops with eager lock flags (e.g. `isPdfDaemonRunning = true`) and sequential `setTimeout` routines. Concurrent runs will cause SQLite database lock collisions and memory/OOM crashes.

---

## 6. Recent Session Learnings & Implementations
* **Asynchronous Ingestion Queue (Plan 1):** Serializes all concurrent `ingestFile` and `registerUnprocessedFile` tasks in an in-memory queue, awaiting vector indexing (`indexVectorsToSqlite`) and K-V extraction (`extractFileKV`) to completely prevent SQLite busy locks (`SQLITE_BUSY`) and index race conditions.
* **Active-Context Control Matrix (Plan 4):** Implemented a document-filtering checkbox list in the Concepts sidebar panel positioned directly in front of the three status dots. Toggling selections persists active files configuration locally in `concepts/active_rag_docs.json` and dynamically filters search candidate chunks in `retrieveContexts` before retrieval.
* **Local-First Ingestion & OCR Cleanup:** Replaced the external Vision OCR and visual Gemini parser with a strict local ingestion parser. Rejects fully scanned PDFs (average text density < 30 characters/page) at upload, and injects standard `[!WARNING]` table placeholders on hybrid pages with inline scanned tables/images.
* **Frictionless Ingestion (Plan 2):** Watcher debounces deletions by 200ms and matches with incoming files using `calculateFileHashSync`. Re-links matching files in index.json and SQLite to bypass OCR.
* **Bi-directional Monaco-SQLite Sync:** The Monaco LSP parser intercepts saves to `claims_registry.md`, `avoidance_ledger.md`, and `case_facts.md` inside `getDiagnostics` and synchronizes markdown tables/key-value lists directly to database records and `case_kv_dictionary.json` (marking manually edited values with `verified_by_user = 1`).
* **Hybrid Search (CMS RAG):** Eliminated native binary `sqlite-vss` C++ extension dependencies. RAG retrieval queries FTS5 index first (`fts_chunks MATCH`) to select candidate chunks, and then reranks them by computing cosine similarities in JS on vector float blobs. This maintains high speed (<1ms) and 100% cross-platform database portability.
  * **Drift Mitigation**: To prevent index/ID drift failures, always match candidate chunks from the FTS5 table to the `document_vectors` table using their composite natural keys (`filename`, `section_title`, and `chunk_index`) instead of raw SQLite `rowid`s.
* **Standalone Markdown Promotion**: Scan and allow standalone `.md` files (which do not have a parent binary document like a PDF) as primary documents in the file-statuses pipeline, pre-setting their first status dot to green (`reviewed`). Automatically exclude companion `.md` files from primary lists to prevent double-listing in the Explorer tree.
* **Dynamic PDF Horizontal Width Fit**: Configure native PDF viewing widgets inside the application shell by appending `#view=FitH` to the iframe preview URL. This ensures pages automatically zoom and scale to fit the panel horizontally as it resizes.
* **Grace-Period Health Checks**: Prevent false-positive "Backend Server Offline" warnings on Electron startup by introducing a 3-second grace-period delay to the initial client-side monitor check, allowing the background Node daemon time to initialize.
* **Supreme Court Layout Compiler**: Expose a deterministic Markdown-to-DOCX compiler conforming to Supreme Court rules (A4, Times New Roman, 14pt body, 1.5 line spacing, 4cm left/right margins, 2cm top/bottom margins) via the explorer right-click context menu, the editor context menu, and the `/export-sc` Notion-style slash command.
* **Sidebar Layout Restorations (Wiki & Concepts)**: Uncommenting widget initializers in `onStart()` requires updating the layout filter inside `onDidInitializeLayout(app)` to explicitly exclude `'hayagriva-wiki-explorer'` and `'hayagriva-concepts-explorer'` from the auto-close list.
* **Grouped Q&A Accordion Panel**: Re-engineered the Case Wiki & Q&A sidebar to scan both the root `wiki/` directory and the `wiki/qna/` subdirectory for Q&A markdown files. It now parses the answer text on the backend and groups questions as folders (`📁`) and collapsible accordions (`❓`) in the HTML5 templates list.
* **Concepts Sidebar Card Refactoring**: Redesigned the Concepts panel with container cards (`.doc-card`), glowing status indicators (`.status-dot-indicator` using custom box-shadow background spans), and pure CSS checkbox overrides. In template rendering loops, ensure parent cards are appended to the root container (`container.appendChild(docCard)`) and all nested templates are properly backslash-escaped.
* **SQLite Ingestion Sequence Resolution**: Ensure the primary document record is registered in the `documents` table via `updateStatus(...)` *prior* to executing `indexToSqlite(...)` and `indexVectorsToSqlite(...)`. This avoids `FOREIGN KEY constraint failed` database errors on child section and vector tables referencing `documents(filename)` during standalone markdown/text file ingestion.
* **Bootstrapping File Filters**: Excluded system files (`CASE_AUDIT.md`, `index.md`) and companion markdown files (which possess a corresponding binary parent document in the case folder) from the primary ingestion boot-scanner inside `cli.js` to eliminate double-indexing overhead and database constraint conflicts.
* **Strict 2,048-Token Context Budget & Graceful Fallback**: Local LLM models (LegalParam / FinanceParam) operate on a strict 2,048-token context window limit (~1,500 words total).
  * If a user query or selected document scope exceeds 1,500 input tokens after RAG chunking, **never crash or send truncated data silently**.
  * Catch the overflow in pre-flight checks, graciously inform the user via a structured notice (*"⚠️ Context Window Exceeded: LegalParam context budget is 2,048 tokens (~1,200 words). Please refine selection in the Active-Context Control Matrix"*), and step back cleanly.
* **GGUF Conversion & Compatibility Pipeline (Param-2.9B Family)**: Re-compiled and verified the local `FinanceParam-2.9b.gguf` under a standard `LlamaForCausalLM` format with BPE merges natively preserved and quantized to `Q4_K_M`.
  * **macOS x86_64 Constraints**: Pin `torch==2.2.2` (latest available official x86_64 macOS build) and use `transformers==4.57.6` with `tokenizers==0.22.2` to resolve both import failures and fast tokenizer Rust-level deserialization crashes.
  * **Vocabulary Corrections**: Automate patching (lowercase-to-uppercase byte tokens, padding tokens, duplicate `<s>` cleanup) using the parameterized `fix_vocab_from_hf.py` script.
  * **Prompt Mismatches**: Use `<|user|>[PROMPT]</|/user|><|assistant|>` (strictly no spaces around the prompt) for `FinanceParam` and general `Param-1-2.9B-Instruct` models, and native Devanagari script for Hindi inputs to prevent looping/gibberish outputs. Detailed steps are in the [gguf-vocab-patching](file:///Users/atulgrover/Desktop/HAYAGRIVA/.agents/skills/gguf-vocab-patching/SKILL.md) skill.


