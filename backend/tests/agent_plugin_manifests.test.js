const assert = require('assert');
const path = require('path');
const fs = require('fs');
const coordinator = require('../lib/agents/agent-coordinator');

async function run() {
    console.log('[Theia Agent Plugin Manifests Unit Tests]');

    const packsDir = path.join(__dirname, '..', 'vault', 'agent_packs');
    const expectedPacks = ['legal_agents.vlt', 'coding_agents.vlt'];

    // 1. Verify plugin.json exists and adheres to Theia Agent Plugin standard in each pack
    console.log('  -> Verifying plugin.json compliance across all Agent Packs...');
    for (const packName of expectedPacks) {
        const packPath = path.join(packsDir, packName);
        const pluginJsonPath = path.join(packPath, 'plugin.json');
        
        assert.ok(fs.existsSync(pluginJsonPath), `Missing plugin.json in ${packName}`);

        const pluginData = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
        
        // Standard plugin metadata assertions
        assert.ok(pluginData.id, `Plugin ${packName} missing 'id'`);
        assert.ok(pluginData.name, `Plugin ${packName} missing 'name'`);
        assert.ok(pluginData.version, `Plugin ${packName} missing 'version'`);
        assert.ok(pluginData.publisher, `Plugin ${packName} missing 'publisher'`);
        assert.ok(Array.isArray(pluginData.agents), `Plugin ${packName} missing 'agents' array`);
        assert.ok(pluginData.agents.length > 0, `Plugin ${packName} has empty 'agents' array`);

        // Check each declared agent
        for (const agent of pluginData.agents) {
            assert.ok(agent.id, `Agent in ${packName} missing 'id'`);
            assert.ok(agent.name, `Agent ${agent.id} in ${packName} missing 'name'`);
            assert.ok(agent.tag, `Agent ${agent.id} in ${packName} missing 'tag'`);
            assert.ok(agent.description, `Agent ${agent.id} in ${packName} missing 'description'`);
            assert.ok(Array.isArray(agent.modes), `Agent ${agent.id} in ${packName} missing 'modes' array`);
            assert.ok(Array.isArray(agent.tags), `Agent ${agent.id} in ${packName} missing 'tags' array`);

            // Verify physical files exist
            const agentJsPath = path.join(packPath, 'agents', agent.id, 'agent.js');
            const agentMdPath = path.join(packPath, 'agents', agent.id, 'agent.md');
            assert.ok(fs.existsSync(agentJsPath), `Missing agent.js for ${agent.id} in ${packName}`);
            assert.ok(fs.existsSync(agentMdPath), `Missing agent.md for ${agent.id} in ${packName}`);
        }

        console.log(`     ✓ Pack ${packName}: ${pluginData.agents.length} agents validated against Theia Agent Plugin spec.`);
    }

    // 2. Verify AgentCoordinator correctly loaded all agents from plugin.json
    console.log('  -> Verifying AgentCoordinator discovery integration...');
    const registeredTags = Object.keys(coordinator.vaultAgents);
    assert.ok(registeredTags.length >= 25, `Expected at least 25 registered agents, found ${registeredTags.length}`);
    
    // Check specific subagents
    const sampleAgents = ['advisor', 'document', 'coc', 'evaluator', 'architecture', 'debugger'];
    for (const tag of sampleAgents) {
        assert.ok(coordinator.vaultAgents[tag], `Agent @${tag} should be registered in coordinator`);
    }
    console.log(`     ✓ Coordinator dynamically loaded all agents with full plugin metadata.`);

    console.log('  ✓ SUCCESS: All Theia Agent Plugin Manifests tests passed!\n');
}

module.exports = { run };
