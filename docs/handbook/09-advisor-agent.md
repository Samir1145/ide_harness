# Chapter 9: Advisor Agent (Legal Q&A RAG Specialist)

The **Advisor Agent** is a Node.js-native RAG assistant that answers complex legal and insolvency queries by querying the local law vault and active case contexts.

---

## 1. Capabilities & Flow

The agent performs local, hybrid information retrieval to answer questions regarding Companies Act, IBC, and corporate compliance details:

```
                  [User Chat Query]
                          │
                          ▼
             [hybrid search: searchLaws()]
             ├── BM25 Keyword Lookup (concepts/bm25_index.json)
             └── Semantic Similarity (MiniLM-L6 vectors on CPU)
                          │
                          ▼
            [Retrieve Top 4 Context Chunks]
                          │
                          ▼
           [Assemble System Prompt Context]
                          │
                          ▼
                [Gemini / Ollama LLM]
                          │
                          ▼
                [Cited Legal Answer]
```

1. **Query Intervention:** When a query is classified as `"advisor"`, the agent executes `searchLaws(caseDir, userMessage)`.
2. **Context Assembly:** It compiles the top 4 matching provisions, schedules, or fact cards into a structured `[Context Information]` text block.
3. **Execution Turn:** The LLM consumes the system instructions, the conversation history, and the contextual lookup block to generate a consulting-grade answer.

---

## 2. In-Memory Search Strategy

* **BM25 Keyword Matching (40% Weight):** Queries tokenized stems from `concepts/bm25_index.json` to find exact keyword matches across text pages and files.
* **Semantic Vector Similarity (60% Weight):** Uses `@xenova/transformers` to compute query embeddings locally. Cosine similarity is computed against vectorized statutory databases.
* **Overlays Override:** If a query matches an overridden overlay record inside `vault/user_overlays/`, it bypasses AES decryption and returns the plaintext overrides directly.

---

## 3. Code Coordinates

* **Agent Persona & Execution:** [agent.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/agents/advisor-agent/agent.js) (loads prompts from [agent.md](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/agents/advisor-agent/agent.md))
* **RAG Pipeline Entrypoint:** [rag.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/core/rag.js) (resolves queries by calling `searchLaws`)
* **Index Offsets & Vectors Parser:** [vault-loader.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/utils/vault-loader.js)
