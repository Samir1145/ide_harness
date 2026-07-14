# Hayagriva Future Roadmap & Shelved Concepts

This document compiles the advanced concepts, architectural designs, and features discussed and shelved during development for future discussion and implementation.

---

## 1. Lightweight Local GraphRAG (Entity-Relation JSON Index)
* **Goal:** Enhance Retrieval-Augmented Generation (RAG) by representing the case files as a connected network of entities and relationships, rather than flat document chunks. This is highly valuable for legal cases which are inherently relational.
* **Architecture:**
  * **Incremental Background Extraction:** In the background lazy worker, when a text section is indexed, call an LLM prompt to extract entities (name, type, description) and their relationships (source, target, relation, description).
  * **Flat File Graph Database:** Store the nodes and edges in a single local JSON file under the case folder: `concepts/knowledge_graph.json` (no heavy graph database required).
  * **Relational Query Expansion:** In `rag.js`, scan user query text for matching entity keys. If found, pull matching nodes and their 1-hop neighbor relationships from the JSON file and prepend them to the LLM prompt as structured markdown lists:
    ```markdown
    [Case Knowledge Graph Context]:
    - financial_creditor initiates_cirp_against corporate_debtor (Default under Section 7)
    ```

---

## 2. TiddlyWiki Bidirectional Write-Back Sync
* **Goal:** Restore complete portability to `.wiki.html` files. Changes and annotations made to the decomposed Markdown cards (`/concepts/<wiki>/*.md`) inside the IDE should sync back into the single-file HTML wiki.
* **Architecture:**
  * **Save Hook:** Monitor change events on `concepts/<wiki>/*.md` cards. On save (`Cmd+S`), read the card's YAML frontmatter tags/links and markdown body.
  * **JSON Store Injection:** Load the original `.wiki.html` file, parse the JSON array inside the `<script class="tiddlywiki-tiddler-store">` script block, upsert the matching tiddler object (updating `text`, `tags`, and `modified` timestamp), stringify it back with proper script tag escaping (`\u003c`), and rewrite the HTML file.
  * **Clean Deletions:** Sync `unlink` card deletion events to remove the corresponding tiddler object from the original HTML file.

---

## 3. Headless LibreOffice + Gemini Excel Parser Fallback
* **Goal:** Enable pixel-perfect visual parsing for complex spreadsheets (merged header cells, side-by-side tables, embedded charts, color formatting).
* **Architecture:**
  * **Auto-Detection:** Detect if the LibreOffice CLI (`soffice`) is installed on the user's host machine.
  * **Excel-to-PDF Conversion:** Convert the spreadsheet to PDF locally:
    `soffice --headless --convert-to pdf --outdir /tmp file.xlsx`
  * **Visual Ingestion:** Run the resulting PDF through the **Force Gemini Multimodal Visual Parse** pipeline to visually transcribe columns, charts, and tables into clean, structured Markdown.

---

## 4. Multi-Agent Process Isolation (KaibanJS Runner)
* **Goal:** Run complex multi-agent teams (like KaibanJS or custom LLM audit chains) safely without freezing or blocking the Electron UI thread.
* **Architecture:**
  * **Spawning Workers:** Spawn the agent orchestration loop inside a separate Node.js child process using `child_process.spawn`.
  * **Standard Stream Piping:** Pipe stdout outputs from the child process. The worker streams real-time status updates as stringified JSON lines (e.g. `{"type": "agent", "name": "Mary", "thought": "..."}`). The parent Electron thread listens to the stream and renders updates dynamically (such as moving cards on a Kanban board) at a smooth 60fps.

---

## 5. Document Rename & Hash Tracking
* **Goal:** Prevent losing manual formatting edits when a user renames or moves a document inside their case folder.
* **Architecture:**
  * **Binary Hashing:** Compute a SHA-256 hash of every uploaded PDF/Word/Excel file and register it in `index.json`.
  * **Rename Detection:** If the file watcher catches a fast deletion (`unlink`) and addition (`add`) of files with matching hashes, intercept the default behavior. Instead of wiping the index and re-converting the file from scratch, rename the corresponding companion `.md` file on disk and update its index metadata path, preserving the user's manual annotations.

---

## 6. Legal Development Environment (LDE) Core Compiler, Linting & Testing Engine
* **Goal:** Transition the platform from an advanced text assistant to a verified Legal Development Environment where legal documents are compiled, linted, tested, and bound to structured case databases.
* **Architecture:**
  * **6.1 Legal AST Parser & Monaco Linter Diagnostics:**
    * Parse companion Markdown text files to generate a structured Legal AST mapping Definitions, Cross-References (e.g., `Clause 12.2`), and External Laws (`@@ibc/s14`).
    * Expose real-time Monaco squiggly warnings (e.g., "Warning: Used term 'effective date' is never defined" or "Warning: Broken reference to Clause 12.2") using diagnostics.
  * **6.2 Legal Unit Testing Engine (Continuous Integration for Law):**
    * Develop a lightweight test-runner executing mock scenarios (e.g., `liquidationValue = 100000000`) against legal text logic.
    * Assert distribution payouts and statutory guidelines (e.g., Section 30(2) compliance) mathematically before final export.
  * **6.3 Precedent-Override Semantic Resolution Engine:**
    * Connect static statutory articles with live precedents in the Law Vault (using [vault-loader.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/utils/vault-loader.js)).
    * Highlight active statutory citations in the editor with quick-action warnings if they have been narrowed, struck down, or overridden by a recent Supreme Court precedent.
  * **6.4 Bi-Directional ORM (Text-to-Data Bridge):**
    * Establish immediate synchronization: edits to values/definitions in document text instantly sync with `case_kv_dictionary.json` fields, and variable updates in the case dashboard automatically compile back into the document's markdown text.
