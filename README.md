# HAYAGRIVA: The Universal Integrated Professional Environment (IPE) Platform

**HAYAGRIVA** is a local-first, highly secure **Integrated Professional Environment (IPE) Platform** engineered for document-intensive knowledge professionals.

Just as an Integrated Development Environment (IDE) synthesizes code editing, compilation, and debugging into a single application for software engineers, HAYAGRIVA unifies document ingestion, domain reference databases, Markdown authoring, live project ledgers, multi-agent AI collaboration, and compliant document compilation into a single desktop workbench.

---

## 📐 The 3×3 Sovereign Architecture Model

For complete architectural details, see the detailed [Product Vision & 3×3 Architecture Guide](file:///Users/atulgrover/Desktop/HAYAGRIVA/docs/architecture/product_vision.md).

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                      HAYAGRIVA: THE SOVEREIGN LEGAL STACK                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 📥 IN-APP WORKSPACE SECTIONS (Inside the Case Folder):                      │
│  1. Case Data & Facts   ──► PDFs, Word, Excel, Sliced Cards, KV Dictionary  │
│  2. Professional Audits ──► Claim Ledgers, Status Dots, Verification Sync    │
│  3. AI Enhancements     ──► RAG Matrix, Subagents, Supreme Court Exporter    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 📦 DOWNLOADABLE PORTAL PLUG-INS (Via Licensing Portal):                    │
│  1. Intelligence Models ──► InLegal-SBERT, Finance-Embeddings, Param-2.9B  │
│  2. Encrypted Vaults    ──► Statutory Laws, Precedents, MCA Forms, IBC DB   │
│  3. Specialist Agents   ──► Advisor Agent, Forms Agent, Document Agent      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🏛️ Core Architectural Systems

HAYAGRIVA's IPE platform architecture is built on **six foundational management systems**:

```
+---------------------------------------------------------------------------------------+
|                           HAYAGRIVA UNIVERSAL IPE ENGINE                              |
+---------------------------------------------------------------------------------------+
|  [IMS] Document Ingestion   -> Multi-format Parsing, Density Gating, OCR & Slicing  |
|  [CMS] Context & Ledger     -> PageIndex Hierarchy, SQLite FTS5 & Vector RAG Engine |
|  [VMS] Encrypted Vaults     -> Local AES-256 Domain Libraries (Codes/Rules/DBs)   |
|  [AMS] Multi-Agent Co-Pilot -> Specialized Critique & Verification Agent Teams    |
|  [DMS] Canvas & Exporter    -> Live Slash Commands & Compliant Format Compiler      |
|  [WMS] Isolated Workspaces  -> Client/Project Vault Isolation & Ledger Bi-Sync    |
+---------------------------------------------------------------------------------------+
```

1. **Vault Management System (VMS):** Encrypted local domain databases (AES-256-GCM) with instant Monaco editor autocomplete (`/law`, `/case`, `/clause`, `@@` hover citations).
2. **Context Management System (CMS):** Local PageIndex hierarchy indexing, hybrid SQLite FTS5 keyword retrieval, and in-memory vector cosine reranking (<1ms response).
3. **Drafting Management System (DMS):** Monaco-powered drafting canvas with placeholder parsing and one-click judicial/industry format compilation (`/export-sc`).
4. **Agent Management System (AMS):** Local Node.js-native specialized subagents (*Advisor Agent*, *Forms Agent*, *Document Agent*) with native critique and delegation loops.
5. **Ingestion Management System (IMS):** Multi-format parser (PDF, Word, Excel, TiddlyWiki) with debounced file-hash relinking (`calculateFileHashSync`) and density gate checks.
6. **Workspace Management System (WMS):** Isolated client/project workspace directories, local Node daemon API server, and bi-directional Monaco-SQLite ledger synchronization.

---

## 🌐 The Multi-Domain Vision

While Legal Counsel is the initial active module, Hayagriva's 6 core systems easily scale to other knowledge domains:

| Domain | VMS (Vaults) | CMS (Ledgers) | AMS (Agents) | DMS (Exports) |
| :--- | :--- | :--- | :--- | :--- |
| ⚖️ **Legal (Current)** | Statutory Acts & Precedent Summaries (`/law`, `/case`) | Case Facts & Claims Ledgers | Advisor, Forms & Document Agents | Supreme Court & Appellate DOCX Petitions |
| 🩺 **Medical & Clinical** | Clinical Practice Guidelines & Drug Interaction DBs | Patient History & Lab Result Timeline | Clinical Advisor & Contraindication Agents | Medical Expert Reports & Discharge Summaries |
| 🏗️ **Architecture & AEC** | Municipal Zoning Bylaws & Building Codes | Project Specs & BOQ Ledgers | Zoning Compliance & Cost Estimation Agents | Municipal Permit & Tender Applications |
| 📊 **Financial & Audit** | Tax Codes & Accounting Standards (IFRS/GAAP) | Audit Reconciliation Ledgers | Tax Risk & Fraud Audit Agents | Statutory Audit Reports & Valuation Summaries |

---

## ⚡ Key Features

* 🔒 **100% Local-First & Encrypted:** All precedent databases, vector calculations, and project files stay strictly on your local machine with AES-256-GCM encryption.
* ✍️ **Monaco Legal Drafting Engine:** Native slash commands (`/law`, `/case`, `/clause`, `/concept`, `/qa`) and hover cards (`@@code/sec`).
* 📜 **Industry & Judicial Exporter:** One-click conversion from Markdown to court-compliant `.docx` format with strict judicial margins and font specifications.
* 📊 **Live Project Ledgers:** Bi-directional synchronization between Markdown ledgers (`case_facts.md`, `claims_registry.md`, `avoidance_ledger.md`) and SQLite records.
* 🔍 **Active-Context RAG Matrix:** Interactive document selection grid to control dynamic context window inputs for RAG retrieval.
* ⚡ **In-IDE Verification & Decoupled Licensing:** Zero-web-portal distribution with nominal ₹1 UPI token verification, cryptographic hardware locking (`IOPlatformUUID` / `MachineGuid`), dynamic micro-pricing, 15-field telemetry, and free Appsmith CRM support. (See [Licensing & Telemetry Architecture](file:///Users/atulgrover/Desktop/ide_harness/docs/architecture/licensing_and_telemetry_architecture.md)).

---

## 🚀 Quick Start

### 1. Requirements
* Node.js (v22 LTS required)
* Yarn (v1.22+)
* macOS / Linux / Windows

### 2. Launch Application
To launch the Hayagriva backend server and Electron desktop shell:
- **macOS:** `./launchers/start.command` (or double-click in Finder)
- **Windows:** `launchers\start.bat`
- **Linux:** `./launchers/start.sh`

To stop all background processes cleanly:
- **macOS:** `./launchers/stop.command`
- **Windows:** `launchers\stop.bat`
- **Linux:** `./launchers/stop.sh`

### 3. Rebuilding Frontend Extensions
If modifying code in `frontend/theia-extensions/`:
```bash
# 1. Compile all workspace extensions directly (tsc -b)
yarn --cwd frontend/theia-extensions/product build
yarn --cwd frontend/theia-extensions/launcher build
yarn --cwd frontend/theia-extensions/updater build
yarn --cwd frontend/theia-extensions/hayagriva build

# 2. Package Electron distribution bundle (esbuild)
yarn --cwd frontend/applications/electron build
```

### 4. Cross-Platform Automated Releases
Hayagriva uses an automated cross-platform GitHub Actions CI/CD matrix ([`build-release.yml`](.github/workflows/build-release.yml)) targeting Node 22 LTS to build and package standalone installers:
* **macOS (Apple Silicon M1):** `Hayagriva-macOS` (`.dmg`)
* **Windows (x64):** `Hayagriva-Windows` (`Setup.exe` NSIS installer)
* **Linux (x64):** `Hayagriva-Linux` (`.AppImage` & `Setup.deb` installer)

All releases can be packaged locally or triggered automatically on tag releases (`v*`). See [BUILD.md](BUILD.md) for packaging instructions.


---

## 📖 Documentation & Guides

* 📘 [User Guide & Ingestion Pipeline](docs/user_guide.md)
* 🛠️ [Build Guide](BUILD.md)
* 🤝 [Contributing Guidelines](CONTRIBUTING.md)
* 📓 [Dev Log — 2026-07-21](docs/dev-log-2026-07-21.md)

---

## 🗓️ Next Session — Resume Here (2026-07-22)

> Last session: **Vault Distribution System + Sovereign LLM Architecture**  
> Full session notes: [`docs/dev-log-2026-07-21.md`](docs/dev-log-2026-07-21.md)

### What was completed last session
- ✅ `vault-compiler.cjs` rewritten → 4 unified global vaults (laws, cases, docs stub, forms stub)
- ✅ `publish-vaults.sh` → monthly GitHub Release pipeline
- ✅ `api-server/` scaffolded → `api.hayagriva.app` activation server (Express + SQLite + Railway config)
- ✅ `vault-loader.js` refactored → OS Keychain key, user vault path, `reloadVault()` hot-swap
- ✅ `cases-vault-loader.js` created → cases vault search (hybrid BM25 + cosine)
- ✅ `vault-manager.js` created → activate license, download+install vault, SSE progress
- ✅ `routes.js` → 4 new `/api/vault/*` routes, removed `learning_curves.db` route
- ✅ `keytar` added → OS Keychain for vault key storage
- ✅ `summaries/` guards removed from watcher / cli / archive-service
- ✅ HAYAGRIVA pushed to GitHub (`93b25d9`), ibc_vault committed locally

### Architecture decisions locked in
- **Sovereign-only** — no cloud LLM (OpenRouter/Gemini/OpenAI hidden from UI, not deleted yet)
- **Ollama removed** — replaced with llamafile distribution via hayagriva.app
- **Two modes only:** `lite` (search, no AI) and `local` (llamafile offline inference)
- **Models:** LegalParam-2.9B + FinanceParam-2.9B as Q4_K_M llamafiles (~1.7 GB each, runs on 16GB Mac)
- **v2 roadmap:** Fine-tune Param-1-2.9B on 17K IBC case summaries via QLoRA on RunPod

---

### ✅ Task List for Next Session

#### Priority 1 — Settings UI (Vault & License tab)
- [ ] Add "Vault & License" tab to `hayagriva/lib/assets/settings-dashboard.html`
- [ ] Vault cards: Laws, Cases, Documents (stub), Forms (stub) — show version, size, Download button
- [ ] Model cards: LegalParam-2.9B, FinanceParam-2.9B — show size, Download button
- [ ] License key input field with "Activate" button → calls `POST /api/vault/activate`
- [ ] SSE progress bar for vault/model downloads → consumes `GET /api/vault/download?vault=cases`
- [ ] "Check for Updates" button → calls `GET /api/vault/status`
- [ ] Remove cloud provider options (OpenRouter / Gemini / OpenAI) from Settings UI
- [ ] Replace "Local Offline (Ollama)" label with "Local Offline (Hayagriva Models)"

#### Priority 2 — llamafile Process Manager
- [ ] Create `hayagriva/lib/utils/llamafile-runner.js`
  - Spawns `model.llamafile --port {port} --n-gpu-layers 99` on demand
  - Port registry (avoid conflicts if multiple models loaded)
  - Health check loop (poll `/health` until ready, ~10s timeout)
  - Idle kill after 10 min inactivity (configurable)
  - macOS: `xattr -rd com.apple.quarantine` + `chmod +x` after download
- [ ] Update `llm-client.js`: remove `streamOllama` + `checkOllamaHealth`, add `streamLlamafile()`
  - `streamLlamafile` = `streamOpenAI` pointed at `http://127.0.0.1:{port}`
  - Calls `ensureLlamafileRunning(modelName)` before first token
- [ ] Implement strict 2,048-token context budget pre-flight check in `llm-client.js`
  - Cap system prompt (~300 t) + RAG context (~1,236 t) + reserved generation (~512 t)
  - If query/scope > 1,500 tokens, display UI notice: *"⚠️ Context Window Exceeded (2,048 Token Limit). Please refine your Active-Context matrix selection."* and step out cleanly.

#### Priority 3 — GGUF Quantization (do on this Mac)
- [ ] `brew install cmake git` (if not present)
- [ ] `pip3 install huggingface_hub gguf sentencepiece`
- [ ] Clone `llama.cpp`, build with Metal: `cmake -DGGML_METAL=ON && cmake --build`
- [ ] Download `bharatgenai/LegalParam-2.9B` weights via `huggingface_hub.snapshot_download`
- [ ] Run `convert_hf_to_gguf.py` → F16 GGUF
- [ ] Run `llama-quantize legalparam-f16.gguf legalparam-q4_k_m.gguf Q4_K_M`
- [ ] Test: `llama-server --model legalparam-q4_k_m.gguf --port 8080 --n-gpu-layers 99`
- [ ] Repeat for FinanceParam-2.9B
- [ ] Wrap both as llamafile executables

#### Priority 4 — Railway Deploy (api.hayagriva.app)
- [ ] Create private GitHub repo for `api-server/`
- [ ] Push `api-server/` to GitHub
- [ ] Create Railway project → Deploy from GitHub repo
- [ ] Set Railway env vars: `VAULT_KEY_LAWS`, `VAULT_KEY_CASES`, `NODE_ENV=production`
- [ ] Add Namecheap CNAME: `api.hayagriva.app → [railway-domain].up.railway.app`
- [ ] Run `npm run seed` with real vault keys to populate `licenses.db`
- [ ] Test: `curl -X POST https://api.hayagriva.app/activate -d '{"licenseKey":"HAYG-TEST-0000-0001"}'`

#### Priority 5 — ibc_vault GitHub remote
- [ ] `gh repo create atulgrover/ibc-vault --private --source=. --push`

---

### Useful context for next session
```
Vault install path:  ~/Library/Application Support/Hayagriva/vaults/{laws|cases}/
Model install path:  ~/Library/Application Support/Hayagriva/models/
Keychain service:    "hayagriva"
Keychain accounts:   "vault-laws", "vault-cases", "vault-documents", "vault-forms"
License format:      HAYG-XXXX-XXXX-XXXX
API base:            https://api.hayagriva.app
Vault manifest:      https://api.hayagriva.app/vaults/latest.json
LegalParam weights:  huggingface.co/bharatgenai/LegalParam-2.9B
FinanceParam weights:huggingface.co/bharatgenai/FinanceParam-2.9B
GGUF target:         Q4_K_M (~1.7 GB each, fits 16GB Mac)
```
