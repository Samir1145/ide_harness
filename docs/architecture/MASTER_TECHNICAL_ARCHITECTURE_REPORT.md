# Hayagriva Sovereign Legal OS: Master Technical Architecture & Codebase Audit Report

---

## 1. High-Level Architecture & Purpose

### 1.1 What Does Hayagriva Actually Do?
Hayagriva is an **air-gapped, sovereign, in-chamber legal document factory and cognitive workspace** designed specifically for Indian litigation advocates, Insolvency Resolution Professionals (IRPs/RPs), and commercial chambers.

Rather than acting as a generic conversational chatbot, Hayagriva operates as a local legal assembly line:
1. **Raw Matter Intake:** The advocate drops case files (NCLT orders, plaints, bank statements, lease deeds, claims) into a matter directory.
2. **Deterministic Companion Extraction (Zero-Model Floor):** Without needing active LLMs or cloud APIs, native parsers extract clean companion Markdown, isolate structured tables, and index document chunks into native SQLite FTS5 and pure-JS BM25 search indices in milliseconds.
3. **Chamber Evidentiary Curation:** Slices files into concept cards, extracts entities and financial quantum into `case_kv_dictionary.json`, and links exhibits.
4. **Autonomous Statutory Drafting & Verification:** Specialized subagents (`DocumentAgent`, `FormsAgent`, `StatutoryAuditor`) audit compliance against local decrypted Bare Act vaults (IBC, Companies Act, Commercial Courts Act, CPC, BSA 2023) and generate Court-ready pleadings.
5. **Court Pleading Export:** Formats and compiles final legal documents into standard Microsoft Word `.docx` (1.75" left margin, 1.5 line spacing, Times New Roman, bold captions) and PDF with automated Order VI Rule 15A Statements of Truth and electronic evidence certificates.

---

### 1.2 Overall Architectural Pattern

Hayagriva follows a **Local Microkernel / Client-Server Hybrid Architecture** embedded within an **Eclipse Theia IDE Shell**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   PRESENTATION TIER (Eclipse Theia IDE)                │
│  • React 19 + PhosphorJS Layout Engine                                 │
│  • Monaco Code Editor (LSP Hovers, Slash Triggers, Slash Skeletons)    │
│  • Hayagriva Custom Browser Extension (`hayagriva-theia-extension`)    │
│  • Command Center & Settings Dashboard (Vaults, Templates, Cockpit)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ JSON-RPC (WebSocket) + REST HTTP (Port 3210)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    APPLICATION TIER (Node.js Daemon)                   │
│  • `backend/cli.js` & `backend/lib/routes.js`                          │
│  • Watcher Daemon (`chokidar` reactive filesystem watcher)             │
│  • Ingestion Pipelines (PDF, DOCX, XLSX, TiddlyWiki)                   │
│  • Agent Coordinator & Execution Sandbox (Cordis LIFO Scoping)         │
│  • Statutory Hydration Engine (DSpace REST -> India Code)              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Direct I/O & Embedded Drivers
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    DATA & STORAGE TIER (Local-First)                   │
│  • SQLite3 (case_vault.db with FTS5 virtual tables)                    │
│  • Plaintext Markdown Concept Cards & `.tid` Tiddler Store             │
│  • Central Variable Dictionaries (`case_kv_dictionary.json`)           │
│  • Immutable JSONL Audit Trail (`audit_trail.jsonl` with SHA-256 chain)│
│  • Local Decrypted PostgreSQL / SQLite Law Vaults                      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack & Dependencies Audit

### 2.1 Backend Dependencies (`backend/package.json`)

| Package | Version | Why It Exists (Role & Purpose) |
| :--- | :--- | :--- |
| **`pdfexcavator`** | `^0.1.2` | Core PDF parser. Built on Mozilla's `pdf.js` (`pdfjs-dist`). Extracts text streams, layout blocks, and graphical line rects. |
| **`mammoth`** | `^1.8.0` | Word document parser. Converts incoming binary `.docx` files to companion Markdown. |
| **`xlsx`** | `^0.18.5` | Spreadsheet parser. Ingests bank books, creditor ledgers, and debt matrices into Markdown tables. |
| **`docx`** | `^9.7.1` | Native JavaScript Word compiler. Assembles court-formatted `.docx` files with 1.75" margins and tables. |
| **`chokidar`** | `^3.6.0` | File watcher daemon. Powers `watcher.js` to reactively detect new/modified files in matter folders. |
| **`gray-matter`** | `^4.0.3` | Frontmatter engine. Parses and serializes YAML metadata in concept cards and wiki notes. |
| **`jsqr`** | `^1.4.0` | Computer vision tool. Scans extracted PDF images to decode High Court/eCourts verification QR codes. |
| **`markdown-it`** | `^14.3.0` | Markdown renderer. Converts Markdown into HTML for Theia previewers and settings dashboards. |
| **`puppeteer-core`** | `^25.9.0` | Headless Chromium driver. Renders court-accurate PDFs from HTML and captures browser verification records. |
| **`sharp`** | `^0.35.3` | Native C++ libvips image processor. Handles image cropping, rotation, and resolution scaling. |
| **`@xenova/transformers`** | `^2.17.2` | Local ONNX neural inference engine. Generates dense embeddings (`InLegal-SBERT`, `bge-small-en-v1.5`) without Python. |
| **`vscode-languageserver`** | `^9.0.1` | LSP protocol implementation. Serves Monaco with autocomplete, diagnostics, and hover hints. |
| **`vscode-languageserver-textdocument`** | `^1.0.12` | In-memory text document manager for the LSP language service. |
| **`vscode-markdown-languageservice`** | `^0.5.0` | Monaco Markdown language support engine. |
| **`vscode-uri`** | `3.0.8` | URI parsing and path normalization utility across Windows/macOS/Linux. |
| **`vscode-ws-jsonrpc`** | `^3.3.1` | JSON-RPC over WebSocket bridge between Monaco Editor and the Node.js backend. |
| **`ws`** | `^8.18.0` | WebSocket server. Enables real-time streaming between Theia frontend and the backend daemon. |
| **`nodemailer`** | `^10.0.10` | SMTP client. Handles client notification dispatches and automated status updates. |
| **`keytar`** | `^7.9.0` | Native OS credential manager. Stores API keys securely in the macOS Keychain / Windows Credential Manager. |
| **`detect-libc`** | `^2.1.2` | Native binary helper to detect glibc vs musl for bundled pandoc/puppeteer binaries. |
| **`@aws-sdk/client-s3`** | `^3.1098.0` | S3 client. Powers encrypted offsite matter backups and VDR synchronizations. |
| **`@aws-sdk/s3-request-presigner`** | `^3.1098.0` | Generates time-limited pre-signed S3 URLs for secure file sharing. |
| **`@llamaindex/llama-cloud`** | `^2.15.0` | Cloud fallback parser for scanned/multimodal document ingestion. |

---

### 2.2 Frontend Dependencies (`frontend/theia-extensions/hayagriva/package.json`)

| Package | Version | Role & Purpose |
| :--- | :--- | :--- |
| **`@theia/core`** | `1.75.0` | Core Eclipse Theia IDE platform framework (dependency injection, commands, menus). |
| **`@theia/editor`** | `1.75.0` | Editor lifecycle and document manager. |
| **`@theia/monaco`** | `1.75.0` | Monaco code editor integration in Theia. |
| **`@theia/filesystem`** | `1.75.0` | File tree watcher and file system abstraction. |
| **`@theia/workspace`** | `1.75.0` | Workspace directory scoping and state persistence. |
| **`@theia/ai-core-ui`** | `1.75.0` | Theia AI chat composer, agent delegation registry, and tool invocation UI. |
| **`react` & `react-dom`** | `^19.0.0` | Presentation framework for custom Theia widgets, toolbars, and settings panels. |

---

### 2.3 Redundancy & Conflict Audit

1. **`@llamaindex/llama-cloud` vs. Local-First Air-Gap Policy:**
   - *Status:* **Redundant / Edge Fallback**.
   - *Audit Note:* The codebase strictly enforces offline sovereignty (Zero-Model Floor). `llama-cloud` is only invoked if the user explicitly opts into cloud multimodal OCR. It can be safely removed or isolated into an optional plugin.
2. **`nodemailer` in Backend Root:**
   - *Status:* **Dormant Utility**.
   - *Audit Note:* Used in legacy notification pipelines. Could be moved to an optional enterprise communication module.
3. **Dual PDF Extraction Paths (`pdfexcavator` vs legacy pandoc):**
   - *Status:* **Resolved**.
   - *Audit Note:* Pandoc ARM64 binary execution on macOS failed due to architecture mismatches. `pdfexcavator` is now the sole authoritative PDF text extractor.

---

## 3. Project Structure & File Map

```
HAYAGRIVA/harness/
├── .agents/                               <-- Sovereign Agent Rules, Skills, and Context
│   ├── AGENTS.md                          <-- Master Workspace Rules & Architectural Invariants
│   └── skills/                            <-- Domain-specific skills (forensic, claims, pii)
│
├── backend/                               <-- Core Server, Pipelines, and Ingestion Engine
│   ├── cli.js                             <-- Entrypoint CLI (`--watch-all`, `--sync-acts`)
│   ├── package.json                       <-- Backend dependencies
│   └── lib/
│       ├── routes.js                      <-- Master HTTP REST & WebSocket Router (Port 3210)
│       │
│       ├── daemon/                        <-- Background Workers
│       │   └── watcher.js                 <-- Reactive filesystem watcher (chokidar) & coordinator
│       │
│       ├── pipeline/                      <-- Ingestion Management System (IMS)
│       │   ├── pdf/upload.js              <-- PDF layout reconstruction & table parser
│       │   ├── pdf/ingest.js              <-- Multi-page PDF chunking & companion writer
│       │   ├── docx/upload.js             <-- Mammoth Word-to-Markdown converter
│       │   ├── xls/upload.js              <-- Sheet-to-Markdown ledger parser
│       │   └── wiki/tiddlywiki-template.js<-- Standalone auto-syncing Wiki generator
│       │
│       ├── core/                          <-- Cognitive & Storage Engine
│       │   ├── bm25.js                    <-- Pure JS BM25 full-text indexing engine
│       │   ├── splitter.js                <-- Document layout landmarking & chunking
│       │   ├── docx-exporter.js           <-- Programmatic Court-formatted DOCX compiler
│       │   ├── lsp-service.js             <-- Monaco Language Server Protocol driver
│       │   ├── pageindex-builder.js       <-- Hierarchical PageIndex tree builder
│       │   └── post-ingest-briefer.js     <-- 4-bullet court intake brief generator
│       │
│       ├── agents/                        <-- Agent Management System (AMS)
│       │   ├── agent-coordinator.js       <-- Multi-agent router & delegation supervisor
│       │   ├── inbox-manager.js           <-- Case Action Inbox attention queue manager
│       │   └── subagents/                 <-- Specialized Workers
│       │       ├── document-agent.js      <-- Pleading & affidavit drafter
│       │       ├── forms-agent.js         <-- Statutory compliance auditor & critic
│       │       ├── bank-analyzer.js       <-- Multi-bank statement reconciler
│       │       └── statutory-auditor.js   <-- LexAI report & bare act auditor
│       │
│       ├── pipeline/forms/                <-- Drafting Management System (DMS)
│       │   ├── commercial-courts-drafting.js <-- Order 38, Order 39, Section 12A drafter
│       │   ├── statutory-drafting.js      <-- Master template skeleton hydration engine
│       │   └── rules_validator.js         <-- Rules CC_01 to CC_05 court pleading validator
│       │
│       └── security/
│           └── policy_guard.js            <-- Command splitting & arg-executor firewall
│
├── frontend/                              <-- Eclipse Theia IDE Desktop Application
│   ├── applications/browser/              <-- Browser/Electron Application Shell (Port 3000)
│   └── theia-extensions/hayagriva/        <-- Hayagriva Custom IDE Extension
│       └── src/browser/
│           ├── extension.ts               <-- Extension lifecycle & global CSS injector
│           ├── commands.ts                <-- Command registry (Drafting, Preview, Wiki)
│           ├── menus.ts                   <-- Tabbar and explorer context menu registry
│           ├── preview-manager.ts         <-- Side-by-side live document previewer
│           └── tree-decorator.ts          <-- Explorer 3-dot badges (● ● ●) & companion chips
│
└── docs/                                  <-- Architectural Specifications & Handbooks
```

---

## 4. Data Flow & Core Logic

### 4.1 Ingestion & Indexing Pipeline (The 3-Dot Status Flow)

When a document (`Commercial Court - rent recovery case.pdf`) is added:

```
[Drop PDF into Matter Folder]
              │
              ▼
[watcher.js: chokidar detects file] ──> Emits event to /api/hayagriva/events
              │
              ▼
[upload.js: convertPdf]
  1. Calls pdfexcavator to extract text stream
  2. Runs isTabularLine heuristics -> preserves structured tables
  3. Joins prose paragraphs (joinParagraphs) without collapsing tables
  4. Scans page 1 for eCourts QR code (decodeQrFromImage)
              │
              ▼
[ingest.js: Companion Generation]
  Writes: conversions/<PDF_STEM>.md
  Emits: Dot 1 Turns Green (● ○ ○)
              │
              ▼
[text_ingest.js & splitter.js: Semantic Slicing]
  1. Slices markdown into sections & concept cards (concepts/<PDF_STEM>/Page_N.md)
  2. Builds pageindex_tree.json
  3. Updates bm25_index.json & SQLite case_vault.db (fts_chunks table)
  Emits: Dot 2 Turns Green (● ● ○)
              │
              ▼
[post-ingest-briefer.js: Enrichment & KV Discovery]
  1. Extracts party names, dates, financial claims into case_kv_dictionary.json
  2. Emits 4-bullet court intake brief into reviews/case_inbox.json
  Emits: Dot 3 Turns Green (● ● ●)
```

---

### 4.2 Statutory Drafting & Critique Loop

When an advocate invokes `/cpc-order39` in Monaco:

1. **LSP Autocompletion (`lsp-service.js`):** Monaco expands the complete Order XXXIX Rules 1 & 2 statutory skeleton.
2. **Variable Overlays:** Variables (`{{claimant_name}}`, `{{arrears_principal}}`) are populated from `case_kv_dictionary.json`.
3. **Critique Delegation Loop (`agent-coordinator.js`):**
   - `DocumentAgent` compiles the initial draft.
   - Delegates internally to `FormsAgent` via `ChatAgentService.delegateToAgent`.
   - `FormsAgent` runs `rules_validator.js` (checks Rules CC_01 to CC_05: statement of truth, urgent relief grounds, court fees).
   - If defects exist, `FormsAgent` returns a critique memo; `DocumentAgent` corrects the draft before saving to `drafts/`.
4. **Export (`docx-exporter.js`):** Compiles the validated markdown into `exports/<Bundle>/<Pleading_Name>.docx`.

---

## 5. Environment & Configuration

### 5.1 Runtime Ports & Protocols

| Service | Port | Protocol | Purpose |
| :--- | :---: | :---: | :--- |
| **Hayagriva Core Daemon** | `3210` | HTTP / WebSocket | File watcher, REST routes, TiddlyWiki auto-saver, search engine. |
| **Theia IDE Shell** | `3000` | HTTP / WebSocket | Main desktop IDE interface and Monaco editor workspace. |
| **Local LLM Engine** | `8090` | HTTP (OpenAI-compat) | Bundled `llamafile` (optional, offline local AI generation). |
| **Document Previewer** | `3210` | HTTP (Iframe) | Dynamic preview of companions, DOCX, and legal pleadings. |

---

### 5.2 Matter Directory Architecture (`HAYA_MATTERS/<Matter_Name>/`)

Every legal case is isolated in its own folder:

```
Matter_Directory/
├── *.pdf, *.docx, *.xlsx                  <-- Source evidentiary files dropped by user
├── <Matter>_conversions_haya/             <-- Companion .md files, audit trail, manifest
│   ├── *.md                               <-- Full companion markdown
│   ├── *.status                           <-- 3-Dot status flag (Dot 1, 2, 3)
│   ├── audit_trail.jsonl                  <-- Immutable SHA-256 evidence log
│   └── case_manifest.json                 <-- Matter metadata and scheduled milestones
├── <Matter>_concepts_haya/                <-- Sliced concept cards & search indices
│   ├── case_vault.db                      <-- SQLite FTS5 database (fts_chunks)
│   ├── bm25_index.json                    <-- BM25 inverted keyword index
│   └── <Doc_Stem>/pageindex_tree.json     <-- Hierarchical document tree
├── drafts/                                <-- Court-ready pleadings & bundles
│   ├── 01_Pre_Institution_Mediation/      <-- Form 1, Statement of Truth, Rule 3 Affidavits
│   ├── 02_Urgent_Injunction_Stay/         <-- Order 39 Application, Statement of Truth
│   └── .history/                          <-- Archived previous revisions
├── exports/                               <-- Compiled Court DOCX files
├── reviews/                               <-- Case Action Inbox & KV Dictionary
│   ├── case_inbox.json                    <-- Asynchronous Human-in-the-Loop tasks
│   └── case_kv_dictionary.json            <-- Single Source of Truth for matter variables
└── wiki/                                  <-- Case Wikis & .tid card stores
```

---

### 5.3 Hardware & System Requirements

- **Operating System:** macOS (Apple Silicon M1-M4 or Intel x64), Linux (x64), or Windows (WSL2).
- **Node.js Runtime:** `Node.js >= 22.0.0` (uses native `node:sqlite`).
- **RAM Footprint:** ~81 KB to 120 MB RAM in Lite Mode (zero LLM active). ~4 GB RAM when local 7B/14B llamafile is booted.
- **External Dependencies:** **ZERO**. No internet connection, Docker containers, or cloud subscriptions required for 100% of core operations.
