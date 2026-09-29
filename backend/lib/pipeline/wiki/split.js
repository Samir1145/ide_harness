'use strict';

const fs = require('fs');
const path = require('path');
const { getWikiDir, getSafeFilename, getConversionsDir } = require('../common/helper');
const { generateTiddlyWikiHtml, buildTiddlersFromChunks } = require('./tiddlywiki-template');

/**
 * Maps a TiddlyWiki store array directly to standardized sections.
 * (Maintains strict backward compatibility with existing callers)
 * @param {Array<Object>} tiddlers - Parsed user tiddlers from wiki HTML store
 * @returns {Array<Object>} Standardized sections list
 */
function splitWiki(tiddlers) {
    console.log(`[Wiki Splitter] Mapping wiki store of ${tiddlers.length} tiddlers`);
    return tiddlers.map(tid => ({
        title: tid.title,
        level: 2,
        content: tid.text || '',
        tags: tid.tags
    }));
}

/**
 * Formats a card into standard TiddlyWiki RFC 822 format (.tid file).
 * Header lines (key: value) followed by a blank line, followed by raw markdown body.
 *
 * @param {Object} card
 * @returns {string} RFC 822 formatted string
 */
function serializeTidCard({ title, tags = '', type = 'text/x-markdown', doc = '', order = 0, created = '', modified = '', text = '' }) {
    const nowStr = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17);
    const tagStr = Array.isArray(tags) ? tags.join(' ') : String(tags || '');
    
    const headers = [
        `title: ${title}`,
        `tags: ${tagStr}`,
        `type: ${type}`,
        doc ? `doc: ${doc}` : null,
        order ? `order: ${order}` : null,
        `created: ${created || nowStr}`,
        `modified: ${modified || nowStr}`
    ].filter(Boolean);

    return headers.join('\n') + '\n\n' + (text || '').trim() + '\n';
}

/**
 * Parses an RFC 822 .tid card string into a structured card object.
 *
 * @param {string} tidString
 * @returns {Object} { title, tags, type, doc, order, created, modified, text }
 */
function parseTidCard(tidString) {
    if (!tidString) return { title: 'Untitled', tags: '', type: 'text/x-markdown', text: '' };
    
    // Normalize newlines and split at first double newline
    const normalized = tidString.replace(/\r\n/g, '\n');
    const doubleNewlineIdx = normalized.indexOf('\n\n');
    
    if (doubleNewlineIdx === -1) {
        return { title: 'Untitled', tags: '', type: 'text/x-markdown', text: normalized.trim() };
    }

    const headerPart = normalized.slice(0, doubleNewlineIdx);
    const bodyPart = normalized.slice(doubleNewlineIdx + 2).trim();

    const headers = {};
    headerPart.split('\n').forEach(line => {
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
            const key = line.slice(0, colonIdx).trim().toLowerCase();
            const val = line.slice(colonIdx + 1).trim();
            headers[key] = val;
        }
    });

    return {
        title: headers.title || 'Untitled',
        tags: headers.tags || '',
        type: headers.type || 'text/x-markdown',
        doc: headers.doc || '',
        order: headers.order ? String(headers.order) : '0',
        created: headers.created || '',
        modified: headers.modified || '',
        text: bodyPart
    };
}

/**
 * Slices companion Markdown text into structured .tid card objects.
 * Accurately recognizes legal paragraphs (e.g. "1. That...", "2. That..."),
 * headings, financial arrears tables, and legal exhibits.
 *
 * @param {string} markdownContent - Full companion markdown text
 * @param {string} docStem - Document filename stem
 * @returns {Array<Object>} List of card objects
 */
