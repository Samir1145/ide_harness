const { splitDocument } = require('../../core/splitter');

/**
 * Splits a PDF Markdown text string into page-based/section-based chunks.
 * @param {string} markdown - The raw markdown converted from PDF
 * @param {string} filePath - Absolute path to the source file
 * @param {RegExp} layoutRegex - Compiled layout landmarks regex
 * @returns {Array<Object>} List of split sections with titles and content
 */
function splitPdf(markdown, filePath, layoutRegex) {
    console.log(`[PDF Splitter] Slicing PDF document: ${filePath}`);
    return splitDocument(markdown, filePath, 'default', 'option_1', '', layoutRegex);
}

module.exports = { splitPdf };
