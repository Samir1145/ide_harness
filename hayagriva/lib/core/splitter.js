const path = require('path');

const STANDARD_KEYWORDS = new Set([
    'INTRODUCTION', 'ABSTRACT', 'KEYWORDS', 'CONCLUSION', 'REFERENCES', 
    'BIBLIOGRAPHY', 'INDEX', 'GLOSSARY', 'SUMMARY', 'ANNEXURE', 'APPENDIX', 
    'FOREWORD', 'PREFACE'
]);

const STOP_WORDS = new Set([
    'the', 'and', 'a', 'an', 'of', 'to', 'in', 'is', 'for', 'that', 'this', 'with', 'on', 'at', 'by', 'from', 'as', 'it', 'its', 'not', 'are', 'be', 'or', 'your', 'our', 'we', 'you', 'they', 'them', 'their', 'will', 'can', 'should', 'would', 'have', 'has', 'had', 'was', 'were', 'been', 'about', 'more', 'some', 'any', 'other', 'such', 'this', 'that', 'these', 'those', 'than', 'then', 'into', 'only', 'also', 'just', 'how', 'what', 'where', 'when', 'who', 'which', 'why', 'fundamentals', 'practice', 'course', 'structure', 'session', 'duration', 'topics', 'cover', 'objective', 'total', 'target'
]);

function extractKeyTopics(text, count = 6) {
    if (!text) return [];
    const words = text.toLowerCase()
        .replace(/[^a-zA-Z\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length >= 4 && !STOP_WORDS.has(w));
        
    const freqs = {};
    for (const w of words) {
        freqs[w] = (freqs[w] || 0) + 1;
    }
    
    return Object.keys(freqs)
        .sort((a, b) => freqs[b] - freqs[a])
        .slice(0, count);
}

const PROFILES = {
    default: {
        numeric: /^\d+(?:\.\d+)*\.?\s+[A-Za-z]/,
        structure: /^(SECTION|ARTICLE|CLAUSE|PART|SESSION|Session|CHAPTER|Chapter|SUTRA|Sutra|PILLAR|Pillar|ANNEXURE|Annexure)\s*[A-Za-z0-9_-]*/i,
        allcaps: /^[A-Z\s_-]{3,200}$/
    }
};

/**
 * Translates the LLM's single-letter layout classification (A–G) into a compiled
 * RegExp ready for use as a heading landmark detector.
 *
 * @param {string} category  - One of 'A'|'B'|'C'|'D'|'E'|'F'|'G'
 * @param {string} [customPrefix] - Required when category === 'D' (e.g. "Sutra", "Pillar")
 * @returns {RegExp|null}  - Null for category G (no-heading fallback)
 */
function compileHeadingRegex(category, customPrefix = '') {
    switch (category.trim().toUpperCase()) {
        case 'A':
            // Numeric decimal hierarchy: 1.1, 2.3.4, 4.1.2.1, 3., 12.1.3.
            return /^\d+(?:\.\d+)*\.?\s+\S/;

        case 'B':
            // Standard legal/formal prefix keywords
            return /^(?:Chapter|Section|Article|Clause|Part|Annexure|Annex|Schedule|Regulation|Rule|Order|Appendix|Paragraph|Para|Preamble)\s+[\dIVXivxA-Za-z]/;

        case 'C':
            // All-capital letter headers (5+ chars, all uppercase)
            return /^[A-Z][A-Z\s]{4,}$/;

        case 'D': {
            // Custom recurring word prefix (LLM returns the specific prefix word)
            const prefix = (customPrefix || '').trim();
            if (!prefix) {
                console.warn('[Splitter] Category D requires a customPrefix word. Falling back to default profile.');
                return null;
            }
            const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`^${escaped}\\s+[\\dIVXivxA-Za-z]`);
        }

        case 'E':
            // Roman numeral / letter enumeration: I., II., A., (a), (i)
            return /^(?:[IVXLCDM]+\.|[A-Z]\.|\([a-z]\)|\([ivx]+\))\s+\S/;

        case 'F':
            // Date/circular number headers: "Circular No. RBI/...", "Notification No. FEMA...", "F.No. 225/..."
            return /^(?:Circular\s+No\.|Notification\s+No\.|F\.?\s*No\.)\s+\S/;

        case 'G':
        default:
            // No structured headings — caller should use paragraph/page-block fallback
            return null;
    }
}

