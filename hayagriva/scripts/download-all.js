const fs = require('fs');
const path = require('path');

const targetDir = '/Users/atulgrover/Desktop/ibc_vault/learning_curves_pdf';
const scratchpadPath = '/Users/atulgrover/.gemini/antigravity-ide/brain/6710bfa5-50a2-463c-af83-2567c29352e5/browser/scratchpad_5iuh90ih.md';

async function main() {
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        console.log(`Created directory: ${targetDir}`);
    }

    const content = fs.readFileSync(scratchpadPath, 'utf8');
    
    // Find all JSON code blocks
    const regex = /```json\s*\n([\s\S]*?)\n```/g;
    let match;
    let items = [];
    
    while ((match = regex.exec(content)) !== null) {
        try {
            const parsed = JSON.parse(match[1]);
            if (Array.isArray(parsed)) {
                items = items.concat(parsed);
            }
        } catch (e) {
            console.error(`Failed to parse a JSON chunk:`, e.message);
        }
    }

    console.log(`Successfully parsed ${items.length} items from scratchpad.`);
    if (items.length === 0) {
        console.error("No items found. Exiting.");
        return;
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.file) {
            console.log(`[${i + 1}/${items.length}] Page ${item.page}: Skipped (empty file name)`);
            continue;
        }

        const filename = item.file;
        const destPath = path.join(targetDir, filename);

        const url = `https://icsiiip.in/panel/assets/images/learning_curves/${encodeURIComponent(filename)}`;
        console.log(`[${i + 1}/${items.length}] Page ${item.page}: Downloading ${filename}...`);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const buffer = Buffer.from(await response.arrayBuffer());
            fs.writeFileSync(destPath, buffer);
            successCount++;
            // Pause 100ms between requests to be polite to the server
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.error(`[${i + 1}/${items.length}] Page ${item.page}: Failed to download ${filename}: ${error.message}`);
            failCount++;
        }
    }

    console.log(`\nAll downloads finished!`);
    console.log(`Total items: ${items.length}`);
    console.log(`Success: ${successCount}`);
    console.log(`Failed: ${failCount}`);
}

main();
