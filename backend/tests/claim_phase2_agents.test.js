const assert = require('assert');
const fs = require('fs');
const path = require('path');
const coordinator = require('../lib/agents/agent-coordinator');

async function runTests() {
    console.log('--- Running Phase 2 Claim Agents Integration Tests ---');

    // 1. Verify that AgentCoordinator loaded the new vault subagents
    console.log('[Test 1] Testing AgentCoordinator dynamic vault loading...');
    assert.ok(coordinator.vaultAgents['claim_preparation'], 'Expected @claim_preparation agent to be registered');
    assert.ok(coordinator.vaultAgents['claim-prep'], 'Expected @claim-prep alias to be registered');
    assert.ok(coordinator.vaultAgents['claim_verification'], 'Expected @claim_verification agent to be registered');
    assert.ok(coordinator.vaultAgents['claim-verify'], 'Expected @claim-verify alias to be registered');
    console.log('✓ @claim_preparation and @claim_verification successfully loaded.');

    const testCaseDir = path.join(__dirname, 'fixtures', 'test_claim_agents_case');
    fs.mkdirSync(testCaseDir, { recursive: true });
    fs.mkdirSync(path.join(testCaseDir, 'drafts'), { recursive: true });
    fs.mkdirSync(path.join(testCaseDir, 'claims'), { recursive: true });

    // Set up sample case facts in case_facts.md
    const sampleFacts = `---
company_name: "Apex Infrastructures Limited"
cin: "U45200DL2016PLC123456"
claimant_name: "Punjab National Bank"
claimant_address: "PNB House, 7 Bhikhaiji Cama Place, New Delhi - 110066"
claimant_email: "cirp.delhi@pnb.co.in"
claimant_pan: "AAACP1234K"
principal_amount: "85000000"
interest_amount: "9200000"
penal_charges: "300000"
date_of_default: "2023-08-10"
insolvency_commencement_date: "2024-05-15"
irp_name: "Adv. Rajesh Kumar"
irp_address: "C-12, Barakhamba Road, Connaught Place, New Delhi - 110001"
irp_email: "rajesh.kumar.irp@gmail.com"
---
# Apex Infrastructures Limited
Financial Creditor Punjab National Bank disbursed credit facilities under Sanction Letter dated 12-Jan-2020.
`;
    fs.writeFileSync(path.join(testCaseDir, 'case_facts.md'), sampleFacts, 'utf8');

    // 2. Test @claim_preparation execution
    console.log('[Test 2] Testing @claim_preparation execution...');
    const prepAgent = coordinator.vaultAgents['claim_preparation'];
    const prepResponse = await prepAgent.run(testCaseDir, 'prepare Form C for Punjab National Bank');

    assert.ok(prepResponse.includes('Statutory Claim Draft Generated: FORM-C'), 'Response must announce Form C generation');
    assert.ok(prepResponse.includes('Punjab National Bank'), 'Response must mention claimant name');
    assert.ok(prepResponse.includes('9,45,00,000.00'), 'Response must show formatted total claim amount');

    const expectedDraft = fs.existsSync(path.join(testCaseDir, 'claims', 'CLAIM_Punjab_National_Bank_FORM-C.md'))
      ? path.join(testCaseDir, 'claims', 'CLAIM_Punjab_National_Bank_FORM-C.md')
      : path.join(testCaseDir, 'drafts', 'CLAIM_Punjab_National_Bank_FORM-C.md');
    assert.ok(fs.existsSync(expectedDraft), `Draft file must exist at ${expectedDraft}`);
    console.log('✓ @claim_preparation successfully drafted Form C.');

    // 3. Test @claim_verification execution
    console.log('[Test 3] Testing @claim_verification execution...');
    const verifyAgent = coordinator.vaultAgents['claim_verification'];
    const verifyResponse = await verifyAgent.run(testCaseDir, 'verify claim for Punjab National Bank');

    assert.ok(verifyResponse.includes('Statutory Claim Verification & Audit Result'), 'Response must display verification matrix');
    assert.ok(verifyResponse.includes('Punjab National Bank'), 'Response must mention claimant');
    assert.ok(verifyResponse.includes('Limitation Check'), 'Response must show limitation check');
    assert.ok(verifyResponse.includes('ADMITTED IN FULL') || verifyResponse.includes('WITHIN LIMITATION'), 'Response must show admission details');

    const expectedReport = path.join(testCaseDir, 'claims', 'VERIFICATION_Punjab_National_Bank.md');
    assert.ok(fs.existsSync(expectedReport), `Audit report must exist at ${expectedReport}`);
    console.log('✓ @claim_verification successfully audited claim.');

    // 4. Test registry update
    const registryPath = path.join(testCaseDir, 'claims_registry.md');
    assert.ok(fs.existsSync(registryPath), 'claims_registry.md must exist');
    const regContent = fs.readFileSync(registryPath, 'utf8');
    assert.ok(regContent.includes('Punjab National Bank'), 'claims_registry.md must contain claimant entry');
    console.log('✓ claims_registry.md verified.');

    // 5. Test coordinator.run routing with targetAgentName
    console.log('[Test 5] Testing coordinator.run with @claim_preparation and @claim_verification...');
    const routedPrep = await coordinator.run(testCaseDir, 'draft claim for operational creditor ABC Ltd', [], '@claim_preparation');
    assert.ok(routedPrep.includes('Statutory Claim Draft Generated: FORM-B') || routedPrep.includes('CLAIM_'), 'Coordinator must route to claim_preparation');

    const routedVerify = await coordinator.run(testCaseDir, 'audit claim', [], '@claim_verification');
    assert.ok(routedVerify.includes('Statutory Claim Verification & Audit Result') || routedVerify.includes('VERIFICATION_'), 'Coordinator must route to claim_verification');
    console.log('✓ coordinator.run routing verified.');

    // Clean up test fixture
    fs.rmSync(testCaseDir, { recursive: true, force: true });
    console.log('✓ Cleaned up test fixture.');
    console.log('✅ ALL PHASE 2 AGENTS INTEGRATION TESTS PASSED!');
    return true;
}

if (require.main === module) {
    runTests().catch(err => {
        console.error('❌ Phase 2 test failed:', err);
        process.exit(1);
    });
}

module.exports = runTests;
