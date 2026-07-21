const fs = require('fs');
const path = require('path');

const targetDir = '/Users/atulgrover/Desktop/ibc_vault/learning_curves_pdf';
const files = [
    "17162651891700Learning curve 1045.pdf",
    "17162651566202Learning curve 1044.pdf"
];

async function downloadTest() {
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        console.log(`Created directory: ${targetDir}`);
    }

    for (const filename of files) {
        const url = `https://icsiiip.in/panel/assets/images/learning_curves/${encodeURIComponent(filename)}`;
        const destPath = path.join(targetDir, filename);

        console.log(`Downloading: ${url} -> ${destPath}`);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const buffer = Buffer.from(await response.arrayBuffer());
            fs.writeFileSync(destPath, buffer);
            console.log(`Successfully downloaded: ${filename} (size: ${buffer.length} bytes)`);
        } catch (error) {
            console.error(`Failed to download ${filename}:`, error.message);
        }
    }
}

downloadTest();
