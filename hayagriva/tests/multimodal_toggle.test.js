const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { ingestPdf } = require('../lib/pipeline/pdf/ingest');

async function run() {
    console.log('[Multimodal Toggle Unit Tests]');
    
    // Use an existing test PDF fixture from the repository
    const samplePdf = path.join(__dirname, '../tests/rbi_regulations.pdf');
    const targetPdf = fs.existsSync(samplePdf) ? samplePdf : (fs.existsSync('/Users/atulgrover/Documents/Atty1/rbi_regulations.pdf') ? '/Users/atulgrover/Documents/Atty1/rbi_regulations.pdf' : null);
    
    if (!targetPdf) {
        console.warn('[Multimodal Test] Warning: No test PDF found. Skipping tests.');
        return;
    }

    // Mock the Google Gemini API key
    const originalApiKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'mock-api-key';
    
    // Mock the convertPdfVisually function inside the multimodal_parser module
    const parserMod = require('../lib/utils/multimodal_parser');
    const originalConvertPdfVisually = parserMod.convertPdfVisually;
    
    let convertVisuallyCalled = false;
    parserMod.convertPdfVisually = async (filePath, apiKey) => {
        convertVisuallyCalled = true;
        return '# Mock Multimodal Visual Conversion\nThis document was converted visually by Gemini.';
    };
    
    try {
        console.log('  -> Ingesting PDF with multimodal: true options...');
        const caseDir = path.join(__dirname, '../tests/fixtures/mock-case');
        fs.mkdirSync(caseDir, { recursive: true });
        
        const result = await ingestPdf(caseDir, targetPdf, { multimodal: true });
        
        assert.ok(convertVisuallyCalled, 'convertPdfVisually should have been called');
        assert.strictEqual(result.isPartial, false, 'Ingestion should be complete (not partial) when multimodal is forced');
        
        // Clean up mock generated markdown file
        if (fs.existsSync(result.companionPath)) {
            fs.unlinkSync(result.companionPath);
        }
        if (fs.existsSync(caseDir)) {
            fs.rmSync(caseDir, { recursive: true, force: true });
        }
        
        console.log('     ✓ Multimodal toggle integration verified successfully.');
    } finally {
        // Restore original functions and env keys
        parserMod.convertPdfVisually = originalConvertPdfVisually;
        process.env.GEMINI_API_KEY = originalApiKey;
    }
    
    console.log('  ✓ SUCCESS: Multimodal Ingestion toggle validations passed!');
}

module.exports = { run };
