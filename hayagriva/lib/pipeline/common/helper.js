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
 * Initializes and resets the concepts subfolder inside case workspace.
 */
function setupConceptsDir(caseDir, basename) {
    const conceptsDir = path.join(caseDir, 'concepts', basename);
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

module.exports = {
    getSafeFilename,
    probeLayoutProfile,
    setupConceptsDir,
    cleanBm25Index
};
