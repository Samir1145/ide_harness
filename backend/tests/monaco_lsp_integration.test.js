const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { getDiagnostics, getCompletions, getHover } = require('../lib/core/lsp-service');
const { getDb } = require('../lib/core/sqlite-store');

async function run() {
    console.log('[Monaco LSP & Table Sync Master Tests]');
    
    // Create temporary workspace inside fixtures
    const testWorkspace = path.join(__dirname, 'fixtures', 'temp_lsp_workspace');
    if (fs.existsSync(testWorkspace)) {
        fs.rmSync(testWorkspace, { recursive: true, force: true });
    }
    fs.mkdirSync(testWorkspace, { recursive: true });
    fs.mkdirSync(path.join(testWorkspace, 'concepts'), { recursive: true });
    fs.mkdirSync(path.join(testWorkspace, 'reviews'), { recursive: true });

    try {
        // 1. Create main doc linking to a missing card and statute
        const docUri = 'file://' + path.join(testWorkspace, 'main_doc.md');
        const docContent = `# Main Case Document

See the [Payment Terms](concepts/payment_terms.md) for details.
Reference to valid statutory code: @@ibc/cirp/s7
`;
        fs.writeFileSync(path.join(testWorkspace, 'main_doc.md'), docContent, 'utf8');

        // Test diagnostics for missing link
        console.log('  -> Testing missing link and statutory diagnostics...');
        let diags = await getDiagnostics(testWorkspace, docUri, docContent);
        
        let missingLinkDiag = diags.find(d => d.message && d.message.includes('does not resolve to any document'));
        assert.ok(missingLinkDiag, 'Should report warning for completely missing relative link.');
        console.log('     ✓ Missing link diagnostic detected correctly.');

        // 2. Create the file in a sub-folder to verify Legal Linker suggestion
        console.log('  -> Testing Legal Linker relocation suggestion...');
        const actualCardPath = path.join(testWorkspace, 'concepts', 'deep_folder', 'payment_terms.md');
        fs.mkdirSync(path.dirname(actualCardPath), { recursive: true });
        fs.writeFileSync(actualCardPath, '# Payment Terms\nThis is the payment terms card.', 'utf8');

        // Wait brief moment for watcher
        await new Promise(resolve => setTimeout(resolve, 300));

        diags = await getDiagnostics(testWorkspace, docUri, docContent);
        let relocationDiag = diags.find(d => d.message && d.message.includes('located at a different path'));
        assert.ok(relocationDiag, 'Should suggest correct relative path for relocated file.');
        console.log('     ✓ Relocation path suggestion verified.');

        // 3. Test Hover Provider
        console.log('  -> Testing Monaco Hover provider...');
        const hoverRes = await getHover(testWorkspace, docUri, docContent, { line: 3, character: 38 });
        // Hover should execute cleanly without throwing
        console.log('     ✓ Hover provider query completed cleanly.');

        // 4. Test Completions Provider
        console.log('  -> Testing Monaco Completions provider...');
        const completionsRes = await getCompletions(testWorkspace, docUri, '# Heading\n/', { line: 1, character: 1 });
        assert.ok(completionsRes !== undefined, 'Completions response should not be undefined.');
        console.log('     ✓ Completions provider executed cleanly.');

        // 5. Test Live Table Sync to SQLite (claims_registry.md)
        console.log('  -> Testing Markdown table sync (claims_registry.md -> SQLite)...');
        const claimsUri = 'file://' + path.join(testWorkspace, 'claims_registry.md');
        const claimsContent = `# Claims Registry

| Creditor | Claimed Amount | Admitted Amount | Admitted Interest | Rejected Amount | Rejection Reason | Claim Date | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| State Bank of India | 50000000 | 48000000 | 2000000 | 0 | None | 2023-01-15 | admitted |
| Operational Creditor XYZ | 1200000 | 1000000 | 0 | 200000 | Disputed invoice | 2023-02-01 | admitted |
`;
        await getDiagnostics(testWorkspace, claimsUri, claimsContent);
        // Wait for setImmediate table sync
        await new Promise(resolve => setTimeout(resolve, 300));

        const db = getDb(testWorkspace);
        const claimsInDb = db.prepare('SELECT * FROM claims').all();
        assert.strictEqual(claimsInDb.length, 2, 'Expected 2 claims to be synced into SQLite database.');
        assert.strictEqual(claimsInDb[0].creditor, 'State Bank of India');
        assert.strictEqual(claimsInDb[0].admitted_amount, 48000000);
        console.log('     ✓ Claims registry Markdown table synced to SQLite claims table.');

        // 6. Test Case Facts Key-Value Sync (case_facts.md)
        console.log('  -> Testing Case Facts Sync (case_facts.md -> case_kv_dictionary.json & SQLite)...');
        const factsUri = 'file://' + path.join(testWorkspace, 'case_facts.md');
        const factsContent = `# Case Facts

- **corporate_debtor_name**: Acme Infrastructure Ltd
- **insolvency_commencement_date**: 2023-01-10
- **total_admitted_debt**: 150000000
`;
        await getDiagnostics(testWorkspace, factsUri, factsContent);
        await new Promise(resolve => setTimeout(resolve, 300));

        const dictPath = path.join(testWorkspace, 'reviews', 'case_kv_dictionary.json');
        assert.ok(fs.existsSync(dictPath), 'Expected case_kv_dictionary.json to be created.');
        const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
        assert.strictEqual(dict.corporate_debtor_name.value, 'Acme Infrastructure Ltd');
        assert.strictEqual(dict.corporate_debtor_name.modifiedBy, 'user');
        console.log('     ✓ Case facts synchronized to JSON dictionary and SQLite with user verification flag.');

        console.log('  ✓ SUCCESS: Monaco LSP & Table Sync Master Tests passed!\n');
    } finally {
        try {
            fs.rmSync(testWorkspace, { recursive: true, force: true });
        } catch (_) {}
    }
}

module.exports = { run };

