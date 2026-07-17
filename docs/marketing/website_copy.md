# HAYAGRIVA Website Copy & Content Blueprint

This document contains the finalized copy, visual asset suggestions, and interaction specifications for the **HAYAGRIVA Product Landing Page**.

---

## Page Structure & Copy Blocks

### 1. NAVIGATION BAR
*   **Logo Text:** HAYAGRIVA
*   **Slogan Monospace:** `[ LOCAL_FIRST_LEGAL_IDE ]`
*   **Nav Links:** Features | Technology | Lite vs Standard | Security | Documentation
*   **CTA Button:** `Download Local Server`

---

### 2. HERO SECTION
*   **Visual Suggestion:** Behind the text, a floating, glowing D3.js node graph slowly connects and disconnects nodes representing case documents (e.g., *Invoices*, *Demand Notices*, *Avoidance Ledgers*).
*   **Slogan Badge:** `⚡ VERIFIED COMPILATION ON LOCAL HARDWARE`
*   **Main Headline (Outfit, 64px, bold):**  
    Compile Case Facts.  
    Build Compliance.  
    Private First.
*   **Subheadline (Inter, 18px, opacity 0.85):**  
    HAYAGRIVA is the local-first IDE designed for Insolvency Professionals, corporate counsels, and litigation teams. Parse heavy PDF volumes, verify claims, scan ledgers for avoidance transactions, and compile ready-to-file legal drafts completely offline.
*   **CTA Buttons:**
    - `Get Started (Local Setup)` (Solid Electric Cyan background, HSL `(195, 95%, 50%)`)
    - `Read Specs (GitHub)` (Bordered transparent button)
*   **Command Line Tooltip:**
    `$ curl -L https://hayagriva.io/install.sh | sh && ./start.command`

---

### 3. THE PROBLEM & THE RESOLUTION
*   **Headline:** Legal work is not just text management. It is compilation.
*   **Left Column (The Friction):**
    *   **Data Leakage:** Cloud LLMs index your clients' confidential case materials, exposing proprietary evidence and trade secrets.
    *   **Context Fragmentation:** Documents live in PDFs, facts live in Word tables, statutes live in PDFs, and drafts live in separate editors. Nothing is linked.
    *   **Model Hallucinations:** Generic chat widgets hallucinate statutory clauses and dates, resulting in errors in NCLT or Supreme Court filings.
*   **Right Column (The Resolution — HAYAGRIVA):**
    *   **100% Offline Vector Indexing:** All semantic searches run locally on ONNX (`all-MiniLM-L6-v2`) inside your local memory.
    *   **Unified Case Workspace:** Companion Markdown files, Monaco LSP autocomplete suggestions, SQLite case facts, and D3 graph nodes live in a unified directory.
    *   **Deterministic Guards:** Strict template schemas restrict generative AI models. If facts are missing, the system outputs templates with unfilled placeholders instead of hallucinating.

---

### 4. CORE FEATURES (The Four Pillars)

#### A. Companion Markdown Ingestion
*   **Icon:** File/Code bracket
*   **Copy:** Upload PDFs, DOCX, and spreadsheets. HAYAGRIVA converts them into readable companion Markdown files. Scanned or corrupted documents are rejected at the gate, while hybrid pages receive warnings rather than failing cryptically.

#### B. Monaco editor + Bi-Directional SQLite Sync
*   **Icon:** Monaco edit cursor
*   **Copy:** Edit facts inside `case_facts.md` in Monaco. Changes are parsed and synchronized in real-time to the SQLite DB and `case_kv_dictionary.json`. Manual user inputs are cataloged as `verified_by_user = 1` to ensure RAG prompts always reference verified facts.

#### C. Local Legal Vault completion
*   **Icon:** Secure Safe / Key
*   **Copy:** Decrypt local statute volumes offline using AES-GCM decryption keys. Type `@@` in Monaco to auto-complete Section indexes, search case precedents, and review Statute hover popups without querying web servers.

#### D. The RAG Passage Search Drawer
*   **Icon:** Sliding panel / Search
*   **Copy:** Click citations inside the Chat view or Monaco editor to slide open a preview drawer showing the exact text excerpt. Promote preview cards into split-screen editors instantly if you need wider context.

---

### 5. PRODUCT TIERS: LITE VS. STANDARD
*   **Headline:** One Case. Two Processing Modes.

#### ⚡ Lite Mode
*   **Target:** 8GB–16GB RAM devices (Laptops, portable workstations).
*   **Cost:** Free / Open Source.
*   **Features Included:**
    - ✅ PDF/DOCX local text extraction
    - ✅ **100% Local ONNX Semantic search** (No cloud leaks)
    - ✅ Case Chronology Timeline extraction (Regex-powered)
    - ✅ Topic Overlap Map scanning
    - ✅ Monaco Editor, LSP diagnostics & Local Statute hovers
    - ✅ Partial Form pre-fill from manually verified facts
    - ✅ D3 Case Graph visualization
*   **AI generation:** Disabled (Short-circuited to return passage cards).

#### 🧠 Standard Mode
*   **Target:** 24GB+ RAM workstations (Local Ollama) or Cloud API configurations.
*   **Cost:** Enterprise License.
*   **Features Included:**
    - ✅ Everything in Lite Mode
    - ✅ Full AI Chat & Drafting Agents (Claims, Avoidance, Resolution, NCLT)
    - ✅ Automated facts extraction from raw texts
    - ✅ Layout profiling & automated summary curation
    - ✅ Background summarization queue
    - ✅ Ollama model size warning validations
    - ✅ Full RAG-based AI answer synthesis

---

### 6. THE PRIVACY ASSURANCE
*   **Headline:** Strict Client Privilege. No Cloud Leaks.
*   **Copy:**
    Whether you run Standard Cloud mode or local offline Ollama mode, all case database indexes, semantic search embeddings, and document structures are calculated **100% locally** using native ONNX runtimes. Your source texts are never uploaded to OpenAI, Anthropic, or Google vector storage grids. If you run Standard Mode using Cloud API Keys, only anonymized prompts are routed for answer synthesis. If you run Local Offline (Ollama) mode, zero bytes leave your machine.

---

### 7. HERO FOOTER / CALL TO ACTION
*   **Headline:** Ready to run your cases like code?
*   **Subheadline:** Download the local launcher script and start your Case Workspace today.
*   **Button Text:** `Get Launcher Script`
