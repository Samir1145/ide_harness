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
3.  **Dot 3 (AI Enrichment & Facts Curation):** Spawns background AI tasks to summarize document sections using high-density 2–3 sentence legal summaries (Legal Triad: rights/obligations, figures/dates, and provisos) directly into the PageIndex tree (`pageindex_tree.json`).

---

## 1.5. Product Mode Feature Matrix: Lite vs. Standard

HAYAGRIVA supports two processing modes to accommodate different hardware specifications and privacy constraints:
*   **Lite Mode (default):** Designed for 8GB–16GB RAM devices. Operates 100% offline without requiring local or cloud LLM engines. When local embedding models (`InLegal-SBERT`, `Finance-Embeddings`), encrypted Law/Case Vaults, and agent packs are installed, Lite Mode delivers complete RAG search, statutory lookup, structured form filling, ledger management, chronology extraction, and court-compliant document compilation.
*   **Standard Mode:** Designed for 16GB–32GB+ RAM or cloud API configurations. Enables the complete suite of AI-assisted drafting, generative reasoning, facts extraction, and multi-agent critique loops.

### 💡 What Can You Do in Lite Mode? (Sovereign Offline Execution)

Even with **zero LLM engines running** (Port 8090 offline), HAYAGRIVA operates as a fully functional, highly capable legal workspace. Below is an exact breakdown of what is active and available in Lite Mode:

#### 1. Ingestion & Document Processing
*   **Multi-format Extraction:** Converts PDFs, Word (`.docx`), Excel (`.xlsx`), and TiddlyWiki files into clean Markdown (`.md`) companion files instantly on drop.
*   **Local Vector Indexing:** Computes 768-dimensional neural embeddings locally in RAM using ONNX Runtime (`InLegal-SBERT` for legal files, `Finance-Embeddings` for sheets).
*   **Native ONNX Cross-Encoder Reranking (`ms-marco-MiniLM-L-6-v2`):** Combined SQLite full-text search (BM25) with dual-vector Reciprocal Rank Fusion (RRF), followed by deep cross-attention transformer reranking executing in **~15–25ms on CPU** with 95%+ precision—all running 100% offline with zero external LLM.
*   **Scanned PDF Self-Healing:** Detects flat/scanned PDFs and accepts companion `.md` drops to unlock vector search without external OCR dependencies.

#### 2. Specialized Subagents (@legal-advisor, @contract-risk, @deal-audit, @form-fill, etc.)
All 19 subagents remain fully operational in Lite Mode by leveraging local RAG retrieval, vault lookups, and KV dictionary extraction:

##### 📚 Simple English Subagent Task Dictionary

