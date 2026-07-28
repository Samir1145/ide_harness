# Advisor Agent

Statutory Q&A and Case Law research agent.

## Folder Layout
* `agent.js` — Core execution file. Queries RAG core and prepares LLM prompts.
* `agent.md` — System instructions (guidelines, reference tags, and citations style).
* `README.md` — This file.

## Execution
Evaluates user prompts, retrieves context from `fts_chunks` and `vss_document_vectors` in SQLite, checks citations via `vault-loader.js`, and queries the active LLM.
