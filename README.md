# HAYAGRIVA: The Universal Integrated Professional Environment (IPE) Platform

**HAYAGRIVA** is a local-first, highly secure **Integrated Professional Environment (IPE) Platform** engineered for document-intensive knowledge professionals.

Just as an Integrated Development Environment (IDE) synthesizes code editing, compilation, and debugging into a single application for software engineers, HAYAGRIVA unifies document ingestion, domain reference databases, Markdown authoring, live project ledgers, multi-agent AI collaboration, and compliant document compilation into a single desktop workbench.

> **Current Focus & Roadmap:**  
> **Law** is the **first reference domain** currently implemented in Hayagriva (statutory vaults, precedent search, court petition drafting, and Supreme Court layout compilation). The underlying architecture is modular and domain-agnostic, designed to expand into a **Universal IPE Framework** for Medicine, Architecture & Engineering (AEC), Financial Auditing, and Scientific Research.

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

---

## 🚀 Quick Start

### 1. Requirements
* Node.js (v18+)
* Yarn (v1.22+)
* macOS / Linux / Windows

### 2. Launch Application
To launch the Hayagriva backend server and Electron desktop shell:
```bash
./start.command
```

To stop all background processes cleanly:
```bash
./stop.command
```

### 3. Rebuilding Frontend Extensions
If modifying code in `ide/theia-extensions/hayagriva`:
```bash
# 1. Compile TypeScript extension
yarn --cwd ide/theia-extensions/hayagriva build

# 2. Package Electron distribution bundle
yarn --cwd ide/applications/electron build
```

---

## 📖 Documentation & Guides

* 📘 [User Guide & Ingestion Pipeline](docs/user_guide.md)
* 🛠️ [Build Guide](BUILD.md)
* 🤝 [Contributing Guidelines](CONTRIBUTING.md)
