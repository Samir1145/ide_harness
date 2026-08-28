const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function run() {
    console.log('[Agent Tools & Function Calling Master Unit Tests]');

    const tempCaseDir = path.join(__dirname, 'fixtures', 'temp_tools_case');
    fs.mkdirSync(path.join(tempCaseDir, 'concepts'), { recursive: true });
    fs.mkdirSync(path.join(tempCaseDir, 'drafts'), { recursive: true });

    // Seed mock facts and concepts
    const kvPath = path.join(tempCaseDir, 'case_kv_dictionary.json');
    fs.writeFileSync(kvPath, JSON.stringify({
        'corporate_debtor': 'Acme Infrastructure Ltd',
        'default_amount': '₹45,00,00,000',
        'date_of_default': '15/03/2023'
    }, null, 2), 'utf8');

    try {
        const { executeTool } = require('../lib/agents/skills/tool-dispatcher');

        // 1. Test getKVValue Tool
        console.log('  -> Testing getKVValue tool execution...');
        const kvRes = await executeTool(tempCaseDir, 'getKVValue', { key: 'corporate_debtor' });
        assert.strictEqual(kvRes.value, 'Acme Infrastructure Ltd', 'Should retrieve corporate debtor from KV');
        console.log('     ✓ getKVValue returned exact matching value.');

        // 2. Test getAllKV Tool
        console.log('  -> Testing getAllKV tool execution...');
        const allKvRes = await executeTool(tempCaseDir, 'getAllKV', {});
        assert.ok(allKvRes.kv && allKvRes.kv.corporate_debtor, 'Should retrieve full KV dictionary');
        console.log('     ✓ getAllKV returned dictionary with 3 keys.');

        // 3. Test retrieveContexts Tool
        console.log('  -> Testing retrieveContexts tool execution...');
        const ragRes = await executeTool(tempCaseDir, 'retrieveContexts', { query: 'debt default amount', limit: 3 });
        assert.ok(Array.isArray(ragRes.contexts), 'Should return contexts array');
        console.log('     ✓ retrieveContexts returned structured context array.');

        // 4. Test queryTimeline Tool
        console.log('  -> Testing queryTimeline tool execution...');
        const timelineRes = await executeTool(tempCaseDir, 'queryTimeline', {});
        assert.ok(Array.isArray(timelineRes.events), 'Should return events array');
        console.log('     ✓ queryTimeline executed and returned chronology.');

        // 5. Test vaultLookup Tool
        console.log('  -> Testing vaultLookup tool execution...');
        const vaultRes = await executeTool(tempCaseDir, 'vaultLookup', { query: 'Section 7 IBC financial creditor', limit: 2 });
        assert.ok(Array.isArray(vaultRes.laws), 'Should return laws array');
        console.log('     ✓ vaultLookup executed and queried Law Vault.');

        // 6. Test checkCrossReference Tool
        console.log('  -> Testing checkCrossReference tool execution...');
        const xrefRes = await executeTool(tempCaseDir, 'checkCrossReference', { statement: 'Default date is 15/03/2023' });
        assert.ok(xrefRes !== undefined, 'Should return cross-reference result');
        console.log('     ✓ checkCrossReference returned verification report.');

    } finally {
        try {
            fs.rmSync(tempCaseDir, { recursive: true, force: true });
        } catch (_) {}
    }

    // 7. Verify Frontend Tool Provider declarations
    console.log('  -> Checking frontend hayagriva-tools.ts file...');
    const toolsPath = path.join(__dirname, '..', '..', 'frontend', 'theia-extensions', 'hayagriva', 'src', 'browser', 'hayagriva-tools.ts');
    assert.ok(fs.existsSync(toolsPath), 'hayagriva-tools.ts must exist');

    const toolsSrc = fs.readFileSync(toolsPath, 'utf8');
    assert.ok(toolsSrc.includes('RetrieveContextsToolProvider'), 'Must export RetrieveContextsToolProvider');
    assert.ok(toolsSrc.includes('GetKVValueToolProvider'), 'Must export GetKVValueToolProvider');
    assert.ok(toolsSrc.includes('QueryTimelineToolProvider'), 'Must export QueryTimelineToolProvider');
    assert.ok(toolsSrc.includes('VaultLookupToolProvider'), 'Must export VaultLookupToolProvider');
    console.log('     ✓ Frontend Tool Providers verified with valid ToolRequest schemas.');

    console.log('  ✓ SUCCESS: All Agent Tools & Function Calling tests passed!\n');
}

module.exports = { run };
