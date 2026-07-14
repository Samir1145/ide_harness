# Chapter 3: Inverted Indexing & SSE-Streamed RAG Search

This chapter covers how the system tokenizes document terms, indexes them in a local BM25 postings database (Phase 2), and streams real-time LLM answers using Server-Sent Events.

---

## 1. User Perspective: The Red-Orange-Green Ingestion Pipeline

To protect system memory and CPU, raw case documents are treated like uncompiled code. They progress through a manual, color-coded state machine:

### File Explorer Status Indicators (Three Pipeline Dots)
Files inside the Case Files explorer display three color-coded progress dots before their filename representing the ingestion stages:
1.  **Dot 1 (Companion MD Extraction):** Turns **Blue** during conversion, **Red** if conversion fails, and **Green** once the editable companion Markdown file is compiled and ready on disk.
2.  **Dot 2 (RAG Vector Indexing):** Turns **Blue** while chunking and indexing, **Red** if indexing fails, and **Green** once the text chunks are successfully indexed in the local BM25 and SQLite Vector DB.
3.  **Dot 3 (AI Enrichment & Facts):** Turns **Blue** while the background AI compiles page summaries and hypothetical questions, **Red** if background processing fails/timeouts, and **Green** once fully enriched.

#### Resiliency & Retries
If the final background AI task fails (Dot 3 turns Red), the status is mapped as **`Green / Green / Red`**. Because the first dot remains Green (indicating the Markdown companion file is successfully extracted and saved on disk), the right-click context menu action **"2. Index into AI Memory"** remains **Enabled** so you can click it to retry the pipeline at any time (e.g., after loading local LLM models or switching API settings).

### Concepts Panel Statuses (Companion Markdown Files)
* **`companion_ready` (Color: Red Card):** Newly generated companions display as Red-bordered pending cards in the Concepts sidebar, warning the user it has not been compiled into OKF concepts yet.
* **`indexed` (Color: Green Chunks):** Clicking **"⚡ Build Concepts"** on the card parses, splits, and indexes the document (Phase 2), rendering the file as a Green list of page chunks.

### Background Q&A Queueing
Once a document transitions to `indexed`, the system automatically pushes its sections to the background lazy worker queue (`lazyQueue`). Over time, the worker generates Q&A wiki cards sequentially without locking the UI.

### Conversing with RAG
Users interact with the compiled case database using the **RAG Case Chat** panel:
1. Type a legal query (e.g., "What outstanding debts were claimed by the financial creditors?").
2. The assistant responds **token-by-token** in real-time.
3. Once finished, a **Citations** list appears showing the matching documents.
4. Clicking a citation opens the companion file in the editor, scrolls to the cited page segment, and highlights it in yellow for 5 seconds.

---

## 2. Developer Perspective

### BM25 Index Structure

One `bm25_index.json` per case workspace under `concepts/`:

```json
{
  "version": 1,
  "avgDocLength": 342,
  "totalDocs": 85,
  "docLengths": { "contract::Page 1": 150 },
  "postings": {
    "insolv": { "df": 5, "docs": { "contract::Page 1": 3 } }
  }
}
```

- **Tokenizer/Stemmer**: Lowercases, strips punctuation, discards 150+ legal/English stop words, applies simple suffix-stemming (`defaults`, `defaulting` → `default`).
- **Phase 2 only**: Written by `ingestText()` inside `ingestion-file/text_ingest.js`. Never written during Phase 1 conversion.
- **Rebuild-safe**: `triggerBuild` in the UI calls `POST /api/hayagriva/build-concepts` which calls `ingestFile(caseDir, companionPath, { conversionOnly: false })`, which reads the current `.md` from disk (with all user edits) and rebuilds the index from scratch.

### LLM Client Routing

`lib/llm-client.js` unifies local and cloud inference with a priority chain:

| Priority | Provider | Condition |
|---|---|---|
| 1 | **OpenRouter** | `OPENROUTER_API_KEY` in `.env` AND image payloads present |
| 2 | **Ollama** | Local server healthy at `127.0.0.1:11434` |
| 3 | **Google Gemini** | `GEMINI_API_KEY` in environment |
| 4 | **OpenAI** | `OPENAI_API_KEY` in environment |

Vision OCR requests (PDF pages with images) always route to OpenRouter → `google/gemini-2.5-flash` with a 120-second timeout.

#### Node-Native ONNX Vector Embeddings
To keep the indexing pipeline fast, lightweight, and offline-resilient, the local embedding generation is **completely decoupled** from the Ollama server process:
* **The Engine:** When in `local` mode, `llm-client.js` loads `@xenova/transformers` (running the **`Xenova/all-MiniLM-L6-v2`** model) natively in-process using ONNX Runtime.
* **Benefits:**
  * **Memory efficiency:** Uses only **~50MB of RAM** (instead of Ollama loading/keeping a 300MB model).
  * **Zero latency:** Avoids Ollama cold-start loading times (which took 15-20 seconds on first query and caused timeouts).
  * **Strict Offline:** Does not make any external HTTP requests to index or search document vectors.
