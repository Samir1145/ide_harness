const fs = require('fs');
const path = require('path');
const { convertXlsxSheets } = require('./upload');
const { getConversionsDir } = require('../common/helper');

/**
 * Ingests an Excel (.xlsx/.xls) workbook by converting each sheet tab into a separate companion Markdown file.
 */
async function ingestXlsx(caseDir, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const relative = path.relative(caseDir, filePath);
    const basename = path.basename(filePath, ext);

    console.log(`[Excel Ingestion] Converting ${relative} to separate sheet companions...`);
    const sheets = convertXlsxSheets(filePath);

    const subfolder = path.dirname(relative);
    const conversionsDir = getConversionsDir(caseDir);
    const destDir = subfolder === '.' ? conversionsDir : path.join(conversionsDir, subfolder);
    fs.mkdirSync(destDir, { recursive: true });

    const companionPaths = [];
    for (const sheet of sheets) {
        const companionPath = path.join(destDir, `${basename}_${sheet.sheetName}.md`);
        fs.writeFileSync(companionPath, sheet.markdown, 'utf8');
        console.log(`[Excel Ingestion] Created sheet companion Markdown: ${companionPath}`);
        companionPaths.push(companionPath);
    }

    return {
        sections: 0,
        companionPath: companionPaths[0] || null,
        companionPaths,
        isPartial: false
    };
}

module.exports = { ingestXlsx };
