# Contributing to HAYAGRIVA

## 🏛️ Architecture & Separation of Concerns

HAYAGRIVA follows a clean, decoupled architecture:

```text
Layer 1 — Core Host Engine (backend/)
  Node.js daemon handling document ingestion, SQLite FTS5/Vector search,
  local LLM integration, IPC server (port 3210), and dynamic plugin dispatching.
  → Edit here to: enhance RAG pipelines, add daemon routes, or optimize local search.

Layer 2 — IDE Extensions (frontend/theia-extensions/)
  Custom TypeScript extensions for Eclipse Theia:
  • hayagriva: Sidebar panels, Monaco slash commands (/law, /case), hover providers.
  • product: Custom branding, window titles, splash screens.
  → Edit here to: add new editor widgets, keybindings, or custom Monaco completions.

Layer 3 — Desktop Shell (frontend/applications/electron/)
  The Eclipse Theia Electron wrapper application.
  → Upstream platform container. Do not modify directly except for dependencies.
```

---

## 🌐 Modular Satellite Repositories

Domain logic and heavy data assets are intentionally externalized from `ide_harness`:

- **`ide_agents/`**: Domain subagents (`advisor`, `forms`, `claims`, `document`), statutory prompt suites, and specialized skills.
- **`ide_vaults/`**: Statutory crawlers, scrapers, Atticus dataset extractors, and AES-256 compiled `.vlt` vaults.
- **`ide_models/`**: Offline GGUF neural weights (`LegalParam-2.9B`, `FinanceParam-2.9B`) and ONNX embeddings.
- **`ide_formats/`**: Statutory court templates, Supreme Court petitions, and corporate filing skeletons.
- **User Cases**: Live matter workspaces live strictly in `~/Documents/Hayagriva_Cases/<CaseName>`, never in the repository root.

---

## 🛠️ Backend Structure (`backend/lib/`)

```text
backend/lib/
├── core/       ← Core services: bm25, rag, llm-client, splitter, indexer, converter, drafting
├── daemon/     ← Background daemons: watcher (filesystem), pdf pipeline
├── utils/      ← Utilities: vault-loader, cases-vault-loader, multimodal_parser
├── pipeline/   ← Format-specific ingestion pipelines (pdf, docx, xls, wiki, common)
├── agents/     ← Generic Agent Coordinator, inbox manager, risk engine, dynamic skill-resolver
├── api-server.js
└── routes.js
```

---

## 🧪 Running Tests

To run the complete automated test suite:

```bash
cd backend
node tests/run_all_tests.js
```
