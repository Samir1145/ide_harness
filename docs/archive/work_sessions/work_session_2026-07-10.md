# Work Session — 2026-07-10

## Summary

Implemented the two-phase ingestion pipeline, Vision OCR via OpenRouter, and serial PDF daemon.

---

## Changes Made

### Backend (`hayagriva/`)

#### `lib/watcher.js`
- **`ingestFile(caseDir, filePath, opts = {})`** — signature updated from `disableDoc2Query` boolean to `opts` object. `opts.conversionOnly` gates all BM25/index writes:
  - `.pdf` path: creates companion, writes `.status = "pending_review"`, skips `index.json`
  - `.md` path: skipped entirely when `conversionOnly: true`
  - `.md` path: full BM25 + concepts + wiki pipeline when `conversionOnly: false`; updates `.status = "indexed"`
- **Serial daemon (`_runDaemonLoop`)**: Replaced broken `setInterval` with recursive `setTimeout` loop. One 3-page batch processed at a time. Daemon passes `{ conversionOnly: true }` to `ingestFile` on each append — no BM25 writes during page accumulation.
- **`isPdfDaemonRunning` guard**: Set eagerly at call site in `createWatcher` (not inside `startPdfIngestionDaemon`) to prevent multiple daemon instances in `--watch-all` mode.
- **`completedPdfSet`**: Exported alongside `pendingPdfQueue` for use by `api-server.js` status endpoint.
- **Header sanitisation**: Regex strips repeated NCLT court header metadata from each OCR'd page block.
- **OCR timeout**: Increased from 60s → 120s per page to accommodate complex multi-table pages.

#### `lib/llm-client.js`
- Added `streamOpenRouter(messages, model, opts)` function.
- Priority chain updated: OpenRouter (vision) → Ollama → Gemini → OpenAI.
- Default OpenRouter model: `google/gemini-2.5-flash`.

#### `lib/api-server.js`
- `GET /api/hayagriva/documents` — merges `index.json` (indexed docs) + `.status` sidecars (pending_review docs). Returns `totalPages`, `nextPage`, `conversionComplete` for pending docs.
- `GET /api/hayagriva/ingest-status` — reads `pendingPdfQueue` and `completedPdfSet` for live daemon progress.
- `POST /api/hayagriva/build-concepts` — triggers Phase 2 on demand: `ingestFile(caseDir, companionPath, { conversionOnly: false })`.

#### `.env`
- Added `OPENROUTER_API_KEY`.

#### `cli.js`
- `bootstrapCase()`: non-MD files pass `{ conversionOnly: true }` — only converts to `.md`, no Phase 2.
- Companion `.md` files (identified by presence of `.status` sidecar) are **skipped** during bootstrap scan — they are Phase 2 territory.
- Both `onFileChange` handlers (single-case + `runWatchAll`) detect companion `.md` files via `.status` sidecar and pass `{ conversionOnly: true }`.

### Frontend (`ide/theia-extensions/hayagriva/`)

#### `src/browser/templates.ts`

**Concepts panel (`conceptsExplorerHtml`)**:
- Now fetches `GET /api/hayagriva/documents` instead of reading `index.json` directly.
- Pending documents rendered as **amber-bordered cards** with:
  - Live progress bar (polls `/ingest-status` every 4s)
  - "📄 Open .md" button (opens companion in editor)
  - "⚡ Build Concepts" button (disabled while daemon running, enabled on completion)
- Indexed documents show existing outline + new **"🔄 Rebuild Concepts"** button (always available).
- Spinner on "Build Concepts" click → reloads panel on API return.
- Auto-refresh every 30s.

**Upload panel (`sidebarHtml`)**:
- After upload, shows conversion status widget with progress polling and disabled "⚡ Build Concepts" button that enables when daemon completes.

---

## Architecture Decision Log

| Decision | Rationale |
|---|---|
| BM25 deferred to Phase 2 | If user edits `.md` after OCR, Phase 1 BM25 would be stale. Build once from final version. |
| `.status` sidecar (not `index.json`) | Phase 1 is zero-write to the database. Sidecar is pure file I/O. |
| Serial daemon with `setTimeout` | `setInterval` caused concurrent OCR instances when multiple iterations overlapped. |
| `isPdfDaemonRunning` set eagerly | Prevents race condition where `createWatcher` loop (one per case dir) spawned multiple daemons. |
| OpenRouter for Vision OCR | Local Ollama vision models too slow; OpenRouter gives access to Gemini 2.5 Flash with 120s timeout. |

---

## Verification

- ✅ `GET /api/hayagriva/documents` returns indexed + pending docs with correct status
- ✅ `.status` sidecar creation and detection verified
- ✅ `POST /api/hayagriva/build-concepts` returns `{ ok: true, sections: 41 }`
- ✅ `tsc -b` compiles clean (0 errors)
- ✅ Vision OCR processing pages 31–33 sequentially confirmed in logs
