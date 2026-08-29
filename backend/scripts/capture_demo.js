const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

async function captureDemo() {
    console.log('[Demo Capture] Launching headless browser...');
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const artifactDir = '/Users/atulgrover/.gemini/antigravity-cli/brain/6868dd9b-95ef-423e-be66-ab72e0516295';

    if (!fs.existsSync(artifactDir)) {
        fs.mkdirSync(artifactDir, { recursive: true });
    }

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: 'new',
        defaultViewport: { width: 1440, height: 900 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    console.log('[Demo Capture] Navigating to http://127.0.0.1:3000 ...');
    await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for Theia UI elements to settle
    await new Promise(r => setTimeout(r, 4000));

    const screenshotPath = path.join(artifactDir, 'claim_demo_screenshot.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`[Demo Capture] Screenshot saved to ${screenshotPath}`);

    await browser.close();
    console.log('[Demo Capture] Done.');
}

captureDemo().catch(err => {
    console.error('[Demo Capture] Error:', err);
    process.exit(1);
});
