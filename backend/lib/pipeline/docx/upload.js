const { execFile, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const mammoth = require('mammoth');

/**
 * Pre-converts legacy Word 97-2003 (.doc) to OOXML (.docx) using headless LibreOffice.
 */
function convertLegacyDocToDocx(docFilePath) {
    return new Promise((resolve, reject) => {
        const tempDir = os.tmpdir();
        const basename = path.basename(docFilePath, path.extname(docFilePath));
        const timestamp = Date.now();
        const defaultConverted = path.join(tempDir, `${basename}.docx`);
        const targetDocx = path.join(tempDir, `${basename}_${timestamp}.docx`);

        const sofficeCmd = fs.existsSync('/usr/local/bin/soffice') ? '/usr/local/bin/soffice' : 'soffice';

        console.log(`[Doc Converter] Pre-converting legacy .doc to .docx via LibreOffice: ${docFilePath}`);
        exec(`"${sofficeCmd}" --headless --convert-to docx "${docFilePath}" --outdir "${tempDir}"`, (err) => {
            if (fs.existsSync(defaultConverted)) {
                try {
                    fs.renameSync(defaultConverted, targetDocx);
                    return resolve(targetDocx);
                } catch (e) {
                    return resolve(defaultConverted);
                }
            }
            if (err) {
                return reject(new Error(`LibreOffice .doc conversion failed: ${err.message}`));
            }
            reject(new Error(`Converted .docx file not generated for ${docFilePath}`));
        });
    });
}

/**
 * Converts a Word (.docx / .doc) document to a Markdown string.
 * Legacy .doc files are pre-converted to .docx via LibreOffice (soffice).
 * Uses local embedded Pandoc binary for high-fidelity table conversion,
 * falling back to Mammoth if Pandoc fails or is missing.
 * @param {string} filePath - Absolute path to the .docx / .doc file
 * @returns {Promise<string>} Markdown text content
 */
async function convertDocx(filePath) {
    console.log(`[Docx Importer] Ingesting Word document: ${filePath}`);
    const isLegacyDoc = filePath.toLowerCase().endsWith('.doc');
    let targetFile = filePath;
    let tempDocxPath = null;

    if (isLegacyDoc) {
        try {
            tempDocxPath = await convertLegacyDocToDocx(filePath);
            targetFile = tempDocxPath;
        } catch (docErr) {
            console.error(`[Doc Importer Error] Legacy .doc conversion error: ${docErr.message}`);
            throw docErr;
        }
    }

    try {
        // Resolve correct binary based on system architecture
        const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
        const pandocPath = path.join(__dirname, '../../..', 'bin', `pandoc-${arch}`);

        let markdown;
        if (fs.existsSync(pandocPath)) {
            try {
                console.log(`[Docx Importer] Converting with Pandoc (${arch}): ${targetFile}`);
                markdown = await runPandoc(pandocPath, targetFile);
            } catch (err) {
                console.warn(`[Docx Importer] Pandoc conversion failed: ${err.message}. Falling back to Mammoth...`);
                markdown = await runMammoth(targetFile);
            }
        } else {
            console.warn(`[Docx Importer] Pandoc binary not found at ${pandocPath}. Falling back to Mammoth...`);
            markdown = await runMammoth(targetFile);
        }

        return markdown;
    } finally {
        if (tempDocxPath && fs.existsSync(tempDocxPath)) {
            try { fs.unlinkSync(tempDocxPath); } catch (_) {}
        }
    }
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

