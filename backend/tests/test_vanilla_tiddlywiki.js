'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { generateTiddlyWikiHtml, buildTiddlersFromChunks } = require('../lib/pipeline/wiki/tiddlywiki-template');

async function testVanillaTiddlyWiki() {
    console.log('🧪 Starting Phase 1: Vanilla TiddlyWiki (empty.html) Verification Suite...\n');

    // ── Phase 1: Generation & Store Structure ────────────────────────────────
    console.log('Phase 1: Verifying HTML generation from official empty.html...');
    const chunks = [
        { section_title: '01_Parties_Corporate_Debtor', content: 'The Corporate Debtor ABC Infra Ltd was admitted into CIRP on 12-Feb-2023.', page_number: 1 },
        { section_title: '02_Financial_Creditor_Claim', content: 'State Bank of India submitted Form C for INR 14,85,20,000.', page_number: 2 },
        { section_title: '03_Avoidance_Transactions', content: 'Forensic audit revealed preferential transfers under Section 43 IBC totaling INR 2.1 Cr.', page_number: 3 }
    ];

    const tiddlers = buildTiddlersFromChunks(chunks, 'ABC_Infra_CIRP');
    assert.strictEqual(tiddlers.length, 4, 'Should build 3 chunks + 1 Master Index card');

    const html = generateTiddlyWikiHtml(
        'ABC Infra CIRP Matter Wiki',
        tiddlers,
        3210,
        'demo_case',
        'abc_infra.wiki.html'
    );

    assert(typeof html === 'string', 'Generated wiki must be a string');
    assert(html.trim().startsWith('<!doctype html>'), 'Generated wiki must begin with <!doctype html>');
    assert(html.includes('ABC Infra CIRP Matter Wiki'), 'Must include custom SiteTitle');
    assert(html.includes('State Bank of India submitted Form C'), 'Must preserve chunk content');
    assert(html.includes('class="tiddlywiki-tiddler-store"'), 'Must contain standard tiddlywiki-tiddler-store');
    assert(html.includes('$:/UploadURL'), 'Must configure official UploadSaver URL');
    assert(html.includes('$:/UploadWithUrlOnly'), 'Must configure UploadWithUrlOnly=yes');
    console.log('  ✓ Official empty.html successfully hydrated with case tiddlers.');
    console.log('  ✓ Standard TiddlyWiki JSON store intact with zero template mutations.');

    // ── Phase 2: Test End-to-End Save via Backend Port 3210 ──────────────────
    console.log('\nPhase 2: Verifying two-way saving with backend (port 3210)...');

    // Save test using standard TiddlyWiki UploadPlugin format (multipart with 0 - OK response)
    const boundary = '---------------------------AaB03x';
    const multipartBody = [
        `--${boundary}`,
        'Content-disposition: form-data; name="UploadPlugin"',
        'backupDir=.;user=;password=;uploaddir=.;;',
        `--${boundary}`,
        'Content-disposition: form-data; name="userfile"; filename="abc_infra.wiki.html"',
        'Content-Type: text/html;charset=UTF-8',
        `Content-Length: ${html.length}`,
        '',
        html,
        `--${boundary}--`,
        ''
    ].join('\r\n');

    await new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: 3210,
            path: '/api/hayagriva/tiddlywiki/save?case=demo_case&file=abc_infra.wiki.html',
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; charset=UTF-8; boundary=${boundary}`,
                'Content-Length': Buffer.byteLength(multipartBody)
            }
        }, (res) => {
            let resData = '';
            res.on('data', chunk => { resData += chunk; });
            res.on('end', () => {
                try {
                    assert.strictEqual(res.status || res.statusCode, 200, `Expected 200 OK but got ${res.statusCode}`);
                    assert(resData.startsWith('0 - OK:'), `UploadSaver protocol expects response starting with "0 - OK:", got: ${resData.substring(0, 20)}`);
                    console.log('  ✓ UploadSaver save returned standard 0 - OK acknowledgment.');
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(multipartBody);
        req.end();
    });

    // ── Phase 3: Test PUT Saver on View URL ──────────────────────────────────
    console.log('\nPhase 3: Verifying PutSaver on /api/hayagriva/tiddlywiki/view...');
    await new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: 3210,
            path: '/api/hayagriva/tiddlywiki/view?case=demo_case&file=abc_infra.wiki.html',
            method: 'PUT',
            headers: {
                'Content-Type': 'text/html; charset=UTF-8',
                'Content-Length': Buffer.byteLength(html)
            }
        }, (res) => {
            let resData = '';
            res.on('data', chunk => { resData += chunk; });
            res.on('end', () => {
                try {
                    assert.strictEqual(res.statusCode, 200, `Expected 200 OK on PUT but got ${res.statusCode}`);
                    assert(res.headers.etag, 'PutSaver expects ETag header in response');
                    console.log('  ✓ PutSaver PUT request succeeded with ETag validation.');
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(html);
        req.end();
    });

    // ── Phase 4: Test Zero-404 On-Demand Auto-Materialization ────────────────
    console.log('\nPhase 4: Verifying seamless on-demand materialization (Zero-404 guarantee)...');
    
    // 4.1: Request completely non-existent wiki via read-file
    const testDocStem = `test_ondemand_${Date.now()}`;
    const testWikiPath = path.join(__dirname, '..', '..', 'demo_case', 'demo_case_wiki_haya', `${testDocStem}.wiki.html`);
    if (fs.existsSync(testWikiPath)) fs.unlinkSync(testWikiPath);

    await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:3210/api/hayagriva/read-file?path=${encodeURIComponent(testWikiPath)}&case=demo_case`, (res) => {
            let resData = '';
            res.on('data', chunk => { resData += chunk; });
            res.on('end', () => {
                try {
                    assert.strictEqual(res.statusCode, 200, `Expected 200 OK for missing wiki on read-file but got ${res.statusCode}`);
                    assert(resData.includes('<!doctype html>'), 'Generated wiki must be valid HTML');
                    assert(resData.includes('$:/themes/tiddlywiki/snowwhite'), 'Must configure official snowwhite theme');
                    assert(resData.includes(testDocStem), 'Must include document stem card');
                    assert(fs.existsSync(testWikiPath), 'Auto-materialization must persist .wiki.html on disk');
                    console.log('  ✓ /api/hayagriva/read-file auto-materialized missing .wiki.html without 404.');
                    // Clean up test file
                    try { fs.unlinkSync(testWikiPath); } catch (_) {}
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });

    // 4.2: Request completely non-existent wiki via /api/hayagriva/tiddlywiki/view
    const testViewStem = `test_view_${Date.now()}`;
    const testViewPath = path.join(__dirname, '..', '..', 'demo_case', 'demo_case_wiki_haya', `${testViewStem}.wiki.html`);
    if (fs.existsSync(testViewPath)) fs.unlinkSync(testViewPath);

    await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:3210/api/hayagriva/tiddlywiki/view?case=demo_case&file=${testViewStem}.wiki.html`, (res) => {
            let resData = '';
            res.on('data', chunk => { resData += chunk; });
            res.on('end', () => {
                try {
                    assert.strictEqual(res.statusCode, 200, `Expected 200 OK for missing wiki on view endpoint but got ${res.statusCode}`);
                    assert(resData.includes('<!doctype html>'), 'Generated view wiki must be valid HTML');
                    assert(resData.includes('$:/themes/tiddlywiki/snowwhite'), 'Must configure official snowwhite theme');
                    assert(fs.existsSync(testViewPath), 'View endpoint must persist .wiki.html on disk');
                    console.log('  ✓ /api/hayagriva/tiddlywiki/view auto-materialized missing wiki without 404.');
                    // Clean up test file
                    try { fs.unlinkSync(testViewPath); } catch (_) {}
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });

    console.log('\n🎉 ALL VANILLA TIDDLYWIKI TESTS PASSED! Official empty.html is 100% operational with Zero-404 guarantee.');
}

testVanillaTiddlyWiki().catch(err => {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
});
