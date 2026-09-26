/**
 * test_entity_graph.js - Full Test Suite for Plan 21 (Typed Entity Graph & Contradiction Edges)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const routesModule = require('../lib/routes');
const entityGraph = require('../lib/core/entity-graph');
const { getDb, closeDb } = require('../lib/core/sqlite-store');

const docsRoot = path.join(__dirname, '..', '..');

async function run() {
    console.log('[Plan 21: Entity Graph & Diagnostic Contradiction Inquest Tests]');

    const caseName = 'Case_UnitTest_EntityGraph';
    const caseDir = path.join(docsRoot, caseName);

    if (fs.existsSync(caseDir)) {
        fs.rmSync(caseDir, { recursive: true, force: true });
    }
    fs.mkdirSync(caseDir, { recursive: true });

    try {
        // ── Stage 1: Entity Normalization & Canonical Keying ─────────────────
        console.log('  -> Stage 1: Testing Name Normalization & Canonical Slugging...');
        const key1 = entityGraph.generateEntityKey('State Bank of India (SAMB Branch)');
        const key2 = entityGraph.generateEntityKey('State Bank of India');
        const key3 = entityGraph.generateEntityKey('SBI');
        assert.strictEqual(key1, 'state_bank_of_india', 'Should normalize branch suffix');
        assert.strictEqual(key2, 'state_bank_of_india', 'Full name should match');
        assert.strictEqual(key3, 'state_bank_of_india', 'Abbreviation should match canonical key');

        const cdNorm = entityGraph.normalizeEntityName('M/s ABC Infra Private Limited (Corporate Debtor)');
        assert.strictEqual(cdNorm, 'ABC Infra Private Limited', 'Should strip honorifics and party role tags');
        console.log('     ✓ Stage 1 Passed: Normalization and canonical slugging verified.');

        // ── Stage 2: SQLite Schema & Upsert ──────────────────────────────────
        console.log('  -> Stage 2: Testing SQLite Schema & Upsert Operations...');
        const db = getDb(caseDir);

        const cdKey = entityGraph.upsertEntity(db, {
            entity_key: 'abc_infra',
            name: 'ABC Infra Ltd',
            entity_type: 'corporate_debtor',
            properties: { cin: 'L12345DL2010PLC000000' }
        });
        assert.strictEqual(cdKey, 'abc_infra');

        // Insert mock claim with quantum discrepancy
        db.prepare(`
            INSERT INTO claims (creditor, claimed_amount, admitted_amount, admitted_interest, rejected_amount, rejection_reason, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            'State Bank of India',
            524000000, // ₹52.40 Cr claimed
            481000000, // ₹48.10 Cr admitted
            0,
            43000000,  // ₹4.30 Cr rejected
            'Penal interest unverified under loan sanction',
            'Admitted in Part'
        );

        // Insert mock avoidance transaction with overlapping party
        db.prepare(`
            INSERT INTO avoidance_transactions (transaction_date, amount, debited_account, credited_party, related_party_status, applicable_section, forensic_notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            '2023-01-15',
            85000000,  // ₹8.50 Cr
            'CC A/C 9901',
            'Vardhman Logistics',
            'YES',
            '66',
            'Siphoning of funds through accommodation entries'
        );

        // Also insert Vardhman Logistics as a claiming creditor to trigger Avoidance Collision
        db.prepare(`
            INSERT INTO claims (creditor, claimed_amount, admitted_amount, status)
            VALUES (?, ?, ?, ?)
        `).run(
            'Vardhman Logistics',
            4500000, // ₹45 Lakhs claimed
            4500000, // ₹45 Lakhs admitted
            'Admitted'
        );

        console.log('     ✓ Stage 2 Passed: Mock claims and avoidance records populated.');

        // ── Stage 3: Master Sync & Contradiction Detection ───────────────────
        console.log('  -> Stage 3: Running syncEntityGraph & Diagnostic Inquest...');
        const syncRes = entityGraph.syncEntityGraph(caseDir);

        console.log(`     Entities registered: ${syncRes.entities_count}`);
        console.log(`     Edges registered: ${syncRes.edges_count}`);
        console.log(`     Contradictions detected: ${syncRes.contradictions_count}`);

        assert.ok(syncRes.entities_count >= 3, 'Should register CD, SBI, and Vardhman');
        assert.ok(syncRes.contradictions_count >= 2, 'Should detect at least 2 distinct contradictions');

        const quantumConflict = syncRes.contradictions.find(c => c.edge_type === 'contradicts');
        assert.ok(quantumConflict, 'Quantum discrepancy must be detected for SBI');
        assert.strictEqual(quantumConflict.source_key, 'state_bank_of_india');
        assert.strictEqual(quantumConflict.details.delta, 43000000, 'Delta must equal 4.30 Cr');

        const avoidanceConflict = syncRes.contradictions.find(c => c.edge_type === 'avoidance_conflict');
        assert.ok(avoidanceConflict, 'Avoidance collision must be detected for Vardhman');
        assert.strictEqual(avoidanceConflict.source_key, 'vardhman_logistics');
        console.log('     ✓ Stage 3 Passed: Quantum discrepancy & Avoidance collisions detected.');

        // ── Stage 4: GraphRAG Prompt Prepend Guard ───────────────────────────
        console.log('  -> Stage 4: Testing GraphRAG Prompt Prepend Guard...');
        const ragContext = entityGraph.getGraphRAGContext(caseDir, 'What is the admitted claim amount for State Bank of India?');
        assert.ok(ragContext, 'Should return a non-null GraphRAG context warning');
        assert.ok(ragContext.includes('DIAGNOSTIC FACTUAL CONFLICT WARNING'), 'Must contain diagnostic warning header');
        assert.ok(ragContext.includes('State Bank of India'), 'Must reference SBI');
        assert.ok(ragContext.includes('4.30 Cr'), 'Must mention the ₹4.30 Cr discrepancy');
        console.log('     ✓ Stage 4 Passed: GraphRAG prompt guard synthesizes verified warning.');

        // ── Stage 5: In-Process HTTP Routes ──────────────────────────────────
        console.log('  -> Stage 5: Querying REST HTTP Routes in-process...');

        // 5.1 GET /api/hayagriva/contradictions
        let status = 0, body = '';
        const mockRes = {
            writeHead(s) { status = s; },
            end(d) { body = d; }
        };

        routesModule['GET']['/api/hayagriva/contradictions'](null, mockRes, { query: { case: caseName } }, docsRoot);
        assert.strictEqual(status, 200);
        const cJson = JSON.parse(body);
        assert.strictEqual(cJson.success, true);
        assert.ok(cJson.count >= 2);
        console.log(`     ✓ /api/hayagriva/contradictions returned ${cJson.count} findings.`);

        // 5.2 GET /api/hayagriva/entities
        body = '';
        routesModule['GET']['/api/hayagriva/entities'](null, mockRes, { query: { case: caseName } }, docsRoot);
        assert.strictEqual(status, 200);
        const eJson = JSON.parse(body);
        assert.strictEqual(eJson.success, true);
        assert.ok(eJson.count >= 3);
        console.log(`     ✓ /api/hayagriva/entities returned ${eJson.count} entities.`);

        // 5.3 GET /api/hayagriva/case-graph
        body = '';
        routesModule['GET']['/api/hayagriva/case-graph'](null, mockRes, { query: { case: caseName } }, docsRoot);
        assert.strictEqual(status, 200);
        const gJson = JSON.parse(body);
        assert.ok(gJson.nodes && gJson.links, 'Case graph must contain nodes and links');
        
        // Find contradiction link with red color
        const redLink = gJson.links.find(l => l.type === 'contradicts');
        assert.ok(redLink, 'Case graph must include typed contradicts edge');
        assert.strictEqual(redLink.color, '#ef4444', 'Contradicts edge must have #ef4444 red color token');
        console.log('     ✓ /api/hayagriva/case-graph includes typed entities and #ef4444 red conflict edges.');

        // 5.4 POST /api/hayagriva/entity-graph/sync
        body = '';
        const mockReq = {
            on(event, cb) {
                if (event === 'data') cb(JSON.stringify({ case: caseName }));
                if (event === 'end') cb();
            }
        };
        routesModule['POST']['/api/hayagriva/entity-graph/sync'](mockReq, mockRes, { query: {} }, docsRoot);
        assert.strictEqual(status, 200);
        const sJson = JSON.parse(body);
        assert.strictEqual(sJson.success, true);
        assert.ok(sJson.result.contradictions_count >= 2);
        console.log('     ✓ /api/hayagriva/entity-graph/sync successfully triggered in-process.');

    } finally {
        closeDb(caseDir);
        if (fs.existsSync(caseDir)) {
            fs.rmSync(caseDir, { recursive: true, force: true });
            console.log('  -> Cleaned up mock case directory.');
        }
    }

    console.log('✅ ALL PLAN 21 TYPED ENTITY GRAPH & CONTRADICTION TESTS PASSED CLEANLY!');
}

module.exports = { run };

if (require.main === module) {
    run().catch(err => {
        console.error('❌ Test failed:', err);
        process.exit(1);
    });
}
