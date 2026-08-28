const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function run() {
    console.log('[Track 2: Multi-Turn Context & Dynamic Memory Injection Unit Tests]');

    const tempCaseDir = path.join(__dirname, 'fixtures', 'temp_memory_case');
    const wikiDir = path.join(tempCaseDir, 'wiki');
    const qnaDir = path.join(wikiDir, 'qna');
    const conceptsDir = path.join(tempCaseDir, 'concepts');

    fs.mkdirSync(qnaDir, { recursive: true });
    fs.mkdirSync(conceptsDir, { recursive: true });

    // Seed mock wiki and concept notes
    fs.writeFileSync(path.join(wikiDir, 'case_summary.md'), '# Case Summary\nCorporate Debtor: Zenith Power Ltd underwent CIRP under Section 7 IBC.', 'utf8');
    fs.writeFileSync(path.join(qnaDir, 'coc_meeting_qna.md'), '# What was decided in the 4th CoC meeting?\n**Answer:** The CoC approved the evaluation matrix with 82% majority vote on 14/01/2024.', 'utf8');
    fs.writeFileSync(path.join(conceptsDir, 'debt_classification.md'), '# Debt Classification\nFinancial Debt: ₹120 Crore (Secured), Operational Debt: ₹15 Crore.', 'utf8');

    try {
        const { resolvePromptVariables, buildMemoryContext } = require('../lib/agents/skills/memory-injector');

        // 1. Test Prompt Variable Resolution
        console.log('  -> Testing template variable interpolation ({{caseName}}, {{memoryDirectory}}, {{activeFile}})...');
        const sampleTemplate = 'Case: {{caseName}} | Memory: {{memoryDirectory}} | Active: {{activeFile}}';
        const resolved = resolvePromptVariables(tempCaseDir, sampleTemplate, path.join(tempCaseDir, 'main.md'));
        
        assert.ok(resolved.includes(tempCaseDir), 'Should replace {{caseName}} with actual case directory path');
        assert.ok(resolved.includes(path.join(tempCaseDir, 'wiki')), 'Should replace {{memoryDirectory}} with wiki path');
        assert.ok(resolved.includes('main.md'), 'Should replace {{activeFile}} with active file path');
        console.log('     ✓ Template variables resolved correctly.');

        // 2. Test Dynamic Memory Injection Retrieval
        console.log('  -> Testing dynamic memory context builder from wiki and concepts...');
        const memoryContext = await buildMemoryContext(tempCaseDir, 'What happened in the 4th CoC meeting?');
        
        assert.ok(typeof memoryContext === 'string', 'Memory context must be a string');
        assert.ok(memoryContext.includes('4th CoC meeting') || memoryContext.includes('82% majority'), 'Must retrieve relevant CoC meeting Q&A note');
        console.log('     ✓ Dynamic memory context built and matched relevant Q&A notes.');

        // 3. Test Fallback when No Wiki Exists
        console.log('  -> Testing memory context builder on empty workspace...');
        const emptyDir = path.join(__dirname, 'fixtures', 'temp_empty_case');
        fs.mkdirSync(emptyDir, { recursive: true });
        try {
            const emptyMemory = await buildMemoryContext(emptyDir, 'test query');
            assert.strictEqual(emptyMemory, '', 'Should return empty string when no memory directory exists');
            console.log('     ✓ Graceful fallback on empty workspace verified.');
        } finally {
            try { fs.rmSync(emptyDir, { recursive: true, force: true }); } catch (_) {}
        }

    } finally {
        try {
            fs.rmSync(tempCaseDir, { recursive: true, force: true });
        } catch (_) {}
    }

    // 4. Verify Frontend Variable Contribution
    console.log('  -> Checking frontend hayagriva-variables.ts...');
    const varContribPath = path.join(__dirname, '..', '..', 'frontend', 'theia-extensions', 'hayagriva', 'src', 'browser', 'hayagriva-variables.ts');
    assert.ok(fs.existsSync(varContribPath), 'hayagriva-variables.ts must exist');
    
    const varSrc = fs.readFileSync(varContribPath, 'utf8');
    assert.ok(varSrc.includes('HayagrivaVariableContribution'), 'Must export HayagrivaVariableContribution');
    assert.ok(varSrc.includes('caseName'), 'Must register caseName variable');
    assert.ok(varSrc.includes('memoryDirectory'), 'Must register memoryDirectory variable');
    console.log('     ✓ Frontend VariableContribution properly configured.');

    console.log('  ✓ SUCCESS: All Track 2 Memory Injection & Context tests passed!\n');
}

module.exports = { run };
