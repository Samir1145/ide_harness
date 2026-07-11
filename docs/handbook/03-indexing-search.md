# Chapter 3: Inverted Indexing & SSE-Streamed RAG Search

This chapter covers how the system tokenizes document terms, indexes them in a local BM25 postings database (Phase 2), and streams real-time LLM answers using Server-Sent Events.

---

## 1. User Perspective

### When Does Indexing Happen?

BM25 indexing is part of **Phase 2** — it only runs when the user explicitly clicks **"⚡ Build Concepts"** or **"🔄 Rebuild Concepts"** in the Concepts panel. This ensures the search index is always built from the final, user-reviewed version of the document, never from a raw OCR draft.

Until Phase 2 is triggered, full-text search on that document returns no results. This is by design — searching stale pre-edit content would be misleading.

### Conversing with RAG
Users interact with the case database using the **RAG Case Chat** panel:
1. Type a legal query (e.g. "What outstanding debts were claimed by the financial creditors?").
2. The assistant responds **token-by-token** in real-time.
3. Once finished, a **Citations** list appears showing the matching documents.
4. Clicking a citation opens the file in the editor, scrolls to the cited page segment, and highlights it in yellow for 5 seconds.

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
* **Hover Previews (Look Up Without Inserting):** Hovering your cursor over a citation token (e.g. `@@ibc/cirp/s7`) triggers `monaco.languages.registerHoverProvider`. The provider executes a local request, decrypts the text block in RAM, and displays it in a scrollable, styled markdown popup card.

### Vault Decryption Pipeline
The vault stores compressed, AES-256-GCM encrypted legal statutes under `vault/`:
1. **Offsets Indexing:** Metadata, tokens, and vectors are queried in `vault/manifest.json`.
2. **RAM Decryption:** To keep memory usage low, the loader reads ONLY the exact segment requested using `fs.readSync` with file offsets. It reads the IV/AuthTag headers, decrypts the block via `aes-256-gcm` using the `VAULT_KEY` environment variable, and decompresses it using `zlib.gunzipSync` in RAM.

### Hybrid Semantic Search
Autocomplete queries execute hybrid search:
* **BM25 Keyword Matching (40% Weight):** Stemmed tokens are matched against the local postings database.
* **Semantic Vector Similarity (60% Weight):** Generates query vectors locally on CPU via `@xenova/transformers` running the `Xenova/all-MiniLM-L6-v2` model.
* **Privacy Assurance:** All processing runs strictly local. No law queries are sent to cloud APIs.
