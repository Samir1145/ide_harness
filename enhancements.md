# Future Enhancements: Law Completion & Document Drafting Pipeline

This document outlines the conceptual architecture and workflow design for the next phase of the TWILLM application: **Law Completion (Inline Autocomplete)** and **Automated Document Drafting**.

---

## 1. Law Completion (Inline Autocomplete)

### User Experience
* As the user drafts a petition, contract, or appeal in the editor, they type a trigger keyword starting with a triple slash (e.g. `/// Section 7` or `/// chequebounce`).
* The editor instantly displays a grayed-out preview (ghost text) containing the official statutory text of the provision or precedent.
* Pressing `Tab` accepts the completion and inserts the text.

### Technical Architecture
```
[User Types "/// Sec 7"] 
   └──> Monaco Editor (InlineCompletionItemProvider)
         └──> Fast Local BM25 Query (< 5ms)
               └──> Retrieve Section Chunks (concepts/IBC_2016/Section_7.md)
                     └──> Return Ghost Text Preview to Editor
```

* **Monaco Editor API**: Leverage Monaco's built-in `InlineCompletionItemProvider` to monitor active keystrokes and capture the trigger string `/^\/\/\/\s*(.+)/`.
* **Zero-Lag Retrieval**: Query our custom local BM25 index in Node.js. Since retrieval runs in < 5ms offline, it is fast enough to execute in real-time as the user types.

---

## 2. Automated Document Drafting Pipeline

### User Experience
* The user triggers a request in the chat panel: *"Draft a Section 7 Petition for this case."*
* The app automatically fetches the blank template format, extracts matching facts from the evidence folder, merges them via the LLM, and opens the populated draft in the editor.

### Ingestion & Processing Pipeline
1. **Template Library**: Keep standard legal templates (IBC Petitions, Appeals, Notices) in a secure, encrypted folder in the app bundle.
2. **Fact Extraction**: Run RAG (BM25 search + LLM extraction) on the case files to grab specific case metadata (Corporate Debtor Name, Default Date, Debt Amount, Exhibits).
3. **LLM Synthesis**: Pass the `Template` + `Extracted Facts` to the LLM to write the first draft.
4. **Interactive Editor**: The user refines the draft in the editor, using **Law Completion** inline to add citations and precedents.

---

## 3. Data Protection & Distribution

* **Asset Encryption (IP Protection)**: Encrypt pre-loaded templates and law libraries on disk using `AES-256-GCM` via Node.js's native `crypto` module. Decrypt them in-memory (RAM) only during startup, preventing users from copying your databases.
* **Vault-Level Encryption (Privacy)**: Provide a Master Password option for cases, encrypting the `concepts/` directory files so data remains secure on client hardware.
