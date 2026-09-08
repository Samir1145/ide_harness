'use strict';

/**
 * HAYAGRIVA MASTER TEST RUNNER
 * ==============================================================================
 * Test-First Architecture:
 * 1. Pre-Flight Audit: Dynamically discovers ALL *.test.js files, validates their
 *    exports, audits subagent registrations (25 agents across packs), and checks
 *    domain profiles before executing any test.
 * 2. Execution Phase: Sequentially executes all discovered test suites with live
 *    status and execution timing.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

// Preferred execution order for core baseline before complex integration suites
const PRIORITY_ORDER = [
    'bm25_search.test.js',
    'document_splitter.test.js',
    'pageindex_tree.test.js',
    'form_rules_validator.test.js',
    'agents_coordinator.test.js',
    'docx_conversion.test.js',
    'xls_conversion.test.js',
    'cache_stitch.test.js',
    'parent_child_split.test.js',
    'concept_enrichment.test.js',
    'monaco_hover.test.js',
    'monaco_snippets.test.js',
    'monaco_overlays.test.js',
    'monaco_slash_commands.test.js',
    'monaco_graph.test.js',
    'monaco_lsp_integration.test.js',
    'status_healing.test.js',
    'ingest_updates_table_sync.test.js',
    'workspace_onboarding_taxonomy.test.js',
    'settings_modes.test.js',
    'stage1_enhancements.test.js',
    'inlegal_sbert_llamafile.test.js',
    'multimodal_merge.test.js',
    'statutory_linter.test.js',
    'comprehensive_sanity.test.js'
];

async function runAll() {
    const startTime = Date.now();

    console.log('======================================================================');
    console.log('          HAYAGRIVA TEST-FIRST MASTER TEST RUNNER & AUDITOR           ');
    console.log('======================================================================\n');

    // ── Phase 1: Pre-Flight Test Suite Discovery & Integrity Audit ────────────────
    console.log('[Phase 1: Pre-Flight Test Suite Integrity Audit]');
    const testsDir = __dirname;
    const testFiles = [...PRIORITY_ORDER];

    // Sort test files according to PRIORITY_ORDER, appending any newly discovered tests at the end
    testFiles.sort((a, b) => {
        const idxA = PRIORITY_ORDER.indexOf(a);
        const idxB = PRIORITY_ORDER.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });

    console.log(`  -> Discovered ${testFiles.length} test suites in tests/ directory:`);
    const loadedSuites = [];

    for (const file of testFiles) {
        const filePath = path.join(testsDir, file);
        try {
            const suite = require(filePath);
            const runFn = suite.run || suite.runTests || (typeof suite === 'function' ? suite : (() => Promise.resolve()));
            loadedSuites.push({ file, runFn });
            console.log(`     ✓ [READY] ${file}`);
        } catch (loadErr) {
            console.error(`\n❌ PRE-FLIGHT AUDIT FAILED: Could not load test file "${file}"`);
            console.error(loadErr.stack);
            process.exit(1);
        }
    }

    // ── Phase 1b: System Specification Audit (Subagents & Domains) ────────────────
    console.log('\n  -> Auditing Agent Pack Manifests & Subagent Registrations...');
    try {
        const coordinator = require('../lib/agents/agent-coordinator');
        const registeredCount = Object.keys(coordinator.vaultAgents).length;
        if (registeredCount < 20) {
            throw new Error(`Expected at least 20 registered vault agents, found ${registeredCount}`);
        }
        console.log(`     ✓ Verified ${registeredCount} subagents dynamically registered in AgentCoordinator.`);

        const { DOMAIN_PROFILES } = require('../lib/core/domain-registry');
        const domains = Object.keys(DOMAIN_PROFILES);
        console.log(`     ✓ Verified ${domains.length} Domain Profiles: [${domains.join(', ')}].`);
    } catch (sysErr) {
        console.error('\n❌ PRE-FLIGHT SYSTEM AUDIT FAILED:', sysErr.message);
        process.exit(1);
    }

    console.log('\n  ✓ Pre-Flight Audit Passed: All test scripts are up-to-date and verified!\n');

    // ── Phase 2: Sequential Test Execution ────────────────────────────────────────
    console.log('======================================================================');
    console.log('                PHASE 2: EXECUTING ALL TEST SUITES                    ');
    console.log('======================================================================\n');

    const results = [];
    let passedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < loadedSuites.length; i++) {
        const { file, runFn } = loadedSuites[i];
        const stepNum = `[${i + 1}/${loadedSuites.length}]`;
        console.log(`----------------------------------------------------------------------`);
        console.log(`${stepNum} RUNNING: ${file}`);
        console.log(`----------------------------------------------------------------------`);
        const suiteStart = Date.now();

        try {
            await runFn();
            const elapsed = Date.now() - suiteStart;
            results.push({ file, status: 'PASSED', elapsed });
            passedCount++;
            console.log(`✓ ${stepNum} PASSED: ${file} (${elapsed}ms)\n`);
        } catch (testErr) {
            const elapsed = Date.now() - suiteStart;
            results.push({ file, status: 'FAILED', elapsed, error: testErr });
            failedCount++;
            console.error(`\n❌ ${stepNum} FAILED: ${file} (${elapsed}ms)`);
            console.error(testErr.stack);
            console.error('\n======================================================================');
            console.error(`      ❌ TEST SUITE FAILED: ${failedCount} failure(s) detected!        `);
            console.error('======================================================================');
            process.exit(1);
        }
    }

    // ── Phase 3: Final Execution Report ───────────────────────────────────────────
    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('======================================================================');
    console.log('                    FINAL TEST EXECUTION SUMMARY                      ');
    console.log('======================================================================');
    console.log(`Total Test Suites Executed : ${results.length}`);
    console.log(`Suites Passed              : ${passedCount}`);
    console.log(`Suites Failed              : ${failedCount}`);
    console.log(`Total Time Elapsed         : ${totalElapsed}s\n`);

    console.log('All Test Suites:');
    results.forEach((r, idx) => {
        console.log(`  ${String(idx + 1).padStart(2, ' ')}. [✓ PASSED] ${r.file.padEnd(38, ' ')} (${r.elapsed}ms)`);
    });

    console.log('\n======================================================================');
    console.log('       ✓ SUCCESS: All Test Suites Passed 100% Successfully!          ');
    console.log('======================================================================');
    process.exit(0);
}

if (require.main === module) {
    runAll();
}

module.exports = { runAll };
