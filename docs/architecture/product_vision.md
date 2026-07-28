# HAYAGRIVA: Product Vision & The 3×3 Sovereign Legal Architecture

> **The World's First Air-Gapped Legal Development Environment (LDE)**
>
> Just as software engineers rely on Integrated Development Environments (IDEs) like VS Code to edit, compile, debug, and test code, **Hayagriva** provides knowledge professionals with a sovereign, local-first workbench to ingest, audit, cross-reference, and compile complex legal and financial cases.

---

## 🏛️ The 3×3 Core Architecture Model

Hayagriva structures legal practice and document engineering into **3 In-App Workspace Sections** and **3 Downloadable Portal Plug-ins**.

```
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

## 📥 Section A: The 3 In-App Workspace Sections

### 1. Case Data & Facts (Ground Truth Layer)
- **Ingestion & Slicing**: Converts multi-format evidence (PDFs, Word docs, Excel sheets, TiddlyWiki notes) into sliced companion markdown cards under `concepts/<doc_name>/`.
- **Key-Value Dictionary**: Automatically extracts core case metadata (Debtor Name, Insolvency Date, Claim Amount, NCLT Bench) into `case_kv_dictionary.json`.
- **Search Indices**: Generates SQLite FTS5 full-text keyword indices and local PageIndex hierarchies for fast retrieval.

### 2. Professional Audits & Human Inputs (Verification Layer)
- **Status Dot Indicators**: Provides 3-stage visual indicators (`Reviewed`, `Needs Verification`, `AI Synthesized`) per file in the Explorer.
- **Bi-directional Monaco-SQLite Sync**: Saves to `claims_registry.md`, `avoidance_ledger.md`, and `case_facts.md` automatically update relational SQLite database tables (`verified_by_user = 1`).
- **Active-Context Control Matrix**: Dynamic document checklist (`concepts/active_rag_docs.json`) allowing lawyers to include, exclude, or summarize specific files for RAG queries.

### 3. AI Enhancements & Exporters (Synthesis Layer)
- **Multi-Agent Collaboration**: Specialized Node.js-native subagents (`@Document`, `@Advisor`, `@Forms`) collaborate via critique and audit loops.
- **Dual-Model RAG Fusion**: Combines InLegal-SBERT and Finance-Embeddings cosine search with Reciprocal Rank Fusion (RRF).
- **Supreme Court Exporter**: One-click Markdown-to-DOCX compilation conforming strictly to judicial formatting rules (A4, 14pt Times New Roman, 1.5 line spacing, 4cm margins).

---

## 📦 Section B: The 3 Downloadable Portal Plug-ins

### 1. Models Pack (Intelligence Engines)
- **Local Embedding Pipelines**: `InLegal-SBERT` (Legal Text Embeddings) & `Finance-Embeddings` (Financial & Quantitative Data).
- **Quantized LLM Engines**: `LegalParam-2.9B.gguf` & `FinanceParam-2.9B.gguf` quantized to `Q4_K_M` running locally via `llama-server`.
- **100% Air-Gapped**: Zero cloud API calls; all AI inferences run directly on local RAM/CPU/GPU.

### 2. Encrypted Vaults Pack (Statutory & Precedent Libraries)
- **Statutory Acts & Rules**: AES-256 encrypted statutory databases (`laws.vlt`) including IBC 2016, Companies Act 2013, NCLT Rules, and Indian Contract Act.
- **Precedent & Case Libraries**: High-speed judgment lookup with instant Monaco editor hover citations (`/law`, `/case`, `@@code/sec`).
- **MCA & IBC Form Skeletons**: Standard statutory templates for Insolvency Forms (Form A–F) and MCA regulatory filings.

### 3. Specialist Agents Pack (Domain Capabilities)
- **Document Agent**: Slicing, gap/placeholder parsing, and petition drafting.
- **Forms Agent**: Audit compliance, MCA form validation, and financial claim verification.
- **Advisor Agent**: Case strategy, precedent cross-examination, and statutory risk analysis.

---

## 🌐 Multi-Domain Extensibility

While Legal Counsel and Insolvency Practice are the initial reference domains, Hayagriva's 3×3 architecture scales seamlessly to other knowledge-intensive fields:

| Domain | Section 1 (Data & Facts) | Section 2 (Human Audit) | Section 3 (AI & Exporters) | Downloadable Vaults & Agents |
| :--- | :--- | :--- | :--- | :--- |
| ⚖️ **Legal & IBC (Current)** | Case PDFs, Claim Forms, Bank Sheets | Claims Ledger, Status Flags | Petitions, SC Exporter | Laws Vault, Precedent DB, LegalParam |
| 🩺 **Clinical & Medical** | Patient Records, Lab Results | Diagnosis Verification, Medication Audit | Clinical Summary, Exporter | Clinical Practice Vault, Contraindication Agents |
| 🏗️ **Architecture & AEC** | Specs, Blueprints, BOQs | Building Code Audit, Cost Matrix | Permit Applications | Municipal Bylaws Vault, Costing Agents |
| 📊 **Financial Audit** | Financials, Tax Returns, Invoices | Reconciliation Ledger, Risk Matrix | Statutory Audit Reports | Tax Code Vault, Audit RAG Engines |
