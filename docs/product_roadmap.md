# HAYAGRIVA: The Legal IDE for Professional Drafting & Compliance

A distraction-free, professional drafting workspace designed specifically for legal professionals, backed by the raw analytical muscle of a modern compiler engine. Built on the modular architecture of Eclipse Theia, **HAYAGRIVA** bridges the gap between traditional legal drafting habits and state-of-the-art software engineering.

---

## Core Product Pillars

### 1. The "Word" Illusion: Abstracted UI & Page-Style Editor
Traditional development tools overwhelm legal professionals with dark-mode terminals, complex file trees, and monospace fonts. We redefine the workspace to feel like an elegant page editor while keeping a high-performance editing engine running invisibly underneath.
*   **Distraction-Free Layout:** Overrides the default Eclipse Theia workbench to hide the status bar, minimaps, and unneeded toolbars.
*   **Page-Style Visual Overlays:** Centered, padded editor views with custom serif typography (e.g., Garamond, Georgia) to simulate a printed page interface.

### 2. Dedicated "Legal LSP" (Language Server Protocol)
We treat legal documents as code, using a custom Language Server Protocol engineered specifically for legal syntax. Built with **Langium** (TypeScript), we parse drafts into Abstract Syntax Trees (AST) for real-time validation.

### 3. Local, Privacy-First AI Agents via MCP
Corporate insolvency, transaction records, and litigation cases contain highly sensitive data. By leveraging the **Model Context Protocol (MCP)** and offline Ollama/Docker runtimes, AI agents query local vector databases without any data leaving the machine.

### 4. Native Git for Lawyers: Track Changes, Simplified
Git version control handles document integrity under the hood, while a custom Theia webview translates raw diff files into a clean "Track Changes" (insertions/deletions) redline visualizer.

### 5. Automated Document Ingestion & Fact Extraction
Raw uploads (`.pdf`, `.docx`, `.xlsx`) are digested automatically via Docling page-provenance extraction, Mammoth paragraph chunking, and SheetJS row-splitting to generate structured Markdown databases.

### 6. "Invisible" Data Exchange (The Compilation Pipeline)
Drafts are authored in structured, machine-readable formats. Upon clicking "Export", a backend compilation pipeline runs Pandoc and OpenXML wrappers to compile them into perfectly typeset, court-ready `.docx` documents.

---

## Out-of-the-Box (OOB) Concept Adaptations

To push the legal drafting experience beyond basic editors, we borrow core engineering and design workflows from other successful IDE forks and non-developer workspaces:

*   **The Overleaf "Split-Visual" Editor:** Like Overleaf's source/visual toggle, HAYAGRIVA allows users to write in a rich-text format while compiling clean, structured Markdown and YAML frontmatter in the background.
*   **The Scrivener "Draft Binder" Outline:** Contracts and petitions are split into modular section files (e.g., *Jurisdiction*, *Limitation Clause*). Lawyers can rearrange these chapters inside a visual outline view, and the compilation pipeline merges them chronologically for export.
*   **The Cursor-style Multi-File Indexing:** Indexes all case exhibits, affidavits, and correspondence so the local AI assistant can fetch facts and cross-check arguments across different files simultaneously.

---

## Advanced Features & "Legal Compiler" Extensions

### I. Real-time "Malpractice Linting"
Just as compilers check for syntax errors, HAYAGRIVA uses its LSP parser to flag high-risk legal draft issues:
*   **Undefined Capitalized Terms:** Warns the writer if a capitalized term is used in the text (e.g. *"Resolution Professional"*) but does not have a matching definition in the Definitions section.
*   **Unused Definitions:** Highlights terms defined in Section 1 but never cited in the body of the agreement.
*   **Contradictory Timelines:** Alerts the user if Section 3 states *"payment due in 30 days"* while Section 9 states *"payment due within 15 days of invoicing"*.
*   **Broken Cross-References:** Flags broken links (e.g., *"pursuant to Section 5.1"* when Section 5.1 does not exist in the active document).

### II. Case Chronology "Time-Travel Debugger"
A timeline is a litigation lawyer's debugger.
*   Integrate a dynamic **Chronology Timeline Sidebar Panel** that compiles date-event sentences across all documents.
*   Clicking an event node in the timeline panel acts as a "Go to Definition" link—automatically opening the corresponding source file and highlighting the exact page, paragraph, and line in yellow.

### III. Multi-Document "Refactoring" (Global Rename)
*   Right-clicking a corporate entity name or court reference and selecting "Rename" updates that entity across the petition, notices, accompanying exhibits, and JSON case logs instantly while keeping layout alignments intact.

### IV. Drag-and-Drop "Clause Palette"
*   A palette library containing standard dispute clauses, arbitration clauses, and boilerplate terms.
*   Dragging a clause into the document prompts the user to fill in detected AST variables (e.g., `$JURISDICTION` or `$LIQUIDATED_DAMAGES_CAP`).

---

## Monetisation & Subscription Model

To ensure recurring renewals, the encrypted law libraries are updated weekly with statutory amendments. A stale vault contains outdated laws, presenting a malpractice risk for advocates.

| Tier | Price | Limits | Features |
|---|---|---|---|
| **Free** | Rs. 0 | 3 cases, 5 docs/case, 25 `@@` completions/day | IBC Core only (Sections 6-32), library frozen at install time, no auto-drafting. |
| **Pro** | Rs. 2,999/month | Unlimited cases, docs, & `@@` completions | All libraries (IBC + Companies Act + CPC + CrPC + NI Act), weekly auto-updates, export to DOCX/PDF. |
| **Firm** | Rs. 9,999/month | Up to 5 seats (Rs. 1,800/extra seat) | Shared case libraries, custom precedents, template customization, audit logging. |
| **Enterprise** | Custom | Bespoke deployments | Fully air-gapped deployment, quarterly vault updates on signed USB. |

