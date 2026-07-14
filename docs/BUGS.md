# BUGS.md — Known Issues & Post-Mortem Log

> Track all discovered bugs, root causes, and fixes here. Update this file whenever a new bug is found, fixed, or re-opened.

---

## [FIXED] B001 — App Bundle Executable Name Mismatch
**Date:** 2026-07-11  
**Severity:** 🔴 Critical — App fails to launch from Finder/Spotlight  

**Symptom:** Double-clicking `Hayagriva.app` in Finder did nothing silently.

**Root Cause:**  
`Info.plist` declared `CFBundleExecutable = Hayagriva` but the actual executable file was named `TWILLM`. macOS uses the plist to find the executable — they **must match exactly**.

**Fix:**  
Renamed `MacOS/TWILLM` → `MacOS/Hayagriva`.

**Files changed:**  
- `Hayagriva.app/Contents/MacOS/TWILLM` → `Hayagriva.app/Contents/MacOS/Hayagriva`

---

## [FIXED] B002 — App Bundle Hardcoded Absolute Paths (Old Project Name)
**Date:** 2026-07-11  
**Severity:** 🔴 Critical — Backend never starts, IDE hangs on loading screen

**Symptom:**  
After launching, the app would show the pulsing logo indefinitely. The backend never started.

**Root Cause:**  
The launcher script (`MacOS/TWILLM`) had hardcoded paths pointing to the old project directory:
```bash
TWILLM_DIR="/Users/atulgrover/Desktop/TWILLM/twillm"   # old name
THEIA_DIR="/Users/atulgrover/Desktop/TWILLM/ide/..."   # old name
```
The project had been renamed from `TWILLM/` to `HAYAGRIVA/`.

**Fix:**  
Rewrote the launcher to derive `PROJECT_ROOT` from its own location inside the bundle:
```bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_BUNDLE="$(dirname "$(dirname "$SCRIPT_DIR")")"
PROJECT_ROOT="$(dirname "$APP_BUNDLE")"          # HAYAGRIVA/
BACKEND_DIR="$PROJECT_ROOT/hayagriva"
```
This makes the bundle portable — works regardless of folder location.

**Files changed:**  
- `Hayagriva.app/Contents/MacOS/Hayagriva` (full rewrite)

---

## [FIXED] B003 — Backend Started in Wrong Mode (`npm start` anti-pattern)
**Date:** 2026-07-11  
**Severity:** 🔴 Critical — Wrong cases loaded, sidebar shows internal code folders as "cases"

**Symptom:**  
`/api/hayagriva/cases` returned `["dev-scratch", "lib", "node_modules", "scripts", "tests", "vault"]` — internal code directories masquerading as legal case folders.

**Root Cause:**  
`package.json` start script is `"node ./cli.js vault"` which passes `vault` as a positional argument.  
This sets `docsRoot = path.resolve('vault') = hayagriva/vault`, then `apiServer(path.dirname(caseDir))` = `hayagriva/`.  
So the API served `hayagriva/` as the cases root — listing its own subdirectories.

**Fix:**  
Always use `start.command` to launch. Do not use `npm start`. The correct invocation is:
```bash
node cli.js --watch-all    # docsRoot defaults to ~/Documents
```

---

## [FIXED] B004 — `formats/` Renamed to `templates/` Not Propagated to Routes
**Date:** 2026-07-11  
**Severity:** 🟡 High — Drafting/formats feature silently broken

**Symptom:**  
`/api/formats/registry` returned `{"formats":[]}`. Drafting panel showed no templates.

**Root Cause:**  
Folder `formats/` was renamed to `templates/` during restructure, but two files still used the old name:

| File | Old path | Fixed path |
|------|----------|-----------|
| `lib/routes.js` | `path.join(__dirname, '..', 'formats')` | `path.join(__dirname, '../..', 'templates')` |
| `lib/core/drafting.js` | `path.join(__dirname, '..', 'formats')` | `path.join(__dirname, '../../..', 'templates')` |

**Fix:** Updated both files with correct name and depth.

---

## [FIXED] B005 — Wrong Relative Path Depths After Folder Restructure
**Date:** 2026-07-11  
**Severity:** 🟡 High — Forms, vault, and pipeline silently broken

**Symptom:**  
Forms export failed. Vault law entries not loaded (`law completion disabled`). Forms mapper could not find schema files.

**Root Cause:**  
After moving files into deeper subdirectories, relative `path.join(__dirname, '..')` calls resolved to wrong directories.

**Path depth map (post-restructure):**

| File location | Correct levels to repo root | Was using |
|---|---|---|
| `lib/` | `../..` (2 levels) | `..` (1 level) |
| `lib/core/` | `../../..` (3 levels) | `..` (1 level) |
| `lib/utils/` | `../../..` (3 levels) | `..` (1 level) |
| `lib/pipeline/forms/` | `../../../../` (4 levels) | `../..` (2 levels) |

