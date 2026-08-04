const fs = require('fs');
const path = require('path');
const { convertDocx } = require('./upload');
const { cleanMarkdown } = require('../../core/markdown-cleaner');
const { getConversionsDir } = require('../common/helper');

/**
 * Ingests a Word (.docx) document by converting it to a Markdown companion file.
 */
async function ingestDocx(caseDir, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const relative = path.relative(caseDir, filePath);
    const basename = path.basename(filePath, ext);

    console.log(`[Docx Ingestion] Converting ${relative} to Markdown companion...`);
    const rawMd = await convertDocx(filePath);
    
    // Auto-clean the Pandoc layout using the hybrid clean pass
    const cleanedMd = await cleanMarkdown(rawMd, caseDir);

    const subfolder = path.dirname(relative);
    const conversionsDir = getConversionsDir(caseDir);
    const destDir = subfolder === '.' ? conversionsDir : path.join(conversionsDir, subfolder);
    fs.mkdirSync(destDir, { recursive: true });
    const companionPath = path.join(destDir, `${basename}.md`);
    const rootCompanionPath = path.join(path.dirname(filePath), `${basename}.md`);

    fs.writeFileSync(companionPath, cleanedMd, 'utf8');
    
    // Clean up stale duplicate companion .md in root if it exists
    if (fs.existsSync(rootCompanionPath) && path.resolve(rootCompanionPath) !== path.resolve(companionPath)) {
        try {
            fs.unlinkSync(rootCompanionPath);
            console.log(`[Docx Ingestion] Removed stale root duplicate: ${rootCompanionPath}`);
        } catch (_) {}
    }

    console.log(`[Docx Ingestion] Created companion Markdown: ${companionPath}`);

    return {
        sections: 0,
        companionPath,
        isPartial: false
    };
}

module.exports = { ingestDocx };
