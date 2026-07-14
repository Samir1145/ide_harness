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
const os = require('os');
const { execSync } = require('child_process');
const { getChatResponse } = require('../../core/llm-client');

/**
 * Invokes the Cocoa PDFKit compiled Swift tool to render a single PDF page into PNG.
 */
function renderPageToPng(pdfPath, pageNo, outputPath) {
    const binPath = path.join(__dirname, 'pdf2png');
    try {
        fs.chmodSync(binPath, '755');
    } catch(e) {}
    
    console.log(`[PDF Ingestion] Rendering PDF page ${pageNo} to ${outputPath} using native Cocoa tool...`);
    const cmd = `"${binPath}" "${pdfPath}" ${pageNo} "${outputPath}"`;
    execSync(cmd);
}

/**
 * Invokes vision OCR via OpenRouter (Gemini 2.5 Flash) to extract text and tables from a page screenshot.
 * Falls back gracefully if the key is missing or the render fails.
 */
async function ocrPageWithVision(pdfPath, pageNo) {
    const tmpPng = path.join(os.tmpdir(), `page_${pageNo}_${Date.now()}.png`);
    try {
        renderPageToPng(pdfPath, pageNo, tmpPng);
        if (!fs.existsSync(tmpPng)) {
            throw new Error(`Failed to render PNG image for page ${pageNo}`);
        }
        
        const base64Img = fs.readFileSync(tmpPng, { encoding: 'base64' });
        
        console.log(`[PDF Ingestion] Invoking vision OCR via OpenRouter (google/gemini-2.5-flash) for Page ${pageNo}...`);
        const messages = [
            {
                role: 'system',
                content: 'You are a precise document OCR assistant. Extract all text faithfully and reconstruct any tables or forms as clean Markdown tables with proper | column | separators |. Output only Markdown content — no preamble, no explanation.'
            },
            {
                role: 'user',
                content: 'Extract all text and tables from this PDF page image. Return clean Markdown.',
                images: [base64Img]
            }
        ];
        
        const response = await getChatResponse(messages, {
            model: 'google/gemini-2.5-flash',  // Routed to OpenRouter automatically
            timeout: 120000 // 120s timeout for complex vision OCR tasks (tables, dense pages)
        });
        
        console.log(`[PDF Ingestion] Vision OCR successfully processed Page ${pageNo}.`);
        return response.trim();
    } catch (err) {
        console.error(`[PDF Ingestion] Vision OCR failed for Page ${pageNo}:`, err.message);
        return null;
    } finally {
        try {
            if (fs.existsSync(tmpPng)) {
                fs.unlinkSync(tmpPng);
            }
        } catch (e) {}
    }
}

/**
 * Processes a single PDF page, extracting text/tables or executing OCR fallback if scanned/blank.
 * footerLines: optional array of normalized footer strings to strip (detected from earlier pages).
 */
async function getProcessedPageContent(filePath, page, pageNo, footerLines = []) {
    const pageTextRaw = await page.extractTextRaw();

    // Strip repeating footer lines from RAW text BEFORE joinParagraphs merges them
    // (footer lines are separate lines in raw pdfexcavator output; merged after reconstruction)
    const rawStripped = stripFooterLines(pageTextRaw || '', footerLines);
    let pageText = reconstructLayout(rawStripped);

    // Legacy: Denoise repeating running headers from NCLT orders (I.A. (PLAN) with dots format)
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
    
    // Check if the page is scanned/image-heavy or if text extraction looks thin
    // Vision OCR is triggered when:
    //   a) Page has very little extractable text (scanned/image page), OR
    //   b) Page has some text but tables parsed empty and total content is thin (layout table)
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    let needsVisionOcr = false;
    try {
        const pageImages = await page.images;
        const hasImages = pageImages && pageImages.length > 0;
        const thinText = pageText.trim().length < 400;
        const noTables = !tablesMd;
        // Trigger if: scanned page OR (has images AND thin text with no parsed tables)
        needsVisionOcr = openrouterKey && (
            pageText.trim().length < 50 ||
            (hasImages && thinText && noTables)
        );
    } catch (e) {
        needsVisionOcr = openrouterKey && pageText.trim().length < 50;
    }

    let ocrText = null;
    if (needsVisionOcr) {
        ocrText = await ocrPageWithVision(filePath, pageNo);
    }
    
    let content = `## Page ${pageNo}\n\n`;
    if (ocrText) {
        content += ocrText + '\n';
    } else {
        if (pageText && pageText.trim()) {
            content += pageText.trim() + '\n';
        }
        if (tablesMd) {
            content += tablesMd + '\n';
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
    const limit = options.multimodal ? null : (options.limit || null);
    const apiKey = process.env.GEMINI_API_KEY;
    console.log(`[PDF Importer] Converting PDF file: ${filePath} (limit: ${limit}, multimodal: ${!!options.multimodal})`);
    
    const pdf = await pdfexcavator.open(filePath);
    try {
        // Pass 1: extract raw text from all pages (before reconstruction, for footer detection)
        const rawPageTexts = [];
        const count = limit ? Math.min(pdf.pages.length, limit) : pdf.pages.length;
        for (let i = 0; i < count; i++) {
            const raw = await pdf.pages[i].extractTextRaw();
            rawPageTexts.push(raw || '');  // raw, unjoined — keeps footer as separate lines
        }
        
        // Automatic vision fallback check
        const totalRawLen = rawPageTexts.reduce((acc, t) => acc + t.length, 0);
        let useMultimodal = !!options.multimodal;
        if (totalRawLen < 50 && apiKey) {
            console.log(`[PDF Importer] Scanned/empty PDF detected (length: ${totalRawLen}). Triggering multimodal fallback...`);
            useMultimodal = true;
        }

        if (useMultimodal && apiKey) {
            try {
                // Close local pdf handle first
                await pdf.close();
                const { convertPdfVisually } = require('../../utils/multimodal_parser');
                const visualMarkdown = await convertPdfVisually(filePath, apiKey);
                const resultStr = new String(visualMarkdown);
                resultStr.pages = [{ page_no: 1, content: visualMarkdown }];
                resultStr.isPartial = false;
                resultStr.totalPages = 1;
                return resultStr;
            } catch (e) {
                console.error('[PDF Importer] Multimodal fallback failed:', e.message);
                // Re-open if we closed it
                throw e; // Bubble up or fall back to standard OCR
            }
        }

        const footerLines = detectRepeatingLines(rawPageTexts);

        // Write .footer sidecar for daemon batches to use
        try {
            const footerSidecar = filePath.replace(/\.pdf$/i, '.footer');
            fs.writeFileSync(footerSidecar, JSON.stringify(footerLines, null, 2), 'utf8');
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
        const footerSidecar = filePath.replace(/\.pdf$/i, '.footer');
        if (fs.existsSync(footerSidecar)) {
            footerLines = JSON.parse(fs.readFileSync(footerSidecar, 'utf8'));
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

module.exports = { convertPdf, convertPdfBlock };

