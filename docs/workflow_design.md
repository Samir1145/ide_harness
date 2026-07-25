# HAYAGRIVA — Workflow Design (Agreed Spec)
> Last updated: 2026-07-12

---

## Core Principle
**The filesystem is the truth.** No auto-processing, no auto-registration. The user drives every step explicitly. The system never does anything in the background that the user hasn't asked for.

---

## File Types Supported
| Extension | Preview in IDE | Has Companion? |
|-----------|----------------|----------------|
| `.pdf` | Inline PDF viewer (Chromium) | ✅ Yes |
| `.docx` / `.doc` | HTML render (Mammoth) | ✅ Yes |
| `.xlsx` / `.xls` | HTML render | ✅ Yes |
| `.wiki.html` | Wiki viewer | ❌ No (wiki IS its own companion) |

---

## The Three-Dot Pipeline

Each supported file in the file tree shows **three status dots**:

```
● ● ●  filename.pdf
🟠🟠🟠  nothing done
🟢🟠🟠  companion .md exists
🟢🟢🟠  ingested to BM25 + PageIndex
🟢🟢🟢  AI-enriched (summaries, Doc2Query, KV facts)
```

### Dot 1 — Companion (Convert to .md)
- **What it does:** Converts the original file to a companion `.md` via Pandoc/Mammoth/PDF parser
- **Source of truth:** Does `<casedir>/<basename>.md` exist on disk? → green
- **Amber tooltip:** "Right-click → Convert to .md"
- **Green click:** Opens companion `.md` in the right editor panel (side-by-side with original preview)
- **Wiki files:** Always green (no conversion needed)

### Dot 2 — Context (Ingest to Context)
- **What it does:**
  1. Parses companion `.md` into sections
  2. Builds `bm25_index.json` (keyword search)
  3. Builds `pageindex_tree.json` (hierarchical section tree)
  4. Writes concept chunk files to `concepts/<basename>/`
- **Requires:** Dot 1 green
- **Source of truth:** Does `concepts/<basename>/pageindex_tree.json` exist? → green
- **Amber tooltip:** "Right-click → Ingest to Context (requires companion first)"
- **Green click:** Opens the PageIndex tree viewer (navigable section outline)
- **No vector embeddings** — BM25 + PageIndex is sufficient

### Dot 3 — AI Enrichment (Enrich with AI)
- **What it does:**
  1. LLM summaries per section (calls Gemini)
  2. Doc2Query Q&A pairs per section (calls Gemini)
  3. Schemaless KV fact extraction from full text (calls Gemini)
- **Requires:** Dot 2 green
- **Source of truth:** TBD — e.g. llmSummary flag in chunk metadata?
- **Amber tooltip:** "Right-click → Enrich with AI (requires context ingest first)"
- **Green click:** TBD — opens summaries / Q&A view

---

## File Explorer Behaviour

### What shows in the native Theia file tree
- **Only original files** — `.pdf`, `.docx`, `.xlsx`, `.wiki.html`
- **Hidden from tree:** `.md` companion files (exist on disk, filtered out)
- **Three status dots** left of filename (passive via FileDecorationProvider)
- **While converting:** blue tint on filename = in progress

### File interactions
| Action | Result |
|--------|--------|
| Double-click | Opens in custom viewer (PDF / HTML / wiki) |
| Right-click | Context menu |
| Click dot 1 (green) | Opens companion `.md` side-by-side |
| Click dot 2 (green) | Opens PageIndex tree viewer |
| Click dot 3 (green) | TBD — AI enrichment view |
| Click amber dot | Nothing (tooltip: right-click for options) |

---

## Right-Click Context Menu

```
────────────────────────────
  OPEN
  ├── Open Preview              ← always
  ├── Open Companion .md        ← only if dot 1 green
  ├── Open PageIndex            ← only if dot 2 green
  └── Open AI View              ← only if dot 3 green (TBD)
────────────────────────────
  PROCESS
  ├── Convert to .md            ← always (re-runs if already done)
  ├── Ingest to Context         ← greyed out if dot 1 not green
  └── Enrich with AI            ← greyed out if dot 2 not green
────────────────────────────
  MANAGE
  ├── Re-convert (force)        ← only if dot 1 green
  ├── Remove from Context       ← only if dot 2 green
  └── Show in Finder
────────────────────────────
  DANGER
  └── Delete file               ← deletes original + companion
────────────────────────────
```

---

## Upload Flow
- Click upload icon → native macOS Finder picker (multi-select)
- Supported: `.pdf`, `.docx`, `.doc`, `.xlsx`, `.xls`, `.wiki.html`
- Copied to root of `~/Documents/<caseName>/`
- File tree refreshes — appear with 🟠🟠🟠
- **No processing triggered**

---

## What is NOT done (by design)
| Feature | Decision |
|---------|----------|
| Auto-ingest on upload | ❌ Never |
| Auto-ingest on folder open | ❌ Never |
| Vector embeddings | ❌ BM25 is sufficient |
| index.json as file registry | ❌ Replaced by filesystem scan |
| File watcher for auto-processing | ❌ Not needed |

---

## Open Questions (TBD)
1. What does dot 3 green open? (AI enrichment view layout TBD)
2. Source of truth for dot 3 state? (llmSummary flag in chunk files?)
3. PageIndex tree — does clicking a section jump to that part in companion .md?
4. Wiki files: can they be ingested to context (dot 2)?
5. Error states: red dot on failed conversion? Notification?
6. Bulk actions: "Convert all" / "Ingest all" needed?

---

## Updates — 2026-07-12 (continued)

### Resolved Open Questions

**Dot 2 click — PageIndex Viewer:**
- Opens ALONGSIDE the companion `.md` (split view)
- Left: PageIndex tree (collapsible, navigable)
- Right: companion `.md` in the editor
- Each node shows: title + page range (e.g. pp. 4–7) + LLM summary (blank until dot 3)
- Clicking a node jumps to that section in the companion `.md`

**Wiki files:**
- Dot 1 always green (wiki IS its own companion)
- Dots 2 and 3 apply — wiki can be ingested and AI-enriched

**Error state:**
- Failed conversion → red dot 1, hover for error details

**Dot 3 green click:** TBD — opens AI enrichment view (summaries / Q&A)
**Dot 3 source of truth:** TBD — llmSummary flag in chunk metadata

### Data structure of pageindex_tree.json (confirmed)
Each node: `{ id, level, title, summary, content, pageStart, pageEnd, children[] }`

**Dot 3 green click:** Opens a structured KV facts card — key-value facts extracted from the full document text (e.g. "Applicant: ABC Ltd", "Date of order: 2024-03-15", etc.)

**Bulk actions:** No — always file-by-file. Bulk actions deferred to a later phase.

### All Open Questions Resolved ✅
