# Agent & RAG System Technologies (Step 3)

This reference outlines the LLM orchestration, search indexing, and database engines used by the RAG agents.

---

## Agent Architecture

The agent orchestration layer is managed by [agent-coordinator.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/agents/agent-coordinator.js) which classifies user intents and delegates to specialized subagents:
* **Advisor Agent:** Performs statutory analysis, case law queries, and precedent evaluation.
* **Forms Agent:** Audits forms fields, checks calculation mathematics, and flags compliance risks.
* **Document Agent:** Generates, drafts, and compiles case document templates.

---

## Database & Search Engines

### 1. SQLite Database (`node:sqlite`)
* **Native SQLite Driver:** Uses Node's native synchronous SQLite module `node:sqlite` (specifically `DatabaseSync`) for database operations, avoiding heavy external C++ binaries.
* **Concurrency:** Runs database journal mode in Write-Ahead Logging (`WAL`) mode with `busy_timeout` set to 5000ms.
* **Full-Text Search (FTS5):** Creates virtual SQLite tables using `fts5` to run fast lexical searches on chunk texts.
* **Vector Indexing (sqlite-vss):** Dynamically attempts to load the native SQLite `vss0` extension to query semantic embedding vectors. Falls back to flat file indexing if native extensions are blocked.

### 2. BM25 Search
* Implements a custom **BM25 TF-IDF** keyword search scorer in [bm25.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/core/bm25.js). The lexical term frequency indices are saved as JSON payloads under `concepts/bm25_index.json`.

---

## LLM & API Clients

All connections are established via native HTTP/HTTPS client sockets without wrappers:
* **Local Ollama:** Sends chat payloads to local endpoints `http://127.0.0.1:11434/api/chat` (default model `qwen2.5-coder:1.5b` or `llama3.2:latest`).
* **Google Gemini API:** Direct connection to `generativelanguage.googleapis.com` for content generation.
* **OpenRouter Cloud API:** Fallback provider for advanced cloud models (like Gemini 2.5 and GPT-4o-Mini).
