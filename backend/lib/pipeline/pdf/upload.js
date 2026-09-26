const pdfexcavator = require('pdfexcavator');

/**
 * Normalizes multi-line PDF text blocks into clean single-line paragraphs.
 */
function joinParagraphs(text) {
    if (!text) return '';
    const lines = text.split(/\r?\n/);
    const cleanedLines = [];
    let currentParagraph = [];

    for (let line of lines) {
        const trimmed = line.trim();
        if (trimmed === '') {
            if (currentParagraph.length > 0) {
                cleanedLines.push(currentParagraph.join(' '));
                currentParagraph = [];
            }
            cleanedLines.push('');
        } else {
            const isHeader = /^#+\s+/.test(trimmed) || /^(subject|to|respected|yours|thanking|signatories|session|pedagogy|target|objective|topics)/i.test(trimmed);
            const isListItem = /^[*-]\s+/.test(trimmed) || /^\d+([\.\s]+|$)/.test(trimmed);
            const isSignature = /^(sd\/\-)/i.test(trimmed);

            if (isHeader || isListItem || isSignature) {
                if (currentParagraph.length > 0) {
                    cleanedLines.push(currentParagraph.join(' '));
                    currentParagraph = [];
                }
                cleanedLines.push(trimmed);
            } else {
                currentParagraph.push(trimmed);
            }
        }
    }

    if (currentParagraph.length > 0) {
        cleanedLines.push(currentParagraph.join(' '));
    }

    return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * Standardizes signatory tables (e.g. IBBI registration tables) into structured Markdown.
 */
function formatSignatureTable(rawText) {
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const resultLines = [];
    
    let tableRows = [];
    let insideTable = false;
    let currentBlock = [];
    
    const isTablePage = lines.filter(l => l.includes('IBBI/')).length >= 3;
    if (!isTablePage) {
        return rawText;
    }
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const rowStartMatch = line.match(/^(\d+)[\.\s]*/);
        
        if (rowStartMatch) {
            const num = parseInt(rowStartMatch[1]);
            if (num > 0 && num < 100) {
                if (currentBlock.length > 0) {
                    tableRows.push(parseBlockToRow(currentBlock));
                    currentBlock = [];
                }
                insideTable = true;
                currentBlock.push(line);
                continue;
            }
        }
        
        if (insideTable) {
            const isTableEnd = line.toLowerCase().includes('submitted jointly') || 
                               line.toLowerCase().includes('the insolvency and bankruptcy');
            if (isTableEnd) {
                if (currentBlock.length > 0) {
                    tableRows.push(parseBlockToRow(currentBlock));
                    currentBlock = [];
                }
                insideTable = false;
                
                if (tableRows.length > 0) {
                    resultLines.push("\n| Sr. No. | Name of Professional | IBBI Registration No. | Signature |");
                    resultLines.push("| --- | --- | --- | --- |");
                    for (const r of tableRows) {
                        resultLines.push(`| ${r.srNo} | ${r.name} | ${r.regNo} | ${r.signature} |`);
                    }
                    tableRows = [];
                }
                resultLines.push(line);
            } else {
                currentBlock.push(line);
            }
        } else {
            resultLines.push(line);
        }
    }
    
    if (currentBlock.length > 0) {
        tableRows.push(parseBlockToRow(currentBlock));
    }
    
    if (tableRows.length > 0) {
        resultLines.push("\n| Sr. No. | Name of Professional | IBBI Registration No. | Signature |");
        resultLines.push("| --- | --- | --- | --- |");
        for (const r of tableRows) {
            resultLines.push(`| ${r.srNo} | ${r.name} | ${r.regNo} | ${r.signature} |`);
        }
    }
    
    return resultLines.join('\n');
}

