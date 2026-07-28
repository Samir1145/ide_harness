# hayagriva — Development Notes

Notes for anyone working on hayagriva. End-user docs are in [README.md](README.md).

---

## Quickstart

```bash
# Start the hayagriva backend server (watches ~/Documents/ by default)
cd hayagriva/
source .env
node cli.js --watch-all

# Server binds on http://127.0.0.1:3210
# IDE (Theia) is started separately via start.command
```

---

## Repo Layout

```
TWILLM-OKF-PAGED/
├── hayagriva/                      # Backend Node.js server
│   ├── cli.js                      # Entry point: bootstraps cases, starts watcher + API
│   ├── .env                        # OPENROUTER_API_KEY, VAULT_KEY, etc.
│   └── lib/
│       ├── watcher.js              # File watcher, ingestFile(), PDF background daemon
│       ├── api-server.js           # HTTP API (port 3210)
│       ├── llm-client.js           # LLM routing: OpenRouter / Ollama / Gemini / OpenAI
│       ├── converter.js            # PDF→MD orchestrator (pdfexcavator)
│       ├── rag.js                  # BM25 retrieval + prompt builder
│       ├── bm25.js                 # Inverted index: load/save/query
│       ├── indexer.js              # index.json read/write/upsert
│       ├── okf.js                  # Markdown/frontmatter parser
│       ├── vault-loader.js         # Encrypted law vault (AES-256-GCM)
│       ├── upload-file/            # Phase 1: format converters
│       │   ├── pdf_upload.js       # PDF text extraction
│       │   ├── docx_upload.js      # Mammoth Word converter
│       │   ├── xls_upload.js       # Excel→Markdown grid tables
│       │   ├── wiki_upload.js      # TiddlyWiki HTML scraper
│       │   ├── pdf2png             # Compiled Cocoa binary (macOS PDFKit renderer)
│       │   └── pdf2png.m           # Objective-C source for pdf2png
│       ├── splitting-file/         # Format-specific chunk segmenters
│       │   └── *_splitter.js
│       └── ingestion-file/         # Phase 2: BM25 + concept coordinators
│           └── *_ingest.js
├── ide/                            # Theia IDE workspace
│   └── theia-extensions/hayagriva/
│       └── src/browser/
│           ├── templates.ts        # Sidebar, upload panel, concepts panel HTML
│           └── hayagriva-contribution.ts
└── docs/
    ├── handbook/                   # User & developer handbook
    └── archive/                    # Work session logs
```

---

## Two-Phase Ingestion Pipeline

### Phase 1 — Conversion (Automatic)

Triggered on upload or by bootstrap scan. Zero writes to BM25 or `index.json`.

```
PDF → ingestPdf() → companion .md created on disk
                 → background daemon queued (3 pages at a time)
                 → .status sidecar written: "pending_review"
```

The daemon (`_runDaemonLoop` in `watcher.js`) is a **serial async loop** using `setTimeout` recursion — never `setInterval`. This ensures:
- Only one 3-page block is ever in-flight at a time
- One daemon per process lifetime (guarded by `isPdfDaemonRunning` set eagerly at call site)
- Re-queue prevention via `completedPdfSet` (Set of absolute PDF paths)

### Phase 2 — Indexing (Manual)

Triggered by user clicking "⚡ Build Concepts" in the Concepts panel, or by calling the API directly.

```
POST /api/hayagriva/build-concepts { case, basename }
  → ingestFile(caseDir, companionPath, { conversionOnly: false })
    → ingestText() → BM25 index updated
    → buildPageIndexTree() → pageindex_tree.json written
    → queueForLazyProcessing() → wiki Q&A cards generated
    → index.json updated
    → .status sidecar: "indexed"
```

### `ingestFile(caseDir, filePath, opts)` Flag Table

| Flag | PDF path | .md path | wiki/docx |
|---|---|---|---|
| `conversionOnly: true` | Creates companion, writes `.status`, skips `index.json` | **Skipped entirely** | Skipped entirely |
| `conversionOnly: false` | Full pipeline (docx/xlsx write index.json normally) | BM25 + concepts + wiki | Full pipeline |

---



## API Reference

| Method | Path | Phase | Description |
|---|---|---|---|
| `GET` | `/api/hayagriva/cases` | — | List case directories |
| `GET` | `/api/hayagriva/documents?case=X` | — | All docs with status (indexed + pending) |
| `GET` | `/api/hayagriva/ingest-status?case=X&basename=Y` | 1 | Live daemon page progress |
| `POST` | `/api/hayagriva/upload` | 1 | Save raw base64 file to disk |
| `POST` | `/api/hayagriva/ingest` | 1 | Convert file → companion `.md` |
| `POST` | `/api/hayagriva/build-concepts` | 2 | BM25 + concepts + wiki pipeline |
| `GET` | `/api/hayagriva/wiki-cards?case=X` | 2 | List wiki Q&A cards |
| `POST` | `/api/hayagriva/query-stream` | — | SSE RAG chat stream |

---

## Environment Variables

```bash
# hayagriva/.env
GEMINI_API_KEY=...                 # Optional Gemini fallback for RAG
OPENAI_API_KEY=...                 # Optional OpenAI fallback
VAULT_KEY=...                      # AES-256-GCM key for encrypted law vault
```

---

## Running

```bash
# Kill any existing server
pkill -f "node cli.js"

# Start fresh
cd hayagriva && source .env && node cli.js --watch-all >> /tmp/hayagriva-launcher.log 2>&1 &

# Monitor logs
tail -f /tmp/hayagriva-launcher.log | grep "Lazy PDF\|Phase"

# Test endpoints
curl http://127.0.0.1:3210/api/hayagriva/cases
curl "http://127.0.0.1:3210/api/hayagriva/documents?case=Atty3"
curl -X POST http://127.0.0.1:3210/api/hayagriva/build-concepts \
  -H "Content-Type: application/json" \
  -d '{"case":"Atty3","basename":"<hash>"}'
```

---

## Build (Theia Extension)

```bash
cd ide/theia-extensions/hayagriva
yarn build          # tsc -b (compiles templates.ts → lib/)
yarn watch          # tsc -b --watch (during active development)
```

The compiled extension is picked up automatically by the running Theia IDE.