function inferHeadings(markdown, profileName = 'default', option = 'option_1', customRegexStr = '') {
    const lines = markdown.split(/\r?\n/);
    const outputLines = [];
    const prof = PROFILES.default;

    let customRegexes = [];
    if (customRegexStr) {
        const patterns = customRegexStr.split(/\r?\n/).map(p => p.trim()).filter(Boolean);
        for (const pattern of patterns) {
            try {
                customRegexes.push(new RegExp(pattern));
            } catch (e) {
                console.error(`Failed to compile custom regex "${pattern}":`, e.message);
            }
        }
    }

    const checkNumeric = (option === 'option_1' || option === 'option_2');
    const checkStructure = (option === 'option_1' || option === 'option_3');
    const checkKeywords = (option === 'option_1' || option === 'option_4');
    const checkAllCaps = (option === 'option_1' || option === 'option_5');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('<!--')) {
            outputLines.push(lines[i]);
            continue;
        }

        let isCustomHeading = false;
        if (customRegexes.length > 0) {
            for (const rx of customRegexes) {
                if (rx.test(line)) {
                    isCustomHeading = true;
                    break;
                }
            }
        }
        
        let isNumericHeading = false;
        if (checkNumeric && prof.numeric.test(line)) {
            if (line.length < 80) {
                const endsWithPunctuation = /[.,;:&]/.test(line[line.length - 1]);
                const containsYear = /\b(19|20)\d{2}\b/.test(line);
                if (!endsWithPunctuation && !containsYear) {
                    isNumericHeading = true;
                }
            }
        }
        
        const isStructureHeading = checkStructure && prof.structure.test(line);
        const isStandardMixedCase = checkStructure && /^(Introduction|Abstract|Conclusion|References|Bibliography|Summary|Appendix)$/i.test(line);
        const isKeywordHeading = checkKeywords && prof.keywords && prof.keywords.test(line);

        let isAllCapsHeading = false;
        if (checkAllCaps && prof.allcaps.test(line) && line.length < 60) {
            const words = line.split(/\s+/).filter(Boolean);
            if (words.length === 1) {
                if (STANDARD_KEYWORDS.has(words[0])) {
                    isAllCapsHeading = true;
                }
            } else if (words.length > 1) {
                const lastWord = words[words.length - 1];
                const endsWithPunctuation = /[.,;:&]/.test(lastWord);
                if (!endsWithPunctuation) {
                    isAllCapsHeading = true;
                }
            }
        }

        if (isCustomHeading || isNumericHeading || isStructureHeading || isStandardMixedCase || isKeywordHeading || isAllCapsHeading) {
            outputLines.push(`# ${line}`);
        } else {
            outputLines.push(lines[i]);
        }
    }
    return outputLines.join('\n');
}

/**
 * Splits pre-processed markdown by heading markers.
 * @param {string} markdown
 * @param {string} docPath
 * @param {RegExp|null} [headingRegex]  When supplied, this regex is matched directly
 *   against raw lines BEFORE markdown heading markers (# …) are checked, allowing
 *   the LLM-profiled regex to drive splitting instead of inferHeadings.
 */
