const fs = require('fs');
const path = require('path');
const { convertPdf } = require('./upload');
const { getConversionsDir } = require('../common/helper');

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

    const subfolder = path.dirname(relative);
    const conversionsDir = getConversionsDir(caseDir);
    const destDir = subfolder === '.' ? conversionsDir : path.join(conversionsDir, subfolder);
    fs.mkdirSync(destDir, { recursive: true });
    const companionPath = path.join(destDir, `${basename}.md`);
    const rootCompanionPath = path.join(path.dirname(filePath), `${basename}.md`);

    fs.writeFileSync(companionPath, structuredMd, 'utf8');
    
    // Clean up stale duplicate companion .md in root if it exists
    if (fs.existsSync(rootCompanionPath) && path.resolve(rootCompanionPath) !== path.resolve(companionPath)) {
        try {
            fs.unlinkSync(rootCompanionPath);
            console.log(`[PDF Ingestion] Removed stale root duplicate: ${rootCompanionPath}`);
        } catch (_) {}
    }

    console.log(`[PDF Ingestion] Created companion Markdown: ${companionPath}`);

    return {
        sections: 0,
        companionPath,
        isPartial: rawMd.isPartial || false,
        totalPages: rawMd.totalPages || 1
    };
}

module.exports = { ingestPdf };
