const assert = require('assert');
const path = require('path');
const fs = require('fs');
const coordinator = require('../lib/agents/agent-coordinator');

async function run() {
    console.log('[Chat Modes & AI Configuration Categories Unit Tests]');

    // 1. Verify AiConfigurationCategory scaffold exists and exports required categories
    console.log('  -> Checking AiConfigurationCategory scaffold file...');
    const configPath = path.join(__dirname, '..', '..', 'frontend', 'theia-extensions', 'hayagriva', 'src', 'browser', 'ai-configuration-category.ts');
    assert.ok(fs.existsSync(configPath), 'ai-configuration-category.ts must exist');

    const configSrc = fs.readFileSync(configPath, 'utf8');
    assert.ok(configSrc.includes('export const AiConfigurationCategory'), 'Must export AiConfigurationCategory symbol');
    assert.ok(configSrc.includes('HayagrivaEngineCategoryContribution'), 'Must export HayagrivaEngineCategoryContribution');
    assert.ok(configSrc.includes('HayagrivaAgentsCategoryContribution'), 'Must export HayagrivaAgentsCategoryContribution');
    assert.ok(configSrc.includes('HayagrivaRagCategoryContribution'), 'Must export HayagrivaRagCategoryContribution');
    console.log('     ✓ AiConfigurationCategory scaffold and 3 category contributions verified.');

    // 2. Verify chat-agents.ts exports ChatModes, tags, and variables
    console.log('  -> Checking chat-agents.ts for ChatModes and metadata...');
    const agentsPath = path.join(__dirname, '..', '..', 'frontend', 'theia-extensions', 'hayagriva', 'src', 'browser', 'chat-agents.ts');
    assert.ok(fs.existsSync(agentsPath), 'chat-agents.ts must exist');

    const agentsSrc = fs.readFileSync(agentsPath, 'utf8');
    assert.ok(agentsSrc.includes('ChatMode'), 'Must import and reference ChatMode');
    assert.ok(agentsSrc.includes("tags = ['legal', 'research', 'precedents']"), 'Advisor must declare tags');
    assert.ok(agentsSrc.includes("tags = ['statutory', 'compliance', 'forms']"), 'Forms must declare tags');
    assert.ok(agentsSrc.includes("tags = ['litigation', 'petitions', 'drafting']"), 'Document must declare tags');
    assert.ok(agentsSrc.includes("mode: activeMode"), 'invoke must forward mode in payload');
    console.log('     ✓ ChatModes, tags, and request mode forwarding verified in frontend agents.');

    // 3. Verify Agent Coordinator receives and forwards mode in options
    console.log('  -> Testing coordinator execution with explicit mode option...');
    const tempCaseDir = path.join(__dirname, 'fixtures', 'temp_mode_case');
    fs.mkdirSync(path.join(tempCaseDir, 'drafts'), { recursive: true });

    try {
        const testRes = await coordinator.run(tempCaseDir, 'draft section 7 petition', [], '@document', { mode: 'plan' });
        assert.ok(testRes && typeof testRes === 'string', 'Coordinator should return a string response');
        console.log('     ✓ Coordinator executed @document in "plan" mode successfully.');
    } finally {
        try {
            fs.rmSync(tempCaseDir, { recursive: true, force: true });
        } catch (_) {}
    }

    // 4. Verify hayagriva-frontend-module.ts binds AiConfigurationCategory
    console.log('  -> Checking frontend module for AiConfigurationCategory bindings...');
    const modulePath = path.join(__dirname, '..', '..', 'frontend', 'theia-extensions', 'hayagriva', 'src', 'browser', 'hayagriva-frontend-module.ts');
    const moduleSrc = fs.readFileSync(modulePath, 'utf8');
    assert.ok(moduleSrc.includes('AiConfigurationCategory'), 'Must bind AiConfigurationCategory in frontend module');
    assert.ok(moduleSrc.includes('HayagrivaEngineCategoryContribution'), 'Must bind HayagrivaEngineCategoryContribution');
    console.log('     ✓ Frontend module DI bindings for AI Configuration Categories verified.');

    console.log('  ✓ SUCCESS: Chat Modes & AI Configuration Categories unit tests passed!\n');
}

module.exports = { run };
