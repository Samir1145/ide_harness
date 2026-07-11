# Chapter 2: Document Ingestion & Two-Phase Pipeline

This chapter covers how PDF, Word, and Excel files are converted to Markdown companions and how concepts/wiki cards are subsequently built from the reviewed companion file.

---

## 1. User Perspective

### Two-Phase Workflow

Document ingestion is now a **two-phase process** designed to let users verify and edit the converted Markdown before committing it to the knowledge base.

```
Phase 1 (Automatic)          Phase 2 (Manual)
─────────────────────        ──────────────────────────────
Upload PDF                   Open .md companion in editor
    ↓                        Review & edit headers/tables
PDF → .md conversion         Click "⚡ Build Concepts"
Vision OCR (if needed)           ↓
Background page daemon       BM25 search index built
.status = pending_review     Concept chunks created
                             Wiki Q&A cards generated
                             .status = indexed
```

### Phase 1 — Upload & Convert
1. Drag a PDF onto the **PDF drop zone** in the upload sidebar.
2. The server converts the first 3 pages immediately and queues the remaining pages for background OCR.
3. The **Concepts panel** shows the document as a **pending card** with an amber left border and a live progress bar showing page conversion status (e.g. "Converting page 18 of 41...").
4. The "⚡ Build Concepts" button remains **disabled** until all pages are converted.

### Phase 2 — Review & Build
1. Click **"📄 Open .md"** on the pending card to open the companion file in the editor.
2. Edit the Markdown as needed — fix OCR errors, clean up table formatting, remove repeated headers.
3. Once satisfied, click **"⚡ Build Concepts"** (enabled when conversion completes).
4. The system reads your edited `.md`, builds BM25 search, creates concept chunks, generates `pageindex_tree.json`, and queues wiki Q&A card generation.
5. The panel updates to show the full outline with 💡 page chunks.

### Rebuild After Edits
For documents already indexed, a **"🔄 Rebuild Concepts"** button is always visible below the outline. Clicking it re-runs Phase 2 on the current state of the `.md` file, allowing you to incorporate any further manual edits into the knowledge base.

---

## 2. Developer Perspective

### Subsystem Layout

```
hayagriva/lib/
├── upload-file/
│   ├── pdf_upload.js       — PDF layout reconstruction + Vision OCR
│   ├── docx_upload.js      — Mammoth Word-to-Markdown converter
│   ├── xls_upload.js       — Excel-to-Markdown grid tables
│   ├── wiki_upload.js      — TiddlyWiki HTML scraper
│   └── form_exporter.js    — Prefills HTML forms and compiles bookmarklets
├── splitting-file/
│   └── *_splitter.js       — Format-specific chunk segmenters
├── ingestion-file/
│   ├── *_ingest.js         — Load → split → BM25 → concepts coordinators
│   ├── extract-file.js     — Schema-less facts extractor (central database)
│   ├── form_mapper.js      — Schema mapping and targeted RAG lookup
│   └── form_rules_validator.js — Programmatic rules validation
├── agents/
│   ├── agent-coordinator.js — Intent classification router
│   ├── advisor-agent/      — Legal Q&A and law vault RAG provider
│   ├── forms-agent/        — Form auditor and validations
│   └── document-agent/     — Template drafter and placeholder checks
├── drafting.js             — Assemblies template drafts and archives edits
├── watcher.js              — File watcher chokidar event boundaries
├── lazy_pdf_worker.js      — Background PDF conversion daemons and queue tasks
├── api-server.js           — HTTP API server boundaries
├── routes.js               — Route dispatch endpoint list mappings
└── llm-client.js           — LLM routing (OpenRouter / Ollama / Gemini)
```

### `ingestFile(caseDir, filePath, opts)` — Phase Gate

The central gate is the `opts.conversionOnly` flag in `watcher.js`:

```js
// Phase 1 — conversion only (zero index/BM25 writes)
await ingestFile(caseDir, filePath, { conversionOnly: true });

// Phase 2 — full pipeline (BM25 + concepts + wiki)
await ingestFile(caseDir, filePath, { conversionOnly: false });
```

| `conversionOnly: true` | `conversionOnly: false` |
|---|---|
| Runs `ingestPdf()` — creates `.md` companion | Runs `ingestText()` — reads (edited) `.md` |
| Writes `.status = "pending_review"` sidecar | Writes BM25 `bm25_index.json` |
| Skips `index.json` | Writes `index.json` |
| Skips `buildPageIndexTree()` | Generates `pageindex_tree.json` |
| Skips lazy worker queue | Queues wiki Q&A card generation |
| Updates `.status = "indexed"` | ✓ |

### `.status` Sidecar File

A lightweight sidecar sits alongside each companion `.md`:

```
/Documents/Atty3/7f0bd0ea687bddd9b1197e79a2a1aee9.md      ← editable companion
/Documents/Atty3/7f0bd0ea687bddd9b1197e79a2a1aee9.status  ← "pending_review" | "indexed"
```

The sidecar is read by the `/api/hayagriva/documents` endpoint to surface pending documents in the UI even before they appear in `index.json`.

### Background Page Daemon

Large PDFs (>3 pages) are processed by a **serial async daemon** in [lazy_pdf_worker.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/lazy_pdf_worker.js):

```
_runDaemonLoop() — fully serial, one 3-page batch at a time
   └─ await convertPdfBlock(filePath, nextPage, endPage)   ← OCR if needed
   └─ fs.appendFileSync(companionPath, blockMd)
   └─ await ingestFile(caseDir, companionPath, { conversionOnly: true })
   └─ setTimeout(_runDaemonLoop, 4000)    ← next batch only after this completes
```

