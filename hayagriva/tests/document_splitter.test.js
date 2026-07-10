const splitter = require('../lib/splitter');
const converter = require('../lib/converter');
const assert = require('assert');
const fs = require('fs');

function testParagraphBlockSplitter() {
    console.log('  -> Testing 8-paragraph chunk blocks fallback splitter...');
    
    const testMd = Array(20).fill('Paragraph block text content.').join('\n\n');
    const sections = splitter.splitByParagraphBlocks(testMd, 'doc.docx', 8);
    
    assert.strictEqual(sections.length, 3, '20 paragraphs divided by 8 should result in 3 chunks');
    assert.strictEqual(sections[0].title, 'Page 1', 'First chunk title should be Page 1');
    assert.strictEqual(sections[1].title, 'Page 2', 'Second chunk title should be Page 2');
    assert.strictEqual(sections[2].title, 'Page 3', 'Third chunk title should be Page 3');
    
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

function testCompileHeadingRegex() {
    console.log('  -> Testing LLM layout profiler compileHeadingRegex (all 7 categories)...');

    // Category A: Numeric decimal hierarchy
    const rxA = splitter.compileHeadingRegex('A');
    assert.ok(rxA.test('1.1 Introduction'), 'Category A must match "1.1 Introduction"');
    assert.ok(rxA.test('2.3.4 Sub-section'), 'Category A must match "2.3.4 Sub-section"');
    assert.ok(!rxA.test('This is a plain paragraph.'), 'Category A must not match plain text');

    // Category B: Standard legal prefix
    const rxB = splitter.compileHeadingRegex('B');
    assert.ok(rxB.test('Chapter 1 Overview'), 'Category B must match "Chapter 1 Overview"');
    assert.ok(rxB.test('Section 12A Definitions'), 'Category B must match "Section 12A"');
    assert.ok(rxB.test('Annexure VI'), 'Category B must match "Annexure VI"');
    assert.ok(!rxB.test('1.1 Sub-section'), 'Category B must not match numeric headings');

    // Category C: All-capital headers
    const rxC = splitter.compileHeadingRegex('C');
    assert.ok(rxC.test('INTRODUCTION'), 'Category C must match "INTRODUCTION"');
    assert.ok(rxC.test('BOARD OF DIRECTORS'), 'Category C must match all-caps multi-word');
    assert.ok(!rxC.test('Introduction to the Act'), 'Category C must not match mixed-case');

    // Category D: Custom word prefix
    const rxD = splitter.compileHeadingRegex('D', 'Sutra');
    assert.ok(rxD.test('Sutra 1 The Principle'), 'Category D must match "Sutra 1"');
    assert.ok(!rxD.test('Chapter 1 Overview'), 'Category D must not match wrong prefix');

    const rxD2 = splitter.compileHeadingRegex('D', 'Pillar');
    assert.ok(rxD2.test('Pillar II Capital Adequacy'), 'Category D must match "Pillar II"');

    const rxDNull = splitter.compileHeadingRegex('D', '');
    assert.strictEqual(rxDNull, null, 'Category D without prefix must return null');

    // Category E: Roman numeral / letter enumeration
    const rxE = splitter.compileHeadingRegex('E');
    assert.ok(rxE.test('I. Preamble'), 'Category E must match "I. Preamble"');
    assert.ok(rxE.test('(a) Definitions'), 'Category E must match "(a) Definitions"');
    assert.ok(!rxE.test('Plain paragraph text here.'), 'Category E must not match plain text');

    // Category F: Circular/notification number headers
    const rxF = splitter.compileHeadingRegex('F');
    assert.ok(rxF.test('Circular No. RBI/2024-25/45'), 'Category F must match RBI circular');
    assert.ok(rxF.test('Notification No. FEMA.20(R)'), 'Category F must match FEMA notification');

    // Category G: No headings fallback
    const rxG = splitter.compileHeadingRegex('G');
    assert.strictEqual(rxG, null, 'Category G must return null (triggers paragraph fallback)');

    // Test dynamic splitDocument with injected Category B regex
    const testMd = 'Chapter 1 Overview\n\nSome legal content here.\n\nChapter 2 Definitions\n\nMore legal content here.';
    const sections = splitter.splitDocument(testMd, 'test.pdf', 'default', 'option_1', '', rxB);
    assert.ok(sections.length >= 2, 'splitDocument with Category B regex must produce >= 2 sections');
    assert.ok(sections[0].title.includes('Chapter 1'), 'First section must be Chapter 1');

    console.log('  -> compileHeadingRegex: All 7 categories verified correctly.');
}

async function testLazyConverter() {
    console.log('  -> Testing lazy PDF converter option with 3 page limit...');
    const testPdf = '/Users/atulgrover/Documents/Atty1/rbi_regulations.pdf';
    
    if (fs.existsSync(testPdf)) {
        const partialMd = await converter.convertToMarkdown(testPdf, { limit: 3 });
        assert.strictEqual(partialMd.isPartial, true, 'isPartial flag must be set to true');
        assert.strictEqual(partialMd.pages.length, 3, 'pages array length must match limit of 3');
        assert.ok(partialMd.totalPages > 3, 'totalPages count must reflect total PDF pages count');
        
        const blockMd = await converter.convertPdfBlock(testPdf, 4, 6);
        assert.ok(blockMd.includes('## Page 4'), 'blockMd must contain Page 4 header');
        assert.ok(blockMd.includes('## Page 6'), 'blockMd must contain Page 6 header');
    }
}

async function run() {
    console.log('[Document Splitter Unit Tests]');
    testParagraphBlockSplitter();
    testHeadingSplitter();
    testCompileHeadingRegex();
    await testLazyConverter();
}

module.exports = { run };
