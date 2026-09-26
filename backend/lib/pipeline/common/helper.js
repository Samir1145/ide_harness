const fs = require('fs');
const path = require('path');
const bm25 = require('../../core/bm25');
const { getChatResponse } = require('../../core/llm-client');
const { compileHeadingRegex } = require('../../core/splitter');

/**
 * Sanitizes header titles into safe file system names.
 */
function getSafeFilename(title) {
    let safe = title.replace(/[^a-zA-Z0-9\s-_]/g, '').trim().replace(/\s+/g, '_') || 'untitled';
    if (safe.length > 60) {
        let hash = 0;
        for (let i = 0; i < title.length; i++) {
            hash = (hash << 5) - hash + title.charCodeAt(i);
            hash |= 0;
        }
        safe = safe.substring(0, 60) + '_' + Math.abs(hash);
    }
    return safe;
}

/**
 * Analyzes document structure via local LLM classification to infer heading formats.
 */
async function probeLayoutProfile(filePath, rawMd) {
    const totalPages = (rawMd && rawMd.totalPages) || 0;

    let sampleText = '';
    if (rawMd && rawMd.pages && rawMd.pages.length > 0) {
        const midIdx = Math.max(0, Math.floor(rawMd.pages.length / 2) - 1);
        sampleText = rawMd.pages.slice(midIdx, midIdx + 2).map(p => p.content).join('\n\n');
    } else if (typeof rawMd === 'string') {
        sampleText = rawMd.substring(0, 3000);
    }

    if (!sampleText.trim()) {
        console.log('[Layout Profiler] No sample text available, skipping LLM probe.');
        return null;
    }

    sampleText = sampleText.substring(0, 2000);

    const prompt = `You are a document layout classifier. Analyze the following sample text extracted from a PDF.
Identify which of the following best describes how major section headings are formatted:

A) Numeric decimal hierarchy – headings begin with numbers like "1.1", "2.3.4", "3."
B) Standard legal prefix – headings begin with: Chapter, Section, Article, Clause, Part, Annexure, Annex, Schedule, Regulation, Rule, Order, Appendix, Para, Preamble
C) All-capital letters – headings are entirely uppercase, like "INTRODUCTION" or "BOARD RECOMMENDATIONS"
D) Custom recurring word prefix – headings use a non-standard word like "Sutra", "Pillar", "Principle", "Standard", "Guideline", "Directive", "Exhibit", "Module", "Finding", "Observation", "Ground", "Charge". State the specific prefix word.
E) Roman numeral or letter enumeration – headings begin with "I.", "II.", "A.", "(a)", "(i)"
F) Date or circular number header – headings begin with "Circular No.", "Notification No.", "F.No."
G) No structured headings – document has no discernible section headings (e.g. bank statement, scanned form)

SAMPLE TEXT:
${sampleText}

Respond with ONLY a single letter (A to G). If D, also include the prefix word after a colon, like: D: Sutra
Do not write any explanation or extra text.`;

    try {
        const response = await getChatResponse([{ role: 'user', content: prompt }], { timeout: 20000 });
        const raw = (response || '').trim();
        const match = raw.match(/^([A-Ga-g])(?::\s*(\S+))?/);
        if (!match) {
            console.log(`[Layout Profiler] LLM returned unrecognised response: "${raw}". Using default inference.`);
            return null;
        }

        const category = match[1].toUpperCase();
        const customPrefix = match[2] || '';
        console.log(`[Layout Profiler] Classified "${path.basename(filePath)}" as Category ${category}${customPrefix ? ` (prefix: "${customPrefix}")` : ''}`);

        const headingRegex = compileHeadingRegex(category, customPrefix);
        if (!headingRegex) {
            console.log('[Layout Profiler] Category G — will use paragraph-block fallback splitter.');
        }
        return headingRegex;
    } catch (e) {
        console.warn('[Layout Profiler] LLM probe failed, using default heading inference:', e.message);
        return null;
    }
}

/**
 * Helper to recursively merge files from source directory to target directory, then remove source.
 */
function mergeAndCleanDir(srcDir, destDir) {
    if (!fs.existsSync(srcDir) || path.resolve(srcDir) === path.resolve(destDir)) return;
    fs.mkdirSync(destDir, { recursive: true });
    try {
        const entries = fs.readdirSync(srcDir, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(srcDir, entry.name);
            const destPath = path.join(destDir, entry.name);
            if (entry.isDirectory()) {
                mergeAndCleanDir(srcPath, destPath);
            } else {
                if (!fs.existsSync(destPath)) {
                    try {
                        fs.renameSync(srcPath, destPath);
                    } catch (_) {
                        try {
                            fs.copyFileSync(srcPath, destPath);
                            fs.unlinkSync(srcPath);
                        } catch (_) {}
                    }
                } else {
                    try { fs.unlinkSync(srcPath); } catch (_) {}
                }
            }
        }
        try { fs.rmSync(srcDir, { recursive: true, force: true }); } catch (_) {}
    } catch (e) {
        console.warn(`[Directory Resolver] Failed to clean ${srcDir}:`, e.message);
    }
}

/**
 * Initializes and resets the concepts subfolder inside case workspace.
 */
