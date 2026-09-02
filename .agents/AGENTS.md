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
* **Theia Coding Guidelines & Code Organization:** Always adhere to [`docs/THEIA_CODING_GUIDELINES.md`](file:///Users/atulgrover/Desktop/haya_pipie/docs/THEIA_CODING_GUIDELINES.md) (Interface + Symbol DI patterns, `undefined` over `null`, explicit return types, `on[Will|Did]VerbNoun` event patterns, namespace-prefixed context keys, and strict multi-target layer boundaries between `common/`, `browser/`, `node/`, and `electron-main/`).

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
* **Manual LLM Engine Workflow & Default Lite Mode**:
  * **Default Boot Mode**: The app ALWAYS launches with `activeMode: "lite"` and LLM engines (`llama-server` on ports `8090` and `8091`) **OFFLINE**.
  * **Manual Engine Control**: Users manually click "Start Engine" / "Stop Engine" in Settings. Starting an engine updates `activeMode` to `"standard"` in `hayagriva_settings.json` and keeps the model running continuously during the session without auto-shifting back to Lite mode.
  * **Offline Fallback**: When an LLM engine is offline, `@Document` and subagents populate all case facts from the `kv_dictionary` into standard skeleton templates, save drafts to `drafts/`, and display a notice instructing the user to start the LLM engine in Settings for full AI generation.
  * **Shutdown Reversion**: Executing `stop.command` or closing the app kills running LLM engines and resets `activeMode` back to `"lite"` so that the next launch starts cleanly in Lite mode every time.
* **Specialized Agent Export Contracts**: Subagent files (such as `document-agent/agent.js`) must export the constructor class directly (`module.exports = DocumentAgent; DocumentAgent.detectSkeleton = detectSkeleton;`) to prevent `TypeError: DocumentAgent is not a constructor` instantiation failures in `agent-coordinator.js`.
* **Dual-Layer Template Inventory Interceptor**: Queries asking for document templates (e.g. `show me a list of all documents available for COC issues`) are intercepted by both `DocumentAgent.run` and `rag.js` to return a 3-column table of available matching templates with `@Document draft <template-name>` request links.
* **Content-Type Auto-Routing (Plan 7 Dual-Vector Loop)**: Classifies document chunks at ingestion time strictly by file extension (`.xlsx`, `.xls`, `.csv`, `.tsv` -> `Finance-Embeddings`; `.pdf`, `.docx`, `.md`, `.txt`, `.tiddlywiki`, `wiki/` -> `InLegal-SBERT`). Stores `vector_type` in SQLite `document_vectors` table with self-healing migration.
* **Dual-Query RAG & RRF Fusion**: Generates dual query embeddings concurrently (`InLegal-SBERT` and `Finance-Embeddings`), evaluates cosine similarity strictly within matching model vector spaces, and merges candidate passages via Reciprocal Rank Fusion (RRF).
* **Background ONNX Pre-Warmup**: `warmupEmbeddingPipeline('legal')` pre-loads `InLegal-SBERT` into native memory during `/api/hayagriva/bootstrap-case` when a workspace opens, eliminating the ~2.5s cold-start freeze on the user's first RAG search query.
* **Smart ONNX Idle Eviction (5m TTL)**: Tracks last embedding access timestamp (`_lastEmbeddingAccess`). A 60-second background monitor disposes in-process ONNX model pipelines (`_legalPipeline`, `_financePipeline`) after 5 minutes of inactivity, releasing ~250 MB of native RAM back to macOS dynamically.
* **Single-Engine LLM Hot-Swapping (50% RAM Savings)**: Consolidated local LLM execution (`LegalParam-2.9B` and `FinanceParam-2.9B`) to unified port `8090`. Starting or switching domain engines in Settings automatically terminates the active process on port 8090 and spawns the newly selected 2.9B model engine, cutting LLM memory footprint in half (from ~5.5 GB to ~2.7 GB).
* **macOS Dock Icon in Development Mode (B012)**: In `yarn start` (development mode), `electron-builder.yml`'s `mac.icon` setting is **never applied** — the macOS Dock and window title bar use whatever the Electron binary has unless you set it programmatically. The fix is to add a `darwin` block inside `frontend/theia-extensions/product/src/electron-main/icon-contribution.ts` that calls `app.dock?.setIcon(icon)` and `window.setIcon(icon)`. After editing, always rebuild: `yarn --cwd frontend/theia-extensions/product build && yarn --cwd frontend/applications/electron build`.
* **Icon Asset Transparency Bug (B013)**: The old `process_branding.py` script generated transparent PNGs by extracting only non-white pixels, resulting in **7–18% visible pixels** — near-invisible on any background. The canonical approach is to use `@napi-rs/canvas` (installed in `backend/`) to draw the master logo centered on a **solid white 512×512 canvas**. The updated script is `backend/scripts/process_branding.js`. Always verify generated icons have 100% opaque pixels (`alpha channel = 255` everywhere) before rebuilding.
* **Branding & Logo Management Pipeline (B014)**:
  * **Master File**: `branding/hayagriva_logo.png`
  * **Processor**: `node backend/scripts/process_branding.js` (uses `@napi-rs/canvas` to create solid 512x512 app launcher icons and transparent PNG banners `TheiaIDE.png`/`TheiaIDE-next.png` for UI panels so light/dark themes render without white background boxes).
  * **Extension Override Trap**: `frontend/theia-extensions/hayagriva/src/browser/extension.ts` MUST use `background-image: var(--theia-branding-logo) !important;`. Never hardcode `data:image/png;base64,...` strings in `extension.ts`, as they override theme CSS at runtime.
  * **Build & Cache Sequence**:
    1. Replace `branding/hayagriva_logo.png`
    2. `node backend/scripts/process_branding.js`
    3. `find frontend/theia-extensions -name "*.tsbuildinfo" -delete`
    4. `yarn --cwd frontend/theia-extensions/hayagriva build`
    5. `yarn --cwd frontend/theia-extensions/product build`
    6. `yarn --cwd frontend/applications/electron build`
* **Workspace Domain Manifest (`case_manifest.json`)**: Auto-bootstrapped per workspace on case open (`ensureCaseManifest`). Allows `detectDocumentVectorType()` in `llm-client.js` to prioritize explicit per-file domain tags (`fileDomains`) over file-extension heuristics, maintaining 100% backward compatibility when no manifest entry exists.
* **Freemium Marketplace & Offline License Validation**: Added **🛒 Marketplace & Downloads** section to Settings (`settings-dashboard.html`), backed by `/api/hayagriva/marketplace/catalog` (scans installed `.vlt` packs and `.gguf` models) and `/api/hayagriva/license/activate`. License keys are validated 100% offline using an embedded Ed25519 public key in `lib/utils/license-validator.js`.
* **CIRP Statutory Timeline Engine ($T_0 \rightarrow T_{330}$)**: Hybrid architecture featuring auto-generated `timeline.md` (Mermaid.js Gantt chart rendered natively in Markdown) + Frappe Gantt interactive widget (`cirp_timeline_widget.vlt`). Driven by `lib/pipeline/timeline-engine.js` and bootstrapped on case launch.
* **iPIE Ecosystem Subagents (`@coc` & `@evaluator`)**:
  * **`@coc-coordinator`**: Computes financial creditor voting shares ($\text{Voting Share}_i = \frac{\text{Debt}_i}{\sum \text{Unrelated Debt}} \times 100\%$), excludes related parties (Section 5(24)), and drafts meeting notices/ballots.
  * **`@plan-evaluator`**: Audits Resolution Plans under Section 30(2) & Section 29A, compiling Regulation 39(4) **Form H Compliance Certificates** for NCLT submission.
* **iPIE Gateway Marketing Integration**: Added a dedicated **iPIE Gateway & Workflow** section to `docs/marketing/index.html` detailing the 4-step execution flow from local private Hayagriva to the MCA Central iPIE Portal.
* **Render Custom Domain & Cloudflare DNS Sync**: Connected custom domain `hayagriva.app` to Render web service with Cloudflare DNS set to `DNS Only` (Grey Cloud) to allow automated Let's Encrypt / Render SSL certificate issuance and 301 redirection for apex domain and `www` subdomains.
* **Mobile Responsive Navigation & Glassmorphism Drawer**: Enhanced `docs/marketing/index.html` with an interactive hamburger toggle (`☰` / `✕`), a touch-optimized glassmorphism drawer, single-column responsive grids (< 768px), and an always-visible high-contrast cyan `↑ TOP` floating pill button.
* **Scanned-PDF Self-Healing & Manually-Placed Companion MD**: When a scanned PDF is rejected (`failed_convert`), dropping an externally converted `.md` companion with the matching stem into the root folder triggers backend self-healing (`failed_convert + companionExists → companion_ready`), greening dot 1 and unlocking **2. Enhance Markdown** & **3. Generate Search Vectors**.
* **Typed Zone Slot Panel Management**: Custom document viewers (PDF/DOCX/XLSX preview and Wiki HTML viewer) belong to Document Viewer Slot 1 (max 1 active viewer; opening a new document viewer automatically closes any previously open document preview widget). Monaco editor tabs belong to Editor Slot 2 (`workbench.editor.limit.value = 2`).
* **Reimagined Settings Hub & Telemetry Bar**: Redesigned `settings-dashboard.html` into a glassmorphic 4-tab Command Center (`Mode & Engine`, `Marketplace`, `Pipeline`, `License`). Features real-time macOS `vm_stat` RAM telemetry (`/api/hayagriva/system/telemetry`), reactive auto-saving, and a drag-and-drop offline module importer.
* **Safe Engine Lifecycle Management (`killProcessOnPort`)**: Replaced unsafe shell pipes (`lsof | xargs kill -9`) in `/api/hayagriva/engine/start` and `stop` with a native Node `killProcessOnPort(8090)` resolver that includes a `pid !== process.pid` guard, preventing API server self-termination and `xargs` empty stdin crashes on macOS.
* **Vault Build & Compilation Architecture (`haya_vaults`)**: Ingestion pipeline processed 47,302 URLs into 44,661 structured PostgreSQL records (37,978 judgments, 3,481 statutes, 2,562 articles, 633 notifications) and 75,000+ Atticus dealpoints/clauses. Compiled 14 encrypted `.vlt` distribution archives (~411 MB) into `output/client_vaults/dist/` with updated checksums in `latest.json`.
* **AES-256-GCM Vault Security & Per-Vault Keychain Architecture**: All `.vlt` binaries are encrypted with AES-256-GCM + HMAC-SHA256 data signatures. In development, `vault-builder.cjs` uses `VAULT_KEY` from `.env`. In production, `VaultManager` provisions distinct per-vault keys (`vault-laws`, `vault-cases`, `vault-documents-corporate`, etc.) into the OS Keychain (`keytar`) upon tier activation, enabling modular product licensing.
* **Dual Product Edition Architecture (`Haya_Legal` vs. `Haya_Finance`)**:
  * **`Haya_Legal` (Advocates & Law Firms)**: Uses **2 Models** (`InLegal-SBERT` 768-dim + `LegalParam-2.9B.gguf`), 14 Data Vaults, Legal Subagent Pack (`@advisor`, `@document`, `@nclt`, `@precedent`, `@litigation`, `@counter`), and `/export-sc` Supreme Court layout compiler.
* **Case Folder Isolation & Deferred Bootstrapping Guard**:
  * The backend MUST NEVER treat root container directories (like `~/Documents`) as an active case workspace.
  * `bootstrapCase`, `ensureCaseSettings`, `ensureAuditDocs`, `ensureCaseManifest`, `/api/hayagriva/bootstrap-case`, `/api/hayagriva/documents`, and `/api/hayagriva/file-statuses` MUST enforce explicit `docsRoot` guard clauses (`if (path.resolve(caseDir) === docsRoot) return;`).
  * System infrastructure files (`concepts/`, `conversions/`, `wiki/`, `CASE_AUDIT.md`, `case_manifest.json`, `hayagriva_settings.json`) are strictly created ONLY inside user-selected case subdirectories.
* **Pipeline Context Menu Availability**:
  * All 4 Hayagriva Pipeline right-click context menu commands (`1. Convert to Markdown`, `2. Enhance Markdown`, `3. Generate Search Vectors`, `4. Run AI Enrichment`) MUST evaluate `isEnabled` based on valid document file extensions (`.pdf`, `.docx`, `.doc`, `.xlsx`, `.xls`, `.csv`, `.pptx`, `.md`, `.txt`) rather than polling status flags, ensuring menu actions are never greyed out when right-clicking valid files.
* **Preference Schema Exclusions & Inversify Safety**:
  * Global `files.exclude` defaults are declared inside `hayagrivaPreferenceSchema` in `extension.ts` and auto-enforced by `ensureGlobalUserSettings` in `routes.js`.
  * Do NOT override `FileNavigatorFilter` via custom subclasses in Inversify, as native `@theia/navigator` constructor bindings disrupt shell layout initialization.
* **Auto-Extract Phase 1 & Status Indicator ($Dot_1 = \text{blue} \rightarrow \text{green}$)**:
  * `cli.js` declares `BINARY_EXTS = ['.pdf', '.docx', '.doc', '.xlsx', '.xls']` at top-level scope.
  * When a binary document is dropped into a case folder, `onFileChange` immediately calls `updateStatus(caseDir, relative, 'processing')` to render dot 1 as **blue** (`processing`), and fires `ingestFile(caseDir, filePath, { conversionOnly: true })` to generate companion markdown automatically.
  * Upon Phase 1 completion, `targetStatus` is set to `'companion_ready'`, updating SQLite and transitioning dot 1 to **green** (`companion_ready`).
  * In `/api/hayagriva/file-statuses`, any file where `companionExists === true` automatically self-heals status from `processing` or `unprocessed` to `companion_ready`.
* **Pre-Flight User Q&A Alignment Protocol**:
  * BEFORE writing or modifying any feature, workflow, or pipeline code, the AI assistant MUST perform deep-dive static analysis and present explicit clarifying questions to the user regarding edge cases, expected behaviors, and architectural side effects.
  * No code mutations or file edits are permitted until the user explicitly reviews, clarifies, and approves the proposal.
* **Canonical Storage Location & System Infrastructure Relocation**:
  * System infrastructure and metadata files (`case_manifest.json`, `CASE_AUDIT.md`, `index.md`, `*.footer`) are stored inside the case conversion directory (`<casename>_conversions_haya/`).
  * On case launch, `migrateRootInfrastructureToConversions()` automatically moves any legacy root infrastructure files into the conversions directory, ensuring the root case folder in Finder displays **only** primary source files.
* **Case-Prefixed System Subfolders (`<casename>_<type>_haya`) & IDE Exclusion**:
  * System subfolders are dynamically named using the parent case folder basename: `<casename>_conversions_haya`, `<casename>_concepts_haya`, and `<casename>_wiki_haya`.
  * **Finder Visibility & Protection**: Visible in macOS Finder so users recognize which case they belong to and know not to delete/modify them directly.
  * **IDE Explorer Exclusion**: Automatically hidden from the IDE File Explorer sidebar tree via wildcard patterns (`**/*_conversions_haya`, `**/*_concepts_haya`, `**/*_wiki_haya`) in `files.exclude`.
  * **Universal Case-Prefixed Directory Resolvers & Auto-Merge**:
  * `getConceptsDir`, `getConversionsDir`, and `getWikiDir` in `helper.js` dynamically resolve `<case_name>_concepts_haya`, `<case_name>_conversions_haya`, and `<case_name>_wiki_haya`.
  * Invoking any resolver automatically detects legacy un-suffixed directories (`concepts`, `conversions`, `wiki`), recursively merges their contents into the case-prefixed directory (`mergeAndCleanDir`), and deletes empty legacy folders.
* **SaulLM-7B GGUF Integration & Cloudflare R2 Sync**:
  * Added **SaulLM-7B Instruct (`saullm-7b`, 4.16 GB)** to Cloudflare R2 bucket `hayagriva` under `models/saullm-7b.gguf`.
  * Registered `saullm-7b` in `CATALOG_MANIFEST` (`vault-importer.js`) and `/api/hayagriva/marketplace/catalog` (`routes.js`) for 1-Click portal downloading.
  * Added single-engine hot-swapping support for `saul` on port 8090 via `run-llama-server.sh saul` and `/api/hayagriva/engine/start`.
* **macOS QLMarkdown & LaunchServices UTI Binding**:
  * Resolved macOS Finder "dog-eared page" preview fallback caused by uninstalled `com.crocopliers.mdviewer` assigning `com.unknown.md` UTIs.
  * Rebound `.md` and `net.daringfireball.markdown` to `org.sbarex.QLMarkdown` using `duti -s org.sbarex.QLMarkdown .md all` and refreshed `quicklookd` cache (`qlmanage -r && qlmanage -r cache`).
* **Unconfigured Workspace Onboarding & Case Command Center**:
  * Opening a brand new blank case folder initializes `domain: 'unconfigured'` in `case_manifest.json`, deferring folder creation until explicit user selection.
  * Automatically launches the **Hayagriva Settings & Setup** dashboard in the center editor view with a practice edition setup wizard banner.
* **Automated Empty Obsolete Taxonomy Folder Pruning**:
  * `bootstrapDomainTaxonomy` in `domain-registry.js` checks all domain taxonomy folders upon workspace load or domain selection.
  * Any obsolete taxonomy folder belonging to a non-active domain that is 100% empty (contains 0 user files) is automatically pruned (`fs.rmdirSync`), eliminating multi-domain sidebar clutter.
* **Party-Structured Legal Domain Taxonomy**:
  * Configured `Haya Legal (Advocate & Law Firm Edition)` with party-oriented subfolders: `00_inbox`, `01_petitioner_plaintiff`, `02_respondent_defendant`, `03_evidence_exhibits`, `04_orders_judgments`, `05_statutes_precedents`.
  * Enables legal subagents (`@advisor`, `@docket_mgr`, `@pleading_mgr`) to immediately distinguish petitioner allegations from respondent counter-arguments during context retrieval.
* **Single-Domain Locking & 0-Document Hot-Swapping**:
  * **0-Document Workspace (`documentCount === 0`)**: Domain switching is 100% unlocked; switching domains cleanly prunes old empty taxonomy folders and provisions the new domain's folders.
  * **Active Workspace (`documentCount > 0`)**: Domain switching is strictly locked (`🔒 Domain Locked`) to preserve vector index integrity (`InLegal-SBERT` vs `Finance-Embeddings`) and prevent cross-domain chunk corruption.
* **Test-First Architecture & Dynamic Auto-Discovery Runner**:
  * `backend/tests/run_all_tests.js` enforces a **Phase 1 Pre-Flight Integrity Audit** before executing any tests.
  * Dynamically discovers all `*.test.js` files via `fs.readdirSync`, verifies each exports a valid `run()` contract, and audits system registrations (25 subagents across installed Vault Agent Packs and 3 domain profiles) upfront.
  * Always update and verify test coverage for new subagents, endpoints, or features *prior* to executing test suites, preventing silent test omissions and stale assertion failures.
* **Case Law & Statutory Vault Directory Resolution & Fallbacks**:
  * `cases-vault-loader.js` and `vault-loader.js` check user Application Support vaults first (`~/Library/Application Support/Hayagriva/vaults/`) and seamlessly fall back to local project data vaults (`backend/vault/data_vaults/cases` with 17,558 case precedents and `backend/vault/data_vaults/laws` with 4,032 statutory acts).
  * `getVaultKey()` queries OS Keychain (`keytar`) under accounts `vault-cases` and `vault-laws`, with automatic fallback to `process.env.VAULT_KEY` for local development.
* **First-Class `@Precedent` Theia AI Chat Agent**:
  * Bound `PrecedentChatAgent` (`@precedent`) directly in `chat-agents.ts` and `hayagriva-frontend-module.ts` to expose `@Precedent` in Theia AI Chat dropdown alongside `@Advisor`, `@Forms`, `@Document`, and `@Claims`.
  * Specialized in querying the 17,558 encrypted Supreme Court, NCLAT, and NCLT judgments vault with `/search` and `/ratio` modes.
* **Monaco `/precedent` & `@precedent` Autocomplete Metadata**:
  * Enhanced `/precedent <query>`, `/case <query>`, and `@precedent` completion providers in `monaco-providers.ts` and `/api/hayagriva/learning-curves` route to parse frontmatter (`Case-Title`, `Issue`, `Citation`, `Date-of-Order`, `Court-Tribunal`) for rich inline preview cards and snippets.
* **Modular Multi-Class Claims Preparation Architecture (`@claim_preparation`)**:
  * **Master Intake Coordinator**: Automatically parses case folder evidence (Form A public announcements, bank statements, purchase agreements, invoices, salary slips) or user intent to categorize claimants (`CLASS_OF_CREDITORS`, `FINANCIAL_CREDITOR`, `OPERATIONAL_CREDITOR`, `WORKMEN_EMPLOYEE`, `OTHER_CREDITOR`).
  * **Specialized Sub-Agent Delegation**: Resolves matching sub-agent (`ClassOfCreditorsClaimSubAgent`, `FinancialClaimSubAgent`, `OperationalClaimSubAgent`, `WorkmenClaimSubAgent`, `OtherClaimSubAgent`).
  * **Class of Creditors Hierarchy (Regulation 8A & 8)**: Treats `CLAIM_<NAME>_FORM_CA.md` as the **Primary Statutory Form** (with Authorized Representative nomination) and `CLAIM_<NAME>_FORM_C.md` as the **Secondary Supporting Form**.
  * **Default Arrears Mathematical Engine**: Calculates unpaid default months from last received credit up to the Insolvency Commencement Date ($N \text{ months} \times \text{monthly rate} = \text{Arrears}$) and synthesizes the total admissible claim ($\text{Principal} + \text{Arrears}$).
  * **Conversational Refinements in Chat**: `subAgent.handleModification()` parses natural language changes (e.g. *"Change AR to Mr. X"*, *"Set default arrears to 20 months"*, *"Update principal amount to ₹14,00,000"*), updates math, and re-drafts forms in place with live chat re-rendering.
  * **Automated Batch Processing across `Clients/`**: Scans parent directory, auto-classifies each client subfolder independently, drafts respective forms, and compiles a centralized `MASTER_CLAIMS_SUMMARY.md` ledger.