| Subagent Tag (New & Legacy) | Product Name | Task Description | Prompt Command Examples | Deliverables / Files Created |
|---|---|---|---|---|
| **`@legal-advisor`** *(or `@advisor`)* | **Legal Advisor** | **Case RAG & Statutory Search**<br>Retrieves relevant document passages across indexed files & cross-references IBC/MCA statutory sections in the Law Vault. | `@legal-advisor how is iPIE defined`<br>`@legal-advisor find default date in loan agreement`<br>`@legal-advisor IBC section 7 admission requirements` | • Formatted Case File Findings Card<br>• `case_facts.md` write-back |
| **`@form-fill`** *(or `@forms`)* | **Form Auto-Fill** | **Statutory e-Form Auto-Fill & Audit**<br>Extracts case facts to auto-fill IBBI/MCA statutory forms, runs math/date validation checks, and exports MCA-compliant JSON schemas. | `@form-fill Form A`<br>`@form-fill Form B for operational creditor`<br>`@form-fill AOC-4` | • Pre-filled Form Skeleton<br>• `exports/<form_id>_<timestamp>.json`<br>• `case_facts.md` audit log |
| **`@avoidance-audit`** *(or `@avoidance`)* | **Avoidance Audit** | **Avoidance Transaction Scan**<br>Scans financial transactions against statutory lookback periods (Preferential Sec 43, Undervalued Sec 45/46, Extortionate Sec 49, Fraudulent Sec 66). | `@avoidance-audit scan transactions`<br>`@avoidance-audit check director payments`<br>`@avoidance-audit lookback review` | • `concepts/avoidance_transactions.json`<br>• `avoidance_ledger.md` table<br>• `case_kv_dictionary.json` flag count |
| **`@claims-audit`** *(or `@claims`)* | **Claims Audit** | **Claims Verification & Discrepancy Audit**<br>Cross-references claimed principal/interest against loan agreements, invoices, and bank statements to flag discrepancies. | `@claims-audit verify claims`<br>`@claims-audit audit financial creditor debt`<br>`@claims-audit check claim amount mismatches` | • `claims_registry.md`<br>• Discrepancy Report Table<br>• `case_kv_dictionary.json` claim metrics |
| **`@argument-score`** *(or `@strength`)* | **Argument Scorer** | **Petition Ground Scoring**<br>Evaluates legal grounds in drafts against statutory sections and retrieved case evidence, scoring argument strength. | `@argument-score evaluate petition grounds`<br>`@argument-score check argument strength`<br>`@argument-score score grounds` | • Scored Grounds Matrix (`🟢 STRONG`, `🟡 MODERATE`, `🔴 WEAK`, `🟠 CONTESTED`) |
| **`@timeline-build`** *(or `@timeline`)* | **Timeline Builder** | **Case Chronology Reconstruction**<br>Extracts all legal dates across case documents, builds a chronological event sequence, and updates key statutory milestone dates. | `@timeline-build build chronology`<br>`@timeline-build reconstruct case dates`<br>`@timeline-build generate timeline` | • `timeline.md` (with Gantt chart)<br>• `case_kv_dictionary.json` milestone dates |
| **`@precedent-find`** *(or `@precedent`)* | **Precedent Finder** | **Case Law & Precedent Research**<br>Searches the local encrypted Case Vault (17,000+ judgments) for Supreme Court and NCLAT rulings matching legal issues. | `@precedent-find find rulings on CIRP withdrawal Sec 12A`<br>`@precedent-find Supreme Court precedent on related party voting` | • Precedent Rulings List<br>• Court Holdings & Citations |
| **`@order-decode`** *(or `@order`)* | **Order Decoder** | **Tribunal Direction & Compliance Audit**<br>Extracts operative directions, compliance deadlines, and next hearing dates from court/NCLT orders. | `@order-decode decode order directions`<br>`@order-decode audit compliance deadlines`<br>`@order-decode extract next hearing date` | • `litigation_tracker.md`<br>• `case_kv_dictionary.json` (`next_hearing_date`, `last_order_date`) |
| **`@coc-calc`** *(or `@coc-coordinator`)* | **CoC Voting Calc** | **CoC Voting Share & Governance Audit**<br>Calculates financial creditor voting shares ($V_i = \frac{Debt_i}{\sum Debt} \times 100\%$), excludes related parties (Sec 5(24)), and formats meeting notices. | `@coc-calc calculate voting shares`<br>`@coc-calc audit related party exclusion`<br>`@coc-calc generate meeting notice` | • Voting Share Table<br>• Statutory Notice & Ballot Template<br>• `drafts/coc_governance_summary.md` |
| **`@plan-audit`** *(or `@plan-evaluator`)* | **Resolution Plan Auditor** | **Resolution Plan Compliance Audit**<br>Audits Resolution Plans against mandatory Section 30(2) requirements and Section 29A disqualifications, preparing Form H compliance fields. | `@plan-audit audit resolution plan`<br>`@plan-audit check Section 29A eligibility`<br>`@plan-audit prepare Form H details` | • Section 30(2) Compliance Checklist<br>• `drafts/form_h_compliance_audit.md` |
| **`@contract-risk`** *(or `@cuad`)* | **Contract Risk Scanner** | **Commercial Contract Risk Scan**<br>Scans commercial contracts for 41 key legal risk categories (limitation of liability, indemnity caps, termination for convenience). | `@contract-risk scan commercial contract`<br>`@contract-risk check liability caps` | • `contract_risk_ledger.md`<br>• 41-Category Risk Matrix |
| **`@deal-audit`** *(or `@maud`)* | **M&A Deal Auditor** | **M&A Due Diligence Audit**<br>Audits Merger Agreements, SPAs, and Joint Ventures against 92 deal points (MAE exclusions, fiduciary outs, breakup fees). | `@deal-audit review merger agreement`<br>`@deal-audit check MAE exclusions` | • `maud_deal_audit.md`<br>• 92 Deal Point Checklist |
| **`@clause-find`** *(or `@acord`)* | **Clause Finder** | **Attorney-Rated Clause Retrieval**<br>Surfaces 126,662 expert-rated clause precedents across 9 commercial clause categories. | `@clause-find find 5-star indemnity clause`<br>`@clause-find arbitration clause` | • 5-Star Rated Clause Snippets |
| **`@entitygraph`** | **Entity Graph** | **3D Entity Relationship Graph Extraction**<br>Extracts parties, corporate entities, directors, dates, and transaction amounts to build a 3D network graph. | `@entitygraph build relationship graph`<br>`@entitygraph extract entity network` | • `concepts/entity_graph.json`<br>• Interactive D3.js 3D Graph Render |
| **`@affidavit-build`** *(or `@deposition`)* | **Affidavit Builder** | **Sworn Affidavit Skeleton Generation**<br>Fills case facts into standardized court affidavit skeletons (`affidavit-template.md`) and flags missing fields. | `@affidavit-build draft affidavit`<br>`@affidavit-build prepare sworn statement` | • `drafts/affidavit_draft_<timestamp>.md`<br>• Unfilled Field Gap Report |
| **`@evidence-matrix`** *(or `@witness`)* | **Evidence Matrix** | **Proof-to-Fact Evidence Matrix**<br>Maps factual claims and witness testimony points directly to underlying documentary evidence and exhibits. | `@evidence-matrix build evidence matrix`<br>`@evidence-matrix map proof to facts` | • `evidence_matrix.md`<br>• `case_facts.md` audit log |
| **`@client-update`** *(or `@clientupdate`)* | **Client Update Brief** | **Client Briefing Report**<br>Populates executive status reports from key case dictionary facts and current litigation status. | `@client-update prepare status report`<br>`@client-update generate client brief` | • `drafts/client_update_<timestamp>.md` |

