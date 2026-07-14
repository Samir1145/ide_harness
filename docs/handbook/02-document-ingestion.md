# Chapter 2: Document Ingestion & Two-Phase Pipeline

This chapter covers how PDF, Word, and Excel files are converted to Markdown companions and how concepts/wiki cards are subsequently built from the reviewed companion file.

---

## 1. User Perspective

### The 4-Step Ingestion & Indexing Pipeline

Document processing in Hayagriva is split into four distinct steps to ensure users can review raw conversions, clean up document errors, and build a highly connected search index.

```
┌─────────────────────────────────┐
│  Step 1: Upload & Convert       │ ──► Convert PDF/Word/Excel to conversions/my_doc.md
└─────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│  Step 2: Review & Clean         │ ──► Edit companion .md in editor (fix OCR, layout)
└─────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│  Step 3: Concept Splitting      │ ──► Click "⚡ Build Concepts" to split to concepts/*.md
└─────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│  Step 4: Background Q&A & RAG   │ ──► Auto-generate summaries, Q&As, & update BM25 index
└─────────────────────────────────┘
```

#### Step 1: Upload & Convert (Phase 1)
* Select a document drop zone in the upload sidebar:
  * **PDFs:** You can check the **"Force Gemini Multimodal Visual Parse"** toggle to upload the entire document to the Google Gemini Multimodal API in one pass for a high-fidelity visual layout reconstruction.
  * **Word/Excel:** Handled locally.
* The server converts the first 3 pages immediately and queues the remaining pages for background processing.
* The **Concepts panel** shows a **pending card** with an amber border and a live progress bar representing background page conversions.

#### Step 2: Review & Clean
* Click **"📄 Open .md"** to open the companion file (`conversions/my_doc.md`) directly in the editor.
* Correct layout gaps, clean OCR errors, format tables, or add custom annotations.
* Save the file. The "⚡ Build Concepts" button unlocks once background conversion hits 100%.

#### Step 3: Concept Splitting (Phase 2)
* Click **"⚡ Build Concepts"** on the card.
* The server reads your cleaned `.md` file, splits it into individual concept files under `concepts/my_doc/` based on headings, and populates `pageindex_tree.json`.
* **Upgrade A (Ancestor Pathing):** Adds hierarchical parents stack (e.g. `ancestors: [services_doc, Services Agreement]`) into each card's frontmatter.
* **Upgrade B (Auto-Concept Linking):** Scans the text for references to other case concepts and registers them in the `links` metadata array automatically, building a connected case network.

#### Step 4: Background Q&A & RAG Search
* **LLM Summaries & Q&As:** The lazy background worker automatically scans newly created cards to generate a 1-sentence summary, 4 hypothetical questions (Doc2Query), and saves Q&A Wiki cards to the sidebar.
* **RAG Retrieval:** Your queries search the enriched BM25 index. The retriever extracts the precise matched sub-chunk and its ancestor hierarchy, feeding Gemini with precise context for the case chat.

---

### Word/DOCX Conversion Pipeline
Word document conversion operates as a high-fidelity hybrid pipeline:
* **Primary (Pandoc):** Auto-detects the CPU architecture (ARM64 vs x64) and runs a local precompiled `pandoc` static binary (version 3.6, downloaded on-demand in `start.command`). It converts files using GitHub Flavored Markdown (`-t gfm`) to preserve tabular matrices, headers, footnotes, and lists with exact structural integrity.
* **Failsafe Fallback (Mammoth):** If Pandoc fails to execute (e.g., due to permissions or architecture restrictions), the parser throws a warning and falls back to `mammoth` to complete the conversion.

#### Hybrid Ingestion Markdown Cleaner (Post-Processor)
Once converted by Pandoc or Mammoth, the raw Markdown content is automatically parsed by a **Hybrid Post-Processor** before writing the companion `.md` file to the case workspace:
1. **Primary Pass (AI LLM Layout Cleaner):** Prompts the local/cloud LLM to unwrap hard paragraph breaks, resolve Pandoc escapes (such as `1\.` $\rightarrow$ `1.`), and promote bold legal section lines (e.g. `**A. Introduction**`) to markdown headings (`## A. Introduction`) **without altering a single legal word**.
2. **Fallback Pass (Deterministic Javascript Regex Cleaner):** If the LLM is offline, fails, or is bypassed (when in the `lite` processing profile), a local JavaScript engine performs regex search-and-replace rules to unwrap paragraphs, strip escapes, and promote headings instantly.

