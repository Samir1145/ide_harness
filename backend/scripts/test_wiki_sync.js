'use strict';

const path = require('path');
const fs = require('fs');
const bm25 = require('../lib/core/bm25');
const { syncMarkdownToWiki, ingestWiki } = require('../lib/pipeline/wiki/ingest');
const { parseWikiHtml } = require('../lib/pipeline/wiki/upload');

async function testWikiSync() {
    console.log('[Test Wiki Sync] Setting up dummy case directory and TiddlyWiki file...');
    const tempCaseDir = path.join(__dirname, '..', 'branding', 'resources', '.tmp_sync_case');
    fs.mkdirSync(tempCaseDir, { recursive: true });

    const wikiFilePath = path.join(tempCaseDir, 'ipie.html');
    const initialHtml = `
<!doctype html>
<html>
<head><meta name="application-name" content="TiddlyWiki" /><title>ipie</title></head>
<body>
<script class="tiddlywiki-tiddler-store" type="application/json">
[
  { "title": "Insolvency Overview", "text": "Original text before edit.", "tags": "Section30" }
]
</script>
</body>
</html>
    `;
    fs.writeFileSync(wikiFilePath, initialHtml, 'utf8');

    // Step 1: Ingest wiki into cards
    console.log('[Test Wiki Sync] Ingesting wiki into card files...');
    const bm25File = path.join(tempCaseDir, 'bm25.json');
    const bm25Index = bm25.loadIndex(bm25File);
    await ingestWiki(tempCaseDir, wikiFilePath, bm25Index, bm25File);

    const cardPath = path.join(tempCaseDir, 'wiki', 'Insolvency_Overview.md');
    if (!fs.existsSync(cardPath)) {
        throw new Error(`Expected card file to exist: ${cardPath}`);
    }

    // Step 2: Edit card file
    console.log('[Test Wiki Sync] Simulating user edit in card file...');
    const updatedMd = `---
title: "Insolvency Overview"
tags:
  - Section30
  - UpdatedTag
---

Updated text edited inside Monaco IDE!`;
    fs.writeFileSync(cardPath, updatedMd, 'utf8');

    // Step 3: Sync back to ipie.html
    console.log('[Test Wiki Sync] Executing syncMarkdownToWiki...');
    await syncMarkdownToWiki(tempCaseDir, cardPath);

    // Step 4: Verify ipie.html tiddler content
    console.log('[Test Wiki Sync] Verifying updated ipie.html content...');
    const updatedTiddlers = parseWikiHtml(wikiFilePath);
    const insolvencyTid = updatedTiddlers.find(t => t.title === 'Insolvency Overview');

    console.log(' - Updated Tiddler Text:', insolvencyTid?.text);
    console.log(' - Updated Tiddler Tags:', insolvencyTid?.tags);

    if (!insolvencyTid || !insolvencyTid.text.includes('Updated text edited inside Monaco IDE!')) {
        throw new Error('Sync back to TiddlyWiki HTML failed!');
    }

    // Cleanup
    fs.rmSync(tempCaseDir, { recursive: true, force: true });
    console.log('✓ Bi-directional TiddlyWiki sync test passed successfully!');
}

testWikiSync().catch(err => {
    console.error('[Sync Test Failed]', err);
    process.exit(1);
});
