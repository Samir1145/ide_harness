# HAYAGRIVA Legal IPE & Ingestion User Guide

**HAYAGRIVA** is an **Integrated Professional Environment (IPE)** designed for Advocates, Corporate Counsel, and Insolvency Professionals. It unifies legal document ingestion, precedent research, Markdown drafting, live case ledgers, and court-compliant petition publishing into one desktop workspace.

## Executive Overview: The Legal IPE Concept
An Integrated Professional Environment (IPE) synthesizes all tools, workflows, data streams, and communication channels a legal practitioner needs into a single interface. Much like an Integrated Development Environment (IDE) minimizes context-switching for software engineers, HAYAGRIVA minimizes context-switching for legal professionals by blending disconnected tools into one seamless desktop application shell:

* **Smart Document & Asset Canvas:** Monaco-powered legal drafting editor with live `/law`, `/case`, `/clause`, and `@@` statutory hover cards.
* **Unified Case Ledger Engine:** Bi-directional synchronization between Markdown ledgers (`case_facts.md`, `claims_registry.md`, `avoidance_ledger.md`) and SQLite database tables.
* **Local-First & Encrypted:** Complete AES-256-GCM encryption at rest for statutory and case law vaults with zero cloud data leakage.
* **Deterministic Compiler:** One-click conversion from Markdown to court-compliant Supreme Court & NCLAT `.docx` petitions (`/export-sc`).

---

## 1. The 3-Stage Ingestion Pipeline
When you upload documents into a Case Workspace, they progress through three sequential, color-coded stages:

1.  **Dot 1 (Companion Markdown Extraction):** Converts files (PDFs, Word documents, Excel sheets) into editable companion Markdown (`.md`) files on disk.
2.  **Dot 2 (Search Vector Generation):** Tokenizes document pages, runs a local neural embedding pass in RAM, and indexes the vectors into the SQLite database.
3.  **Dot 3 (AI Enrichment & Facts Curation):** Spawns background AI tasks to summarize document sections and generate hypothetical questions for the RAG search database.

---

## 1.5. Product Mode Feature Matrix: Lite vs. Standard

HAYAGRIVA supports two processing modes to accommodate different hardware specifications and privacy constraints:
*   **Lite Mode (default):** Designed for 8GB–16GB RAM devices. Operates offline, skipping LLM generations to prevent OOM errors, while providing local indexing, timeline chronology extraction, topic overlap maps, and local ONNX-powered semantic search.
*   **Standard Mode:** Designed for 16GB–32GB+ RAM or cloud API configurations. Enables the complete suite of AI-assisted drafting, facts extraction, and evaluation agents.

### Step 1 — Ingestion Pipeline

| Feature | ⚡ Lite | 🧠 Standard (Local/Cloud) | Status |
|---|---|---|---|
| **PDF → Markdown (pdfexcavator)** | ✅ local extraction | ✅ local extraction | **Implemented** |
| **DOCX Ingestion (mammoth)** | ✅ local extraction | ✅ local extraction | **Implemented** |
| **XLSX / XLS Ingestion (xlsx-js)** | ✅ local extraction | ✅ local extraction | **Implemented** |
| **TiddlyWiki HTML Ingestion** | ✅ local wiki parse | ✅ local wiki parse | **Implemented** |
| **PDF Quality Density Gate** | ✅ local character limit | ✅ local character limit | **Implemented** |
| **Lazy PDF Queue (Pages 4–N)** | ✅ local background queue | ✅ local background queue | **Implemented** |
| **Layout Profiler Classification** | ❌ returns paragraph fallback | ✅ LLM A–G layout profiling | **Implemented** |
| **Markdown Cleaner Pass** | ❌ regex-only cleaner | ✅ LLM markdown cleaner | **Implemented** |
| **Topic Merge Across Docs** | ❌ always creates new topic | ✅ LLM topic merge | **Implemented** |
| **BM25 Keyword Indexing** | ✅ local SQLite store | ✅ local SQLite store | **Implemented** |
| **FTS5 Full-Text Search** | ✅ local SQLite store | ✅ local SQLite store | **Implemented** |
| **Semantic Vector Indexing** | ✅ **100% Local ONNX** | ✅ **100% Local ONNX** (No cloud leaks) | **Implemented** |
| **KV Fact Entity Extraction** | ❌ skipped | ✅ LLM key-value extraction | **Implemented** |

### Step 2 — HIL Enrichment

