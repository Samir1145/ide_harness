'use strict';

const path = require('path');
const fs = require('fs');
const { parseWikiHtml } = require('../lib/pipeline/wiki/upload');
const { isTiddlyWikiHtml } = require('../lib/pipeline/common/helper');

function testTiddlyWikiParsing() {
    console.log('[Test TW Parser] Creating sample 3rd-party TiddlyWiki HTML content...');
    
    // Sample 3rd party TW5 html with reverse attribute order & ipie tiddlers
    const sampleTwHtml = `
<!doctype html>
<html>
<head>
<meta name="application-name" content="TiddlyWiki" />
<title>ipie</title>
</head>
<body>
<script type="application/json" class="tiddlywiki-tiddler-store">
[
  {
    "title": "iPIE Framework Overview",
    "text": "The iPIE Ecosystem coordinates statutory filings under Section 30(2) & Section 29A.",
    "tags": "[[Insolvency]] [[Portal]]"
  },
  {
    "title": "Resolution Plan Checklist",
    "text": "Checklist for NCLT Regulation 39(4) Form H compliance certificate.",
    "tags": "Checklist"
  }
]
</script>
</body>
</html>
    `;

    const tmpFilePath = path.join(__dirname, '..', 'branding', 'resources', '.tmp_ipie_test.html');
    fs.mkdirSync(path.dirname(tmpFilePath), { recursive: true });
    fs.writeFileSync(tmpFilePath, sampleTwHtml, 'utf8');

    console.log(`[Test TW Parser] Testing isTiddlyWikiHtml on "${tmpFilePath}"...`);
    const detected = isTiddlyWikiHtml(tmpFilePath);
    console.log(` - Detected as TiddlyWiki: ${detected ? '✓ YES' : '❌ NO'}`);
    if (!detected) throw new Error('Failed to detect 3rd-party TiddlyWiki HTML file!');

    console.log(`[Test TW Parser] Testing parseWikiHtml on "${tmpFilePath}"...`);
    const tiddlers = parseWikiHtml(tmpFilePath);
    console.log(` - Parsed ${tiddlers.length} tiddlers:`);
    for (const t of tiddlers) {
        console.log(`   * ${t.title} (tags: ${t.tags})`);
    }

    if (tiddlers.length !== 2) {
        throw new Error(`Expected 2 tiddlers, but got ${tiddlers.length}`);
    }

    // Clean up
    fs.unlinkSync(tmpFilePath);
    console.log('✓ 3rd-Party TiddlyWiki Parser test passed successfully!');
}

testTiddlyWikiParsing();
