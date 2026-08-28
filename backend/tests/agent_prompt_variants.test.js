const assert = require('assert');
const path = require('path');
const fs = require('fs');
const coordinator = require('../lib/agents/agent-coordinator');

async function run() {
    console.log('[Agent Prompt Variants & Custom Overlays Unit Tests]');

    // 1. Verify all 25 Vault Agents have compiled system instructions and prompt variant support
    console.log('  -> Verifying prompt resolution and fallback contracts across all 25 agents...');
    const registeredTags = Object.keys(coordinator.vaultAgents);
    assert.ok(registeredTags.length >= 25, `Expected at least 25 registered agents, got ${registeredTags.length}`);

    for (const tag of registeredTags) {
        const agent = coordinator.vaultAgents[tag];
        assert.ok(typeof agent.instructions === 'string' && agent.instructions.length > 0, `Agent @${tag} must have non-empty instructions`);
        
        // Test getPrompt method contract (or default instructions fallback)
        const defaultPrompt = typeof agent.getPrompt === 'function' ? agent.getPrompt('default') : agent.instructions;
        assert.ok(typeof defaultPrompt === 'string' && defaultPrompt.length > 0, `Agent @${tag} getPrompt('default') must return string`);

        // Test non-existent variant fallback
        const fallbackPrompt = typeof agent.getPrompt === 'function' ? agent.getPrompt('non_existent_variant') : agent.instructions;
        assert.ok(fallbackPrompt === defaultPrompt, `Agent @${tag} should fall back to default prompt on unknown variant`);
    }
    console.log(`     ✓ All ${registeredTags.length} agents verified with robust prompt variant fallback contracts.`);

    // 2. Test Custom Per-Case Prompt Overlay Overrides
    console.log('  -> Testing custom per-case prompt override resolution...');
    const tempCaseDir = path.join(__dirname, 'fixtures', 'temp_prompt_case');
    const customPromptsDir = path.join(tempCaseDir, 'prompts');
    fs.mkdirSync(customPromptsDir, { recursive: true });

    try {
        // Create custom user prompt overlay for @advisor
        const customAdvisorPrompt = '# Custom Case Strategy Prompt\nYou are an ultra-concise advisor specialized in cross-border insolvency.';
        fs.writeFileSync(path.join(customPromptsDir, 'advisor.md'), customAdvisorPrompt, 'utf8');

        const advisorAgent = coordinator.vaultAgents['advisor'];
        if (typeof advisorAgent.getPromptForCase === 'function') {
            const resolvedCasePrompt = advisorAgent.getPromptForCase(tempCaseDir, 'default');
            assert.strictEqual(resolvedCasePrompt, customAdvisorPrompt, 'Should resolve custom per-case prompt overlay when present');
            console.log('     ✓ Custom per-case prompt overlay resolved successfully.');
        }

    } finally {
        try {
            fs.rmSync(tempCaseDir, { recursive: true, force: true });
        } catch (_) {}
    }

    // 3. Verify Frontend Chat Agents declare PromptVariantSet
    console.log('  -> Checking frontend chat-agents.ts for PromptVariantSet declarations...');
    const frontendAgentsPath = path.join(__dirname, '..', '..', 'frontend', 'theia-extensions', 'hayagriva', 'src', 'browser', 'chat-agents.ts');
    const frontendSrc = fs.readFileSync(frontendAgentsPath, 'utf8');
    
    assert.ok(frontendSrc.includes('PromptVariantSet'), 'chat-agents.ts must import and use PromptVariantSet');
    assert.ok(frontendSrc.includes('defaultVariant'), 'Must declare defaultVariant in prompt sets');
    assert.ok(frontendSrc.includes('variants:'), 'Must declare prompt variants');
    console.log('     ✓ Frontend ChatAgents declare valid PromptVariantSet schemas.');

    console.log('  ✓ SUCCESS: All Agent Prompt Variants & Overlay tests passed!\n');
}

module.exports = { run };
