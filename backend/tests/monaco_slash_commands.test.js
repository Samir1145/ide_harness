const assert = require('assert');
const fs = require('fs');
const path = require('path');
const routesModule = require('../lib/routes');

const docsRoot = path.join(__dirname, '..', '..');

async function run() {
    console.log('[Notion-Style Slash Commands Unit Tests]');

    // Ensure mock case and concepts folder structure exist for testing
    const caseName = 'Case_UnitTest_Slash';
    const caseDir = path.join(docsRoot, caseName);
    const conceptsDir = path.join(caseDir, 'concepts');
    const docName = 'test_contract';
    const docConceptsDir = path.join(conceptsDir, docName);

    if (!fs.existsSync(docConceptsDir)) {
        fs.mkdirSync(docConceptsDir, { recursive: true });
    }

    const mockConceptPath = path.join(docConceptsDir, 'Indemnity.md');
    fs.writeFileSync(mockConceptPath, '# Indemnity\nThis is mock indemnity fact card content.', 'utf8');
    console.log(`  -> Created mock split concept file at: ${mockConceptPath}`);

    try {
        console.log('  -> Verifying /api/hayagriva/concepts listing endpoint in-process...');
        const handler = routesModule['GET']['/api/hayagriva/concepts'];
        assert.ok(typeof handler === 'function', 'Concepts listing route handler should exist');

        let responseStatus = 0;
        let responseBody = '';
        const mockRes = {
            writeHead(status) {
                responseStatus = status;
            },
            end(data) {
                responseBody = data;
            }
        };
        const mockParsedUrl = {
            query: { case: caseName }
        };

        // Call route handler directly
        handler(null, mockRes, mockParsedUrl, docsRoot);

        assert.strictEqual(responseStatus, 200, 'HTTP response status should be 200');
        const parsed = JSON.parse(responseBody);
        
        assert.ok(parsed && parsed.concepts, 'Response body should contain concepts list');
        console.log(`     Found ${parsed.concepts.length} concepts in directory scan`);
        
        const found = parsed.concepts.find(c => c.title === 'Indemnity');
        assert.ok(found, 'Concepts list should contain "Indemnity" card');
        assert.strictEqual(found.relativePath, `concepts/${docName}/Indemnity.md`, 'Relative path should match folder hierarchy');

        console.log('     ✓ In-process concepts listing endpoint query succeeded.');

    } finally {
        // Cleanup temporary folders
        if (fs.existsSync(caseDir)) {
            fs.rmSync(caseDir, { recursive: true, force: true });
            console.log('  -> Cleaned up mock case directories.');
        }
    }

    console.log('  ✓ SUCCESS: Slash Commands & Concepts listing validations completed!');
}

module.exports = { run };
