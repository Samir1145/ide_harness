const { splitDocument } = require('../../core/splitter');

/**
 * Splits Excel workbook Markdown tables into chunks.
 * @param {string} markdown - Converted spreadsheet markdown text
 * @param {string} filePath - Absolute path to the source file
 * @returns {Array<Object>} List of split sections
 */
function splitXlsx(markdown, filePath) {
    console.log(`[Excel Splitter] Slicing XLSX document: ${filePath}`);
    return splitDocument(markdown, filePath, 'default', 'option_1', '', null);
}

module.exports = { splitXlsx };
