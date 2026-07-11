# Contributing to Hayagriva

## Three-Layer Architecture

```
Layer 1 — Backend (hayagriva/)
  Node.js server that handles document ingestion, search, LLM calls, and forms.
  Edit here to: add new document formats, improve search, add API endpoints.

Layer 2 — IDE Extension (hayagriva-extension/)
  Standalone TypeScript Theia extension — sidebar panels, commands, menus.
  Edit here to: add new sidebar views, keyboard shortcuts, IDE-level features.

Layer 3 — IDE Shell (ide/)
  The Eclipse Theia Electron app with branding applied.
  Do NOT edit this folder. It is build infrastructure only.
```

## Backend Structure (`hayagriva/lib/`)

```
lib/
├── core/       ← Core services: bm25, rag, llm-client, splitter, indexer, converter, drafting
├── daemon/     ← Background daemons: watcher (filesystem), lazy_pdf_worker (PDF queue)
├── utils/      ← Small utilities: okf, vault-loader, multimodal_parser, window-list
├── pipeline/   ← Per-format document pipeline
│   ├── pdf/    ← upload.js, ingest.js, split.js
│   ├── docx/   ← upload.js, ingest.js, split.js
│   ├── xls/    ← upload.js, ingest.js, split.js
│   ├── wiki/   ← upload.js, ingest.js, split.js
│   ├── forms/  ← mapper.js, rules_validator.js, exporter.js
│   └── common/ ← helper.js, extract.js, text_ingest.js
├── agents/     ← AI agents: advisor, document, forms
├── api-server.js
└── routes.js
```

## Adding a New Document Format

1. Create `lib/pipeline/<format>/upload.js` — converter
2. Create `lib/pipeline/<format>/split.js` — chunker
3. Create `lib/pipeline/<format>/ingest.js` — BM25 indexer
4. Export the `ingest<Format>` function from `lib/pipeline/index.js`
5. Add the file extension to `watcher.js` DOC_EXTENSIONS list

## Running Tests

```bash
cd hayagriva
npm test
```
