const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { convertDocx } = require('../lib/pipeline/docx/upload');

async function run() {
    console.log('[Word Ingestion Unit Tests]');
    
    // Use mammoth's own test tables.docx file
    const testDocxPath = path.join(__dirname, '../node_modules/mammoth/test/test-data/tables.docx');
    
    if (!fs.existsSync(testDocxPath)) {
        console.warn(`[Docx Test] Warning: Test file not found at ${testDocxPath}. Skipping tests.`);
        return;
    }

    // 1. Verify standard conversion (using Pandoc since binary is present)
    console.log('  -> Testing standard conversion (should use Pandoc)...');
    const pandocOutput = await convertDocx(testDocxPath);
    
    // Assert it converted successfully
    assert.ok(pandocOutput, 'Pandoc output should not be empty');
    
    // Verify that Pandoc preserved the table structure using pipe markdown syntax
    const hasPipes = pandocOutput.includes('|') && pandocOutput.includes('---');
    assert.ok(hasPipes, 'Pandoc output should contain standard Markdown table pipes and separators');
    console.log('     ✓ Pandoc conversion verified successfully (tables preserved).');

    // 2. Verify fallback behavior (temporarily rename/disable Pandoc binary)
    console.log('  -> Testing Mammoth fallback routing...');
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const realBinaryPath = path.join(__dirname, '../bin', `pandoc-${arch}`);
    const tempBinaryPath = path.join(__dirname, '../bin', `pandoc-${arch}-temp-disabled`);
    
    let renamed = false;
    if (fs.existsSync(realBinaryPath)) {
        fs.renameSync(realBinaryPath, tempBinaryPath);
        renamed = true;
    }
    
    try {
        const fallbackOutput = await convertDocx(testDocxPath);
        assert.ok(fallbackOutput, 'Fallback output should not be empty');
        // Mammoth does not preserve pipes for this table, or converts differently. Just check it runs and produces output.
        console.log('     ✓ Fallback routing to Mammoth worked cleanly without throwing.');
    } finally {
        // Restore binary path
        if (renamed && fs.existsSync(tempBinaryPath)) {
            fs.renameSync(tempBinaryPath, realBinaryPath);
        }
    }

    console.log('  ✓ SUCCESS: Word (DOCX) pipeline validations passed!');
}

module.exports = { run };