### Excel/XLSX Conversion Pipeline
Excel spreadsheets are processed locally by the SheetJS `xlsx` library, parsing cell sheets row-by-row into Markdown tables chunked in blocks of 100 lines.

---

---

## 2. Developer Perspective

### Subsystem Layout

```
hayagriva/
├── bin/
│   ├── pandoc-arm64        — Precompiled Pandoc v3.6 binary for Apple Silicon Macs
│   └── pandoc-x64          — Precompiled Pandoc v3.6 binary for Intel Macs
├── lib/
│   ├── upload-file/
│   │   ├── pdf_upload.js   — PDF layout reconstruction + Vision OCR
│   │   ├── docx_upload.js  — Pandoc compiler with Mammoth fallback
│   │   ├── xls_upload.js   — Excel-to-Markdown grid tables
│   │   ├── wiki_upload.js  — TiddlyWiki HTML scraper
│   │   └── form_exporter.js — Prefills HTML forms and compiles bookmarklets
```

---

### `ingestFile(caseDir, filePath, opts)` — Phase Gate

The central gate is the `opts.conversionOnly` flag in `watcher.js`:

```js
// Phase 1 — conversion only (zero index/BM25 writes)
await ingestFile(caseDir, filePath, { 
    conversionOnly: true,
    multimodal: true // Force Gemini Multimodal Parse if requested
});

// Phase 2 — full pipeline (BM25 + concepts + wiki)
await ingestFile(caseDir, filePath, { conversionOnly: false });
```

| `conversionOnly: true` | `conversionOnly: false` |
|---|---|
| Runs `ingestPdf(..., { multimodal })` — creates `.md` companion | Runs `ingestText()` — reads (edited) `.md` |
| Writes `.status = "pending_review"` sidecar | Writes BM25 `bm25_index.json` |
| Skips `index.json` | Writes `index.json` |
| Skips `buildPageIndexTree()` | Generates `pageindex_tree.json` |
| Skips lazy worker queue (if multimodal is forced) | Queues wiki Q&A card generation |
| Updates `.status = "indexed"` | ✓ |

### Hidden Companion & Sidecar Files

To prevent cluttering the main workspace, all intermediate companion files (`.md`, `.status`, `.footer`, and `.cache`) are completely hidden from the standard File Explorer using settings exclusions. The user manages these files strictly via context menu options on the source documents.

The primary sidecars are:
* **Companion Markdown (`.md`)**: The editable visual layout text representation.
* **Status File (`.status`)**: A lightweight sidecar tracking current processing state (e.g. `converting`, `pending_review`, `indexed`, `failed_convert`).
* **Footer File (`.footer`)**: Temporary footer templates extracted during parse.
* **Cache File (`.cache`)**: Temporary serial cache for background page workers.

A sidecar is written for each document:
```
/Documents/Atty3/conversions/7f0bd0ea687bddd9b1197e79a2a1aee9.status  ← Hidden status sidecar
/Documents/Atty3/7f0bd0ea687bddd9b1197e79a2a1aee9.md                 ← Hidden markdown companion
```
The sidecar is read dynamically by the `/api/hayagriva/documents` and `/api/hayagriva/file-statuses` endpoints to surface progress status dot colors in the UI explorer.

### Background Page Daemon (Cache-and-Stitch)

Large PDFs (>3 pages) are processed by a **serial async daemon** in [lazy_pdf_worker.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/lazy_pdf_worker.js) (unless forced multimodal is requested, in which case the daemon queue is skipped entirely). 

To prevent concurrent write locks in the editor, intermediate page blocks are cached into a hidden `.md.cache` file. We consolidate the cache file and stitch it back into the master companion `.md` file in a single write operation only when the conversion reaches 100% completion:

```
_runDaemonLoop() — fully serial, one 3-page batch at a time
   └─ await convertPdfBlock(filePath, nextPage, endPage)   ← OCR if needed
   └─ fs.appendFileSync(companionPath + '.cache', blockMd)  ← write to cache
   └─ If nextPage > totalPages:
        └─ fs.appendFileSync(companionPath, cacheContent)  ← stitch cache to master
        └─ fs.unlinkSync(companionPath + '.cache')
        └─ await ingestFile(caseDir, companionPath, { conversionOnly: true }) ← single watcher sync
   └─ setTimeout(_runDaemonLoop, 4000)
```

