# Roadmap & Architectural Specification: The Sovereign TiddlyWiki Legal Assembly Line (`tiddly_shift.md`)

---

## 1. Executive Summary & Architectural North Star

### The Core Problem Solved
1. **Markdown Cognitive Friction for Advocates:** Litigators and insolvency professionals think in terms of court pleadings, averments, and visual calculation tables. Forcing them to write and debug raw Markdown pipes (`| col |`) breaks their legal train of thought.
2. **The "Monolithic Jumping Scroll" Bug:** When viewing a monolithic 20-page `.md` document, pressing `Ctrl+S` causes the entire preview `<iframe>` to reload over HTTP, tearing down the DOM and snapping `window.scrollY` back to `0`.
3. **How Lawyers Actually Think (Atomic Evidentiary Blocks):** Litigators do not write linear prose from scratch; they dissect a case into **atomic evidentiary building blocks** (Articles of an agreement, dates of default, assessment orders, arrears schedules), verify them card-by-card, and then assemble them into court pleadings.

### The 4-Stage Legal Lifecycle

```
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: RAW INTAKE (PDF Dropped)                                      │
│ • Commercial Court - rent recovery case.pdf                             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Auto-Conversion & Slicing
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 2: THE EVIDENTIARY WIKI (The Chamber Brain)                      │
│ • wiki/Commercial Court - rent recovery case/                          │
│   ├── 01_Parties.tid                                                   │
│   ├── 02_Lease_Covenants.tid                                           │
│   ├── 03_Arrears_Table.tid       <-- Click-to-edit visual table cells  │
│   └── 04_Prior_Orders.tid        <-- Linked exhibits [[Ex P-8]]        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Curation & Legal Assembly
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 3: SYNTHESIS / NEW PLEADING WIKI (Drafting & Fact Assembly)      │
│ • The advocate arranges cards, writes arguments, adds new instructions │
│ • Transcludes evidence cards straight into the draft (e.g. {{Table}})  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ One-Click Sovereign Compilation
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 4: CONTINUOUS COURT EXPORT (.docx / .pdf)                        │
│ • exports/01_Pre_Institution_Mediation/Plaint.docx                     │
│ • Formatted for filing with continuous paragraph numbering (1 to 16)   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Spatial Layout Architecture: Clean Single-Sidebar Paradigm

To eliminate the "OS inside an OS" feeling, the screen follows a strict **spatial division of labor** inspired by modern developer IDEs (VS Code / Cursor):

```
┌──────┬──────────────┬─────────────────────────────────────────────────────────────┐
│ ACT. │ THEIA LEFT   │                   THEIA MAIN (Document Area)                │
│ BAR  │ DOCK         ├──────────────────────────────────────────────┬──────────────┤
│      │ (VS Code)    │           STORY RIVER (Active Cards)         │ TIDDLYWIKI   │
│ [📁] │              │                                              │ RIGHT PANEL  │
│      │ [📁 Files]   │  ┌────────────────────────────────────────┐  │ (Toggleable) │
│ [🤖] │  - or -      │  │ 📄 01_Parties.tid             [✏️ Edit]│  │              │
│      │ [🤖 Agent]   │  └────────────────────────────────────────┘  │ 📑 TOC       │
│ [🏛️] │              │                                              │ 📌 Open Cards│
│      │              │  ┌────────────────────────────────────────┐  │ 🏷️ Exhibits  │
│ [⚙️] │              │  │ 📊 04_Arrears_Table.tid       [✏️ Edit]│  │              │
│      │              │  │ [Click-to-edit visual table]           │  │ [<< Collapse]│
│      │              │  └────────────────────────────────────────┘  │              │
└──────┴──────────────┴──────────────────────────────────────────────┴──────────────┘
```

### The Spatial Zones:
1. **Outer Left (Theia Activity Bar & Primary Dock):**
   - **`[📁]` File Explorer:** Case files, raw PDFs, drafts, exports, ledgers.
   - **`[🤖]` AI Legal Coworker:** Full chat composer, tool approvals, agent delegation (`@document`, `@forms`), and Case Action Inbox.
   - **`[🏛️]` Statutory Vaults Cockpit:** Bare Acts inspection and cartridge manager.
2. **Outer Right (Theia Shell Area `'right'`):**
   - **Permanently collapsed / suppressed.** Zero outer clutter.
3. **Inner Center (Theia Main Editor Area):**
   - Hosts the **TiddlyWiki Canvas** (Story River) or Monaco Editor.
4. **Inner Right (TiddlyWiki's Native Toggleable Sidebar):**
   - Hosts the **Document Table of Contents (TOC)**, Open Cards list, and Exhibit Tags.
   - Collapsible with **`<<`** for 100% full-width immersion, or expandable with **`>>`** for instant navigation.

### The "Auditor's Desk" (Tabs & Split Verification)
The advocate has two flexible viewing arrangements in the main workspace:
- **Sibling Tabs:** `[ 📚 Recovery Case (Wiki) ]` | `[ 📕 Original PDF ]` | `[ 📝 Draft Plaint ]`. Instant 0ms switching.
- **Side-by-Side Split ("Auditor's Desk"):** The original scanned PDF on the left; the editable Case Wiki cards on the right.

---

## 3. Rigorous Pros & Cons Review

### A. The Genuine Liabilities (Cons) of Stock TiddlyWiki & How We Overcome Them

| Con in Stock TiddlyWiki | Risk to Advocates | How the Minimalist Legal Template Solves It |
| :--- | :--- | :--- |
| **"Uncanny Valley" Jargon** | Confusing terms (*"Tiddlers"*, *"Story River"*, *"Shadows"*). | Replaced with clean legal terms: **"Fact Cards"**, **"Paragraphs"**, **"Exhibits"**, **"Table of Contents"**. |
| **Loss of Linear Document Continuity** | Disjointed index cards; cannot see the full plaint flow or continuous page numbering. | **Dual Perspective Toggle:** <br>`[ 🃏 Atomic Fact Cards ]` $\longleftrightarrow$ `[ 📜 Continuous Plaint ]`<br>Transcludes all cards in sequence with live legal numbering (`1.` to `16.`). |
| **"App-inside-an-App" Clutter** | Double sidebars, double search bars, settings icons. | **Theia right dock suppressed.** TiddlyWiki's internal TOC panel becomes the *only* document outline, collapsible via `<<`. |
| **Fragile WYSIWYG Plugins** | Stock TW plugins often break keyboard shortcuts and table copy/paste. | Use lightweight, focused in-card contentEditable / Milkdown engine strictly for cell editing and bolding. |

### B. The Definitive Advantages (Pros) of the Card-Based Wiki

1. **Zero Scroll Snapping:** Editing happens inside an isolated card. Saving that card re-renders *only that card*. The rest of the screen never jumps to the top.
2. **Visual Table Editing:** Click directly into table cells, change figures, press `Tab` to jump cells. Zero Markdown pipe syntax (`|`).
3. **Relational Evidence Linking:** Cross-link `[[Rakesh Mohan]]` $\leftrightarrow$ `[[Ex P-8 Assessment Order]]` $\leftrightarrow$ `[[Lease Deed]]`. Clicking a link pops open that specific evidence card in place.
4. **100% Air-Gapped & Sovereign:** A single standalone `.wiki.html` file runs locally in any browser with zero cloud or Docker dependencies.

---

## 4. Comprehensive File Inventory: Files Touched & Created

### A. Backend Core & Pipeline Files

| File Path | Status | Primary Responsibility |
| :--- | :---: | :--- |
| [`backend/lib/pipeline/wiki/tiddlywiki-template.js`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/lib/pipeline/wiki/tiddlywiki-template.js) | **Enhance** | Upgrade into **Minimalist Legal Wiki**: strip default TW sidebars/search clutter; inject legal court styling; add `[ 🃏 Cards ]` $\longleftrightarrow$ `[ 📜 Continuous Plaint ]` view toggle; embed in-card visual table editing. |
| [`backend/lib/pipeline/wiki/split.js`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/lib/pipeline/wiki/split.js) | **Enhance** | Slices parsed Markdown/PDF sections into standardized `.tid` card objects with RFC 822 frontmatter (`title`, `tags`, `type: text/x-markdown`, `doc`, `order`). |
| [`backend/lib/pipeline/pdf/ingest.js`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/lib/pipeline/pdf/ingest.js) | **Enhance** | After writing companion `.md`, automatically triggers `generateCaseWikiForPdf()` to populate `wiki/<PDF_STEM>/` with `.tid` cards and `.wiki.html`. |
| [`backend/lib/daemon/watcher.js`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/lib/daemon/watcher.js) | **Enhance** | Explicitly ignore `wiki/` directory in primary `DOC_EXTENSIONS` intake loop to prevent infinite ingestion loops; watch `.tid` files for dirty-card FTS5 incremental updates. |
| [`backend/lib/routes.js`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/lib/routes.js) | **Enhance** | Strengthen `/api/hayagriva/tiddlywiki/save` to write atomic `.tid` files; add new endpoint `/api/hayagriva/tiddlywiki/export-court-docx` to compile wiki cards into court-formatted Word documents. |
| [`backend/lib/core/wiki-stitcher.js`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/lib/core/wiki-stitcher.js) | **New** | Reads ordered `.tid` files, unrolls transclusions (`{{03_Arrears_Table}}`), renumbers continuous legal paragraphs (`1.` to `N.`), and feeds the compiled document to `docx-exporter.js`. |

---

### B. Frontend Theia Extension Files

| File Path | Status | Primary Responsibility |
| :--- | :---: | :--- |
| [`frontend/applications/browser/package.json`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/frontend/applications/browser/package.json) | **Enhance** | Register file association `"files.associations": { "*.tid": "markdown" }` so Monaco recognizes `.tid` files as first-class Markdown with full LSP slash commands. |
| [`frontend/theia-extensions/hayagriva/src/browser/commands.ts`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/frontend/theia-extensions/hayagriva/src/browser/commands.ts) | **Enhance** | Register `📖 Open Evidentiary Wiki` and `🏛️ Export Continuous Court DOCX` commands; bind right-click explorer menu for `.wiki.html` and `.tid` files. |
| [`frontend/theia-extensions/hayagriva/src/browser/menus.ts`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/frontend/theia-extensions/hayagriva/src/browser/menus.ts) | **Enhance** | Add primary action `📖 Open Case Wiki` to tab context menus and file explorer menus for ingested documents. |
| [`frontend/theia-extensions/hayagriva/src/browser/preview-manager.ts`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/frontend/theia-extensions/hayagriva/src/browser/preview-manager.ts) | **Enhance** | Host the interactive Legal Wiki inside a dedicated Theia widget with bi-directional `postMessage` synchronization, eliminating iframe reload snaps. |
| [`frontend/theia-extensions/hayagriva/src/browser/extension.ts`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/frontend/theia-extensions/hayagriva/src/browser/extension.ts) | **Enhance** | Dock the AI Agent Chat panel in the Left Activity Bar by default, ensuring the outer right dock remains collapsed. |

---

## 5. The 5 High-Risk Failure Modes & Mandatory Safeguards

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FAILURE MODES & SAFEGUARDS                      │
├────────────────────────────────────────────────────────────────────────┤
│ 1. WATCHER INFINITE LOOP:                                              │
│    • Hazard: chokidar sees .tid files and runs ingestDoc() on them.     │
│    • SAFEGUARD: Explicitly ignore `wiki/` directory in watcher.js.     │
├────────────────────────────────────────────────────────────────────────┤
│ 2. 3-DOT STATUS COLLAPSE:                                              │
│    • Hazard: Status checker fails if .md companion is removed.         │
│    • SAFEGUARD: Keep companion .md in conversions/ as canonical base.   │
├────────────────────────────────────────────────────────────────────────┤
│ 3. MONACO LSP LOSS:                                                    │
│    • Hazard: Monaco opens .tid as plaintext (no /cpc-truth commands).  │
│    • SAFEGUARD: Add `*.tid: markdown` in Theia package preferences.    │
├────────────────────────────────────────────────────────────────────────┤
│ 4. PREVIEW REGRESSION:                                                 │
│    • Hazard: Right-click on .md draft crashes if pointed to wiki.      │
│    • SAFEGUARD: Keep viewAsHtml intact; add dedicated openCaseWiki.    │
├────────────────────────────────────────────────────────────────────────┤
│ 5. STALE COURT EXPORTS:                                                │
│    • Hazard: Word doc has old figures if cards are edited separately.  │
│    • SAFEGUARD: Dynamic transclusion ({{03_Arrears_Table}}) in stitcher │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Phase-by-Phase Implementation Roadmap

### Phase 1: Minimalist Legal TiddlyWiki Template [100% Implemented & Verified]
- **File:** [`backend/lib/pipeline/wiki/tiddlywiki-template.js`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/lib/pipeline/wiki/tiddlywiki-template.js)
- **Scope Implemented:**
  - Injected authoritative Chamber Legal styling (`Georgia` / `Times New Roman` serif body, dark slate cards, court gold accents, high-contrast typography).
  - Curated collapsible right outline (`#legal-sidebar`) with tabs: `[ 📑 Outline ]`, `[ 📌 Open Cards ]`, `[ 🏷️ Exhibits ]` and real-time live search filter.
  - Added **Dual Perspective Switch**:
    - `[ 🃏 Atomic Fact Cards ]`: isolated cards with per-card controls (`✏️ Edit`, `💻 Code`, `📋 Copy`).
    - `[ 📜 Continuous Plaint ]`: continuous legal pleading flow with court header, sequential legal paragraph numbering (`1.`, `2.`...), and Order VI Rule 15A verification block.
  - Embedded in-card **Visual Table Editor**: Markdown tables parse into interactive tables with `contenteditable="true"` cells, tabular figures, and auto-serialization back to Markdown on edit.
  - Added in-card Monaco trigger hook (`[ 💻 Code ]`) and Court DOCX export trigger (`[ 🏛️ Export Court DOCX ]`).
  - Implemented unit test suite [`backend/tests/test_legal_wiki_template.js`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/tests/test_legal_wiki_template.js) (7/7 tests passing) and confirmed zero regression on existing pipeline tests.