#### 3. Workspace & Editor Features (Monaco Legal LSP)
The Monaco editor in HAYAGRIVA features a dedicated Language Server Protocol (LSP) provider that works **100% locally in both Lite and Standard modes**.

##### ⚡ Monaco LSP & Slash Command Dictionary

##### 3. Rationalized 5-Command Suite (`/` triggers)

Hayagriva rationalizes all Monaco editor slash actions into **5 primary commands**, with backward-compatible aliases for legacy triggers:

###### A. Clean 5-Command Suite Overview

| Primary Command | Category | Action Description | Sample Input & Examples | Output / Inserted Content | Legacy Aliases |
|---|---|---|---|---|---|
| **`/law`** | **Statutory Search** | Searches encrypted Law Vault (`vault-laws.vlt`) across all Acts, Sections, & Rules. | `/law sec 30(2)`<br>`/law ibc 14`<br>`/law mca 185` | Inserts exact statutory section snippet with interactive `${1:field}` tab-stops. | `/sec`, `/ibc`, `/mca` |
| **`/precedent`** | **Court Judgments** | Searches 581 precedent rulings & court orders (`vault-cases.vlt`). | `/precedent related party voting`<br>`/precedent CIRP timeline` | Inserts markdown citation link or full holding snippet:<br>`[Supreme Court on Sec 21(2)](<case_name>_concepts_haya/lc_12.md)` | `/case` |
| **`/fact`** | **Workspace Knowledge** | Links defined terms, case facts, & Q&A cards from workspace subfolders. | `/fact claim dispute`<br>`/fact insolvency date` | Inserts concept link or wiki card link:<br>`[Claim Dispute](<case_name>_concepts_haya/claim_dispute.md)` | `/concept`, `/qa` |
| **`/clause`** | **Drafting Boilerplate** | Inserts standard legal contract clauses from the 75,000+ Atticus library. | `/clause arbitration`<br>`/clause indemnity`<br>`/clause governing_law` | Inserts structured clause text with `${1:placeholders}` for tab navigation. | `/clause` |
| **`/export`** | **Court Publishing** | Compiles active Markdown file into a Supreme Court/NCLAT compliant DOCX. | `/export`<br>`/export-sc` | Generates court-compliant A4 Word file (`.docx`) with SC formatting (14pt Times New Roman, 1.5 line spacing, 4cm left/right margins). | `/export-sc`, `/court-export` |

