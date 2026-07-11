# Workspace Rules & Session Learnings (HAYAGRIVA)

These guidelines document key architectural decisions and term alignments to keep subsequent sessions aligned.

---

## 1. System Terminology Alignment
* **Context Management System (CMS):** Manages document slicing, pageindex hierarchy indexing, companion markdown conversion, and keyword/semantic text retrieval.
* **Vault Management System (VMS):** Manages local encrypted legal databases, RAM decryption/decompression pipelines, user overlays, Monaco completion and hover providers, and the D3.js 3D Case Graph Viewer.
* **Agent Management System (AMS):** Manages specialized Node.js-native subagents (Advisor Agent, Forms Agent, Document Agent) and their programmatic integration via Eclipse Theia AI's ChatAgent registry and delegation.
* **Ingestion Management System (IMS):** Manages document parsing pipelines (PDF, Word, Excel, TiddlyWiki), Pandoc fallback routing, and multimodal visual OCR.
* **Drafting Management System (DMS):** Manages legal document templates (skeletons and prompts), unresolved gap/placeholder parsing, and version history archiving.
* **Workspace Management System (WMS):** Manages case directories isolation, local API server hosting, central variable dictionary overlays, and background worker loops.

---

## 2. Agent Design Decisions
* **Single Specialist Preference:** Do not introduce heavy multi-agent frameworks (e.g. KaibanJS) for deterministic template tasks. Keeping execution single-turn is faster and more reliable.
* **Critique Loops:** Implement self-correction loops using **Theia AI Framework native delegation APIs** (`ChatAgentService.delegateToAgent`). The `DocumentAgent` delegates drafts to `FormsAgent` for auditing, and refines the draft based on critique before showing it to the user.

---

## 3. Future Roadmap Specifications
Refer to the following plans saved in the workspace:
* **Plan 1 (Rename Sync & Hash Tracking):** Debounces `unlink` for 200ms and checks newly added file hashes to auto-rename directories instead of re-converting from scratch.
* **Plan 2 (LibreOffice PDF OCR Fallback):** Auto-detects `soffice`, converts complex sheets to headless PDFs, renders pages, and transcribes visual cell layouts using Gemini Pro vision prompting.
