# Hayagriva Backend Test Suite (Test-First Architecture)

## Running All Tests

```bash
yarn --cwd backend test
```

## Architecture: Test-First & Auto-Discovery

The master test runner [`run_all_tests.js`](./run_all_tests.js) enforces a strict **Pre-Flight Test-First Audit** before executing any tests:

1. **Pre-Flight Test Suite Discovery & Export Validation:**
   - Dynamically scans `tests/` for all `*.test.js` files.
   - Requires each test file and validates that it exports an executable `run()` function.
   - Halts immediately if any test file is corrupted or lacks standard exports.

2. **Pre-Flight System Specification Audit:**
   - Scans all Vault Agent Packs (`vault/agent_packs/`) and verifies that 100% of defined subagents (25 subagents) are loaded and ready in `AgentCoordinator`.
   - Scans all active Domain Profiles (`insolvency`, `legal`, `finance`) from `domain-registry.js`.

3. **Sequential Execution & Telemetry:**
   - Runs each suite in prioritized order with individual runtime metrics and full stack-trace logging on failure.

---

## Active Test Suites (25 Suites)

| # | Test File | Covered Capabilities |
|---|---|---|
| 1 | `bm25_search.test.js` | BM25 tokenizer, stemmer, term frequency, search scoring |
| 2 | `document_splitter.test.js` | Heading regex, section extraction, layout profiler inference |
| 3 | `pageindex_tree.test.js` | Page tree construction, parent-child links, summary generation |
| 4 | `form_rules_validator.test.js` | Date chronology, mathematical balance, rule validation |
| 5 | `agents_coordinator.test.js` | 25-subagent catalog, prompt markdown loading, Level 1 Orchestrator |
| 6 | `docx_conversion.test.js` | Pandoc DOCX table preservation and Mammoth fallback |
| 7 | `xls_conversion.test.js` | Excel merged cell and empty row/column filtering |
| 8 | `cache_stitch.test.js` | Background PDF lazy daemon and cache-stitch pipeline |
| 9 | `parent_child_split.test.js` | Long document chunk slicing and child-to-parent RAG resolution |
| 10 | `concept_enrichment.test.js` | Scope frontmatter, ancestor hierarchy, and auto-concept linking |
| 11 | `monaco_hover.test.js` | Monaco hover providers and Vault statutory reference previews |
| 12 | `monaco_snippets.test.js` | Variable tab-stop transformations (`[date]`, `[amount]`, `_____`) |
| 13 | `monaco_overlays.test.js` | User-space custom law overlays and decryption bypass |
| 14 | `monaco_slash_commands.test.js` | Notion-style slash command handlers and `/export-sc` Supreme Court compiler |
| 15 | `monaco_graph.test.js` | 3D D3.js Case Graph viewer node/edge compilation |
| 16 | `monaco_lsp_integration.test.js` | Monaco LSP diagnostics, Legal Linker relocation suggestions, live table sync |
| 17 | `status_healing.test.js` | 3-dot status indicators and missing-companion self-healing |
| 18 | `ingest_updates_table_sync.test.js` | SHA-256 file hashing, Markdown table parsing, SQLite sync |
| 19 | `workspace_onboarding_taxonomy.test.js` | Unconfigured workspace detection, domain taxonomies, safe pruning |
| 20 | `settings_modes.test.js` | Lite mode guards, single-port LLM hot-swapping, RAG token budget |
| 21 | `stage1_enhancements.test.js` | Stage 1 pipeline enhancements and SQLite schema migrations |
| 22 | `inlegal_sbert_llamafile.test.js` | Legal citation regex parsing and setup verification |
| 23 | `multimodal_merge.test.js` | Multi-page PDF visual OCR merging and topic directory scanning |
| 24 | `multimodal_toggle.test.js` | Vision OCR toggle routing and local-first fallback |
| 25 | `comprehensive_sanity.test.js` | Worker queue deduplication, end-to-end sanity checks |

---

## Adding New Tests

To add a new test, simply create a file matching `backend/tests/<feature>.test.js` and export an `async function run()`:

```javascript
async function run() {
    console.log('[My Feature Unit Tests]');
    // Assertions here
    console.log('  ✓ SUCCESS: My Feature passed!\n');
}

module.exports = { run };
```

The master test runner will **automatically discover, pre-flight audit, and execute** your new test suite without requiring manual configuration.
