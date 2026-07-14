const fs = require('fs');
const path = require('path');
const bm25 = require('../../core/bm25');
const { parseWikiHtml, parseTags, extractWikiLinks } = require('./upload');
const { splitWiki } = require('./split');
const { formatMarkdownWithFrontmatter, parseMarkdownWithFrontmatter } = require('../../utils/okf');
const { getSafeFilename, cleanBm25Index } = require('../common/helper');

/**
 * Handles TiddlyWiki (.wiki.html) file ingestion, parsing individual cards out of the store block.
 */
async function ingestWiki(caseDir, filePath, bm25Index, bm25IndexFile) {
    const isWikiHtml = filePath.toLowerCase().endsWith('.wiki.html');
    const ext = isWikiHtml ? '.wiki.html' : path.extname(filePath).toLowerCase();
    const relative = path.relative(caseDir, filePath);
    const basename = isWikiHtml ? path.basename(filePath, '.wiki.html') : path.basename(filePath, ext);
    const subfolder = path.dirname(relative);
    const safeSubfolder = subfolder === '.' ? '' : subfolder;

    console.log(`[Wiki Ingestion] Starting TiddlyWiki HTML ingestion: ${relative}`);

    // Setup folder structures - wiki cards are written to caseDir/wiki
    const wikiDir = path.join(caseDir, 'wiki');
    fs.mkdirSync(wikiDir, { recursive: true });
    cleanBm25Index(bm25Index, basename);

    const tiddlers = parseWikiHtml(filePath);
    const sections = splitWiki(tiddlers);
    const shadowDocuments = [];
    const sectionTitles = [];

    for (let i = 0; i < tiddlers.length; i++) {
        const tid = tiddlers[i];
        const safeTitle = getSafeFilename(tid.title);
        const mdPath = path.join(wikiDir, `${safeTitle}.md`);
        const tags = parseTags(tid.tags);
        const body = tid.text || '';
        const links = extractWikiLinks(body);
        
        const mdContent = formatMarkdownWithFrontmatter({
            title: tid.title,
            docName: basename,
            tags: tags.concat([safeSubfolder, basename]).filter(Boolean),
            links,
            content: body
        });
        
        fs.writeFileSync(mdPath, mdContent, 'utf8');
        shadowDocuments.push({ path: mdPath, title: tid.title, tags, links });
        sectionTitles.push(tid.title);

        bm25.addDocument(bm25Index, {
            id: `wiki::${safeTitle}`,
            text: body
        });
    }

    bm25.saveIndex(bm25Index, bm25IndexFile);
    return {
        sections: tiddlers.length,
        conceptsDir: wikiDir,
        shadowDocuments,
        sectionTitles
    };
}

/**
 * Handles individual markdown Wiki card (.md) ingestion.
 */
async function ingestWikiCard(caseDir, filePath, bm25Index, bm25IndexFile) {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath, ext);

    console.log(`[Wiki Ingestion] Ingesting and indexing wiki card: ${path.basename(filePath)}`);
    const content = fs.readFileSync(filePath, 'utf8');
    const { frontmatter, body } = parseMarkdownWithFrontmatter(content);
    
    bm25.addDocument(bm25Index, {
        id: `wiki::${basename}`,
        text: body
    });
    bm25.saveIndex(bm25Index, bm25IndexFile);
    
    return { sections: 1 };
}

/**
 * Syncs modifications from wiki/*.md files back to the single-file TiddlyWiki (.wiki.html).
 */
async function syncMarkdownToWiki(caseDir, filePath) {
    const isWikiHtml = (f) => f.toLowerCase().endsWith('.wiki.html');
    const files = fs.readdirSync(caseDir);
    const wikiFile = files.find(isWikiHtml);
    if (!wikiFile) {
        console.warn(`[Wiki Sync] No .wiki.html file found in case directory ${caseDir} to write back to.`);
        return;
    }
    const wikiPath = path.join(caseDir, wikiFile);
    console.log(`[Wiki Sync] Syncing wiki card back to: ${wikiPath}`);

    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath, ext);

    const mdContent = fs.readFileSync(filePath, 'utf8');
    const { frontmatter, body } = parseMarkdownWithFrontmatter(mdContent);
    const cardTitle = frontmatter.title || basename;

    let htmlContent = fs.readFileSync(wikiPath, 'utf8');
    const startTag = '<script class="tiddlywiki-tiddler-store" type="application/json">';
    const startIdx = htmlContent.indexOf(startTag);
    const endIdx = htmlContent.indexOf('</script>', startIdx);

    if (startIdx === -1 || endIdx === -1) {
        console.warn(`[Wiki Sync] No tiddler store script tag found in ${wikiPath}`);
        return;
    }

    const jsonText = htmlContent.substring(startIdx + startTag.length, endIdx);
    let tiddlers = [];
    try {
        tiddlers = JSON.parse(jsonText);
    } catch (e) {
        console.error(`[Wiki Sync] Failed to parse TiddlyWiki store JSON: ${e.message}`);
        return;
    }

    let existing = tiddlers.find(tid => tid.title === cardTitle);
    const nowStr = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17); // YYYYMMDDhhmmssSSS

    if (existing) {
        existing.text = body;
        existing.modified = nowStr;
        if (frontmatter.tags) {
            existing.tags = Array.isArray(frontmatter.tags) ? frontmatter.tags.join(' ') : frontmatter.tags;
        }
    } else {
        const newTid = {
            title: cardTitle,
            text: body,
            created: nowStr,
            modified: nowStr
        };
        if (frontmatter.tags) {
            newTid.tags = Array.isArray(frontmatter.tags) ? frontmatter.tags.join(' ') : frontmatter.tags;
        }
        tiddlers.push(newTid);
    }

    const newJsonText = JSON.stringify(tiddlers).replace(/</g, '\\u003c');
    const updatedHtml = htmlContent.substring(0, startIdx + startTag.length) + newJsonText + htmlContent.substring(endIdx);
    fs.writeFileSync(wikiPath, updatedHtml, 'utf8');
    console.log(`[Wiki Sync] Successfully wrote card "${cardTitle}" back to ${wikiFile}`);
}

module.exports = { ingestWiki, ingestWikiCard, syncMarkdownToWiki };
