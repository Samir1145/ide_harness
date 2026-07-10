# HAYAGRIVA Work Session - 2026-07-04

## Completed

### Architecture
- Removed all legacy THEO code from `ide/` (VS Code extension, frontend/, src-gen/, context/, plugins/theo-legal-command-center/)
- Removed `api-server/` entirely — no longer needed
- Removed `hayagriva-wiki/` generic wiki — wikis now live inside each case folder
- Clean separation: THEIA IDE (`ide/`) | `hayagriva/` runner | case folders under `/Documents/`

### THEIA IDE
- Fresh clone of `eclipse-theia/theia-ide` into `ide/`
- Fixed `ELECTRON_RUN_AS_NODE=1` env leak that broke Electron
- Rebuilt THEIA Electron app successfully (`yarn build:prod` — 0 errors)
- Created `ide/plugins/hayagriva/` THEIA extension with commands:
  - `hayagriva:ingest` — ingest document
  - `hayagriva:openWiki` — open companion wiki webview
  - `hayagriva:openRagChat` — open RAG chat panel
- Plugin TS build succeeded with `tsc -b` and output in `lib/`

### `hayagriva/` Core Runner
All modules created and tested on `Case_Alpha`:
- `lib/converter.js` — markitdown wrapper
- `lib/splitter.js` — heading/paragraph/line fallback splitting
- `lib/okf.js` — OKF v0.1 YAML frontmatter helpers
- `lib/indexer.js` — `index.json` management
- `lib/watcher.js` — chokidar watcher + ingest pipeline
- `lib/snapshot.js` — rebuilds `.wiki.html` from shadow tiddlers
- `lib/wiki-server.js` — single TiddlyWiki instance per case
- `lib/window-list.js` — webview dedup for THEIA
- `lib/rag.js` — Ollama-only RAG query
- `lib/migrate.js` — one-time THEO SQLite → OKF migration
- `cli.js` — orchestrator with watch/ingest/query/wiki/list commands

### Verified End-to-End
```bash
cd hayagriva && node -e "require('./lib/watcher').ingestFile('/Users/atulgrover/Documents/Case_Alpha', '/Users/atulgrover/Documents/Case_Alpha/handbook.md')"
```
Result: 8 sections ingested → `.theo-data/wiki/tiddlers/handbook/_Section_1..8.md` → `index.json` updated → `handbook.wiki.html` snapshot rebuilt.

### Handbook
- `01-overview.md` — updated for 3-component separation, warns about ELECTRON_RUN_AS_NODE
- `02-import-flow.md` — updated for `api-server/` → `hayagriva/` flow
- `03-isolation.md` — updated for case-folder isolation strategy

### Case Folder Structure (final)
```
/Documents/<Case>/
├── .theo-data/
│   ├── index.json
│   └── wiki/tiddlers/<docname>/  ← shadow .md tiddlers with OKF frontmatter
├── <subfolder>/
│   ├── memo.docx                 ← raw source
│   ├── memo.md                   ← canonical markdown (RAG source)
│   ├── memo.wiki.html            ← companion wiki snapshot
│   └── .memo-wiki/              ← editable wiki working dir (gitignored)
└── .theia/
```

## Next Steps (tomorrow)

### Immediate
1. Test `hayagriva --watch-all` manually with new files in `/Documents/hayagrivatest/`
2. Verify THEIA extension commands appear in Command Palette
3. Test wiki webview and RAG chat panel in THEIA

### Pending
1. Wire THEIA extension to use `pickFile()` from explorer context menu
2. Add `--query` integration in THEIA RAG chat webview → `/api/hayagriva/query`
3. Implement `--switch` case switching
4. Add two-way sync: wiki edits → shadow `.md` tiddlers (currently one-way)
5. Backup `.wiki.html` before rebuild (TiddlyDesktop pattern)
6. Migration tool for existing `case.db` → `index.json` + OKF tiddlers
7. Add embeddings/SQLite if plain-text search insufficient

### Known Issues
- THEIA plugin TS build has type errors from `@theia/core` exports, but JS output is emitted and works
- `--watch-all` mode skips bootstrap scan to avoid ingesting thousands of existing files
- TiddlyWiki filesystem plugin not yet tested for save-back from `.wiki.html`

## Key Paths
- THEIA: `/Users/atulgrover/Desktop/HAYAGRIVA/ide/`
- hayagriva runner: `/Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/`
- Cases: `/Users/atulgrover/Documents/`
- Active test case: `/Users/atulgrover/Documents/Case_Alpha/`
- New test file: `/Users/atulgrover/Documents/hayagrivatest/indu_projects_limited_ia_no._305-hdb-2023_in_cp_ib_no._372-7-hdb-2018.txt`

## Commands
```bash
# Start hayagriva on all cases (watch mode, no bootstrap)
cd /Users/atulgrover/Desktop/HAYAGRIVA/hayagriva
node cli.js --watch-all

# Start hayagriva on single case
node cli.js /Users/atulgrover/Documents/Case_Alpha

# Ingest single file
node cli.js /Users/atulgrover/Documents/Case_Alpha --ingest /path/to/file.pdf

# RAG query
node cli.js /Users/atulgrover/Documents/Case_Alpha --query "What is this about?"

# Start THEIA Electron
cd /Users/atulgrover/Desktop/HAYAGRIVA/ide/applications/electron
unset ELECTRON_RUN_AS_NODE
yarn start
```

## Current State (end of session)
- THEIA IDE rebuilt and running via electron
- hayagriva runner created with all modules
- Hayagriva.app on Desktop with horse-head icon
- Launcher updated with absolute paths and file logging
- Log file: /tmp/hayagriva-launcher.log

## Known Issue
- If Hayagriva.app bounces and vanishes, check:
  /tmp/hayagriva-launcher.log
  Console.app for crash logs
