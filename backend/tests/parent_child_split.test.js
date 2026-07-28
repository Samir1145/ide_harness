const assert = require('assert');
const path = require('path');
const fs = require('fs');
const bm25 = require('../lib/core/bm25');
const { ingestText } = require('../lib/pipeline/common/text_ingest');
const { retrieveContexts } = require('../lib/core/rag');
const { indexToSqlite, updateStatus } = require('../lib/daemon/watcher');

async function run() {
    console.log('[Parent-Child Split Unit Tests]');

    const tempDir = path.join(__dirname, '../tests/fixtures/mock-split-case');
    fs.mkdirSync(tempDir, { recursive: true });

    // Create a very long markdown document with two distinct headings.
    // We repeat the paragraph text 35 times so that SectionOne is over 8000 characters,
    // guaranteeing that the chunker splits it into multiple sub-chunks (>3000 chars threshold).
    const p1 = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(35);
    const p2 = 'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '.repeat(35);
    const p3 = 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. '.repeat(35);
    const p4 = 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum. '.repeat(35);
    
    const longContent = `# SectionOne\n\n${p1}\n\n${p2}\n\n${p3}\n\n${p4}\n\n# SectionTwo\nThis is a short second section.`;
    
    const filePath = path.join(tempDir, 'long_document.md');
    fs.writeFileSync(filePath, longContent);

    const bm25IndexFile = path.join(tempDir, 'concepts/bm25_index.json');
    fs.mkdirSync(path.dirname(bm25IndexFile), { recursive: true });
    
    const indexObj = bm25.loadIndex(bm25IndexFile);
    bm25.saveIndex(indexObj, bm25IndexFile);

    try {
        console.log('  -> Ingesting long document to trigger parent-child split...');
        const result = await ingestText(tempDir, filePath, indexObj, bm25IndexFile);
        
        // Also populate mock SQLite database since RAG retrieveContexts queries SQLite fts_chunks
        updateStatus(tempDir, 'long_document.md', 'indexed');
        indexToSqlite(tempDir, result);
        
        // Assertions:
        // 1. Check index contains split sub-chunks
        const loadedIndex = bm25.loadIndex(bm25IndexFile);
        const docKeys = Object.keys(loadedIndex.docLengths);
        
        console.log('--- Indexed Document IDs ---');
        console.log(docKeys);
        console.log('----------------------------');

        // Look for composite keys ending in ::0 or ::1
        const splitKeys = docKeys.filter(k => k.includes('::0') || k.includes('::1'));
        assert.ok(splitKeys.length >= 2, 'Should index split child sub-chunks with composite IDs');

        // 2. Test RAG retrieval resolving composite IDs
        console.log('  -> Verifying RAG retrieval resolves child parts back to the parent file...');
        const contexts = await retrieveContexts(tempDir, 'Lorem ipsum');
        
        assert.ok(contexts.length > 0, 'Should retrieve matching contexts');
        
        const hit = contexts[0];
        console.log(`Matched Context Title: "${hit.title}"`);
        assert.ok(hit.title.includes('[Part '), 'RAG context title should preserve child parts metadata');
        assert.ok(hit.content.length < longContent.length, 'Should only return the specific sub-chunk content, not the whole file');

        // Clean up
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        console.log('     ✓ Parent-Child split and retrieval verified successfully.');
    } catch (e) {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        throw e;
    }

    console.log('  ✓ SUCCESS: Parent-Child split validations passed!');
}

module.exports = { run };