function sliceMarkdownToTidCards(markdownContent, docStem = 'Document') {
    if (!markdownContent || typeof markdownContent !== 'string') return [];

    const lines = markdownContent.split(/\r?\n/);
    const tiddlers = [];
    let currentTitle = 'Case Overview';
    let currentLines = [];
    let currentTags = ['Pleading', 'Overview'];
    let orderCounter = 1;

    function flushCurrent() {
        if (currentLines.length === 0) return;
        const text = currentLines.join('\n').trim();
        if (!text) {
            currentLines = [];
            return;
        }

        const tagSet = new Set(currentTags);
        // Automatic statutory and forensic tags
        if (text.includes('|') && (text.includes('---') || text.includes('-+-') || text.includes('|:'))) {
            tagSet.add('Table');
            tagSet.add('Financial');
        }
        if (/\b(Ex|Exhibit|Annexure|Order|Deed|Certificate|E\-[0-9]+)\b/i.test(text)) {
            tagSet.add('Exhibit');
        }
        if (/\b(jurisdiction|territorial|pecuniary)\b/i.test(text)) {
            tagSet.add('Jurisdiction');
        }
        if (/\b(court fee|ad-valorem|valuation)\b/i.test(text)) {
            tagSet.add('CourtFee');
        }
        if (/\b(cause of action|accrued|limitation)\b/i.test(text)) {
            tagSet.add('CauseOfAction');
        }

        const nowStr = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17);
        tiddlers.push({
            title: currentTitle,
            tags: Array.from(tagSet).join(' '),
            type: 'text/x-markdown',
            doc: docStem,
            order: orderCounter++,
            created: nowStr,
            modified: nowStr,
            text
        });
        currentLines = [];
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const paraMatch = line.match(/^([0-9]+)\.\s*(.*)/);
        const headingMatch = line.match(/^##+\s*(.*)/);

        if (paraMatch || headingMatch) {
            flushCurrent();

            if (paraMatch) {
                const paraNum = paraMatch[1];
                const preview = paraMatch[2].slice(0, 45).replace(/[^a-zA-Z0-9\s]/g, '').trim();
                currentTitle = `Paragraph ${paraNum}: ${preview || 'Legal Statement'}`;
                currentTags = ['Pleading', `Para_${paraNum}`];
                currentLines.push(line);
            } else if (headingMatch) {
                const headingText = headingMatch[1].trim();
                if (/^Page\s+\d+/i.test(headingText)) {
                    // Page break - keep page marker in flow without creating an empty orphan card
                    currentLines.push(line);
                } else {
                    currentTitle = headingText;
                    currentTags = ['Section', getSafeFilename(headingText)];
                    currentLines.push(line);
                }
            }
        } else {
            currentLines.push(line);
        }
    }
    flushCurrent();

    return tiddlers;
}

/**
 * Writes sliced .tid cards to disk under <wikiDir>/<docStem>/ and compiles <docStem>.wiki.html.
 *
 * @param {string} caseDir - Matter directory
 * @param {string} docStem - Document filename stem
 * @param {string} companionMdContent - Extracted companion markdown text
 * @returns {Object} { cardsCount, cardsDir, wikiHtmlPath }
 */
function generateCaseWikiForPdf(caseDir, docStem, companionMdContent) {
    const wikiDir = getWikiDir(caseDir);
    const caseName = path.basename(caseDir);

    // 1. Slice companion markdown into cards
    const cards = sliceMarkdownToTidCards(companionMdContent, docStem);
    if (cards.length === 0) {
        return { cardsCount: 0, cardsDir: '', wikiHtmlPath: '' };
    }

    // 2. Write structured .tid files to <wikiDir>/<docStem>/
    const cardsDir = path.join(wikiDir, docStem);
    fs.mkdirSync(cardsDir, { recursive: true });

    cards.forEach((card, idx) => {
        const safeName = `${String(idx + 1).padStart(2, '0')}_${getSafeFilename(card.title)}.tid`;
        const tidFilePath = path.join(cardsDir, safeName);
        const tidContent = serializeTidCard(card);
        fs.writeFileSync(tidFilePath, tidContent, 'utf8');
    });

    // 3. Compile standalone single-file Legal Wiki canvas
    const wikiFileName = `${docStem}.wiki.html`;
    const wikiHtmlPath = path.join(wikiDir, wikiFileName);
    const wikiHtml = generateTiddlyWikiHtml(
        `${docStem} — Sovereign Legal Wiki`,
        cards,
        3210,
        caseName,
        wikiFileName
    );
    fs.writeFileSync(wikiHtmlPath, wikiHtml, 'utf8');

    console.log(`[Wiki Slicer] ✓ Sliced ${cards.length} .tid cards into: ${cardsDir}`);
    console.log(`[Wiki Slicer] ✓ Compiled Standalone Legal Wiki: ${wikiHtmlPath}`);

    return {
        cardsCount: cards.length,
        cardsDir,
        wikiHtmlPath
    };
}
 
/**
 * Ensures that a .wiki.html canvas exists on disk for a given document stem and case.
 * If the file is missing, it dynamically compiles it from existing .tid cards,
 * companion markdown, or SQLite FTS5 chunks, guaranteeing zero 404s.
 *
 * @param {string} caseDir - Absolute path to the case directory
 * @param {string} docStem - Document stem (e.g. '01_nclt_admission_order')
 * @param {string} [targetWikiPath] - Optional explicit destination path
 * @returns {string} Absolute path to the guaranteed .wiki.html file
 */