### Phase 2: Ingestion Slicing & `.tid` Storage [100% Implemented & Verified]
- **Files:** [`backend/lib/pipeline/wiki/split.js`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/lib/pipeline/wiki/split.js), [`backend/lib/pipeline/pdf/ingest.js`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/lib/pipeline/pdf/ingest.js), [`backend/lib/pipeline/wiki/ingest.js`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/lib/pipeline/wiki/ingest.js)
- **Scope Implemented:**
  - Implemented RFC 822 `.tid` serialization (`serializeTidCard`) and parsing (`parseTidCard`) preserving all headers (`title`, `tags`, `type: text/x-markdown`, `doc`, `order`, `created`, `modified`).
  - Implemented `sliceMarkdownToTidCards()` with automated legal paragraph detection (`1. That...`), financial table tagging (`Table Financial`), exhibit tagging (`Exhibit`), and statutory jurisdiction/court fee classification.
  - Implemented `generateCaseWikiForPdf()`: automatically slices companion Markdown into isolated `.tid` files under `<wikiDir>/<docStem>/` and compiles the standalone `<docStem>.wiki.html` canvas.
  - Integrated directly into `ingestPdf()`: every PDF conversion automatically generates both the canonical companion `.md` (preserving 3-Dot status) and the structured `.tid` cards + `.wiki.html`.
  - Updated `ingestWikiCard()` to support both `.tid` and `.md` formats for BM25 full-text indexing.
  - Unit test suite [`backend/tests/test_wiki_split_and_tid.js`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/tests/test_wiki_split_and_tid.js) passing 100% (3/3 phases), with live verification producing 33 `.tid` cards for `Commercial Court - rent recovery case`.


