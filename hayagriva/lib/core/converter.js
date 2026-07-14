const fs = require('fs');
const path = require('path');
const { convertDocx } = require('../pipeline/docx/upload');
const { convertXlsx } = require('../pipeline/xls/upload');
const { convertPdf, convertPdfBlock } = require('../pipeline/pdf/upload');


// Keep track of active converter processes (kept for interface compatibility)
const activeProcesses = new Map();

async function convertToMarkdown(inputPath, options = {}) {
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file does not exist: ${inputPath}`);
    }

    const ext = path.extname(inputPath).toLowerCase();
    if (ext === '.docx') {
        return convertDocx(inputPath);
    } else if (ext === '.xlsx' || ext === '.xls') {
        return convertXlsx(inputPath);
    } else if (ext === '.pdf') {
        return convertPdf(inputPath, options);
    } else if (ext === '.txt' || ext === '.md') {
        return fs.readFileSync(inputPath, 'utf8');
    } else {
        throw new Error(`Unsupported file format: ${ext}`);
    }
}

function cancelConversion(filePath) {
    return false;
}

module.exports = { 
    convertToMarkdown, 
    convertDocx, 
    convertXlsx, 
    convertPdf,
    convertPdfBlock,
    cancelConversion,
    activeProcesses
};