function ensureCaseWiki(caseDir, docStem, targetWikiPath) {
    if (targetWikiPath && fs.existsSync(targetWikiPath)) {
        return targetWikiPath;
    }

    const wikiDir = getWikiDir(caseDir);
    const resolvedPath = targetWikiPath || path.join(wikiDir, `${docStem}.wiki.html`);
    if (fs.existsSync(resolvedPath)) {
        return resolvedPath;
    }

    const caseName = path.basename(caseDir);
    const convDir = getConversionsDir(caseDir);

    // 1. Check for existing .tid cards in <wikiDir>/<docStem>/
    const cardsDir = path.join(wikiDir, docStem);
    if (fs.existsSync(cardsDir)) {
        try {
            const tidFiles = fs.readdirSync(cardsDir).filter(f => f.endsWith('.tid'));
            if (tidFiles.length > 0) {
                const cards = tidFiles.sort().map(f => parseTidCard(fs.readFileSync(path.join(cardsDir, f), 'utf8')));
                const wikiHtml = generateTiddlyWikiHtml(
                    `${docStem.replace(/_/g, ' ')} — Case Wiki`,
                    cards,
                    3210,
                    caseName,
                    path.basename(resolvedPath)
                );
                fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
                fs.writeFileSync(resolvedPath, wikiHtml, 'utf8');
                return resolvedPath;
            }
        } catch (_) {}
    }

    // 2. Check for companion markdown in conversions/ or caseDir
    let companionContent = null;
    const possibleMdPaths = [
        path.join(convDir, `${docStem}.md`),
        path.join(convDir, docStem, `${docStem}.md`),
        path.join(caseDir, `${docStem}.md`),
        path.join(caseDir, 'raw', `${docStem}.md`),
        path.join(caseDir, 'drafts', `${docStem}.md`)
    ];

    if (fs.existsSync(convDir)) {
        try {
            const subdirs = fs.readdirSync(convDir, { withFileTypes: true });
            for (const dirent of subdirs) {
                if (dirent.isDirectory()) {
                    possibleMdPaths.push(path.join(convDir, dirent.name, `${docStem}.md`));
                }
            }
        } catch (_) {}
    }

    for (const p of possibleMdPaths) {
        if (fs.existsSync(p)) {
            try {
                companionContent = fs.readFileSync(p, 'utf8');
                if (companionContent && companionContent.trim()) break;
            } catch (_) {}
        }
    }

    if (companionContent) {
        generateCaseWikiForPdf(caseDir, docStem, companionContent);
        if (fs.existsSync(resolvedPath)) return resolvedPath;
    }

    // 3. Check for chunks in SQLite FTS5 database
    try {
        const { getDb } = require('../../core/sqlite-store');
        const db = getDb(caseDir);
        if (db) {
            const rows = db.prepare(`
                SELECT section_title, content, page_number 
                FROM fts_chunks 
                WHERE filename LIKE ? OR filename LIKE ? 
                ORDER BY chunk_index ASC
            `).all(`%${docStem}%`, `%${docStem.replace(/_/g, ' ')}%`);

            if (rows && rows.length > 0) {
                const tiddlers = buildTiddlersFromChunks(rows, docStem.replace(/_/g, ' '));
                const wikiHtml = generateTiddlyWikiHtml(
                    `${docStem.replace(/_/g, ' ')} — Case Wiki`,
                    tiddlers,
                    3210,
                    caseName,
                    path.basename(resolvedPath)
                );
                fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
                fs.writeFileSync(resolvedPath, wikiHtml, 'utf8');
                return resolvedPath;
            }
        }
    } catch (_) {}

    // 4. Clean initial case dossier fallback
    const initialTiddler = {
        title: `${docStem.replace(/_/g, ' ')} — Legal Dossier`,
        text: `## ${docStem.replace(/_/g, ' ')}\n\n* **Case:** ${caseName}\n* **Document:** ${docStem}\n* **Status:** Initialized\n\n### Sovereign Case Wiki\nThis Legal TiddlyWiki canvas is ready for your analysis, concept cards, and evidence cross-references.\n\n- Powered by authentic **TiddlyWiki 5.4.1**.\n- Use \`[[Concept Name]]\` to create instant cross-references between case cards.\n- Edits are saved directly to your local case repository.`,
        created: new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17),
        modified: new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17),
        tags: 'Case_Dossier Overview Initialized'
    };

    const wikiHtml = generateTiddlyWikiHtml(
        `${docStem.replace(/_/g, ' ')} — Case Wiki`,
        [initialTiddler],
        3210,
        caseName,
        path.basename(resolvedPath)
    );
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, wikiHtml, 'utf8');
    return resolvedPath;
}

module.exports = {
    splitWiki,
    serializeTidCard,
    parseTidCard,
    sliceMarkdownToTidCards,
    generateCaseWikiForPdf,
    ensureCaseWiki
};
