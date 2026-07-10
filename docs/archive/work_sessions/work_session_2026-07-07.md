# HAYAGRIVA Work Session - 2026-07-07

## Completed

### 1. Ingestion Pipeline & Parsers
* Refactored [converter.js](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/hayagriva/lib/converter.js) and [splitter.js](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/hayagriva/lib/splitter.js) to drop `markitdown` CLI and route directly through:
  - `mammoth` (Word documents) to clean HTML with paragraph splitting fallback.
  - `xlsx` (Excel sheets) with row chunking and column header replication.
  - `docling` (PDF documents layout analyzer) page-level provenance extraction.
* Created a standalone layout-provenance python helper [docling_convert.py](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/hayagriva/scripts/docling_convert.py).

### 2. Search & Retrieval Engines
* Implemented a fast custom keyword search index [bm25.js](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/hayagriva/lib/bm25.js) utilizing TF-IDF scoring, legal stop words filtering, and suffix-stemming rules.
* Configured a dynamic client [llm-client.js](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/hayagriva/lib/llm-client.js) supporting Ollama with automatic Gemini and OpenAI fallbacks.
* Added a chronological case timeline compiler [timeline.js](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/hayagriva/lib/timeline.js) parsing date patterns and context sentences into `timeline.md`.
* Upgraded backend routes to SSE stream RAG answers token-by-token.

### 3. Folder Hardening ("Noob-Proofing")
* Resolved case extraction relative to the active Workspace Root to prevent path bugs.
* Added chokidar watcher deletion hooks to automatically wipe index records, concepts subfolders, and timeline dates if source documents are deleted by the user.

### 4. Code Splitting & Modularization
Decoupled the massive frontend extension monolith into isolated, single-responsibility files:
* `src/browser/templates.ts` — Webview markup HTML strings.
* `src/browser/highlight-decorator.ts` — Monaco text line highlights.
* `src/browser/commands.ts` — Command registrations.
* `src/browser/menus.ts` — Context and view menus.
* `src/browser/extension.ts` — Event brokers and panel orchestrator.
* `src/browser/hayagriva-frontend-module.ts` — DI Inversify bindings.

### 5. Handbook Rewrite
* Re-authored the `handbook/` into 6 step-by-step chapters covering the user and admin perspective for each phase.

### 6. Build & Launch Integration
* Fixed `start.command` paths using portable `ROOT_DIR` dynamic script-relative path checks.
* Linked dependencies with `PUPPETEER_SKIP_DOWNLOAD` parameters.
* Fixed syntax errors in `templates.ts` (escaped nested backticks) and `menus.ts` (switched to `['editor_context_menu']` path).
* Built custom extension explicitly (`yarn build` inside `hayagriva-theia-extension`) to update target browser `/lib/` files.
* Compiled frontend extensions and generated Electron React/esbuild bundle packages (0 errors).
* Terminated conflicting background processes and launched the active application bundle.
* Implemented auto-reconnect retry polling to Case Wiki Explorer Webview load functions to handle initial proxy startup delays.

# HAYAGRIVA Work Session - 2026-07-09

## Completed

### 1. TabBar Toolbar Contribution Bugfix
* Fixed missing upload icon in the explorer sidebar tab bar header:
  - Bound `HayagrivaFrontendContribution` to the `TabBarToolbarContribution` interface in [hayagriva-frontend-module.ts](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/ide/theia-extensions/hayagriva/src/browser/hayagriva-frontend-module.ts#L17).
  - Added the `icon: 'fa fa-upload'` property to the `TabBarToolbarRegistry` registration in [extension.ts](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/ide/theia-extensions/hayagriva/src/browser/extension.ts#L82).
  - Made the command visibility `isVisible` callback robust by checking for both container (`explorer-view-container`) and inner content widget (`files`) view IDs in [commands.ts](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/ide/theia-extensions/hayagriva/src/browser/commands.ts#L101-L107).

### 2. Workspace File Exclusions
* Added a local workspace settings file [.theia/settings.json](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/.theia/settings.json) to filter out internal `wiki/` and `concepts/` database directories from the main File Explorer sidebar. This hides system-generated markdown cards and page chunks to keep the workspace clean.

### 3. Dedicated Concepts Sidebar Panel (Lightbulb Icon)
* Implemented a new custom Concepts sidebar panel under the lightbulb icon (`fa fa-lightbulb-o`) ranked at `550` in the Left Panel.
* Coded a dynamic iframe view `conceptsExplorerHtml(caseName)` inside [templates.ts](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/ide/theia-extensions/hayagriva/src/browser/templates.ts#L408) that reads `concepts/index.json` to display a tree structure of document chunks.
* Added a `open-concept-chunk` event listener in [extension.ts](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/ide/theia-extensions/hayagriva/src/browser/extension.ts#L309-L315) so double-clicking page chunks opens them using the native Theia editor.

---

## Next Steps
* Proceed with hybrid search setup (BM25 + sqlite-vec vector KNN embeddings) and dynamic CodeLens/Gutter markings.
