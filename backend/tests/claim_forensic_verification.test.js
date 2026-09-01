const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { auditCaseClaims, auditBankLedger, reconcileContracts } = require('../lib/agents/skills/claim-verify');
const { generateClaimForm } = require('../lib/agents/skills/claim-form-fill');
const coordinator = require('../lib/agents/agent-coordinator');

async function runTests() {
    console.log('🧪 Starting Forensic Claim Verification Tests...\n');
    const caseDir = '/Users/atulgrover/Desktop/Clients/Savita Mittal Claimant (Vikas Garg)';

    // Test 1: Bank Ledger Crawler
    console.log('Running Test 1: Exhaustive Bank Ledger Crawler...');
    const ledger = auditBankLedger(caseDir);
    assert.strictEqual(ledger.debits.length, 3, 'Should find exactly 3 capital debits');
    assert.strictEqual(ledger.totalOutflow, 1417487.00, 'Total outflow must equal ₹14,17,487.00');
    assert.strictEqual(ledger.credits.length, 24, 'Should find 24 rental credits');
    assert.strictEqual(ledger.totalInflow, 1090710.47, 'Total inflow must equal ₹10,90,710.47');
    assert.strictEqual(ledger.netUnrecovered, 326776.53, 'Net unrecovered must equal ₹3,26,776.53');
    assert.strictEqual(ledger.defaultStartDate, '2024-11-01', 'Default start date must be 2024-11-01');
    console.log('✅ Test 1 Passed: 100% Ledger Rows Parsed with Zero Omissions.\n');

    // Test 2: Contract Reconciler
    console.log('Running Test 2: Multi-Tranche Contract Reconciler...');
    const recon = reconcileContracts(caseDir, ledger);
    assert.strictEqual(recon.pairedTranches.length, 3, 'Should have 3 paired tranches');
    assert.strictEqual(recon.pairedTranches[0].debitAmount, 688117.00, 'Batch 1 amount is ₹6,88,117.00');
    assert.strictEqual(recon.pairedTranches[1].debitAmount, 688117.00, 'Batch 2 amount is ₹6,88,117.00');
    assert.strictEqual(recon.totalParticles, 41, 'Total particles must equal 41');
    console.log('✅ Test 2 Passed: Multi-Tranche Particles & Serials Mapped.\n');

    // Test 3: CLAIM_AUDIT.md Workpad
    console.log('Running Test 3: Live Workpad CLAIM_AUDIT.md Generation...');
    const audit = auditCaseClaims(caseDir);
    assert.ok(fs.existsSync(audit.workpadPath), 'CLAIM_AUDIT.md must exist in caseDir');
    const content = fs.readFileSync(audit.workpadPath, 'utf8');
    assert.ok(content.includes('SAVITA MITTAL'), 'Must include claimant name');
    assert.ok(content.includes('Bifurcated Entity Disconnect'), 'Must include red flag register');
    assert.ok(content.includes('14,17,487.00'), 'Must include total outflow');
    assert.ok(content.includes('10,90,710.47'), 'Must include total inflow');
    console.log('✅ Test 3 Passed: CLAIM_AUDIT.md Live Workpad Verified.\n');

    // Test 4: Form C Drafting & Box 8 Pleading
    console.log('Running Test 4: Form C Generation with Special Pleading...');
    const res = await generateClaimForm(caseDir, 'form-c', { claimPathway: 'composite' });
    assert.strictEqual(res.claimantName, 'SAVITA MITTAL');
    assert.strictEqual(res.totalClaimFormatted, '14,17,487.00');
    assert.ok(res.markdown.includes('Integrated Sale-and-Leaseback Financing'), 'Box 8 must contain sale-and-leaseback brief');
    assert.ok(res.markdown.includes('Connectedness & Single Economic Enterprise (Sec 5(24))'), 'Box 8 must contain Sec 5(24) brief');
    assert.ok(res.markdown.includes('CLAIM_AUDIT.md'), 'Attached docs must cite CLAIM_AUDIT.md');
    console.log('✅ Test 4 Passed: Form C Generated with Audited Box 8 Pleading.\n');

    // Test 5: Coordinator 3-Surface Model
    console.log('Running Test 5: Agent Coordinator 3-Surface Model Execution...');
    const coordinatorResponse = await coordinator.run(caseDir, '@claim_preparation prepare claim', [], 'claim_preparation');
    assert.ok(coordinatorResponse.includes('Forensic Verification Stream'), 'Must include thought stream');
    assert.ok(coordinatorResponse.includes('CLAIM_AUDIT.md'), 'Must reference CLAIM_AUDIT.md');
    assert.ok(coordinatorResponse.includes('Checkpoint 1: Verified Contracts & Particle Inventory'), 'Must include Checkpoint 1');
    assert.ok(coordinatorResponse.includes('Checkpoint 2: Reconciled Financial Flows & Default Milestone'), 'Must include Checkpoint 2');
    assert.ok(coordinatorResponse.includes('Checkpoint 3: Strategic Pleading Choice'), 'Must include Checkpoint 3');
    console.log('✅ Test 5 Passed: 3-Surface Model & Interactive Steering Gates Verified.\n');

    console.log('🎉 ALL 5 TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
    console.error('❌ Test execution failed:', err);
    process.exit(1);
});
