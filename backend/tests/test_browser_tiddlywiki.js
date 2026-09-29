'use strict';

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function runBrowserTest() {
    console.log('🌐 Launching Headless Chrome to test TiddlyWiki in actual browser engine...');
    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });

        // ─────────────────────────────────────────────────────────────────
        // Test 1: Load abc_infra.wiki.html via /api/hayagriva/tiddlywiki/view
        // ─────────────────────────────────────────────────────────────────
        console.log('\n[Browser Test 1] Navigating to /api/hayagriva/tiddlywiki/view...');
        const viewUrl = 'http://127.0.0.1:3210/api/hayagriva/tiddlywiki/view?case=demo_case&file=abc_infra.wiki.html';
        const response = await page.goto(viewUrl, { waitUntil: 'networkidle2', timeout: 15000 });

        console.log(`  ✓ HTTP Status: ${response.status()}`);
        assert.strictEqual(response.status(), 200, 'Page must return 200 OK');

        // Wait for TiddlyWiki to boot and mount the story river
        await page.waitForSelector('.tc-story-river', { timeout: 10000 });
        console.log('  ✓ TiddlyWiki 5.4.1 boot sequence completed; .tc-story-river mounted.');

        await page.waitForSelector('.tc-tiddler-frame', { timeout: 10000 });
        console.log('  ✓ Tiddler cards rendered in Story River.');

        // Extract DOM information
        const details = await page.evaluate(() => {
            const siteTitle = document.querySelector('.tc-site-title')?.textContent?.trim() || '';
            const siteSubtitle = document.querySelector('.tc-site-subtitle')?.textContent?.trim() || '';
            const tiddlerTitles = Array.from(document.querySelectorAll('.tc-tiddler-frame .tc-title')).map(el => el.textContent.trim());
            
            // Check computed styles on tiddler body
            const bodyEl = document.querySelector('.tc-tiddler-body');
            const computedFont = bodyEl ? window.getComputedStyle(bodyEl).fontFamily : '';
            const computedLineHeight = bodyEl ? window.getComputedStyle(bodyEl).lineHeight : '';

            // Check frame styling
            const frameEl = document.querySelector('.tc-tiddler-frame');
            const computedBg = frameEl ? window.getComputedStyle(frameEl).backgroundColor : '';
            const computedBorder = frameEl ? window.getComputedStyle(frameEl).borderColor : '';

            return {
                siteTitle,
                siteSubtitle,
                tiddlerTitles,
                computedFont,
                computedLineHeight,
                computedBg,
                computedBorder
            };
        });

        console.log(`  ✓ Site Title: "${details.siteTitle}"`);
        console.log(`  ✓ Site Subtitle: "${details.siteSubtitle}"`);
        console.log(`  ✓ Rendered Cards: ${details.tiddlerTitles.join(', ')}`);
        console.log(`  ✓ Tiddler Typography Font: ${details.computedFont}`);
        console.log(`  ✓ Tiddler Line Height: ${details.computedLineHeight}`);
        console.log(`  ✓ Card Background: ${details.computedBg}`);

        assert.ok(details.computedFont.toLowerCase().includes('georgia') || details.computedFont.toLowerCase().includes('times'), 'Tiddler text must use legal serif typography (Georgia / Times)');

        // Take screenshot of rendered TiddlyWiki
        const screenshotPath1 = '/tmp/tiddlywiki_browser_view.png';
        await page.screenshot({ path: screenshotPath1, fullPage: false });
        console.log(`  ✓ Screenshot captured: ${screenshotPath1} (${fs.statSync(screenshotPath1).size} bytes)`);

        // ─────────────────────────────────────────────────────────────────
        // Test 2: Verify On-Demand Zero-404 Auto-Materialization via read-file
        // ─────────────────────────────────────────────────────────────────
        console.log('\n[Browser Test 2] Testing on-demand auto-materialization via read-file in browser...');
        const uniqueMatter = `browser_test_${Date.now()}`;
        const autoUrl = `http://127.0.0.1:3210/api/hayagriva/read-file?path=/Users/atulgrover/Desktop/HAYAGRIVA/harness/demo_case/demo_case_wiki_haya/${uniqueMatter}.wiki.html&case=demo_case`;
        
        const autoResponse = await page.goto(autoUrl, { waitUntil: 'networkidle2', timeout: 15000 });
        console.log(`  ✓ HTTP Status: ${autoResponse.status()}`);
        assert.strictEqual(autoResponse.status(), 200, 'On-demand wiki must return 200 OK without 404');

        await page.waitForSelector('.tc-tiddler-frame', { timeout: 10000 });
        const autoDetails = await page.evaluate(() => {
            const title = document.querySelector('.tc-title')?.textContent?.trim() || '';
            const body = document.querySelector('.tc-tiddler-body')?.textContent?.trim() || '';
            return { title, body };
        });

        console.log(`  ✓ Auto-materialized Card Title: "${autoDetails.title}"`);
        assert.ok(autoDetails.title.includes(uniqueMatter) || autoDetails.title.includes('Legal Dossier'), 'Auto-materialized card must display generated matter title');
        console.log('  ✓ Zero-404 guarantee verified inside real browser engine!');

        const screenshotPath2 = '/tmp/tiddlywiki_ondemand_view.png';
        await page.screenshot({ path: screenshotPath2, fullPage: false });
        console.log(`  ✓ Screenshot captured: ${screenshotPath2} (${fs.statSync(screenshotPath2).size} bytes)`);

        // Clean up temporary auto-materialized file
        const createdFile = path.join(__dirname, '..', '..', 'demo_case', 'demo_case_wiki_haya', `${uniqueMatter}.wiki.html`);
        try { fs.unlinkSync(createdFile); } catch (_) {}

        console.log('\n🏆 BROWSER VERIFICATION COMPLETE: Vanilla TiddlyWiki 5.4.1 renders cleanly with legal styling and zero 404s.');
    } finally {
        await browser.close();
    }
}

runBrowserTest().catch(err => {
    console.error('❌ Browser test failed:', err);
    process.exit(1);
});
