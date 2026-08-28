# Session Memory: Test-First Architecture & Active AI Agent Feature Tracks

**Date:** 2026-08-29  
**Repository:** `HAYAGRIVA` (`haya_pipie`)

---

## 🧪 1. Test-First Architecture & Pre-Flight Auto-Discovery Runner

### Key Upgrades:
* **Pre-Flight Integrity Audit (`backend/tests/run_all_tests.js`):**
  * Auto-discovers all `*.test.js` files via `fs.readdirSync`.
  * Pre-validates that 100% of test files load and export an executable `run()` method before executing any test.
  * Audits system components (all 25 Vault subagents and 3 Domain Profiles) upfront.
* **Master 25-Suite Catalog (`backend/tests/`):**
  * `bm25_search.test.js`, `document_splitter.test.js`, `pageindex_tree.test.js`, `form_rules_validator.test.js`, `agents_coordinator.test.js` (25 agents), `docx_conversion.test.js`, `xls_conversion.test.js`, `cache_stitch.test.js`, `parent_child_split.test.js`, `concept_enrichment.test.js`, `monaco_hover.test.js`, `monaco_snippets.test.js`, `monaco_overlays.test.js`, `monaco_slash_commands.test.js`, `monaco_graph.test.js`, `monaco_lsp_integration.test.js`, `status_healing.test.js`, `ingest_updates_table_sync.test.js`, `workspace_onboarding_taxonomy.test.js`, `settings_modes.test.js`, `stage1_enhancements.test.js`, `inlegal_sbert_llamafile.test.js`, `multimodal_merge.test.js`, `multimodal_toggle.test.js`, `comprehensive_sanity.test.js`.
* **Testing Command:**
  ```bash
  yarn --cwd backend test
  ```

---

## 🤖 2. Active AI Agent & Feature Tracks

### Track 1: Full 25-Subagent Suite & Level 1 Orchestrator
* **Legal & Insolvency Pack (21 Subagents):** `@advisor`, `@document`, `@forms`, `@claims`, `@avoidance`, `@nclt`, `@im`, `@plan`, `@coc`, `@evaluator`, `@litigation`, `@timeline`, `@precedent`, `@strength`, `@entitygraph`, `@order`, `@counter`, `@compliance`, `@witness`, `@deposition`, `@clientupdate`.
* **Coding Pack (4 Subagents):** `@architecture`, `@debugger`, `@codewriter`, `@reviewer`.
* **Level 1 Domain Managers:** Pipeline orchestrators (`@legal`, `@process_mgr`, `@claims_mgr`, `@docket_mgr`, `@audit_mgr`).

### Track 2: Master Agent Mutual Enhancement Suite
* **Contract Antecedent Basis Linter (`contract_antecedent_linter.js`):** Audits agreements to ensure all capitalized defined terms have preceding definitions.
* **Adversarial Mock Bench & Opposition Counsel (`mock_judge.md` / `/mock-judge`):** Red-teams petitions to find procedural flaws and missing exhibits.
* **Procedural Eligibility Gate (`procedural_eligibility.js`):** Pre-filing *Locus Standi* and *Limitation Period* verification.

### Track 3: Patent Agent Vault & Universal IDE Architecture
* **7 Patent Subagents:** `@interrogate`, `@alice-check`, `@draft-claims`, `@prior-art`, `@mock-examine`, `@prosecute`, `@illustrate`.
* **USPTO Format Exporters:** Line-numbered margin exporter and track-changes claim amendments (`[[strikethrough]]` / `<u>added</u>`).

### Track 4: Workspace Onboarding & Party-Structured Taxonomies
* **Unconfigured Workspace Wizard:** Onboarding screen for new blank case folders.
* **Party-Structured Folders:** `00_inbox`, `01_petitioner_plaintiff`, `02_respondent_defendant`, `03_evidence_exhibits`, `04_orders_judgments`, `05_statutes_precedents`.
* **Safe Pruning:** Deletes empty obsolete taxonomy folders upon domain switch without touching user files.

### Track 5: Standalone Monaco LSP & Sovereign LLM Engine
* **Decoupled LSP Process (`backend/lib/core/lsp-server-process.js`):** JSON-RPC language server for Monaco hover, diagnostics, `/` slash commands, and real-time Markdown-to-SQLite table synchronization (`claims_registry.md`, `avoidance_ledger.md`, `case_facts.md`).
* **Unified Single-Port Hot-Swapping:** `LegalParam-2.9B`, `FinanceParam-2.9B`, `SaulLM-7B` on port 8090 with strict 1,500-token budget pre-flight checks.
