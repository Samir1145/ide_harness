'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  serializeTidCard,
  parseTidCard,
  sliceMarkdownToTidCards,
  generateCaseWikiForPdf
} = require('../lib/pipeline/wiki/split');

async function runTests() {
  console.log('🧪 Starting Phase 2: Ingestion Slicing & .tid Storage Unit Tests...\n');

  // Test 1: RFC 822 .tid serialization and parsing round-trip
  console.log('Test 1: Verifying RFC 822 .tid serialization & parsing round-trip...');
  const cardData = {
    title: 'Paragraph 1: Ownership of SCO',
    tags: 'Pleading CommercialCourt Exhibit',
    type: 'text/x-markdown',
    doc: 'Rent_Suit_2026',
    order: 1,
    created: '20260928120000000',
    modified: '20260928120500000',
    text: '1. That the Plaintiffs are absolute owners of the demised commercial premises.'
  };

  const serialized = serializeTidCard(cardData);
  assert(serialized.includes('title: Paragraph 1: Ownership of SCO'), 'Must have title header');
  assert(serialized.includes('type: text/x-markdown'), 'Must have type header');
  assert(serialized.includes('doc: Rent_Suit_2026'), 'Must have doc header');
  assert(serialized.includes('order: 1'), 'Must have order header');
  assert(serialized.includes('\n\n1. That the Plaintiffs'), 'Headers and body separated by double newline');

  const parsed = parseTidCard(serialized);
  assert.strictEqual(parsed.title, cardData.title, 'Title must match');
  assert.strictEqual(parsed.type, 'text/x-markdown', 'Type must match');
  assert.strictEqual(parsed.doc, 'Rent_Suit_2026', 'Doc must match');
  assert.strictEqual(parsed.order, 1, 'Order must match');
  assert.strictEqual(parsed.text, cardData.text, 'Text body must match');
  console.log('  ✓ RFC 822 .tid card serialization and parsing verified.');

  // Test 2: Slicing legal Markdown with paragraphs, tables, and exhibits
  console.log('Test 2: Slicing companion Markdown into structured card objects...');
  const samplePleadingMd = `
1. That the Plaintiffs are lawful co-owners of SCO No. 123-124, Sector 17, Chandigarh.
2. That vide registered Lease Deed dated 15.01.2018, the premises was demised to Defendant No. 1. Photocopy of Lease Deed is marked as Ex P-1.

10. That the Defendants are not ready to pay the arrears of rent. As per the table, the following arrears of rent are recoverable:

| Period | Months | Monthly Rent | Rent Due |
| --- | --- | --- | --- |
| Oct-23 to Aug-24 | 11 | 14,58,608 | 70,93,422 |
| Sep-24 to Jul-25 | 11 | 15,31,538 | 78,95,656 |
| **Total Rent** | | | **1,49,89,078** |

11. That the Defendants are habitual defaulters. Photocopies of the assessment orders are attached herewith as Ex P-8 dated 13.09.2021 and Ex P-9 dated 11.03.2026.
14. That the premises in question is situated at Chandigarh and therefore, this Hon'ble Court has jurisdiction to entertain and try the present suit.
15. That in the present suit for recovery of Rs. 2,62,75,834/- is sought, therefore, the value of the suit for the purposes of court fee is affixed.
`;

  const cards = sliceMarkdownToTidCards(samplePleadingMd, 'RentRecovery');
  assert(Array.isArray(cards), 'Cards must be an array');
  assert(cards.length >= 5, `Expected at least 5 cards, got ${cards.length}`);

  // Verify paragraph 10 has Table Financial tags
  const para10 = cards.find(c => c.title.includes('Paragraph 10'));
  assert(para10, 'Must have Paragraph 10 card');
  assert(para10.tags.includes('Table'), 'Paragraph 10 must have Table tag');
  assert(para10.tags.includes('Financial'), 'Paragraph 10 must have Financial tag');
  assert(para10.text.includes('1,49,89,078'), 'Paragraph 10 must contain table total');

  // Verify paragraph 11 has Exhibit tag
  const para11 = cards.find(c => c.title.includes('Paragraph 11'));
  assert(para11, 'Must have Paragraph 11 card');
  assert(para11.tags.includes('Exhibit'), 'Paragraph 11 must have Exhibit tag');

  // Verify paragraph 14 has Jurisdiction tag
  const para14 = cards.find(c => c.title.includes('Paragraph 14'));
  assert(para14, 'Must have Paragraph 14 card');
  assert(para14.tags.includes('Jurisdiction'), 'Paragraph 14 must have Jurisdiction tag');

  console.log('  ✓ Paragraph slicing, table detection, and statutory tagging verified.');

  // Test 3: generateCaseWikiForPdf on-disk output
  console.log('Test 3: Testing generateCaseWikiForPdf disk emission...');
  const testCaseDir = path.join(__dirname, 'scratch_wiki_case_' + Date.now());
  fs.mkdirSync(testCaseDir, { recursive: true });

  const result = generateCaseWikiForPdf(testCaseDir, 'RentRecovery', samplePleadingMd);
  assert(result.cardsCount >= 5, 'Should return card count');
  assert(fs.existsSync(result.cardsDir), 'Cards directory must exist on disk');
  assert(fs.existsSync(result.wikiHtmlPath), 'Wiki HTML canvas must exist on disk');

  // Check individual .tid files
  const tidFiles = fs.readdirSync(result.cardsDir).filter(f => f.endsWith('.tid'));
  assert(tidFiles.length === result.cardsCount, `Expected ${result.cardsCount} .tid files, got ${tidFiles.length}`);

  const firstTidContent = fs.readFileSync(path.join(result.cardsDir, tidFiles[0]), 'utf8');
  assert(firstTidContent.startsWith('title:'), '.tid file must start with RFC 822 title header');
  assert(firstTidContent.includes('type: text/x-markdown'), '.tid file must specify markdown type');

  // Check generated .wiki.html canvas
  const wikiHtml = fs.readFileSync(result.wikiHtmlPath, 'utf8');
  assert(wikiHtml.includes('<!doctype html>'), 'Wiki canvas must be valid HTML');
  assert(wikiHtml.includes('class="tiddlywiki-tiddler-store"'), 'Wiki canvas must contain JSON store');
  assert(wikiHtml.includes('70,93,422'), 'Wiki canvas must contain arrears amount');

  console.log('  ✓ On-disk .tid files and .wiki.html generation verified.');

  // Cleanup test scratch
  try {
    fs.rmSync(testCaseDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n🎉 ALL PHASE 2 SLICING & .TID TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
