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
function detectRepeatingLines(pageTexts) {
    if (!pageTexts || pageTexts.length === 0) return [];
    const freq = new Map();
    for (const text of pageTexts) {
        // Check both the first 5 lines (header) and last 5 lines (footer)
        const lines = text.split('\n');
        const candidates = [
            ...lines.slice(0, 5),
            ...lines.slice(-5)
        ];
        const seen = new Set();
        for (const line of candidates) {
            const norm = normalizeFooterLine(line);
            if (norm.length < 10) continue; // skip trivial/blank lines
            if (seen.has(norm)) continue;
            seen.add(norm);
            freq.set(norm, (freq.get(norm) || 0) + 1);
        }
    }
    const threshold = Math.max(2, Math.ceil(pageTexts.length * 0.4));
    const repeating = [...freq.entries()]
        .filter(([, count]) => count >= threshold)
        .map(([line]) => line);
    if (repeating.length > 0) {
        console.log(`[PDF Footer] Detected ${repeating.length} repeating header/footer line(s) to strip.`);
    }
    return repeating;
}

/**
 * Removes lines from text that match any of the detected footer fingerprints.
 * Comparison is done after normalizing page numbers.
 */
function stripFooterLines(text, footerLines) {
    if (!footerLines || footerLines.length === 0) return text;
    const footerSet = new Set(footerLines);
    return text.split('\n')
        .filter(line => !footerSet.has(normalizeFooterLine(line)))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n'); // collapse excess blank lines left behind
}

const path = require('path');
const fs = require('fs');

/**
 * Processes a single PDF page, extracting text/tables or executing placeholder warning fallback if scanned.
 * footerLines: optional array of normalized footer strings to strip (detected from earlier pages).
 */
async function getProcessedPageContent(filePath, page, pageNo, footerLines = []) {
    const pageTextRaw = await page.extractTextRaw();

    // Strip repeating footer lines from RAW text BEFORE joinParagraphs merges them
    const rawStripped = stripFooterLines(pageTextRaw || '', footerLines);
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
    
    // Check for inline images/scanned components
    let hasImages = false;
    try {
        const pageImages = await page.images;
        hasImages = pageImages && pageImages.length > 0;
    } catch (e) {
        hasImages = false;
    }

    let content = `## Page ${pageNo}\n\n`;
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
            // Hybrid page: has native text but also scanned images/tables which parsed as empty tables
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
        // Pass 1: extract raw text from all pages (before reconstruction, for footer detection)
        const rawPageTexts = [];
        const count = limit ? Math.min(pdf.pages.length, limit) : pdf.pages.length;
        for (let i = 0; i < count; i++) {
            const raw = await pdf.pages[i].extractTextRaw();
            rawPageTexts.push(raw || '');  // raw, unjoined — keeps footer as separate lines
        }
        
        // Ingestion check for scanned PDFs
        const totalRawLen = rawPageTexts.reduce((acc, t) => acc + t.length, 0);
        const averageCharsPerPage = count > 0 ? (totalRawLen / count) : 0;
        if (averageCharsPerPage < 30) {
            await pdf.close();
            const err = new Error(
                "Fully scanned PDF detected. HAYAGRIVA Desktop operates 100% offline to protect case privacy and does not run local OCR. " +
                "Please convert this document to Markdown externally (e.g. using the HAYAGRIVA web/mobile app or local scanner software) and load the .md file directly."
            );
            err.code = 'SCANNED_PDF_REJECTED';
            throw err;
        }

        const footerLines = detectRepeatingLines(rawPageTexts);

        // Write .footer sidecar for daemon batches to use inside conversions/ directory
        try {
            const ext = path.extname(filePath);
            const basename = path.basename(filePath, ext);
            const dir = path.dirname(filePath);
            const conversionsDir = path.join(dir, 'conversions');
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
        const pages = [];
        for (let i = 0; i < count; i++) {
            const page = pdf.pages[i];
            const pageNo = i + 1;
            const content = await getProcessedPageContent(filePath, page, pageNo, footerLines);
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
        const conversionsDir = path.join(dir, 'conversions');
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
        const pages = [];
        const startIdx = Math.max(0, startPage - 1);
        const endIdx = Math.min(pdf.pages.length, endPage);

        for (let i = startIdx; i < endIdx; i++) {
            const page = pdf.pages[i];
            const pageNo = i + 1;
            const content = await getProcessedPageContent(filePath, page, pageNo, footerLines);
            pages.push(content);
        }

        // Strip <!-- PAGE:X --> markers injected by pdfexcavator
        return pages.join('\n\n').replace(/<!--\s*PAGE:\d+\s*-->\n?/g, '');
    } finally {
        await pdf.close();
    }
}

module.exports = { convertPdf, convertPdfBlock, joinParagraphs };

