const fs = require('fs');
const path = require('path');
const { convertDocx } = require('./upload');
const { cleanMarkdown } = require('../../core/markdown-cleaner');

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

    const destDir = path.dirname(filePath);
    fs.mkdirSync(destDir, { recursive: true });
    const companionPath = path.join(destDir, `${basename}.md`);

    fs.writeFileSync(companionPath, cleanedMd, 'utf8');
    console.log(`[Docx Ingestion] Created companion Markdown (layout cleaned): ${companionPath}`);

    return {
        sections: 0,
        companionPath,
        isPartial: false
    };
}

module.exports = { ingestDocx };
