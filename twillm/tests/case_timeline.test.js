const timeline = require('../lib/timeline');
const assert = require('assert');

function testDateParsing() {
    console.log('  -> Testing timeline date parsing (Indian & standard formats)...');
    
    assert.strictEqual(timeline.parseToSortableDate('15.03.2023'), '2023-03-15');
    assert.strictEqual(timeline.parseToSortableDate('22/06/2023'), '2023-06-22');
    assert.strictEqual(timeline.parseToSortableDate('15 March 2023'), '2023-03-15');
    assert.strictEqual(timeline.parseToSortableDate('March 15, 2023'), '2023-03-15');
    assert.strictEqual(timeline.parseToSortableDate('2023-03-15'), '2023-03-15');
}

function testDateExtractionAndContext() {
    console.log('  -> Testing chronology date and context extraction...');
    
    const timelineMd = 'Insolvency began on 15.03.2023. The resolution plan was approved on March 15, 2024. Other sentence here.';
    const dates = timeline.extractDates(timelineMd);
    
    assert.strictEqual(dates.length, 2, 'Should extract exactly 2 date occurrences');
    assert.strictEqual(dates[0].sortableDate, '2023-03-15');
    assert.strictEqual(dates[1].sortableDate, '2024-03-15');
    assert.ok(dates[0].context.includes('15.03.2023'), 'First date context is missing the date string');
    assert.ok(dates[1].context.includes('March 15, 2024'), 'Second date context is missing the date string');
}

function run() {
    console.log('[Case Timeline Unit Tests]');
    testDateParsing();
    testDateExtractionAndContext();
}

module.exports = { run };