Key guards against duplicate daemon instances:
- `isPdfDaemonRunning` — set **eagerly inside the worker** to prevent multiple loops spawning concurrently.
- `completedPdfSet` — tracks fully-converted PDFs by absolute path, prevents re-queuing when the watcher fires on `.md` companion changes.

### In-Memory Parent-Child Indexing

To handle long document sections without cluttering the concepts directory or breaking the `pageindex_tree.json` heading structures:
* **The Disk Structure:** Exactly **one** `.md` file is saved to disk per heading to keep the user's concepts directory tidy and readable.
* **In-Memory Sub-chunking:** If a section exceeds 3000 characters during Phase 2 concept compilation, `text_ingest.js` splits the content in-memory using a sliding paragraph window and indexes each chunk separately in the BM25 search index database under a composite ID (`basename::heading::partIndex`).
* **Sub-chunk RAG Resolution:** In `rag.js`, the query retriever intercepts composite IDs, resolves them to the correct parent file on disk, runs the same chunking algorithm, and extracts **only** the matched child chunk content to construct the final LLM prompt. This keeps context sizes precise and avoids token dilution.

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
* **Trigger**: Automatically fires if the raw text extracted from the entire document is extremely short ($<50$ characters total) and `process.env.GEMINI_API_KEY` is configured, or if the user checks the **Force Gemini Multimodal Visual Parse** toggle (passing `options.multimodal: true` in the API payload).
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

---

## 4. Troubleshooting & Ingestion Failsafes ("Likely to Break" Points)

Understanding where each step of the split pipeline is likely to fail is critical for maintaining robust legal ingestion services:

### Step 1: Convert to Markdown (Dot 1)
*   **Scanned/Flat PDFs (OCR Failure):** If a PDF consists of image scans with no selectable text, the layout engine falls back to vision-based OCR. This requires an active `OPENROUTER_API_KEY` (Gemini Flash) and network connection. Without them, page conversion outputs blank pages or times out.
*   **Gatekeeper Executable Block (macOS):** Custom compiled helper binaries (like `bin/pandoc-arm64` and `lib/pipeline/pdf/pdf2png`) may be blocked from executing by macOS Gatekeeper security policies. Run `chmod +x` or verify the code signing of these binaries.
*   **Legacy Formats:** Standard loaders strictly parse modern `.docx` and `.xlsx` files. Uploading legacy binary formats (like pre-2007 Word `.doc` or Excel `.xls` files) will fail unless an external LibreOffice (`soffice`) converter is running.

### Step 2: Generate Search Vectors (Dot 2)
*   **Offline First-Run (ONNX Cache):** The `all-MiniLM-L6-v2` transformer model runs inside your Node.js process using ONNX runtime. If it hasn't been cached locally (`~/.cache/huggingface/hub/`), it will attempt a network download. Running Step 2 offline before model pre-download will cause a crash.
*   **Memory Exhaustion (Out-of-Memory / OOM):** When processing massive documents (500+ pages), the file is split into thousands of chunks. Running local vector calculations on thousands of chunks sequentially can freeze the Node.js event loop or exhaust heap memory.
*   **SQLite Concurrency Locks:** If batch operations are active simultaneously, SQLite can lock. Although protected by a `busy_timeout` queue, high-volume concurrent processes can eventually fail with `SQLITE_BUSY: database is locked`.

### Step 3: Run AI Enrichment (Dot 3)
*   **Ollama / Local LLM Outages:** If using a local LLM (e.g. `qwen2.5-coder:1.5b`), the Ollama daemon must be actively running (`ollama serve`) and the model pre-pulled. Otherwise, connections fail instantly with connection refused.
*   **Slow Local GPU/CPU (Timeouts):** Generating legal facts on consumer-grade laptops can be extremely slow. If a single chunk extraction exceeds **120 seconds**, the pipeline worker times out and marks the status as `failed_enrich`.
*   **Malformed LLM JSON Payload:** If the LLM generates conversational preambles, includes syntax errors (trailing commas, unclosed brackets), or truncates due to token limits, the server's `JSON.parse` wrapper fails.
*   **Cloud API Key Restrictions:** If configured to run in cloud mode, missing or invalid `GEMINI_API_KEY` or `OPENAI_API_KEY` credentials in `.env` will instantly halt the enrichment process.

