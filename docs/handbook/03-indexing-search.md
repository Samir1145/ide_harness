# Chapter 3: Inverted Indexing & SSE-Streamed RAG Search

This step covers how the system tokenizes document terms, indexes them in a local postings database, and streams real-time LLM answers using Server-Sent Events.

---

## 1. User Perspective

### Conversing with RAG
Users interact with the case database using the **RAG Case Chat** panel (bottom/right sidebar):
1. Type a legal query (e.g. "What outstanding debts were claimed by the financial creditors?").
2. The assistant responds **token-by-token** in real-time.
3. Once finished, a **Citations** list appears showing the matching documents.
4. Clicking a citation link (e.g., `handbook.md`) automatically opens that file in the editor, scrolls to the cited page segment, and highlights it in yellow for 5 seconds.

---

## 2. Admin & Developer Perspective

### Custom BM25 Index Database
Instead of a heavy vector database, the application builds a clean inverted index (`bm25_index.json`) for each case workspace:
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
* **Tokenizer/Stemmer**: Lowercases text, strips punctuation, discards 150+ legal/English stop words, and applies simple suffix-stemming (e.g., `defaults`, `defaulting` -> `default`).
* **Auto-Sync Watcher**: When a markdown section is edited or saved, `watcher.js` incremental sync cleans the index postings for that document and adds the revised content on the fly, avoiding full index rebuilds.

### LLM Client Fallback Hierarchy
The `llm-client.js` module unifies local and cloud inference:
1. **Ollama (Local Default)**: Pings `127.0.0.1:11434`. If healthy, runs inference offline (e.g. using `llama3.2:latest`).
2. **Google Gemini (Cloud Fallback)**: If Ollama is offline or times out (3s), falls back to Google Gemini using `GEMINI_API_KEY`, formatting system prompts dynamically.
3. **OpenAI (Cloud Alternative)**: If Gemini is unavailable, falls back to OpenAI using `OPENAI_API_KEY`.

### SSE Streaming Pipeline
The client communicates via `POST /api/twillm/query-stream`. The server reads chunks from the active LLM generator and writes events to the client:
```javascript
res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
});
// Stream: res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`)
// End: res.write(`data: ${JSON.stringify({ done: true, sources })}\n\n`)
```
The RAG panel reads the stream using the browser's standard `ReadableStream` reader loop.