* **Auto-Fallback:** If cloud embedding models (Gemini/OpenAI) fail due to network disconnection, the system automatically falls back to this local ONNX pipeline.

### SSE Streaming Pipeline

The client communicates via `POST /api/hayagriva/query-stream`. The server reads chunks from the active LLM generator and writes events:

```javascript
res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
});
// Stream: res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`)
// End:    res.write(`data: ${JSON.stringify({ done: true, sources })}\n\n`)
```

The RAG panel reads the stream using the browser's standard `ReadableStream` reader loop.

### Environment Variables (`.env`)

```bash
# Required for Vision OCR on image-heavy PDF pages
OPENROUTER_API_KEY=sk-or-v1-...

# Optional cloud fallbacks for RAG/layout inference
GEMINI_API_KEY=...
OPENAI_API_KEY=...

# Case vault encryption (required for law vault)
VAULT_KEY=...
```

---

## 3. Monaco Autocomplete & Encrypted Law Vault

This subsystem integrates offline legal reference lookups directly into the editor.

### Monaco Completion & Hover Providers
Monaco registers dynamic UI listeners inside `extension.ts`:
* **Autocomplete Triggers & Interactive Snippets (`@@`):** Typing `@@` lists domains (e.g. `@@IBC`). Typing `@@ibc/` lists sub-processes (e.g. `@@ibc/cirp`). Typing a full reference executes a local fetch. If the matching law or custom template contains fillable placeholders (e.g. `[date]`, `[amount]`, `[name]`) or underscores `_____`, the completion helper compiles them into Monaco tab-stops (e.g. `${1:date}`) and registers `InsertAsSnippet` insert rules. Users can press `Tab` to cycle and fill out values interactively.
* **Notion-Style Slash Commands (`/`):** Typing `/` (at the start of a line or after a space) triggers a Cursor/Notion-style block command menu. The menu provides options:
  - `/law <query>`: Dynamic local law vault query.
  - `/concept <query>`: Autocompletes references to split fact cards using `/api/hayagriva/concepts` directory-scanning. Inserts markdown links.
  - `/qa <query>`: Autocompletes references to wiki notes and Q&A files.
  - `/clause <query>`: Inserts boilerplate legal templates (Arbitration, Governing Law, Indemnity, Force Majeure) with tabstop placeholders for interactive parameter filling.
* **Hover Previews (Look Up Without Inserting):** Hovering your cursor over a citation token (e.g. `@@ibc/cirp/s7`) triggers `monaco.languages.registerHoverProvider`. The provider executes a local request, decrypts the text block in RAM, and displays it in a scrollable, styled markdown popup card.

### Vault Decryption Pipeline
The vault stores compressed, AES-256-GCM encrypted legal statutes under `vault/`:
1. **Offsets Indexing:** Metadata, tokens, and vectors are queried in `vault/manifest.json`.
2. **RAM Decryption:** To keep memory usage low, the loader reads ONLY the exact segment requested using `fs.readSync` with file offsets. It reads the IV/AuthTag headers, decrypts the block via `aes-256-gcm` using the `VAULT_KEY` environment variable, and decompresses it using `zlib.gunzipSync` in RAM.
3. **User-Space Overlays & Decryption Bypass:** Custom JSON files containing statutory amendments or rule edits can be saved under `vault/user_overlays/`. The loader parses and merges these definitions in RAM during initialization. If a request matches an overridden ID, the system returns the custom plain-text description directly, bypassing disk offset reads and AES decryption entirely.

### 3D Case Concept Graph Viewer
The visual layout network explorer maps connections between case documents, concept cards, and wiki logs:
* **Relational API Scanner (`/api/hayagriva/case-graph`):** Scans the `concepts/` and `wiki/` folders dynamically to parse YAML frontmatter for parent-child hierarchies (`ancestors` list) and internal cross-references (`links` array).
* **Color-Coded Nodes:**
  - **Amber Node (Document):** Represents a raw case document folder.
  - **Blue Node (Concept Card):** Represents a single fact/concept chunk.
  - **Green Node (Wiki/Q&A):** Represents researcher notes and LLM question-answer records.
* **Interactive Navigation:** Supports zoom/pan controls, drag layout positioning, and single-click node redirection. Clicking any node sends a message to the IDE shell to instantly open and focus the corresponding Markdown file.


### Hybrid Semantic Search
Autocomplete queries execute hybrid search:
* **BM25 Keyword Matching (40% Weight):** Stemmed tokens are matched against the local postings database.
* **Semantic Vector Similarity (60% Weight):** Generates query vectors locally on CPU via `@xenova/transformers` running the `Xenova/all-MiniLM-L6-v2` model.
* **Privacy Assurance:** All processing runs strictly local. No law queries are sent to cloud APIs.
