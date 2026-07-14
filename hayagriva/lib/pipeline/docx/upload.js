const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');

/**
 * Converts a Word (.docx) document to a Markdown string.
 * Uses local embedded Pandoc binary for high-fidelity table conversion,
 * falling back to Mammoth if Pandoc fails or is missing.
 * @param {string} filePath - Absolute path to the .docx file
 * @returns {Promise<string>} Markdown text content
 */
async function convertDocx(filePath) {
    console.log(`[Docx Importer] Ingesting Word document: ${filePath}`);
    
    // Resolve correct binary based on system architecture
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const pandocPath = path.join(__dirname, '../../..', 'bin', `pandoc-${arch}`);
    
    if (fs.existsSync(pandocPath)) {
        try {
            console.log(`[Docx Importer] Converting with Pandoc (${arch}): ${filePath}`);
            return await runPandoc(pandocPath, filePath);
        } catch (err) {
            console.warn(`[Docx Importer] Pandoc conversion failed: ${err.message}. Falling back to Mammoth...`);
        }
    } else {
        console.warn(`[Docx Importer] Pandoc binary not found at ${pandocPath}. Falling back to Mammoth...`);
    }
    
    // Fallback parser
    return runMammoth(filePath);
}

function runPandoc(pandocPath, filePath) {
    return new Promise((resolve, reject) => {
        // Output format set to GitHub Flavored Markdown (gfm) to preserve tables cleanly
        execFile(pandocPath, ['-f', 'docx', '-t', 'gfm', filePath], (error, stdout, stderr) => {
            if (error) {
                return reject(error);
            }
            resolve(stdout);
        });
    });
}

async function runMammoth(filePath) {
    console.log(`[Docx Importer] Converting with Mammoth: ${filePath}`);
    const result = await mammoth.convertToMarkdown({ path: filePath });
    return result.value;
}

module.exports = { convertDocx };

