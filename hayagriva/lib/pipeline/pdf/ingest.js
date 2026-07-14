const fs = require('fs');
const path = require('path');
const { convertPdf } = require('./upload');

/**
 * Ingests a PDF file by converting its first few pages to a Markdown companion file.
 * The background worker in watcher.js will then process subsequent pages.
 */
async function ingestPdf(caseDir, filePath, options = {}) {
    const ext = path.extname(filePath).toLowerCase();
    const relative = path.relative(caseDir, filePath);
    const basename = path.basename(filePath, ext);

    console.log(`[PDF Ingestion] Converting ${relative} to Markdown companion (front-loading first 3 pages)...`);
    const rawMd = await convertPdf(filePath, { limit: 3, multimodal: !!options.multimodal });

    let structuredMd = '';
    if (rawMd.pages) {
        for (const page of rawMd.pages) {
            structuredMd += page.content + '\n\n';
        }
    } else {
        structuredMd = String(rawMd);
    }

    const destDir = path.dirname(filePath);
    fs.mkdirSync(destDir, { recursive: true });
    const companionPath = path.join(destDir, `${basename}.md`);

    fs.writeFileSync(companionPath, structuredMd, 'utf8');
    console.log(`[PDF Ingestion] Created structured companion Markdown: ${companionPath}`);

    return {
        sections: 0,
        companionPath,
        isPartial: rawMd.isPartial || false,
        totalPages: rawMd.totalPages || 1
    };
}

module.exports = { ingestPdf };