**Files fixed:**
- `lib/utils/vault-loader.js` — `../vault` → `../../vault`
- `lib/pipeline/forms/exporter.js` — `../../forms` → `../../../../forms`
- `lib/pipeline/forms/mapper.js` — `../../forms` → `../../../../forms`
- `lib/routes.js` — `../templates` → `../../templates`
- `lib/core/drafting.js` — `../templates` → `../../../templates`

**Prevention note:**  
When moving a file deeper in the hierarchy, verify every `path.join(__dirname, '..')` by running:
```bash
node -e "console.log(require('path').join('/the/actual/__dirname', '../..', 'target'));"
```

---

## [FIXED] B006 — Pulsing Logo / App Not Loading on Window Refresh
**Date:** 2026-07-11  
**Severity:** 🟡 High — App appears frozen after reload

**Symptom:**  
After Cmd+R in the Electron window, the Hayagriva logo pulsed indefinitely. The app never loaded.

**Root Cause:**  
The Electron/Theia process had exited. The preload splash animation had no renderer to transition into, so it ran forever.

**Fix:**  
Restart both components properly:
```bash
# Backend
pkill -f "node cli.js"
cd hayagriva && node cli.js --watch-all &

# IDE
cd ide/applications/electron && yarn start
```
Or simply double-click `start.command` — it handles both.

**Rule:** Always use `stop.command` to shut down — never raw `pkill` against Electron.

---

## [FIXED] B007 — `npm start` Anti-Pattern in package.json
**Date:** 2026-07-11  
**Severity:** 🟢 Low — Footgun; easy to accidentally trigger

**Symptom:**  
Running `npm start` from `hayagriva/` silently broke the cases root — the API listed internal code folders (`lib/`, `node_modules/`) as case folders.

**Root Cause:**  
`package.json` `"start"` was `"node ./cli.js vault"` — a dev convenience shortcut that passed `vault` as a positional arg, setting `docsRoot = hayagriva/vault`, then `apiServer(path.dirname(vault)) = hayagriva/`.

**Fix:**  
Changed `package.json` start script to use `--watch-all`:
```json
"start": "node ./cli.js --watch-all"
```

**Files changed:**  
- `hayagriva/package.json`

---

## [FIXED] B008 — Concepts panel stuck on "Loading Concepts" or carrying previous case folder context
**Date:** 2026-07-12  
**Severity:** 🟡 High — Sidebar UI stays out of sync with workspace folders

**Symptom:**  
The concepts panel (Lightbulb icon) got stuck on "Loading Concepts..." or continued showing files/folders from a previously opened workspace folder (like `atty1`) even when the user opened a new folder with no documents.

**Root Cause:**  
1. Inside both `wikiExplorerHtml` and `conceptsExplorerHtml` template scripts, there was a hardcoded developer fallback rule:
   ```javascript
   if (currentCase === 'TWILLM-OKF-PAGED' || currentCase === 'HAYAGRIVA' || !currentCase) {
       // Force fallback to data.cases[0] (resolves to Atty1/atty1)
   }
   ```
   This was originally written during development so testing inside the repository root folders (`HAYAGRIVA` or `TWILLM-OKF-PAGED`) automatically loaded `atty1`'s documents.
2. The frontend extension was only updating the sidebar when the active editor changed (`editorManager.onActiveEditorChanged`). When opening an empty folder or switching workspaces, there is no active editor, so the sidebar never updated or cleared.

