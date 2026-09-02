const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ClaimPreparationAgent = require('../vault/agent_packs/legal_agents.vlt/agents/claim-prep/agent');
const { getSubAgentForType, subAgentRegistry } = require('../lib/agents/subagents');

async function runTests() {
    console.log('--- Running Multi-Class Claim Sub-Agents Integration Tests ---');

    // 1. Verify SubAgent registry
    console.log('[Test 1] Testing SubAgent Registry resolution...');
    assert.ok(subAgentRegistry['CLASS_OF_CREDITORS'], 'Expected CLASS_OF_CREDITORS subagent to be registered');
    assert.ok(subAgentRegistry['FINANCIAL_CREDITOR'], 'Expected FINANCIAL_CREDITOR subagent to be registered');
    assert.ok(subAgentRegistry['OPERATIONAL_CREDITOR'], 'Expected OPERATIONAL_CREDITOR subagent to be registered');
    assert.ok(subAgentRegistry['WORKMEN_EMPLOYEE'], 'Expected WORKMEN_EMPLOYEE subagent to be registered');
    assert.ok(subAgentRegistry['OTHER_CREDITOR'], 'Expected OTHER_CREDITOR subagent to be registered');

    assert.strictEqual(getSubAgentForType('CLASS_OF_CREDITORS').primaryForm, 'FORM_CA');
    assert.strictEqual(getSubAgentForType('FINANCIAL_CREDITOR').primaryForm, 'FORM_C');
    assert.strictEqual(getSubAgentForType('OPERATIONAL_CREDITOR').primaryForm, 'FORM_B');
    assert.strictEqual(getSubAgentForType('WORKMEN_EMPLOYEE').primaryForm, 'FORM_D');
    assert.strictEqual(getSubAgentForType('OTHER_CREDITOR').primaryForm, 'FORM_F');
    console.log('✓ All 5 Sub-Agents properly mapped to canonical IBC claim forms.');

    // 2. Test Class of Creditors Execution (Savita Mittal Case Directory)
    console.log('[Test 2] Testing Class of Creditors execution on Savita Mittal folder...');
    const clientDir = '/Users/atulgrover/Desktop/Clients/Savita Mittal Claimant (Vikas Garg)';
    
    if (fs.existsSync(clientDir)) {
        const agent = new ClaimPreparationAgent();
        const response = await agent.run(clientDir, 'prepare claim for Savita Mittal');

        assert.ok(response.includes('IBBI Statutory Claim Package Prepared'), 'Must announce claim prepared');
        assert.ok(response.includes('CLASS_OF_CREDITORS'), 'Must detect CLASS_OF_CREDITORS');
        assert.ok(response.includes('27,07,856.00'), 'Must show total claim of ₹27,07,856.00');
        assert.ok(response.includes('CLAIM_SAVITA_MITTAL_FORM_CA.md'), 'Must reference Primary Form CA');
        assert.ok(response.includes('CLAIM_SAVITA_MITTAL_FORM_C.md'), 'Must reference Secondary Form C');
        assert.ok(response.includes('Harmanjit Singh'), 'Must nominate Mr. Harmanjit Singh as AR');

        // Verify generated files on disk
        const primaryCA = path.join(clientDir, 'CLAIM_SAVITA_MITTAL_FORM_CA.md');
        const secondaryC = path.join(clientDir, 'CLAIM_SAVITA_MITTAL_FORM_C.md');
        assert.ok(fs.existsSync(primaryCA), 'Primary Form CA file must exist');
        assert.ok(fs.existsSync(secondaryC), 'Secondary Form C file must exist');

        const caText = fs.readFileSync(primaryCA, 'utf8');
        assert.ok(caText.includes('27,07,856.00'), 'Form CA must contain ₹27,07,856.00');
        assert.ok(caText.includes('Harmanjit Singh'), 'Form CA must contain AR name');
        assert.ok(caText.includes('M/s Zebyte Rental Planet Private Limited'), 'Form CA must contain Corporate Debtor from Form A');
        console.log('✓ Class of Creditors Form CA (Primary) & Form C (Secondary) drafted and verified.');

        // 3. Test Conversational Refinement
        console.log('[Test 3] Testing conversational modification prompt...');
        const modResponse = await agent.run(clientDir, 'change AR to Mr. Rajesh Sharma and set arrears to 20 months');

        assert.ok(modResponse.includes('Rajesh Sharma'), 'Response must reflect updated AR');
        assert.ok(modResponse.includes('20 mos'), 'Response must reflect 20 months arrears');

        const updatedCA = fs.readFileSync(primaryCA, 'utf8');
        assert.ok(updatedCA.includes('Rajesh Sharma'), 'Form CA must be updated with new AR');
        console.log('✓ Conversational refinement successfully updated claim forms in place.');

        // Reset to original Harmanjit Singh & 23 months
        await agent.run(clientDir, 'change AR to Mr. Harmanjit Singh and set arrears to 23 months');
        console.log('✓ Reset state cleanly.');
    } else {
        console.log('⚠️ Savita Mittal client directory not found on Desktop, skipping live directory test.');
    }

    // 4. Test Synthetic Batch Processing
    console.log('[Test 4] Testing batch processing simulation across test fixtures...');
    const testBatchDir = path.join(__dirname, 'fixtures', 'test_batch_clients');
    fs.mkdirSync(path.join(testBatchDir, 'Client_Alpha_Homebuyer'), { recursive: true });
    fs.mkdirSync(path.join(testBatchDir, 'Client_Beta_Vendor'), { recursive: true });

    fs.writeFileSync(path.join(testBatchDir, 'Client_Alpha_Homebuyer', 'Allotment_Letter.md'), '# Allotment Letter\nCloud particle sale and leaseback unit.', 'utf8');
    fs.writeFileSync(path.join(testBatchDir, 'Client_Beta_Vendor', 'Vendor_Invoice_101.md'), '# Invoice\nPurchase order for IT networking hardware.', 'utf8');

    const agent = new ClaimPreparationAgent();
    const batchResponse = await agent.processBatchClaimants(testBatchDir);

    assert.ok(batchResponse.includes('Master Batch Claims Processing Completed'), 'Must complete batch processing');
    assert.ok(fs.existsSync(path.join(testBatchDir, 'MASTER_CLAIMS_SUMMARY.md')), 'MASTER_CLAIMS_SUMMARY.md must be generated');

    // Clean up test batch fixture
    fs.rmSync(testBatchDir, { recursive: true, force: true });
    console.log('✓ Batch processing multi-claimant simulation verified.');

    console.log('✅ ALL MULTI-CLASS CLAIM SUB-AGENT INTEGRATION TESTS PASSED!');
    return true;
}

if (require.main === module) {
    runTests().catch(err => {
        console.error('❌ Multi-class subagent test failed:', err);
        process.exit(1);
    });
}

module.exports = runTests;