function setupConceptsDir(caseDir, basename) {
    const parentConcepts = getConceptsDir(caseDir);
    const conceptsDir = path.join(parentConcepts, basename);
    if (fs.existsSync(conceptsDir)) {
        fs.rmSync(conceptsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(conceptsDir, { recursive: true });
    return conceptsDir;
}

/**
 * Clears old search index nodes of a document before re-indexing.
 */
function cleanBm25Index(bm25Index, basename) {
    for (const id in bm25Index.docLengths) {
        if (id.startsWith(`${basename}::`)) {
            bm25.removeDocument(bm25Index, id);
        }
    }
}

/**
 * Detects if a file is a TiddlyWiki HTML file (.wiki.html or .html with TW markers).
 */
function isTiddlyWikiHtml(filePath) {
    if (!filePath) return false;
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.wiki.html')) return true;
    if (lower.endsWith('.html') || lower.endsWith('.htm')) {
        try {
            const head = fs.readFileSync(filePath, { encoding: 'utf8', flag: 'r' }).slice(0, 15000);
            return head.includes('tiddlywiki-tiddler-store') || 
                   head.includes('storeArea') || 
                   head.includes('tiddlywiki') ||
                   head.includes('TiddlyWiki');
        } catch (_) {}
    }
}

function isValidCaseDir(caseDir) {
    if (!caseDir || typeof caseDir !== 'string') return false;
    const trimmed = caseDir.trim();
    if (!trimmed) return false;
    // Query strings, questions, prompts, or newlines are not valid case directories
    if (trimmed.includes('?') || trimmed.includes('\n') || trimmed.length > 150) return false;
    try {
        return fs.existsSync(trimmed) && fs.statSync(trimmed).isDirectory();
    } catch (_) {
        return false;
    }
}

/**
 * Dynamic Directory Resolvers for Case Subfolders:
 * Target format: <case_name>_<type>_haya (e.g., ipie_conversions_haya)
 * Auto-syncs subfolder prefixes if parent case directory is renamed.
 */
function getConversionsDir(caseDir) {
    if (!isValidCaseDir(caseDir)) return '';
    const caseName = path.basename(caseDir);
    const targetDir = path.join(caseDir, `${caseName}_conversions_haya`);
    if (!fs.existsSync(targetDir)) {
        try { fs.mkdirSync(targetDir); } catch (_) {}
    }

    if (fs.existsSync(caseDir)) {
        try {
            const entries = fs.readdirSync(caseDir);
            for (const entry of entries) {
                if (entry === 'conversions' || (entry.endsWith('_conversions_haya') && entry !== `${caseName}_conversions_haya`)) {
                    const legacyPath = path.join(caseDir, entry);
                    mergeAndCleanDir(legacyPath, targetDir);
                }
            }
        } catch (_) {}
    }
    return targetDir;
}

function getConceptsDir(caseDir) {
    if (!isValidCaseDir(caseDir)) return '';
    const caseName = path.basename(caseDir);
    const targetDir = path.join(caseDir, `${caseName}_concepts_haya`);
    if (!fs.existsSync(targetDir)) {
        try { fs.mkdirSync(targetDir); } catch (_) {}
    }

    if (fs.existsSync(caseDir)) {
        try {
            const entries = fs.readdirSync(caseDir);
            for (const entry of entries) {
                if (entry === 'concepts' || (entry.endsWith('_concepts_haya') && entry !== `${caseName}_concepts_haya`)) {
                    const legacyPath = path.join(caseDir, entry);
                    mergeAndCleanDir(legacyPath, targetDir);
                }
            }
        } catch (_) {}
    }
    return targetDir;
}

function getWikiDir(caseDir) {
    if (!isValidCaseDir(caseDir)) return '';
    const caseName = path.basename(caseDir);
    const targetDir = path.join(caseDir, `${caseName}_wiki_haya`);
    if (!fs.existsSync(targetDir)) {
        try { fs.mkdirSync(targetDir); } catch (_) {}
    }

    if (fs.existsSync(caseDir)) {
        try {
            const entries = fs.readdirSync(caseDir);
            for (const entry of entries) {
                if (entry === 'wiki' || (entry.endsWith('_wiki_haya') && entry !== `${caseName}_wiki_haya`)) {
                    const legacyPath = path.join(caseDir, entry);
                    mergeAndCleanDir(legacyPath, targetDir);
                }
            }
        } catch (_) {}
    }
    return targetDir;
}

function chunkText(text, maxChars = 3000, overlapParas = 1) {
    const paras = text.split(/\n\s*\n/).filter(p => p.trim());
    const chunks = [];
    let currentChunk = [];
    let currentLen = 0;
    
    for (let i = 0; i < paras.length; i++) {
        const p = paras[i];
        currentChunk.push(p);
        currentLen += p.length;
        
        if (currentLen >= maxChars || i === paras.length - 1) {
            chunks.push(currentChunk.join('\n\n'));
            if (overlapParas > 0 && i < paras.length - 1) {
                currentChunk = currentChunk.slice(-overlapParas);
                currentLen = currentChunk.reduce((acc, c) => acc + c.length, 0);
            } else {
                currentChunk = [];
                currentLen = 0;
            }
        }
    }
    return chunks;
}

module.exports = {
    getSafeFilename,
    probeLayoutProfile,
    setupConceptsDir,
    cleanBm25Index,
    isTiddlyWikiHtml,
    isValidCaseDir,
    getConversionsDir,
    getConceptsDir,
    getWikiDir,
    chunkText
};