| Feature | ⚡ Lite | 🧠 Standard (Local/Cloud) | Status |
|---|---|---|---|
| **Lazy Background Worker** | ❌ skipped (auto-marks `enriched`) | ✅ LLM Q&A/summary generation | **Implemented** |
| **Monaco Editor + LSP** | ✅ local autocompletion & hover | ✅ local autocompletion & hover | **Implemented** |
| **Monaco-SQLite Sync** | ✅ updates facts, claims, avoidance | ✅ updates facts, claims, avoidance | **Implemented** |
| **Statute Hover (`@@` refs)** | ✅ local vault decryption | ✅ local vault decryption | **Implemented** |
| **Law Vault Search Completion** | ✅ local ONNX/BM25 search | ✅ local ONNX/BM25 search | **Implemented** |
| **Manual Review (3rd Status Dot)**| ✅ local SQLite write | ✅ local SQLite write | **Implemented** |
| **Active-Context Control Matrix** | ✅ local active docs RAG filter | ✅ local active docs RAG filter | **Implemented** |
| **3D Case Graph Viewer (D3.js)** | ✅ local index.json node render | ✅ local index.json node render | **Implemented** |
| **Document Priority Control** | ✅ local drag-and-drop hierarchy | ✅ local drag-and-drop hierarchy | **Implemented** |
| **Wiki Card Creation** | ✅ local manual card creation | ✅ local manual + LLM enrichment | **Implemented** |
| **Case Chronology Timeline** | ✅ local regex date extractor | ✅ local regex date extractor | **Implemented** |
| **Topic Overlap Map** | ✅ local card index scanner | ✅ local card index scanner | **Implemented** |
| **Semantic Passage Search** | ✅ local candidate retrieval | ✅ local candidate retrieval + rerank | **Implemented** |

### Step 3 — Agentic Outputs / Actions

| Feature | ⚡ Lite | 🧠 Standard (Local/Cloud) | Status |
|---|---|---|---|
| **SC Layout Compiler (DOCX)** | ✅ local Markdown-to-DOCX compiler | ✅ local Markdown-to-DOCX compiler | **Implemented** |
| **Forms Agent Pre-fill** | ✅ partial pre-fill from case facts | ✅ full pre-fill (Phase 1 + Phase 2 RAG) | **Implemented** |
| **AI RAG Chats / Answers** | ❌ returns formatted passage cards | ✅ full LLM synthesized responses | **Implemented** |
| **`/api/agents/chat` Gating** | ❌ routes local RAG search directly | ✅ calls agent classification | **Implemented** |
| **Complex Generative Agents** | ❌ blocked (NCLT, IM, Plan, Avoidance, Claims) | ✅ fully accessible | **Implemented** |
| **Template Drafting** | ❌ returns raw templates with placeholders | ✅ compiles text via LLM | **Implemented** |
| **Ollama Model Quality Badge** | N/A | ✅ inline warning badge for small models | **Implemented** |

---

## 2. Ingestion Failure Modes & Resolutions

### 🔴 Step 1 Failure: Companion Extraction Fails (Dot 1 Red)

#### A. Scanned PDFs (Flat Images)
*   **The Cause:** If a PDF contains only scanned images and no selectable text bytes, the extraction engine falls back to layout OCR. This requires an active internet connection and a cloud API key (Google Gemini/OpenRouter).
*   **The Resolution:** 
    *   **Cloud Option:** Provide an `OPENROUTER_API_KEY` (Gemini Flash) or `GEMINI_API_KEY` in the **Case Settings panel** (gear icon in Monaco top-right toolbar) and connect to the internet.
    *   **Offline Fallback:** If you have no internet, HAYAGRIVA automatically creates a **Skeleton Companion MD** file containing placeholder page blocks. You can open it in the Monaco editor and manually paste or type transcribed case facts.

#### B. macOS Gatekeeper Restrictions (EACCES / Permission Denied)
*   **The Cause:** macOS blocks execution of downloaded binary conversion tools (e.g., `pandoc-arm64`).
*   **The Resolution:** Run the following permission-quarantine clearance command in your system Terminal:
    ```bash
    chmod +x "/Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/bin/pandoc-arm64" && xattr -d com.apple.quarantine "/Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/bin/pandoc-arm64"
    ```

#### C. Legacy Document Formats (.doc, .xls)
*   **The Cause:** Binary files (pre-2007 format structures) cannot be parsed natively by XML-based converters.
*   **The Resolution:** Open the file in Microsoft Word or Excel, choose **Save As**, select modern `.docx` or `.xlsx` format, and upload it. Alternatively, install **LibreOffice** (see Section 3 below) to enable automatic background conversion.

---

### 🔴 Step 2 Failure: Search Vector Indexing Fails (Dot 2 Red)

#### A. Offline First-Run (ONNX Cache Model Download)
*   **The Cause:** HAYAGRIVA calculates document vectors in-process using ONNX Runtime. The first time the system runs, it must download the `all-MiniLM-L6-v2` transformer model (~25MB) from Hugging Face. If the system is offline on this first run, it fails.
*   **The Resolution:** Connect to the internet **once** and restart the app. The system will pre-fetch the model assets and cache them. After this, you can run vector calculations completely offline.

#### B. Event Loop Freezes on Large Files (OOM)
*   **The Cause:** Sequentially executing neural networks on hundreds of pages in a single loop freezes the Node event loop and exceeds heap memory boundaries.
*   **The Resolution:** HAYAGRIVA automatically throttles processing by yielding control back to the V8 event loop after every 30 pages. If system lag persists, switch to **Cloud Active Mode** in Case Settings to delegate vector generation to cloud APIs in under 2 seconds.

---