###### B. Detailed Clause Examples (`/clause <type>`)

| Command | Clause Type | Sample Input | Inserted Boilerplate Code Sample |
|---|---|---|---|
| **`/clause arbitration`** | Arbitration Clause | `/clause arbitration` | `Any dispute, controversy, or claim arising out of or relating to this contract, including its formation, breach, termination, or invalidity, shall be referred to and finally resolved by arbitration under the Arbitration and Conciliation Act, 1996. The tribunal shall consist of ${1:one} arbitrator(s). The venue/seat of arbitration shall be ${2:New Delhi}, and the language of the proceedings shall be English.` |
| **`/clause governing_law`** | Governing Law & Jurisdiction | `/clause law` | `This Agreement shall be governed by, construed, and enforced in accordance with the laws of India. The parties agree that the courts located in ${1:New Delhi} shall have exclusive jurisdiction to settle any disputes arising under this Agreement.` |
| **`/clause indemnity`** | Indemnification Clause | `/clause indemnity` | `The ${1:Indemnifying Party} shall defend, indemnify, and hold harmless the ${2:Indemnified Party} from and against any and all claims, losses, damages, liabilities, and expenses (including reasonable legal fees) arising from any breach of this Agreement or negligent acts.` |
| **`/clause confidentiality`** | Confidentiality Clause | `/clause confidentiality` | `Each party agrees to hold in strict confidence all confidential information disclosed by the other party. Neither party shall disclose such information to any third party without the prior written consent of the disclosing party, except as required by law. This obligation survives for ${1:3} year(s) post-termination.` |
| **`/clause force_majeure`** | Force Majeure Clause | `/clause force` | `Neither party shall be liable for any failure or delay in performance under this Agreement due to circumstances beyond its reasonable control, including but not limited to acts of God, war, riot, fire, flood, labor dispute, or government actions, provided prompt notice is given.` |

###### C. Monaco LSP Capabilities Summary

*   **👻 Ghost Text (Inline Completions):** Typing `/law`, `/precedent`, `/fact`, `/clause`, or `/export` on any line renders a grey ghost text preview ahead of the cursor. Pressing **`Tab`** accepts the preview instantly.
*   **🔍 Statutory Hover Cards (`@@` references):** Hovering your cursor over section references (e.g. `@@ibc/sec7`, `@@mca/sec185`, `Section 43`) displays an interactive popup card with full statutory text, sub-sections, and tribunal holdings.
*   **🔄 Bi-directional Monaco-SQLite Sync:** Editing tables or key-value lists in `case_facts.md`, `claims_registry.md`, or `avoidance_ledger.md` directly updates SQLite database records upon save (`Cmd+S` / `Ctrl+S`), marking user-edited values as `verified_by_user = 1`.
*   **Active-Context Control Matrix:** Filter RAG candidate document subsets dynamically using sidebar selection checkboxes.
*   **CIRP Statutory Timeline Widget:** Render Frappe Gantt interactive timelines and Mermaid.js charts derived from `timeline.md`.



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
