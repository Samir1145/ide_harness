const { splitDocument } = require('../../core/splitter');

/**
 * Splits a Word document Markdown text based on structural headings.
 * @param {string} markdown - Converted Word document markdown text
 * @param {string} filePath - Absolute path to the source file
 * @returns {Array<Object>} List of split sections
 */
function splitDocx(markdown, filePath) {
    console.log(`[Docx Splitter] Slicing DOCX document: ${filePath}`);
    return splitDocument(markdown, filePath, 'default', 'option_1', '', null);
}

module.exports = { splitDocx };