### 🔴 Step 3 Failure: AI Enrichment Fails (Dot 3 Red)

#### A. Out-of-Memory Blocks on 8GB-16GB RAM Systems
*   **The Cause:** Running large offline LLM models (via local Ollama) on consumer laptops alongside a browser and an IDE will exhaust memory, freeze system execution, and cause query timeouts.
*   **The Resolution:** **HAYAGRIVA actively blocks local Ollama enrichment on machines with less than 24GB of RAM** to protect system stability. 
    *   To enrich documents on a 16GB RAM system, you must switch your router to **Cloud Active Mode** in the Settings panel (utilizing Gemini Flash via OpenRouter/Gemini API). 
    *   Otherwise, configure your workspace profile to **Lite Mode** which bypasses the background LLM queue entirely.

#### B. Ollama Daemon Offline
*   **The Cause:** The Ollama background service is not running or the model has not been pulled.
*   **The Resolution:** Run `ollama serve` in a terminal window, run `ollama pull qwen2.5-coder:1.5b` to fetch the model, and then restart the launcher script.

---

*Once installed, the backend will auto-detect the installation path. No settings configurations are needed.*

---

## 4. Vault Distribution System

HAYAGRIVA uses an encrypted, versioned **Vault** system to distribute curated legal and financial knowledge bases directly to users. Vaults are downloaded once and stored locally — no data is ever sent to a cloud server during search or inference.

### The 4 Vaults

| Vault | Contents | Status |
|---|---|---|
| **Laws Vault** | Full statutory text across all IBC domains | Available |
| **Cases Vault** | Summaries of 17,000+ NCLT/NCLAT judgments and orders | Available |
| **Documents Vault** | Standard legal document templates | Coming soon |
| **Forms Vault** | IBBI prescribed forms with field guidance | Coming soon |

### How to Download a Vault

1. Open **Settings → Vault & License** tab inside HAYAGRIVA.
2. Enter your license key (`HAYG-XXXX-XXXX-XXXX`) received via email after purchase.
3. The app validates your key against `api.hayagriva.app` and stores your vault decryption key in the macOS/Windows Keychain.
4. Click **Download** next to the vault you wish to install.
5. The vault is downloaded, integrity-verified (SHA-256), and installed to:
   - macOS: `~/Library/Application Support/Hayagriva/vaults/{name}/`
   - Windows: `%APPDATA%\Hayagriva\vaults\{name}\`
6. The app hot-swaps the new vault without requiring a restart.

### Monthly Updates

Vaults are refreshed monthly with new judgments and statutory amendments. You will receive an email notification. To update:
1. Open **Settings → Vault & License**.
2. Click **Check for Updates**.
3. Click **Download** on any vault showing a new version.

---

## 5. Local AI — Sovereign LLM Mode

HAYAGRIVA's AI features run **100% locally** using domain-tuned Indian legal language models. No case data, client names, or legal arguments are ever transmitted to a cloud API.

### Two Operating Modes

| Mode | AI | Speed | RAM Required |
|---|---|---|---|
| **⚡ Lite** | None (BM25 + semantic search only) | Instant | 8 GB |
| **🧠 Local** | LegalParam / FinanceParam (offline LLM) | ~15–20 t/s | 16 GB |

### Downloading a Local LLM

Local models are distributed as **llamafile** executables — a single self-contained file (~1.7 GB) that includes the model weights and inference runtime. No separate software installation is required.

1. Open **Settings → Vault & License**.
2. Under **Local AI Models**, click **Download** next to the model you need.
3. The model is installed to `~/Library/Application Support/Hayagriva/models/`.
4. Switch your mode to **Local** in Settings to activate it.

### Available Models

| Model | Size | Specialisation | Context |
|---|---|---|---|
| **LegalParam-2.9B** | ~1.7 GB | IBC, NCLT, insolvency law across 14 legal domains | 2,048 tokens |
| **FinanceParam-2.9B** | ~1.7 GB | Indian financial law: taxation, banking, investment | 2,048 tokens |

> **Note:** These models are optimised for focused drafting and Q&A on retrieved case excerpts. For long document summarisation, use the vault search to retrieve relevant sections first, then prompt the model on those excerpts.

---

## 6. Troubleshooting

### 🔴 Step 3 Failure: AI Enrichment Fails (Dot 3 Red)

#### A. Out-of-Memory on 8GB–16GB RAM Systems
- **Cause:** Running a local LLM alongside the IDE and browser can exhaust memory on lower-end machines.
- **Resolution:** Switch to **Lite Mode** in Settings. All search and indexing features remain fully functional. AI drafting features are deactivated.

#### B. Local Model Not Downloaded
- **Cause:** Local mode is active but no LLM model file exists in the models directory.
- **Resolution:** Go to **Settings → Vault & License → Local AI Models** and download a model. The model must be fully installed before Local mode can activate.

#### C. Model Cold Start Delay
- **Cause:** The LLM process needs ~5–10 seconds to start on first use.
- **Resolution:** This is expected. A spinner will show in the chat panel during startup. Subsequent queries in the same session are instant.