function parseBlockToRow(block) {
    if (block.length === 0) return { srNo: '', name: '', regNo: '', signature: '' };
    
    const firstLine = block[0];
    const srNoMatch = firstLine.match(/^(\d+)[\.\s]*/);
    const srNo = srNoMatch[1];
    let remaining = firstLine.substring(srNoMatch[0].length).trim();
    
    let nameParts = [];
    let regParts = [];
    let sigParts = [];
    
    const allText = [remaining, ...block.slice(1)].map(l => l.trim()).filter(Boolean);
    
    for (let text of allText) {
        let textToProcess = text;
        const sdIndex = text.search(/SD\/\-/i);
        if (sdIndex !== -1) {
            sigParts.push(text.substring(sdIndex).trim());
            textToProcess = text.substring(0, sdIndex).trim();
        }
        
        if (!textToProcess) continue;
        
        const ibbiIndex = textToProcess.search(/IBBI\//i);
        if (ibbiIndex !== -1) {
            const namePart = textToProcess.substring(0, ibbiIndex).trim();
            const regPart = textToProcess.substring(ibbiIndex).trim();
            if (namePart) nameParts.push(namePart);
            if (regPart) regParts.push(regPart);
        } else if (textToProcess.includes('Reg.') || regParts.length > 0 && (/\d+/.test(textToProcess) || textToProcess.includes('/'))) {
            regParts.push(textToProcess);
        } else {
            nameParts.push(textToProcess);
        }
    }
    
    let name = nameParts.join(' ').trim();
    let regNo = regParts.join('').replace(/\s+/g, '').trim();
    let signature = sigParts.join(' ').trim() || 'SD/-';
    
    if (signature.includes('SD/-') && signature.length > 5) {
        const namePart = signature.replace(/SD\/\-/, '').trim();
        if (namePart) {
            name = namePart;
            signature = 'SD/-';
        }
    }
    
    return { srNo, name, regNo, signature };
}

function reconstructLayout(text) {
    if (!text) return '';
    const joined = joinParagraphs(text);
    return formatSignatureTable(joined);
}

/**
 * Normalizes a line for footer comparison — strips page numbers so
 * "Page 21 of 84" and "Page 5 of 84" compare equal.
 */
function normalizeFooterLine(line) {
    return line
        .replace(/\bPage\s+\d+\s+of\s+\d+\b/gi, 'Page N of N')
        .replace(/\bpage\s+\d+\b/gi, 'Page N')
        .trim();
}

/**
 * Scans the first few lines of each page text to find lines that repeat
 * across ≥40% of pages (or at least 2 pages). These are court headers/footers.
 * Returns an array of normalized line strings to strip.
 */
/**
 * Scans the first few lines of each page text to find lines that repeat
 * across >= 30% of pages (or at least 2 pages). These are court headers/footers.
 * Returns an array of normalized line strings to strip.
 */
function detectRepeatingLines(pageTexts) {
    if (!pageTexts || pageTexts.length === 0) return [];
    const freq = new Map();
    for (const text of pageTexts) {
        // Check both the first 6 lines (header) and last 5 lines (footer)
        const lines = text.split('\n');
        const candidates = [
            ...lines.slice(0, 6),
            ...lines.slice(-5)
        ];
        const seen = new Set();
        for (const line of candidates) {
            const norm = normalizeFooterLine(line);
            if (norm.length < 5) continue; // skip trivial/blank lines
            if (seen.has(norm)) continue;
            seen.add(norm);
            freq.set(norm, (freq.get(norm) || 0) + 1);
        }
    }
    const threshold = Math.max(2, Math.ceil(pageTexts.length * 0.3));
    const repeating = [...freq.entries()]
        .filter(([, count]) => count >= threshold)
        .map(([line]) => line);
    if (repeating.length > 0) {
        console.log(`[PDF Header/Footer] Detected ${repeating.length} repeating line(s) to strip:`, repeating);
    }
    return repeating;
}

/**
 * Removes lines from text that match any of the detected footer fingerprints.
 * Comparison is done after normalizing page numbers.
 * On Page 1, preserves the top 8 lines (court name, bench, cause title).
 */
function stripFooterLines(text, footerLines, pageNo = 1) {
    if (!footerLines || footerLines.length === 0 || !text) return text;
    const footerSet = new Set(footerLines);
    return text.split('\n')
        .filter((line, idx) => {
            if (pageNo === 1 && idx < 8) return true;
            return !footerSet.has(normalizeFooterLine(line));
        })
        .join('\n')
        .replace(/\n{3,}/g, '\n\n'); // collapse excess blank lines left behind
}

const path = require('path');
const fs = require('fs');
let getConversionsDir;
try {
    ({ getConversionsDir } = require('../common/helper'));
} catch (_) {}

/**
 * Determines whether an extracted image is a header verification stamp, QR code, or corner logo.
 */
function isHeaderStampOrQr(img) {
    if (!img) return false;
    const top = img.top !== undefined ? img.top : (img.y0 !== undefined ? img.y0 : 0);
    const width = img.width || 0;
    const height = img.height || 0;

    // Small square or icon in header zone (< 120pt)
    const inHeaderZone = top <= 120;
    const isSmall = width <= 120 && height <= 120;
    const isSquareRatio = height > 0 && Math.abs(width - height) / Math.max(width, height) <= 0.25;
    const isTinyArea = (width * height) <= 15000;

    return (inHeaderZone && isSmall && isSquareRatio) || isTinyArea;
}

/**
 * Attempts to decode a QR code from a raw image stream (RGB / RGBA).
 */
function decodeQrFromImage(img) {
    if (!img || !img.stream || !img.srcSize) return null;
    try {
        const jsQR = require('jsqr');
        const [width, height] = img.srcSize;
        const rgb = img.stream;
        if (!width || !height || rgb.length < width * height * 3) {
            return null;
        }
        const rgba = new Uint8ClampedArray(width * height * 4);
        if (rgb.length >= width * height * 4) {
            rgba.set(rgb.subarray(0, width * height * 4));
        } else {
            for (let i = 0, j = 0; i < width * height * 3; i += 3, j += 4) {
                rgba[j] = rgb[i];
                rgba[j + 1] = rgb[i + 1];
                rgba[j + 2] = rgb[i + 2];
                rgba[j + 3] = 255;
            }
        }
        const code = jsQR(rgba, width, height);
        if (code && code.data && code.data.trim()) {
            return code.data.trim();
        }
    } catch (_) {}
    return null;
}

/**
 * Processes a single PDF page, extracting text/tables or executing placeholder warning fallback if scanned.
 * footerLines: optional array of normalized footer strings to strip (detected from earlier pages).
 * docContext: optional state object shared across document pages (stores decoded QR url, etc.).
 */
async function getProcessedPageContent(filePath, page, pageNo, footerLines = [], docContext = {}) {
    const pageTextRaw = await page.extractTextRaw();

    // Strip repeating header and footer lines from RAW text BEFORE joinParagraphs merges them
    const rawStripped = stripFooterLines(pageTextRaw || '', footerLines, pageNo);
    let pageText = reconstructLayout(rawStripped);

    // Legacy: Denoise repeating running headers from NCLT orders
    const cleanHeaderRegex = /\s*I\.A\.\s*\(PLAN\)\s*[\s\S]*?Page\s*\d+\s*of\s*\d+(\s*ORDER\s+PER:\s*BENCH)?/gi;
    pageText = pageText.replace(cleanHeaderRegex, '').trim();

    const tables = await page.extractTables();
    let tablesMd = '';
    if (tables && tables.length > 0) {
        for (const table of tables) {
            if (table.rows && table.rows.length > 0) {
                const headers = table.rows[0];
                const formatRow = (row) => `| ${row.map(cell => (cell !== undefined && cell !== null) ? String(cell).replace(/\|/g, '\\|').trim() : '').join(' | ')} |`;
                const headerMd = formatRow(headers);
                const separatorMd = `| ${headers.map(() => '---').join(' | ')} |`;
                let tableMd = `\n\n${headerMd}\n${separatorMd}\n`;
                for (let rIdx = 1; rIdx < table.rows.length; rIdx++) {
                    tableMd += `${formatRow(table.rows[rIdx])}\n`;
                }
                tablesMd += tableMd;
            }
        }
    }
    
    // Check for inline images/scanned components, ignoring small header stamps & QR codes
    let hasImages = false;
    try {
        const pageImages = await page.images;
        if (pageImages && pageImages.length > 0) {
            for (const img of pageImages) {
                if (docContext && !docContext.qrUrl) {
                    const decoded = decodeQrFromImage(img);
                    if (decoded) {
                        docContext.qrUrl = decoded;
                    }
                }
            }
            // Filter out header stamps, icons, and QR codes from table warning heuristics
            const contentImages = pageImages.filter(img => !isHeaderStampOrQr(img));
            hasImages = contentImages.length > 0;
        }
    } catch (e) {
        hasImages = false;
    }

    let content = `## Page ${pageNo}\n\n`;

    // If QR URL was verified and this is Page 1, present verified authenticity badge
    if (pageNo === 1 && docContext && docContext.qrUrl) {
        content += `> [!NOTE]\n`;
        content += `> 🏛️ **eCourts Digital Order Verification:** [${docContext.qrUrl}](${docContext.qrUrl})\n\n`;
    }

    const textLen = pageText.trim().length;

    if (textLen < 30) {
        // Scanned page/empty page
        content += `> [!WARNING]\n`;
        content += `> ### 🔍 SCANNED PAGE DETECTED (PAGE ${pageNo})\n`;
        content += `> **Location:** Page ${pageNo}\n`;
        content += `> **System Note:** This page has no native text layer. Local OCR processing was skipped to maintain offline privacy.\n`;
        content += `> **Action Required:** Convert this page externally and paste the text/content below.\n\n`;
    } else {
        content += pageText.trim() + '\n\n';
        if (tablesMd) {
            content += tablesMd + '\n';
        } else if (hasImages) {
            // Hybrid page: has native text but also genuine scanned images/tables which parsed as empty tables
            content += `> [!WARNING]\n`;
            content += `> ### 🔍 SCANNED TABLE DETECTED (PAGE ${pageNo})\n`;
            content += `> **Location:** Page ${pageNo}\n`;
            content += `> **System Note:** Scanned table or image components were detected on this page and skipped to maintain offline privacy.\n`;
            content += `> **Action Required:** Convert this table segment externally and paste the Markdown table/content below.\n`;
            content += `> \n`;
            content += `> \`\`\`markdown\n`;
            content += `> | [Col 1] | [Col 2] |\n`;
            content += `> |---------|---------|\n`;
            content += `> | Paste   | Here    |\n`;
            content += `> \`\`\`\n\n`;
        }
    }
    
    return content;
}

/**
 * Converts a PDF file into a Markdown string representation.
 * Detects repeating headers/footers from all pages and writes a .footer sidecar
 * for use by the background daemon (convertPdfBlock).
 */
async function convertPdf(filePath, options = {}) {
    const limit = options.limit || null;
    console.log(`[PDF Importer] Converting PDF file: ${filePath} (limit: ${limit})`);
    
    const pdf = await pdfexcavator.open(filePath);
    try {
        // Sample across pages (up to 30 pages) to detect repeating running headers and footers
        const sampleCount = Math.min(pdf.pages.length, 30);
        const sampleRawTexts = [];
        for (let i = 0; i < sampleCount; i++) {
            const raw = await pdf.pages[i].extractTextRaw();
            sampleRawTexts.push(raw || '');  // raw, unjoined — keeps footer as separate lines
        }
        
        // Ingestion check for scanned PDFs
        const totalRawLen = sampleRawTexts.reduce((acc, t) => acc + t.length, 0);
        const averageCharsPerPage = sampleCount > 0 ? (totalRawLen / sampleCount) : 0;
        if (averageCharsPerPage < 30) {
            await pdf.close();
            const err = new Error(
                "Fully scanned PDF detected. HAYAGRIVA Desktop operates 100% offline to protect case privacy and does not run local OCR. " +
                "Please convert this document to Markdown externally (e.g. using the HAYAGRIVA web/mobile app or local scanner software) and load the .md file directly."
            );
            err.code = 'SCANNED_PDF_REJECTED';
            throw err;
        }

        const footerLines = detectRepeatingLines(sampleRawTexts);

        // Write .footer sidecar for daemon batches to use inside conversions/ directory
        try {
            const ext = path.extname(filePath);
            const basename = path.basename(filePath, ext);
            const dir = path.dirname(filePath);
            const conversionsDir = (typeof getConversionsDir === 'function' && getConversionsDir(dir)) || path.join(dir, 'conversions');
            fs.mkdirSync(conversionsDir, { recursive: true });
            const footerSidecar = path.join(conversionsDir, `${basename}.footer`);
            fs.writeFileSync(footerSidecar, JSON.stringify(footerLines, null, 2), 'utf8');

            // Unlink legacy root sidecar if it exists
            const legacySidecar = filePath.replace(/\.pdf$/i, '.footer');
            if (fs.existsSync(legacySidecar) && path.resolve(legacySidecar) !== path.resolve(footerSidecar)) {
                try { fs.unlinkSync(legacySidecar); } catch (_) {}
            }
        } catch (e) {
            console.warn('[PDF Footer] Could not write .footer sidecar:', e.message);
        }

        // Pass 2: build markdown with footer stripping applied
        const docContext = { qrUrl: null };
        const pages = [];
        const count = limit ? Math.min(pdf.pages.length, limit) : pdf.pages.length;
        for (let i = 0; i < count; i++) {
            const page = pdf.pages[i];
            const pageNo = i + 1;
            const content = await getProcessedPageContent(filePath, page, pageNo, footerLines, docContext);
            pages.push({
                page_no: pageNo,
                content: content
            });
        }

        // Strip <!-- PAGE:X --> markers injected by pdfexcavator
        const fullMarkdown = pages.map(p => p.content).join('\n\n')
            .replace(/<!--\s*PAGE:\d+\s*-->\n?/g, '');

        const resultStr = new String(fullMarkdown);
        resultStr.pages = pages;
        resultStr.isPartial = limit ? (pdf.pages.length > limit) : false;
        resultStr.totalPages = pdf.pages.length;
        resultStr.qrUrl = docContext.qrUrl;
        return resultStr;
    } finally {
        try {
            await pdf.close();
        } catch(e) {}
    }
}

/**
 * Extracts and converts a range of pages from a PDF.
 * Reads the .footer sidecar (written by convertPdf) to strip repeating footers.
 */
async function convertPdfBlock(filePath, startPage, endPage) {
    console.log(`[PDF Importer] Converting PDF block: ${filePath} (pages: ${startPage}-${endPage})`);

    // Load footer fingerprint from sidecar (written during initial convertPdf call)
    let footerLines = [];
    try {
        const ext = path.extname(filePath);
        const basename = path.basename(filePath, ext);
        const dir = path.dirname(filePath);
        const conversionsDir = (typeof getConversionsDir === 'function' && getConversionsDir(dir)) || path.join(dir, 'conversions');
        const footerSidecar = path.join(conversionsDir, `${basename}.footer`);
        const legacySidecar = filePath.replace(/\.pdf$/i, '.footer');

        const targetSidecar = fs.existsSync(footerSidecar) ? footerSidecar : (fs.existsSync(legacySidecar) ? legacySidecar : null);
        if (targetSidecar) {
            footerLines = JSON.parse(fs.readFileSync(targetSidecar, 'utf8'));
            if (footerLines.length > 0) {
                console.log(`[PDF Footer] Loaded ${footerLines.length} footer line(s) from sidecar for stripping.`);
            }
        }
    } catch (e) {
        console.warn('[PDF Footer] Could not read .footer sidecar:', e.message);
    }

    const pdf = await pdfexcavator.open(filePath);
    try {
        const docContext = { qrUrl: null };
        const pages = [];
        const startIdx = Math.max(0, startPage - 1);
        const endIdx = Math.min(pdf.pages.length, endPage);

        for (let i = startIdx; i < endIdx; i++) {
            const page = pdf.pages[i];
            const pageNo = i + 1;
            const content = await getProcessedPageContent(filePath, page, pageNo, footerLines, docContext);
            pages.push(content);
        }

        // Strip <!-- PAGE:X --> markers injected by pdfexcavator
        return pages.join('\n\n').replace(/<!--\s*PAGE:\d+\s*-->\n?/g, '');
    } finally {
        await pdf.close();
    }
}

module.exports = { convertPdf, convertPdfBlock, joinParagraphs };

