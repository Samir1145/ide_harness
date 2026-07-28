# Monaco Editor & Encrypted Vault Subsystem Audit

This audit document details the inner workings of the **Monaco Autocomplete Integration** and the **Local Encrypted Law Vault** in Hayagriva.

---

## 1. Local Encrypted Law Vault Subsystem
The Law Vault handles offline, secure legal reference lookups. It is highly optimized for performance and strict compliance.

### Storage Layout
The files reside in `hayagriva/vault/`:
* `manifest.json`: An index array containing metadata for thousands of legal sections. Each entry contains:
  - `id`: The unique code (e.g., `ibc/cirp/s7`).
  - `title` / `section`: Section headings and metadata.
  - `offset` / `length`: Exact byte addresses inside the raw data file.
  - `tokens`: Word arrays for BM25 keyword matching.
  - `vector`: Precomputed embeddings for semantic search.
* `laws.vlt.data`: The binary payload containing Gzipped, AES-256-GCM encrypted database segments.
* `version.json`: Release metadata of the law corpus.

### Dynamic RAM Decryption Flow
Instead of loading the entire law database into memory, the loader operates dynamically to minimize RAM usage:
```
[User triggers autocomplete] ──► Query index in manifest.json to get offset/length
                                             │
                                             ▼
[Read file segment] ───────────► Read exact byte buffer directly from laws.vlt.data
                                             │
                                             ▼
[Extract payload headers] ─────► Extract IV (12 bytes) & AuthTag (16 bytes) from block
                                             │
                                             ▼
[Decrypt & Decompress] ────────► Decrypt block via aes-256-gcm using VAULT_KEY env
                                 Decompress result using zlib.gunzipSync
                                             │
                                             ▼
[Insert snippet] ──────────────► Stream plain text back to Monaco editor autocompletion
```

### Hybrid Semantic Search Engine
* **Local Embeddings:** The system loads a local transformer pipeline (`@xenova/transformers`) running the `Xenova/all-MiniLM-L6-v2` model directly in-process on CPU.
* **Hybrid Scoring:** Queries run through a combined formula:
  $$\text{Score} = (0.4 \times \text{Normalized BM25}) + (0.6 \times \text{Cosine Similarity}) + \text{Exact Section Boost}$$
* **Privacy Guard:** Everything runs 100% locally. No law queries or search vectors are sent over the internet.

---

## 2. Monaco Editor Integration
The integration is registered dynamically inside the browser extension ([extension.ts](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva-extension/src/browser/extension.ts)).

### A. Autocomplete Providers (The `@@` Triggers)
Monaco registers a `registerCompletionItemProvider` matching the trigger characters `@` and `/`:
* **Level 1 (Sub-domains):** Typing `@@` lists all available acts (e.g., `@@IBC`, `@@MCA`, `@@ICA`).
* **Level 2 (Chapters/Rules):** Typing `@@ibc/` lists processes (e.g., `@@ibc/cirp`, `@@ibc/ibbi`).
* **Level 3 (Search & Fetch):** Typing `@@ibc/cirp/section 7` triggers an API fetch to the local backend. The backend retrieves the matching section, decrypts it in RAM, and inserts it into Monaco as an autocomplete snippet.

### B. Word Illusion Layout
Registered under `toggleWordIllusion()`, this layout alters Monaco's CSS styles to mimic a page-centered text editor:
* Hides the status bar (`#theia-statusBar`).
* Centers the text editor container to a maximum width of `850px`.
* Adds page margins and drop-shadows, creating a clean document editing view.