function splitByHeadings(markdown, docPath, headingRegex = null) {
    const sections = [];
    const lines = markdown.split(/\r?\n/);
    let current = null;
    let activePage = 1;
    
    for (const line of lines) {
        const pageMatch = line.match(/<!-- PAGE:(\d+) -->/) || line.match(/^## Page\s+(\d+)/i);
        if (pageMatch) {
            activePage = parseInt(pageMatch[1], 10);
        }

        if (headingRegex && !line.startsWith('#') && !line.startsWith('<!--') && headingRegex.test(line.trim())) {
            if (current) {
                const contentPages = [
                    ...current.content.matchAll(/<!-- PAGE:(\d+) -->/g),
                    ...current.content.matchAll(/## Page\s+(\d+)/gi)
                ].map(m => parseInt(m[1], 10));
                current.pageEnd = contentPages.length > 0 ? contentPages[contentPages.length - 1] : current.pageIndex;
                sections.push(current);
            }
            current = { title: line.trim(), level: 1, content: '', pageIndex: activePage };
            continue;
        }
        
        const match = line.match(/^(#{1,6})\s+(.+)/);
        if (match) {
            if (current) {
                // Determine pageEnd for the completed section
                const contentPages = [
                    ...current.content.matchAll(/<!-- PAGE:(\d+) -->/g),
                    ...current.content.matchAll(/## Page\s+(\d+)/gi)
                ].map(m => parseInt(m[1], 10));
                if (contentPages.length > 0) {
                    current.pageEnd = contentPages[contentPages.length - 1];
                } else {
                    current.pageEnd = current.pageIndex;
                }
                sections.push(current);
            }
            current = { 
                title: match[2].trim(), 
                level: match[1].length, 
                content: '',
                pageIndex: activePage
            };
        } else if (current) {
            current.content += (current.content ? '\n' : '') + line;
        } else {
            current = { 
                title: path.basename(docPath, path.extname(docPath)), 
                level: 1, 
                content: line,
                pageIndex: activePage
            };
        }
    }
    if (current) {
        const contentPages = [
            ...current.content.matchAll(/<!-- PAGE:(\d+) -->/g),
            ...current.content.matchAll(/## Page\s+(\d+)/gi)
        ].map(m => parseInt(m[1], 10));
        if (contentPages.length > 0) {
            current.pageEnd = contentPages[contentPages.length - 1];
        } else {
            current.pageEnd = current.pageIndex;
        }
        sections.push(current);
    }
    
    // Clean up markers from section titles and content
    for (const sec of sections) {
        sec.title = sec.title.replace(/<!-- PAGE:\d+ -->/g, '').trim();
        sec.content = sec.content.replace(/<!-- PAGE:\d+ -->\r?\n?/g, '').trim();
    }
    
    return sections;
}

function splitByParagraphs(markdown, maxChunks = 8) {
    const paras = markdown.split(/\n\s*\n/).filter(p => p.trim());
    const out = [];
    const chunkSize = Math.max(1, Math.ceil(paras.length / maxChunks));
    for (let i = 0; i < paras.length; i += chunkSize) {
        const chunk = paras.slice(i, i + chunkSize).join('\n\n');
        out.push({ title: `Section ${out.length + 1}`, level: 2, content: chunk });
    }
    return out;
}

function splitByPages(pages) {
    return pages.map(p => ({
        title: `Page ${p.page_no}`,
        level: 2,
        content: p.content,
        pageIndex: p.page_no
    }));
}

/**
 * Splits PDF pages by headings.
 * @param {Array} pages
 * @param {string} docPath
 * @param {string} [profileName]
 * @param {string} [option]
 * @param {string} [customRegexStr]
 * @param {RegExp|null} [headingRegex]  LLM-profiled override regex (skips inferHeadings when set)
 */
function splitPdfPagesByHeadings(pages, docPath, profileName = 'default', option = 'option_1', customRegexStr = '', headingRegex = null) {
    let combinedMd = '';
    for (const p of pages) {
        combinedMd += `\n\n<!-- PAGE:${p.page_no} -->\n\n${p.content}\n\n`;
    }

    if (headingRegex) {
        // LLM profile active — skip inferHeadings, pass regex directly to the splitter
        console.log(`[Splitter] Using LLM-profiled heading regex: ${headingRegex}`);
        return splitByHeadings(combinedMd, docPath, headingRegex);
    }

    const inferred = inferHeadings(combinedMd, profileName, option, customRegexStr);
    return splitByHeadings(inferred, docPath);
}

function splitByParagraphBlocks(markdown, docPath, blockSize = 8) {
    const paras = markdown.split(/\n\s*\n/).filter(p => p.trim());
    const sections = [];
    for (let i = 0; i < paras.length; i += blockSize) {
        const chunk = paras.slice(i, i + blockSize).join('\n\n');
        const pageNum = Math.floor(i / blockSize) + 1;
        sections.push({
            title: `Page ${pageNum}`,
            level: 2,
            content: `## Page ${pageNum}\n\n${chunk}`,
            pageIndex: pageNum
        });
    }
    return sections;
}

/**
 * Top-level document splitter. Dispatches to PDF, Word, or plain-text strategies.
 * @param {string|object} markdown        Raw markdown string, or object with .pages array
 * @param {string}        docPath         Source file path (used for fallback title)
 * @param {string}        [profileName]   Legacy profile name (kept for backward compat)
 * @param {string}        [option]        Legacy option flag  (kept for backward compat)
 * @param {string}        [customRegexStr] Legacy custom regex (kept for backward compat)
 * @param {RegExp|null}   [headingRegex]  LLM-profiled override regex
 */
function splitDocument(markdown, docPath, profileName = 'default', option = 'option_1', customRegexStr = '', headingRegex = null) {
    if (markdown && typeof markdown === 'object' && Array.isArray(markdown.pages)) {
        if (headingRegex) {
            console.log(`[Splitter] Slicing PDF with LLM-profiled heading regex (Total: ${markdown.pages.length} pages)`);
        } else {
            console.log(`[Splitter] Slicing PDF with heading inference (Total: ${markdown.pages.length} pages)`);
        }
        return splitPdfPagesByHeadings(markdown.pages, docPath, profileName, option, customRegexStr, headingRegex);
    }

    const ext = path.extname(docPath).toLowerCase();
    if (ext === '.docx') {
        const headingSplit = splitByHeadings(markdown, docPath, headingRegex);
        if (headingSplit.length >= 2) {
            console.log(`[Splitter] Word doc split by headings (Total: ${headingSplit.length} sections)`);
            return headingSplit;
        }
        console.log(`[Splitter] Word doc lacks headings, falling back to 8-paragraph chunk blocks`);
        return splitByParagraphBlocks(markdown, docPath, 8);
    }

    // For plain text / markdown files — if LLM regex provided, use it directly
    if (headingRegex) {
        const headingSplit = splitByHeadings(markdown, docPath, headingRegex);
        if (headingSplit.length >= 2) return headingSplit;
        return splitByParagraphBlocks(markdown, docPath, 8);
    }

    let processedMd = markdown;
    if (profileName !== 'default' || option !== 'option_1' || customRegexStr) {
        processedMd = inferHeadings(markdown, profileName, option, customRegexStr);
    } else if (!/#\s+/.test(markdown)) {
        processedMd = inferHeadings(markdown, profileName, option, customRegexStr);
    }

    const headingSplit = splitByHeadings(processedMd, docPath);
    if (headingSplit.length >= 2) {
        return headingSplit;
    }
    
    return splitByParagraphBlocks(processedMd, docPath, 8);
}

function applyCleanRules(markdown, rules) {
    if (!rules || !Array.isArray(rules)) return markdown;
    let text = markdown;
    for (const rule of rules) {
        if (!rule.find) continue;
        try {
            const regex = new RegExp(rule.find, 'gi');
            let replacement = rule.replace || '';
            replacement = replacement
                .replace(/\\n/g, '\n')
                .replace(/\\t/g, '\t')
                .replace(/\\r/g, '\r');
            text = text.replace(regex, replacement);
        } catch (e) {
            console.error('Failed to run clean rule:', rule.find, e.message);
        }
    }
    return text.trim();
}

module.exports = { splitDocument, splitByHeadings, splitByParagraphs, splitByPages, splitByParagraphBlocks, inferHeadings, compileHeadingRegex, applyCleanRules, extractKeyTopics };