Key guards against duplicate daemon instances:
- `isPdfDaemonRunning` — set **eagerly inside the worker** to prevent multiple loops spawning concurrently.
- `completedPdfSet` — tracks fully-converted PDFs by absolute path, prevents re-queuing when the watcher fires on `.md` companion changes.

### Vision OCR Pipeline

When a page has fewer than 400 characters of extractable text (image-heavy or scanned):

1. **Cocoa native renderer** (`pdf2png`) converts the PDF page to a high-resolution PNG using macOS `PDFKit` APIs.
2. **OpenRouter → Gemini 2.5 Flash** receives the base64 PNG and returns clean Markdown including reconstructed table grids.
3. Timeout is 120 seconds per page to handle complex multi-table pages.

```
pdf_upload.js → convertPdfBlock() → pdfexcavator (text)
                                  → pdf2png (image render)
                                  → getChatResponse() → OpenRouter → Gemini 2.5 Flash
```

#### Multimodal Visual Fallback (Entire File OCR)
To bypass local rendering bottlenecks and improve conversion speed for completely scanned, corrupted, or highly visual PDF papers, the pipeline includes a **direct multimodal fallback** in [multimodal_parser.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/multimodal_parser.js):
* **Trigger**: Automatically fires if the raw text extracted from the entire document is extremely short ($<50$ characters total) and `process.env.GEMINI_API_KEY` is configured, or if `options.multimodal` is requested.
* **Flow**: Encodes the entire PDF binary in base64 and uploads it as a single request payload inline to Google Gemini (`gemini-1.5-flash`). Gemini visually transcribes the document's tables, forms, and columns into clean Markdown.
* **Daemon Skip**: Because the entire document is resolved in one multimodal pass, `isPartial` is set to `false`, and the background pagination loop is skipped entirely to conserve resources.

---

### LLM Client Routing

`llm-client.js` routes in priority order:

| Priority | Provider | Trigger |
|---|---|---|
| 1 | **OpenRouter** | `OPENROUTER_API_KEY` set AND images present |
| 2 | **Ollama** | Local server healthy at `127.0.0.1:11434` |
| 3 | **Google Gemini** | `GEMINI_API_KEY` set |
| 4 | **OpenAI** | `OPENAI_API_KEY` set |

---

### TiddlyWiki Ingestion & Process Architecture

Unlike PDFs, Word documents, or Excel files, TiddlyWiki `.wiki.html` files represent compiled offline wikis that contain individual cards (tiddlers) inside a JSON store block:

* **Zero Background Processes**: The application does not run any active TiddlyWiki node instances or server daemons. The API endpoint `/api/hayagriva/wiki-port` returns `{ port: null }`. Instead of displaying an iframe viewer inside the extension workspace, wiki editing is handled natively in the IDE by directly opening the companion `index.md` file in the workspace editor.
* **Store Extraction**: During Phase 1 ingestion, `wiki_upload.js` scans the HTML file to locate the JSON store block (`<script class="tiddlywiki-tiddler-store" type="application/json">`).
* **Filtering & Parsing**: It parses the JSON store, strips out system configurations (starting with `$:/`), and extracts user tiddlers.
* **Companion Decomposition**: Each extracted tiddler card is parsed for its title, tags, and internal links, then written as an individual companion Markdown file under `/concepts/<wiki_basename>/<card_title>.md` with structured yaml frontmatter metadata.
* **Search Integration**: The parsed tiddlers are tokenized and added to the case's BM25 inverted index.

#### Incremental Concept Merging (Intelligent Append)
On Phase 2 Concept compilation in [text_ingest.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/ingestion-file/text_ingest.js), HAYAGRIVA implements **Intelligent Append** to prevent folder clutter and card duplication across multiple ingested case files:
1. **Existing Topic Check**: Scans all previously created markdown concept files inside the case directory's `concepts/` tree.
2. **LLM Classification**: Sends the title and snippet of each new section to the LLM (`gemini-1.5-flash`) to verify if it maps directly to an existing topic.
3. **Merge Action**:
   - If classified as `MERGE`, the content is appended directly to the end of the existing concept file, prefaced by `## Appended from: [basename]`.
   - The combined text is then re-indexed in the local BM25 index.
   - If classified as `NEW`, a brand-new concept markdown file is created.

---

## 3. API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/hayagriva/upload` | Write raw base64 file to disk |
| `POST` | `/api/hayagriva/ingest` | Phase 1: convert file to `.md` companion |
| `GET` | `/api/hayagriva/documents?case=X` | List all docs with status (indexed + pending) |
| `GET` | `/api/hayagriva/ingest-status?case=X&basename=Y` | Live daemon progress (nextPage/totalPages) |
| `POST` | `/api/hayagriva/build-concepts` | Phase 2: trigger BM25 + concepts + wiki |
| `POST` | `/api/hayagriva/cancel-ocr` | Halt running background OCR processes |

### `GET /api/hayagriva/documents` Response Shape

```json
{
  "documents": [
    {
      "title": "7f0bd0ea687bddd9b1197e79a2a1aee9",
      "filename": "7f0bd0ea687bddd9b1197e79a2a1aee9.pdf",
      "status": "pending_review",
      "companionPath": "/Users/.../Atty3/7f0bd0ea687bddd9b1197e79a2a1aee9.md",
      "totalPages": 41,
      "nextPage": 22,
      "conversionComplete": false
    },
    {
      "title": "AgreementDoc",
      "status": "indexed",
      "sections": 14,
      "shadowDocuments": [...]
    }
  ]
}
```

### `POST /api/hayagriva/build-concepts` Request

```json
{ "case": "Atty3", "basename": "7f0bd0ea687bddd9b1197e79a2a1aee9" }
```

Response: `{ "ok": true, "sections": 41 }`
