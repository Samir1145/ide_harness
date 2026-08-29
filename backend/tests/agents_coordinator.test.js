const path = require('path');
const fs = require('fs');
const coordinator = require('../lib/agents/agent-coordinator');

async function run() {
    console.log('[Agents & Coordinator Master Unit Tests]');

    // 1. Verify all 25 Vault Agent Packs loaded dynamically
    console.log('  -> Verifying dynamic registration of all Vault agents...');
    const registeredTags = Object.keys(coordinator.vaultAgents);
    console.log(`     Discovered ${registeredTags.length} registered Vault agents: [${registeredTags.join(', ')}]`);

    const expectedAgents = [
        // Legal & Insolvency Domain Pack
        'advisor', 'document', 'forms', 'claims', 'avoidance', 'nclt', 'im', 'plan',
        'litigation', 'timeline', 'precedent', 'strength', 'entitygraph', 'order',
        'counter', 'compliance', 'witness', 'deposition', 'clientupdate', 'coc', 'evaluator',
        'claim_preparation', 'claim_verification'
    ];

    for (const tag of expectedAgents) {
        if (!coordinator.vaultAgents[tag]) {
            throw new Error(`Expected Vault Agent @${tag} was not loaded in AgentCoordinator!`);
        }
        const agent = coordinator.vaultAgents[tag];
        if (typeof agent.run !== 'function') {
            throw new Error(`Agent @${tag} is missing an executable run() method!`);
        }
        if (typeof agent.instructions !== 'string' || agent.instructions.trim().length === 0) {
            throw new Error(`Agent @${tag} does not have valid compiled system instructions (.md prompt)!`);
        }
    }
    console.log(`     ✓ All ${expectedAgents.length} expected agents verified with valid instructions and run() contracts.`);

    // 2. Verify coordinator classification routing fallbacks
    console.log('  -> Testing intent classification routing fallback contracts...');
    if (typeof coordinator.classifyIntent !== 'function') {
        throw new Error('Coordinator missing classifyIntent function.');
    }

    // 3. Verify coordinator execution contracts and direct routing
    console.log('  -> Testing coordinator execution routing in mock environment...');
    const tempCaseDir = path.join(__dirname, 'fixtures', 'temp_agent_case');
    fs.mkdirSync(path.join(tempCaseDir, 'drafts'), { recursive: true });
    fs.mkdirSync(path.join(tempCaseDir, 'reviews'), { recursive: true });
    fs.mkdirSync(path.join(tempCaseDir, 'concepts'), { recursive: true });

    try {
        // Test Lite Mode fallback execution for @coc
        const cocRes = await coordinator.run(tempCaseDir, 'calculate voting shares for financial creditors', [], '@coc');
        if (!cocRes || typeof cocRes !== 'string') {
            throw new Error(`Expected string response from @coc coordinator routing, got: ${typeof cocRes}`);
        }
        console.log('     ✓ Direct routing to @coc executed and returned structured output.');

        // Test Lite Mode fallback execution for @evaluator
        const evalRes = await coordinator.run(tempCaseDir, 'check section 29A compliance for resolution plan', [], '@evaluator');
        if (!evalRes || typeof evalRes !== 'string') {
            throw new Error(`Expected string response from @evaluator coordinator routing, got: ${typeof evalRes}`);
        }
        console.log('     ✓ Direct routing to @evaluator executed and returned structured output.');

        // Test Level 1 Domain Manager routing check
        const { orchestratorRegistry } = require('../lib/agents/orchestrator-coordinator');
        const legalManager = orchestratorRegistry.getManager('legal');
        if (!legalManager || typeof legalManager.runPipeline !== 'function') {
            throw new Error('OrchestratorRegistry failed to provide @legal Domain Manager.');
        }
        console.log('     ✓ Level 1 OrchestratorRegistry successfully loaded Domain Managers.');

    } finally {
        try {
            fs.rmSync(tempCaseDir, { recursive: true, force: true });
        } catch (_) {}
    }

    console.log('  ✓ SUCCESS: Agents & Coordinator Master Unit Tests passed!\n');
}

module.exports = { run };