### Phase 3: Watcher Protection & Atomic Save API [100% Implemented & Verified]
- **Files:** [`backend/lib/daemon/watcher.js`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/lib/daemon/watcher.js), [`backend/lib/routes.js`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/lib/routes.js), [`backend/lib/api-server.js`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/lib/api-server.js)
- **Scope Implemented:**
  - **Infinite Loop Elimination (Failure Mode 1):** Configured `createWatcher()` in `watcher.js` to strictly ignore internal directories (`concepts`, `conversions`, `drafts`, `exports`, `ledgers`, `.theia`, `.vscode`) and added `isWikiPath` check returning early before primary document intake.
  - **Incremental BM25 Card Sync:** User or editor modifications to `.tid` files inside `wiki/` or `*_wiki_haya/` trigger fast incremental BM25 updates via `ingestWikiCard()` without re-queueing the document.
  - **Atomic Card Save Endpoint (`POST /api/hayagriva/tiddlywiki/save-card`):** Writes directly to `<wikiDir>/<docStem>/<order>_<title>.tid`, syncs changes to the companion `.wiki.html` canvas via `syncMarkdownToWiki()`, and executes sub-millisecond incremental updates to SQLite FTS5 (`case_vault.db`) in `fts_chunks` and `document_sections`.
  - **Bulk Canvas Save Endpoint (`POST /api/hayagriva/tiddlywiki/save`):** Atomically extracts updated cards from `<script class="tiddlywiki-tiddler-store">`, persists individual `.tid` files to disk, and updates SQLite FTS5 indices.
  - **HTTP Method Parity & CORS:** Enabled `PUT` and `POST` parity with `module.exports.PUT = module.exports.POST` and added `PUT` to `Access-Control-Allow-Methods` in `api-server.js`.
  - **Unit & Live Verification:** Passed all Phase 3 tests in [`backend/tests/test_watcher_and_atomic_save.js`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/tests/test_watcher_and_atomic_save.js), verified live HTTP 200 responses, on-disk `.tid` updates, and live SQLite FTS5 query matching on the active Commercial Court case.


