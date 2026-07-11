const assert = require('assert');
const path = require('path');
const fs = require('fs');
const bm25 = require('../lib/core/bm25');
const { ingestText } = require('../lib/pipeline/common/text_ingest');
const { parseMarkdownWithFrontmatter } = require('../lib/utils/okf');

async function run() {
    console.log('[Concept Enrichment Unit Tests]');

    const tempDir = path.join(__dirname, '../tests/fixtures/mock-enrich-case');
    fs.mkdirSync(tempDir, { recursive: true });

    // We write a mock document that establishes headings and cross-references.
    // We reference "Insolvency Professional" inside the "Scope" section.
    const markdownContent = `
# Insolvency Professional
This section describes the roles and responsibilities of the Insolvency Professional.

# Services Agreement
## Scope
The scope of work involves contracting an Insolvency Professional to manage assets.
`;

    const filePath = path.join(tempDir, 'services_doc.md');
    fs.writeFileSync(filePath, markdownContent);

    const bm25IndexFile = path.join(tempDir, 'concepts/bm25_index.json');
    fs.mkdirSync(path.dirname(bm25IndexFile), { recursive: true });
    
    const indexObj = bm25.loadIndex(bm25IndexFile);
    bm25.saveIndex(indexObj, bm25IndexFile);

    try {
        console.log('  -> Ingesting document to verify Upgrade A & B...');
        await ingestText(tempDir, filePath, indexObj, bm25IndexFile);

        // Verification A: Check that the hierarchical card "Scope" contains ancestors
        const scopeCardPath = path.join(tempDir, 'concepts/services_doc/Scope.md');
        assert.ok(fs.existsSync(scopeCardPath), 'Scope concept card file should be generated');

        const scopeContent = fs.readFileSync(scopeCardPath, 'utf8');
        const parsedScope = parseMarkdownWithFrontmatter(scopeContent);
        
        console.log('--- Scope Frontmatter ---');
        console.log(JSON.stringify(parsedScope.frontmatter, null, 2));
        console.log('-------------------------');

        // Assert Upgrade A: Ancestors stack must be present and correct
        assert.ok(Array.isArray(parsedScope.frontmatter.ancestors), 'Ancestors metadata should be an array');
        assert.deepStrictEqual(parsedScope.frontmatter.ancestors, ['services_doc', 'Services Agreement'], 'Ancestors stack should preserve path hierarchy');

        // Assert Upgrade B: Auto-Concept Linking should match "Insolvency Professional"
        assert.ok(Array.isArray(parsedScope.frontmatter.links), 'Links metadata should be an array');
        assert.ok(parsedScope.frontmatter.links.includes('Insolvency Professional'), 'Links metadata should auto-link keyword mentions of other concepts');

        // Clean up
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        console.log('     ✓ Ancestors stack and auto-concept linking verified successfully.');
    } catch (e) {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        throw e;
    }

    console.log('  ✓ SUCCESS: Concept Enrichment validations passed!');
}

module.exports = { run };