**Fix:**  
1. Removed the hardcoded developer fallbacks from [templates.ts](file:///Users/atulgrover/Desktop/HAYAGRIVA/ide/theia-extensions/hayagriva/src/browser/templates.ts) so it only falls back if no case folder name can be resolved at all (`!currentCase`).
2. Added a workspace location change listener to `workspaceService.onWorkspaceLocationChanged` in [extension.ts](file:///Users/atulgrover/Desktop/HAYAGRIVA/ide/theia-extensions/hayagriva/src/browser/extension.ts) to force a sidebar refresh when switching workspaces, even when there are no open editor files.

**Files changed:**  
- `ide/theia-extensions/hayagriva/src/browser/templates.ts`
- `ide/theia-extensions/hayagriva/src/browser/extension.ts`

---

## [FIXED] B009 — Hardcoded case names, ports, and limits (Case_Alpha, 3210, RAG limits)
**Date:** 2026-07-12  
**Severity:** 🟢 Low — Hardcoded configuration values hinder custom configurations

**Symptom:**  
Hardcoded fallbacks (`Case_Alpha`), ports (`3210`), and law DB query limits (`n=5` and `n=1`) were hardcoded directly in URLs, template files, and backend startup code.

**Root Cause:**  
Lack of configurable settings integrations and dynamic path scanning.

**Fix:**  
1. Added a dynamic case folder scanner `getDefaultCaseName(docsRoot)` in [routes.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/routes.js) to resolve the first subdirectory, rather than hardcoding `'Case_Alpha'`.
2. Updated the backend [cli.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/cli.js) to resolve the API port dynamically from `process.env.HAYAGRIVA_API_PORT`.
3. Declared and bound `hayagrivaPreferenceSchema` configurations (`hayagriva.apiPort`, `hayagriva.rag.citationLimit`, `hayagriva.rag.hoverLimit`) in the frontend extension.
4. Updated all `fetch` URLs, iframe `src` / `srcdoc` builders, and Monaco providers to dynamically resolve the port/URL and RAG query limits from user preferences.

**Files changed:**  
- `hayagriva/lib/routes.js`
- `hayagriva/cli.js`
- `ide/theia-extensions/hayagriva/src/browser/extension.ts`
- `ide/theia-extensions/hayagriva/src/browser/templates.ts`
- `ide/theia-extensions/hayagriva/src/browser/commands.ts`
- `ide/theia-extensions/hayagriva/src/browser/tree-decorator.ts`
- `ide/theia-extensions/hayagriva/src/browser/hayagriva-frontend-module.ts`

---

## [FIXED] B010 — Concepts Panel Not Refreshing After Document Upload
**Date:** 2026-07-12  
**Severity:** 🟡 High — Newly uploaded documents don't appear in Concepts sidebar until manual reload

**Symptom:**  
After uploading a document via the Upload modal, the Wiki Explorer refreshed correctly but the Concepts panel (lightbulb icon) did not update — the new document remained invisible until the next 30-second background poll cycle.

**Root Cause:**  
The `refresh-wiki-explorer` postMessage handler in [extension.ts](file:///Users/atulgrover/Desktop/HAYAGRIVA/ide/theia-extensions/hayagriva/src/browser/extension.ts) only forwarded the refresh signal to the `wikiIframe`:
```typescript
} else if (event.data.type === 'refresh-wiki-explorer') {
  wikiIframe.contentWindow?.postMessage({ type: 'select-case', caseName: event.data.caseName }, '*');
  // conceptsWidget was never notified
}
```
The Concepts iframe only reloads on `select-case` or `refresh-wiki-explorer` messages. Since neither was sent to it after upload, it stayed stale until its own `setInterval` fired.

**Fix:**  
Extended the `refresh-wiki-explorer` handler to also forward the message to the `conceptsWidget` iframe:
```typescript
if (this.conceptsWidget) {
  const conceptsIframe = this.conceptsWidget.node.querySelector('iframe');
  conceptsIframe?.contentWindow?.postMessage({ type: 'refresh-wiki-explorer', caseName: event.data.caseName }, '*');
}
```

**Files changed:**  
- `ide/theia-extensions/hayagriva/src/browser/extension.ts`

---

## [FIXED] B011 — Document Stuck as "⏳ Generating companion..." After Ingest
**Date:** 2026-07-12  
**Severity:** 🟡 High — Concepts panel permanently shows processing spinner for already-completed documents

**Symptom:**  
A document that had been successfully ingested (companion `.md` exists, `statuses.json` shows `companion_ready`) continued showing "⏳ Generating companion..." in the Concepts sidebar. The ⚡ Build Concepts button was permanently disabled.

**Root Cause (3 compounding bugs):**

1. **Missing `updateStatus` on ingest success:** The `/api/hayagriva/ingest` route's `.then()` block only wrote the `.status` sidecar file in `conversions/` — it never called `updateStatus()` to write the final status into `concepts/statuses.json`. So `statuses.json` was permanently stuck at `processing`.

2. **`index.json` not patched after `conversionOnly` ingest:** `ingestFile` called with `conversionOnly: true` deliberately skips writing `index.json` (only updates `statuses.json`). But if the document was already registered in `index.json` with `status: processing` (from a prior `upsertDocument` call), that stale status persisted — and the `/documents` route reads `index.json` first, so `statuses.json`'s correct value was never seen.

3. **No guard against re-ingesting already-complete documents:** The `hayagriva:ingest` right-click command could be triggered on a file that already had `companion_ready` status. This overwrote both `statuses.json` and `index.json` with `processing`, restarted the ingest pipeline, and left the file stuck if the server was restarted mid-ingest (so the `.then()` block never ran).

**Fix:**  
Three changes to [routes.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/routes.js):

1. **Guard:** Before starting ingest, check the `conversions/.status` sidecar. If `companion_ready` and the companion `.md` exists, skip re-ingest and repair `statuses.json` instead (pass `force: true` to override).

2. **`updateStatus` on success:** After `ingestFile` resolves, call `updateStatus(caseDir, relative, targetStatus)` to write the final status into `statuses.json`.

3. **Patch `index.json`:** After `ingestFile` resolves, also find and update the document entry in `index.json` if its status is stale — preventing the `/documents` route from returning the wrong status.

**Files changed:**  
- `hayagriva/lib/routes.js`

---



```
## [STATUS] BXXX — Short title
**Date:** YYYY-MM-DD
**Severity:** 🔴 Critical / 🟡 High / 🟢 Low

**Symptom:** What the user sees.
**Root Cause:** Why it happens.
**Fix:** What was done.
**Files changed:** List.
```