### Phase 4: Continuous Court Pleading Stitcher & DOCX Export [100% Implemented & Verified]
- **Files:** [`backend/lib/core/wiki-stitcher.js`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/lib/core/wiki-stitcher.js), [`backend/lib/routes.js`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/lib/routes.js), [`backend/tests/test_wiki_stitcher.js`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/tests/test_wiki_stitcher.js)
- **Scope Implemented:**
  - **Dynamic Transclusion Unrolling (Safeguard 5):** Automatically expands cards referenced as `{{Card_Title}}` (e.g. `{{03_Arrears_Table}}`) directly inline into the text stream so live edits to atomic tables immediately reflect in court pleading exports.
  - **Sequential Legal Paragraph Renumbering:** Parses substantive cards in story order and normalizes non-continuous or fragmented paragraph numbers into a strict, court-ready continuous sequence (`1.` through `N.`).
  - **Statutory Court Verification & Evidentiary Certificates:**
    - Formats formal Court Cause Title and Pleading Headings for Commercial Court / District Court.
    - Automatically appends formal Court Verification block with dynamic paragraph scope (`paragraphs 1 to N`).
    - Injects **Statement of Truth** under Order VI Rule 15A CPC as amended by Commercial Courts Act, 2015.
    - Injects electronic record certificate under **Section 63 of Bharatiya Sakshya Adhiniyam, 2023** (corresponding to Section 65B of Indian Evidence Act, 1872).
  - **Court-Grade Word DOCX Compilation:** Uses bundled `pandoc-x64` / `pandoc-arm64` (Pandoc 3.6) with automatic fallback to `docx-exporter.js`, generating Microsoft Word tables with alternating row shading, 1.5 line spacing, Times New Roman typography, and 1.75" left margins for legal binding.
  - **Export API Endpoint (`POST /api/hayagriva/tiddlywiki/export-court-docx`):** Stitches cards and saves both `<docStem>_Court_Pleading.docx` and `<docStem>_Court_Pleading.md` into `<caseDir>/exports/`. Robust directory resolution handles spaces, underscores, and normalized file stems.
  - **Unit & Live Verification:** Passed all Phase 4 tests in [`backend/tests/test_wiki_stitcher.js`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/tests/test_wiki_stitcher.js), and verified live via HTTP against `/Users/atulgrover/Desktop/HAYA_MATTERS/Commercial Court`, producing an 18 KB Court DOCX and 15 KB Markdown file with 34 sequential paragraphs.

