const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

async function captureDraftEditor() {
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const artifactDir = '/Users/atulgrover/.gemini/antigravity-cli/brain/6868dd9b-95ef-423e-be66-ab72e0516295';

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: 'new',
        defaultViewport: { width: 1440, height: 900 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000));

    // Evaluate in page to trigger file opening via Theia's command service or editor manager
    await page.evaluate(() => {
        try {
            // Find file in tree or dispatch command
            const files = Array.from(document.querySelectorAll('.theia-TreeNode'));
            const draftNode = files.find(f => f.textContent.includes('CLAIM_State_Bank_FORM-C.md') || f.textContent.includes('drafts'));
            if (draftNode) {
                draftNode.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
            }
        } catch (_) {}
    });

    await new Promise(r => setTimeout(r, 2000));

    const screenshotPath = path.join(artifactDir, 'claim_draft_editor_view.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`[Demo Capture] Draft editor view saved to ${screenshotPath}`);

    await browser.close();
}

captureDraftEditor().catch(console.error);
