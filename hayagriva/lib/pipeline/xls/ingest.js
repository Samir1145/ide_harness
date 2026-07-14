const fs = require('fs');
const path = require('path');
const { convertXlsx } = require('./upload');

/**
 * Ingests an Excel (.xlsx/.xls) workbook by converting it to a Markdown companion file.
 */
async function ingestXlsx(caseDir, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const relative = path.relative(caseDir, filePath);
    const basename = path.basename(filePath, ext);

    console.log(`[Excel Ingestion] Converting ${relative} to Markdown companion...`);
    const rawMd = convertXlsx(filePath);

    const destDir = path.dirname(filePath);
    fs.mkdirSync(destDir, { recursive: true });
    const companionPath = path.join(destDir, `${basename}.md`);

    fs.writeFileSync(companionPath, rawMd, 'utf8');
    console.log(`[Excel Ingestion] Created companion Markdown: ${companionPath}`);

    return {
        sections: 0,
        companionPath,
        isPartial: false
    };
}

module.exports = { ingestXlsx };
