const assert = require('assert');
const path = require('path');
const fs = require('fs');

// We will add exports to watcher.js for tree building helpers to test them cleanly.
const watcher = require('../lib/daemon/watcher');

function runTests() {
    console.log('[PageIndex Tree Unit Tests]');
    
    // We will test if the exported buildPageIndexTree construct correct hierarchies.
    if (typeof watcher.buildPageIndexTree !== 'function') {
        console.log('  -> Skiping tests (buildPageIndexTree not exported).');
        return;
    }

    console.log('  -> Testing tree generation from mock sections...');
    
    const mockSections = [
        { title: 'Chapter 1', level: 1, content: 'Introduction content here.', pageIndex: 2 },
        { title: 'Section 1.1', level: 2, content: 'Subsection content.', pageIndex: 3 },
        { title: 'Section 1.2', level: 2, content: 'More subsection content.', pageIndex: 5 },
        { title: 'Chapter 2', level: 1, content: 'Second chapter.', pageIndex: 8 }
    ];

    const result = watcher.buildPageIndexTree('TestDoc', mockSections, 'Raw document text');
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.tree.title, 'TestDoc');
    assert.strictEqual(result.tree.level, 0);
    assert.strictEqual(result.tree.children.length, 2); // Chapter 1 & Chapter 2
    
    const ch1 = result.tree.children[0];
    assert.strictEqual(ch1.title, 'Chapter 1');
    assert.strictEqual(ch1.children.length, 2); // Section 1.1 & Section 1.2
    
    const sec11 = ch1.children[0];
    assert.strictEqual(sec11.title, 'Section 1.1');
    assert.strictEqual(sec11.parentId, ch1.id);
    
    // Verify page bounds propagation bottom-up
    // Chapter 1 pageStart should be min of children (Section 1.1 starts at 3, Chapter 1 section starts at 2)
    assert.strictEqual(ch1.pageStart, 2);
    assert.strictEqual(ch1.pageEnd, 5); // Max page index of children is Section 1.2 (page 5)
    
    // Document root page bounds
    assert.strictEqual(result.tree.pageStart, 1); // Document root default pageStart is 1
    assert.strictEqual(result.tree.pageEnd, 8); // Max of all children (Chapter 2 pageIndex 8)

    console.log('  -> Testing fallback summary generator...');
    const mockContent = 'First sentence of the text. Second sentence of the text. Third sentence of the text.';
    const summary = watcher.generateFallbackSummary(mockContent);
    assert.strictEqual(summary, 'First sentence of the text. Second sentence of the text.');

    console.log('  ✓ SUCCESS: PageIndex Tree generation tests passed!');
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
