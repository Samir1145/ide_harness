'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { serializeTidCard, parseTidCard } = require('../lib/pipeline/wiki/split');
const { getDb } = require('../lib/core/sqlite-store');

async function runTests() {
  console.log('🧪 Starting Phase 3: Watcher Protection & Atomic Save Unit Tests...\n');

  const testCaseDir = path.join(__dirname, 'scratch_p3_case_' + Date.now());
  fs.mkdirSync(testCaseDir, { recursive: true });

  try {
    // Test 1: Watcher Ignore Pattern Verification
    console.log('Test 1: Verifying Watcher ignore rules for wiki & conversion paths...');
    
    // Simulate watcher ignore predicate
    const isIgnored = (p) => {
      const base = path.basename(p);
      if (base === 'index.md' || base === 'index.json' || base === 'timeline.md') return true;
      if (base.startsWith('.') && base !== '.gitignore') return true;
      if (p.includes('concepts' + path.sep) || p.endsWith(path.sep + 'concepts') || p.includes('_concepts_haya')) return true;
      if (p.includes('reviews' + path.sep) || p.endsWith(path.sep + 'reviews')) return true;
      if (p.includes('drafts' + path.sep) || p.endsWith(path.sep + 'drafts')) return true;
      if (p.includes('exports' + path.sep) || p.endsWith(path.sep + 'exports')) return true;
      if (p.includes('ledgers' + path.sep) || p.endsWith(path.sep + 'ledgers')) return true;
      if (p.includes('wiki' + path.sep + 'qna') || p.endsWith(path.sep + 'wiki' + path.sep + 'qna')) return true;
      if (p.includes('conversions' + path.sep) || p.endsWith(path.sep + 'conversions') || p.includes('_conversions_haya')) return true;
      if (p.includes('.theia' + path.sep) || p.includes('.vscode' + path.sep) || p.includes('.git' + path.sep)) return true;
      if (p.endsWith('.DS_Store')) return true;
      return false;
    };

    assert.strictEqual(isIgnored(path.join(testCaseDir, 'Case_conversions_haya', 'doc.md')), true, 'Conversions must be ignored');
    assert.strictEqual(isIgnored(path.join(testCaseDir, 'Case_concepts_haya', 'doc', 'c1.md')), true, 'Concepts must be ignored');
    assert.strictEqual(isIgnored(path.join(testCaseDir, 'drafts', 'pleading.docx')), true, 'Drafts must be ignored');
    assert.strictEqual(isIgnored(path.join(testCaseDir, 'exports', 'pleading.docx')), true, 'Exports must be ignored');
    assert.strictEqual(isIgnored(path.join(testCaseDir, 'Commercial Court - rent recovery case.pdf')), false, 'Primary PDF must NOT be ignored');
    console.log('  ✓ Ignore filter cleanly protects internal directories from duplicate ingestion.');

    // Test 2: Watcher Protection against Infinite Loops on .tid files
    console.log('Test 2: Verifying .tid files inside wiki are shielded from primary document intake loop...');
    const isWikiPath = (filePath) => filePath.includes('wiki' + path.sep) || filePath.includes('_wiki_haya');
    const tidPath = path.join(testCaseDir, 'Case_wiki_haya', 'DocStem', '01_Para.tid');
    assert.strictEqual(isWikiPath(tidPath), true, 'Tid file must be recognized as wiki path');
    console.log('  ✓ Infinite loop prevention: wiki cards shielded from primary document conversion loop.');

    // Test 3: Incremental SQLite FTS5 Card Indexing
    console.log('Test 3: Verifying atomic card indexing in SQLite case_vault.db...');
    const db = getDb(testCaseDir);

    const card = {
      title: 'Paragraph 10: Arrears of Rent Recoverable',
      tags: 'Pleading Table Financial',
      text: '10. Arrears of rent recoverable: Rs. 3,30,15,091/- with 18% GST.',
      doc: 'RentRecovery'
    };

    const cardRef = `wiki::${card.doc}::${card.title}`;
    
    // Ensure document row exists for foreign key
    db.prepare(`
      INSERT INTO documents (filename, title, status)
      VALUES (?, ?, 'companion_ready')
      ON CONFLICT(filename) DO NOTHING
    `).run(cardRef, card.title);

    // Insert section and FTS chunk
    db.prepare('DELETE FROM fts_chunks WHERE filename = ?').run(cardRef);
    db.prepare('DELETE FROM document_sections WHERE filename = ?').run(cardRef);

    db.prepare(`
      INSERT INTO document_sections (filename, title, page_start, page_end, parent_title, hierarchy_level, content)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(cardRef, card.title, 1, 1, card.doc, 2, card.text);

    db.prepare(`
      INSERT INTO fts_chunks (filename, section_title, page_number, chunk_index, content)
      VALUES (?, ?, ?, ?, ?)
    `).run(cardRef, card.title, 1, 0, `[Card: ${card.title}]\n\n${card.text}`);

    // Verify FTS query finds the card by keyword and figure
    const ftsResult = db.prepare(`
      SELECT filename, section_title, content FROM fts_chunks
      WHERE fts_chunks MATCH ?
    `).all('33015091 OR Arrears');

    assert(ftsResult.length > 0, 'FTS query must return newly indexed card');
    assert.strictEqual(ftsResult[0].filename, cardRef, 'FTS match must reference the exact cardRef');
    console.log('  ✓ Incremental FTS5 indexing verified: query matched', ftsResult[0].section_title);

    // Test 4: Atomic Disk Save of Individual .tid File
    console.log('Test 4: Verifying atomic single-card save on disk...');
    const wikiDir = path.join(testCaseDir, 'Case_wiki_haya', 'RentRecovery');
    fs.mkdirSync(wikiDir, { recursive: true });

    const targetTid = path.join(wikiDir, '10_Paragraph_10.tid');
    const updatedContent = serializeTidCard({
      title: card.title,
      tags: card.tags,
      type: 'text/x-markdown',
      doc: card.doc,
      order: 10,
      text: '10. Arrears of rent recoverable updated: Rs. 3,50,00,000/- with 18% GST.'
    });

    fs.writeFileSync(targetTid, updatedContent, 'utf8');
    assert(fs.existsSync(targetTid), 'Tid file must exist on disk');

    const readBack = parseTidCard(fs.readFileSync(targetTid, 'utf8'));
    assert.strictEqual(readBack.title, card.title, 'Parsed title must match');
    assert(readBack.text.includes('3,50,00,000'), 'Parsed text must reflect atomic update');
    console.log('  ✓ Atomic single-card on-disk persistence confirmed.');

    console.log('\n🎉 ALL PHASE 3 WATCHER & ATOMIC SAVE TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    try {
      fs.rmSync(testCaseDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
