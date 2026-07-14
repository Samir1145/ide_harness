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
 * Parses a TiddlyWiki HTML (.wiki.html) file and extracts its tiddler store array.
 * @param {string} filePath - Absolute path to the wiki file
 * @returns {Array<Object>} List of tiddler cards
 */
function parseWikiHtml(filePath) {
    console.log(`[Wiki Importer] Parsing wiki HTML file: ${filePath}`);
    const htmlContent = fs.readFileSync(filePath, 'utf8');
    const startTag = '<script class="tiddlywiki-tiddler-store" type="application/json">';
    const startIdx = htmlContent.indexOf(startTag);
    const endIdx = htmlContent.indexOf('</script>', startIdx);
    
    if (startIdx === -1 || endIdx === -1) {
        console.warn(`[Wiki Importer] No tiddler store script tag found in ${filePath}`);
        return [];
    }
    
    const jsonText = htmlContent.substring(startIdx + startTag.length, endIdx);
    try {
        const tiddlers = JSON.parse(jsonText);
        // Return only user tiddlers, filtering out system configurations ($:/)
        return tiddlers.filter(tid => tid.title && !tid.title.startsWith('$:/'));
    } catch (e) {
        console.error(`[Wiki Importer] Failed to parse TiddlyWiki store JSON: ${e.message}`);
        return [];
    }
}

module.exports = { parseWikiHtml, parseTags, extractWikiLinks };