### Phase 5: Theia IDE Integration & Preferences [100% Implemented & Verified]
- **Files:** [`frontend/applications/browser/package.json`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/frontend/applications/browser/package.json), [`commands.ts`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/frontend/theia-extensions/hayagriva/src/browser/commands.ts), [`menus.ts`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/frontend/theia-extensions/hayagriva/src/browser/menus.ts), [`extension.ts`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/frontend/theia-extensions/hayagriva/src/browser/extension.ts)
- **Scope Implemented:**
  - **Monaco `.tid` Markdown Association:** Configured `"files.associations": { "*.tid": "markdown" }` in both `frontend/applications/browser/package.json` and programmatically via `preferenceService.set` in `extension.ts` onStart. Monaco opens `.tid` cards with first-class Markdown highlighting and slash command triggers (`/cpc-truth`, `/cpc-order39`, etc.).
  - **Command & Context Menu Registration:**
    - `📖 Open Case Wiki (Legal Canvas)` (`hayagriva:openCaseWiki`): Registered in File Navigator context menu, Tab Bar context menu, and Editor context menu. Resolves `.wiki.html`, `.tid`, or companion document stems and opens the interactive Legal Wiki Canvas.
    - `🏛️ Export Continuous Court DOCX` (`hayagriva:exportCourtDocx`): Registered in File Navigator, Tab Bar, and Editor context menus. Directly stitches `.tid` cards, normalizes legal numbering, injects statutory certificates, and compiles Court Word DOCX.
    - `📖 View as HTML (Live Formatted Preview)` (`hayagriva:viewAsHtml`): Strictly preserved as primary Tab Bar right-click action with `order: '0'` (preventing preview regression). Added `.tid` to `validExts`.
  - **Single-Sidebar Alignment (Left Activity Bar Docking):** Reconfigured `openRagChat()` to `{ area: 'left', rank: 500 }`. The AI Agent Chat docks in the Left Activity Bar alongside File Navigator and Case Wiki, keeping Theia's outer right panel collapsed so the TiddlyWiki collapsible right outline acts as the sole document outline.
  - **Clean Build & Zero Regressions:** TypeScript compilation (`yarn build`) in `hayagriva` extension and Webpack bundling (`yarn build`) in `theia-ide-browser-app` passed with 0 errors.

---

## 7. Verification Checklist & Regression Safety Gates

All 5 core gates are now 100% verified:
- [x] **Gate 1:** Existing unit test suites (`tests/run_all_tests.js`) and all 4 wiki test suites pass with 0 regressions.
- [x] **Gate 2:** Existing companion Markdown (`.md`) and concepts (`concepts/`) generation remains 100% operational.
- [x] **Gate 3:** Ingestion of `Commercial Court - rent recovery case.pdf` generates both `.md` and `wiki/` cards without infinite loops or warnings.
- [x] **Gate 4:** Editing an arrears figure in `03_Arrears_Table.tid` updates the `.tid` file on disk, updates companion `.wiki.html`, and syncs to SQLite FTS5 (`case_vault.db`).
- [x] **Gate 5:** Exporting continuous pleading generates an openable `.docx` file matching Commercial Court formatting rules (1.75" left margin, 1.5 line spacing, Times New Roman, Statement of Truth, Section 63 BSA certificate).
