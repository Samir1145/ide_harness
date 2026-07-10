# HAYAGRIVA Bug Log

## Bug: Wiki stops rendering in IDE (Port EADDRINUSE Conflicts)

### Root Cause
- **Spawning CLI Wrappers**: Previously, [wiki-server.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/wiki-server.js) was spawning `tiddlywiki` via the `npx tiddlywiki` CLI command wrapper.
- **Orphan Processes**: In Node.js, calling `spawn('npx', ...)` runs TiddlyWiki inside a shell sub-wrapper. When `/switch-context` is called, the parent process attempts to kill the child using `this.process.kill('SIGTERM')`. This kills the `npx` wrapper script, but **leaves the actual TiddlyWiki worker process running as a detached orphan in the background**.
- **EADDRINUSE Bind Failures**: Because the orphan process remains active, it holds the port lock (e.g. `8080`). When the companion server attempts to start a new instance of TiddlyWiki on the same port, it throws `EADDRINUSE` and crashes, causing the IDE iframe to fail to display the wiki.

### The Fix
- Changed `WikiServer` to resolve the absolute path to `node_modules/tiddlywiki/tiddlywiki.js` using `require.resolve`.
- Spawned `node` directly:
  ```javascript
  const tiddlywikiPath = require.resolve('tiddlywiki/tiddlywiki.js');
  this.process = spawn('node', [tiddlywikiPath, ...args], { ... });
  ```
- Because the process is spawned directly as `node` without shell wrappers, `SIGTERM` signals kill the TiddlyWiki process instantly, freeing the port immediately and allowing seamless context hot-swapping without conflicts.

## Bug: Monaco Inline Completions Prefix Requirement & Autocomplete Trigger

### Root Cause
- **Inline Completion Provider**: Initially, [extension.ts](file:///Users/atulgrover/Desktop/HAYAGRIVA/ide/theia-extensions/hayagriva/src/browser/extension.ts) registered a Monaco inline completions provider (`registerInlineCompletionsProvider`) to render ghost text when typing `@@`.
- **Strict Prefix Matching**: Inline completions in Monaco require exact prefix matching and do not offer a navigable list or dropdown interface. This made hierarchical, multi-level domain navigation (like `@@ibc/` and `@@mca/` subdomains) difficult to support and caused completion selections to flicker or fail.

### The Fix
- **IntelliSense Dropdown**: Replaced `registerInlineCompletionsProvider` with standard completion items via `registerCompletionItemProvider`.
- **Explicit Trigger Characters**: Bound trigger characters `['@', '/']` to enable standard Intellisense dropdowns that support nested path traversal (e.g. typing `@@ibc/` displays subdomain options) and asynchronously fetch complete section texts from the `/api/laws/query` backend endpoint.

## Bug: Monaco Autocomplete Dropdown Fails to Trigger for @@

### Root Cause
- **Trigger Suppression:** Monaco suppresses autocomplete dropdowns if a trigger character (like the first `@`) returns no suggestions. Since typing `@@` consists of two separate `@` keystrokes, the first `@` was returning `{ suggestions: [] }`, causing Monaco to suppress subsequent suggestions in that session.
- **Prefix Mismatch Filtering:** Monaco filters completion items by comparing the prefix typed in the editor (from the start of `replaceRange` to the cursor) against each suggestion's `label` and `filterText`. Since our original suggestions had labels like `"ARB - Arbitration Act"` (which do not start with `@` or `@@`), Monaco discarded all of them as mismatching, resulting in an empty dropdown.
- **Range Overflow:** The replacement range used hardcoded `lastIndexOf('@@')` calls. If the trigger was not fully typed, this index returned `-1`, causing column `0` invalid range errors in Monaco.

### The Fix
- **Prefix Matching:** Refactored the provider regex to `/@@?([\w\s./,-]*)$/` to match both `@` and `@@`.
- **Dynamic Range Math:** Replaced the hardcoded index lookups with a dynamic `.search(/@@?/)` query to resolve the exact character index and prevent range errors.
- **Suggestion Prefixing:** Prefixed the `label` and `filterText` of all completion suggestions with their corresponding typed prefixes (e.g. `@@ARB...` or `@@ibc/...`). This satisfies Monaco's prefix filtering engine, ensuring all suggestions are displayed.

## Bug: Partial PDF Ingestion & Stuck "pending_review" Status (Srimarg PDF Ingestion Issues)

### Root Cause
- **Background Serial Ingestion Design:** PDF ingestion is a two-phase lazy process. Initially, only pages 1–3 are processed immediately to keep the app responsive. The remaining pages are queued (`pendingPdfQueue`) and appended sequentially in the background in batches of 10 pages.
- **In-Memory Queue Restarts:** The queue of pending page blocks is stored in-memory. If the user closes the Electron application or restarts/rebuilds the backend while a background PDF ingestion is active, the queue is completely wiped. The PDF remains partially converted, and its status stays locked as `"pending_review"` with the `.status` file remaining on disk.
- **OCR Timeouts:** The PDF pages are converted via Vision OCR (using OpenRouter/Gemini 2.5 Flash). Initially, the OCR timeout was set to 60s. Scanned pages containing complex, dense tables (e.g. IBBI registration tables) took longer than 60s to render, resulting in timeout failures which aborted the background daemon and discarded the remaining pages of the PDF.

### The Fix
- **Increased OCR Timeout:** Doubled the Vision OCR request timeout from 60 seconds to 120 seconds per page in `watcher.js` to prevent complex table pages from causing block ingestion failures.
- **Resilient Serial Daemon Loop:** Replaced the previous overlapping `setInterval` loops with a sequential, recursive `setTimeout` loop. This processes only one block at a time, protecting the API from overlap overloads.
- **Eager Daemon Guards:** Added eager lock checks (`isPdfDaemonRunning = true`) at the watcher call sites to prevent multiple instances of the background loops from running concurrently and overloading the system.
