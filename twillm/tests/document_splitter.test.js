const splitter = require('../lib/splitter');
const assert = require('assert');

function testParagraphBlockSplitter() {
    console.log('  -> Testing 8-paragraph chunk blocks fallback splitter...');
    
    // Simulate a document with 20 paragraphs
    const testMd = Array(20).fill('Paragraph block text content.').join('\n\n');
    const sections = splitter.splitByParagraphBlocks(testMd, 'doc.docx', 8);
    
    assert.strictEqual(sections.length, 3, '20 paragraphs divided by 8 should result in 3 chunks');
    assert.strictEqual(sections[0].title, 'Page 1', 'First chunk title should be Page 1');
    assert.strictEqual(sections[1].title, 'Page 2', 'Second chunk title should be Page 2');
    assert.strictEqual(sections[2].title, 'Page 3', 'Third chunk title should be Page 3');
    
    // Make sure content matches block chunk size
    const sec1Lines = sections[0].content.trim().split(/\r?\n\r?\n/);
    assert.strictEqual(sec1Lines.length, 9, 'First chunk should contain exactly 9 elements (1 page header + 8 paragraphs)');
    assert.strictEqual(sec1Lines[0], '## Page 1', 'First element must be the page header');
}

function testHeadingSplitter() {
    console.log('  -> Testing document heading-based splitter...');
    
    const testMd = `# Section 1\n\nSome paragraph text here.\n\n## Section 2\n\nSome more text here under sub-heading.`;
    const sections = splitter.splitByHeadings(testMd, 'doc.md');
    
    assert.strictEqual(sections.length, 2, 'Should divide by headings into 2 sections');
    assert.strictEqual(sections[0].title, 'Section 1');
    assert.strictEqual(sections[1].title, 'Section 2');
}

function run() {
    console.log('[Document Splitter Unit Tests]');
    testParagraphBlockSplitter();
    testHeadingSplitter();
}

module.exports = { run };
