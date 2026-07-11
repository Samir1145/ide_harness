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

## Adding New Bugs

```
## [STATUS] BXXX — Short title
**Date:** YYYY-MM-DD
**Severity:** 🔴 Critical / 🟡 High / 🟢 Low

**Symptom:** What the user sees.
**Root Cause:** Why it happens.
**Fix:** What was done.
**Files changed:** List.
```
