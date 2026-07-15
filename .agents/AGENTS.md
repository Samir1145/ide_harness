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
* **Plan 1 (Rename Sync & Hash Tracking):** Debounces `unlink` for 200ms and checks newly added file hashes to auto-rename directories instead of re-converting from scratch.
* **Plan 2 (LibreOffice PDF OCR Fallback):** Auto-detects `soffice`, converts complex sheets to headless PDFs, renders pages, and transcribes visual cell layouts using Gemini Pro vision prompting.

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
* **Frictionless Ingestion (Plan 1):** Watcher debounces deletions by 200ms and matches with incoming files using `calculateFileHashSync`. Re-links matching files in index.json and SQLite to bypass OCR.
* **Bi-directional Monaco-SQLite Sync:** The Monaco LSP parser intercepts saves to `claims_registry.md`, `avoidance_ledger.md`, and `case_facts.md` inside `getDiagnostics` and synchronizes markdown tables/key-value lists directly to database records and `case_kv_dictionary.json` (marking manually edited values with `verified_by_user = 1`).
* **Hybrid Search (CMS RAG):** Eliminated native binary `sqlite-vss` C++ extension dependencies. RAG retrieval queries FTS5 index first (`fts_chunks MATCH`) to select candidate chunks, and then reranks them by computing cosine similarities in JS on vector float blobs. This maintains high speed (<1ms) and 100% cross-platform database portability.



