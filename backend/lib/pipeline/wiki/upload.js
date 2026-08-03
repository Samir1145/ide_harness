const fs = require('fs');

/**
 * Parses tags string from TiddlyWiki tag lists (supports bracketed tags [[my tag] tag2).
 */
function parseTags(tags) {
    if (!tags) return [];
    if (Array.isArray(tags)) return tags;
    if (typeof tags !== 'string') return [];
    const tagsStr = tags.trim();
    if (tagsStr.startsWith('[') && tagsStr.endsWith(']')) {
        try {
            return JSON.parse(tagsStr);
        } catch {}
    }
    const result = [];
    const re = /\[\[([^\]]+)\]\]|(\S+)/g;
    let match;
    while ((match = re.exec(tagsStr)) !== null) {
        result.push(match[1] || match[2]);
    }
    return result;
}

/**
 * Extracts links formatted as [[LinkTarget]] from Markdown/Wiki text.
 */
function extractWikiLinks(text) {
    if (!text) return [];
    const links = [];
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    let match;
    while ((match = linkRegex.exec(text)) !== null) {
        links.push(match[1]);
    }
    return Array.from(new Set(links));
}

/**
 * Helper to decode basic HTML entities from TW Classic div attributes.
 */
function decodeHtmlEntities(str) {
    if (!str) return '';
    return str
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&#92;/g, '\\');
}

/**
 * Parses a TiddlyWiki HTML (.html / .wiki.html) file and extracts its tiddler store array.
 * Supports TW5 JSON store script tags and Classic TW storeArea div blocks.
 * @param {string} filePath - Absolute path to the wiki file
 * @returns {Array<Object>} List of tiddler cards
 */
function parseWikiHtml(filePath) {
    console.log(`[Wiki Importer] Parsing wiki HTML file: ${filePath}`);
    const htmlContent = fs.readFileSync(filePath, 'utf8');

    // 1. Try matching TW5 <script class="tiddlywiki-tiddler-store"...> (attributes in any order)
    const scriptRegex = /<script\b[^>]*class=["']tiddlywiki-tiddler-store["'][^>]*>([\s\S]*?)<\/script>/i;
    let match = scriptRegex.exec(htmlContent);

    // Fallback search for script tag with type="application/json" and store marker
    if (!match) {
        const altScriptRegex = /<script\b[^>]*type=["']application\/json["'][^>]*class=["']tiddlywiki-tiddler-store["'][^>]*>([\s\S]*?)<\/script>/i;
        match = altScriptRegex.exec(htmlContent);
    }

    if (match && match[1]) {
        try {
            const tiddlers = JSON.parse(match[1]);
            return tiddlers.filter(tid => tid.title && !tid.title.startsWith('$:/'));
        } catch (e) {
            console.error(`[Wiki Importer] Failed to parse TiddlyWiki store JSON: ${e.message}`);
        }
    }

    // 2. Fallback for TW Classic or <div id="storeArea"> format
    if (htmlContent.includes('id="storeArea"') || htmlContent.includes("id='storeArea'")) {
        console.log(`[Wiki Importer] Parsing TiddlyWiki Classic storeArea format...`);
        const tiddlers = [];
        const divRegex = /<div\b[^>]*title=["']([^"']+)["'][^>]*>([\s\S]*?)<\/div>/gi;
        let divMatch;
        while ((divMatch = divRegex.exec(htmlContent)) !== null) {
            const title = decodeHtmlEntities(divMatch[1]);
            if (title && !title.startsWith('$:/')) {
                const bodyText = decodeHtmlEntities(divMatch[2] || '');
                tiddlers.push({ title, text: bodyText });
            }
        }
        if (tiddlers.length > 0) {
            return tiddlers;
        }
    }

    console.warn(`[Wiki Importer] No valid tiddler store found in ${filePath}`);
    return [];
}

module.exports = { parseWikiHtml, parseTags, extractWikiLinks };