---

## Feature Implementation Status Dashboard

| Feature Area | Key Capability | Current Stage | Source File / Implementation Context |
| :--- | :--- | :--- | :--- |
| **1. Abstracted UI** *(The Word Illusion)* | Stripping workbench layout (closing non-essential sidebars) | **Partially Implemented** | Native widgets registered in [extension.ts:L90-100](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/ide/theia-extensions/hayagriva/src/browser/extension.ts#L90-L100) to auto-close unused panels on layout load. |
| | Custom Serif/Sans-serif editor styling & margins | **Fully Implemented** | Overriding Monaco styling to present page margins, dynamic borders, and serif typography in [extension.ts:L730-780](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/ide/theia-extensions/hayagriva/src/browser/extension.ts#L730-L780). |
| **2. Legal LSP** | Monaco `@@` autocomplete trigger for law lookup | **Fully Implemented** | Registered completion provider in [extension.ts:L508-729](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/ide/theia-extensions/hayagriva/src/browser/extension.ts#L508-L729) querying the `/api/laws/query` endpoint. |
| | Monaco custom citation links (e.g. `Page 12` clickable) | **Fully Implemented** | Link Provider registered in [extension.ts:L470-504](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/ide/theia-extensions/hayagriva/src/browser/extension.ts#L470-L504). |
| | True Abstract Syntax Tree (AST) validation & parsing | **Planned** | Planned integration of **Langium** (TypeScript) to recognize obligations, conditions, and flag invalid citation structures. |
| **3. Privacy-First Local AI** | Off-line local embeddings & BM25 Scoring | **Fully Implemented** | Local transformer Xenova `MiniLM-L6` model running in-memory and hybrid scoring formulas in [vault-loader.js:L61-75](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/hayagriva/lib/vault-loader.js#L61-L75). |
| | Model Context Protocol (MCP) server & agents | **Planned** | Planned framework to interface local Ollama models with the editor. |
| **4. Native Version Control** | Under-the-hood Git commit abstraction | **Planned** | Background version checkpoints without command-line exposure. |
| | Simplified "Track Changes" Webview | **Planned** | Custom Lumino webview to render human-readable insertions/deletions. |
| **5. Invisible Data Exchange** | Multi-Format Ingestion pipeline | **Fully Implemented** | Automated parsers (Docling, Mammoth, SheetJS) converting raw uploads to Markdown in [watcher.js](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/hayagriva/lib/watcher.js). |
| | Court-Ready `.docx` Export compilation | **Planned** | Backend export compiler pipeline utilizing Pandoc. |
| **6. Case Ingestion & RAG Wiki** | Click-to-Highlight citation navigation | **Fully Implemented** | Handles citation clicks, opens files, and triggers a fading yellow line decorator in [extension.ts:L317-346](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/ide/theia-extensions/hayagriva/src/browser/extension.ts#L317-L346). |
| | Case Wiki Explorer Side panels | **Fully Implemented** | Native widgets (`Case Wiki` and `Concepts`) registered in [extension.ts:L260-395](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/ide/theia-extensions/hayagriva/src/browser/extension.ts#L260-L395). |
| | Automated Timeline Compiler | **Fully Implemented** | Extractor scans documents for date patterns and writes `timeline.md` dynamically. |

---

## Incremental Implementation Roadmap (Task Checklist)

### Phase 1: Visual Foundation (The Word Illusion)
*   [x] Inject page-layout overrides into `onStart()` of [extension.ts](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/ide/theia-extensions/hayagriva/src/browser/extension.ts).
    *   [x] Hide status bar (`#theia-statusBar`).
    *   [x] Override Monaco default font family to beautiful Serif (`Garamond`, `Georgia`).
    *   [x] Set editor margins to `max-width: 850px; margin: 0 auto;` and apply subtle page shadows.
*   [x] Register `hayagriva:toggleWordIllusion` command inside [commands.ts](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/ide/theia-extensions/hayagriva/src/browser/commands.ts) to toggle layout styles.
*   [x] Add toolbar action button to toggle the page view.


### Phase 2: Chronology "Time-Travel Debugger" UI
*   [ ] Refactor the static chronology generator backend to output chronological JSON arrays.
*   [ ] Create a custom Lumino sidebar widget `hayagriva-timeline-explorer` using standard Theia view contributions.
*   [ ] Add click event listeners to the timeline nodes that resolve file anchors and highlight target paragraphs dynamically.

### Phase 3: Exporter & Document Assembly (Compilation Pipeline)
*   [ ] Integrate Pandoc or OpenXML templates on the backend to export drafts to clean `.docx` files.
*   [ ] Implement a custom export action command in the Theia file context menu.
*   [ ] Implement section merging rules to allow a multi-file Scrivener-style outline workspace to compile into one legal document.

### Phase 4: Basic AST & "Legal Linter" rules
*   [ ] Bootstrap **Langium** or a custom parser to extract capitalized terms from drafts.
*   [ ] Implement real-time Diagnostics (linters) in Monaco to flag Capitalized Terms lacking definition references.
*   [ ] Implement diagnostics to raise errors for references to non-existent sections (e.g. *"Section 9.1"* when it doesn't exist).

### Phase 5: Version Control & Track Changes Webview
*   [ ] Programmatically capture Git commits behind-the-scenes on document save.
*   [ ] Build a webview comparing Git histories and formatting modifications as clean Word-like redlines.

### Phase 6: Drag-and-Drop Clause Palette
*   [ ] Create a sidebar panel displaying standard boilerplate snippets.
*   [ ] Wire up drag-and-drop listener to read snippet structures and prompt user for variables upon insertion.
