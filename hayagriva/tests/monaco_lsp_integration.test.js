const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { getDiagnostics } = require('../lib/core/lsp-service');

async function testLspIntegration() {
    console.log('[Test Monaco/LSP] Starting LSP integration tests...');
    
    // Create temporary workspace inside dev-scratch or current directory
    const testWorkspace = path.join(__dirname, 'temp_lsp_workspace');
    if (fs.existsSync(testWorkspace)) {
        fs.rmSync(testWorkspace, { recursive: true, force: true });
    }
    fs.mkdirSync(testWorkspace, { recursive: true });
    fs.mkdirSync(path.join(testWorkspace, 'concepts'), { recursive: true });

    try {
        // 1. Create main doc linking to a missing card
        const docUri = 'file://' + path.join(testWorkspace, 'main_doc.md');
        const docContent = `
# Title
See the [Payment Terms](concepts/payment_terms.md) for details.
Reference to valid statutory code: @@ibc/cirp/s7
`;
        fs.writeFileSync(path.join(testWorkspace, 'main_doc.md'), docContent, 'utf8');

        // Test diagnostics for missing link
        console.log('[Test Monaco/LSP] Verifying missing link diagnostics...');
        let diags = await getDiagnostics(testWorkspace, docUri, docContent);
        
        let missingLinkDiag = diags.find(d => d.message.includes('does not resolve to any document'));
        assert.ok(missingLinkDiag, 'Should report warning for completely missing relative link.');

        // 2. Create the file in a different path (simulate dynamic write/rebuild from Step 1)
        console.log('[Test Monaco/LSP] Creating referenced file in a sub-folder...');
        const actualCardPath = path.join(testWorkspace, 'concepts', 'deep_folder', 'payment_terms.md');
        fs.mkdirSync(path.dirname(actualCardPath), { recursive: true });
        fs.writeFileSync(actualCardPath, '# Payment Terms\nThis is the payment terms card.', 'utf8');

        // Wait brief moment to allow fs.watch to capture the file rename/addition event
        await new Promise(resolve => setTimeout(resolve, 300));

        // Test diagnostics again - it should now detect the file exists at a different location
        console.log('[Test Monaco/LSP] Verifying Legal Linker location suggestion...');
        diags = await getDiagnostics(testWorkspace, docUri, docContent);
        
        let relocationDiag = diags.find(d => d.message.includes('located at a different path'));
        assert.ok(relocationDiag, 'Should suggest correct relative path for relocated file.');
        assert.ok(relocationDiag.message.includes('concepts/deep_folder/payment_terms.md'), 
            `Suggestion should point to actual sub-folder path. Got: "${relocationDiag.message}"`);

        console.log('[Test Monaco/LSP] LSP Integration Tests PASSED successfully.');
    } finally {
        // Clean up
        try {
            fs.rmSync(testWorkspace, { recursive: true, force: true });
        } catch (_) {}
    }
}

// Export or run directly if executed as script
if (require.main === module) {
    testLspIntegration().catch(err => {
        console.error('[Test Monaco/LSP] Test FAILED:', err);
        process.exit(1);
    });
}

module.exports = testLspIntegration;
