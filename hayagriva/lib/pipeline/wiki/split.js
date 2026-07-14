/**
 * Maps a TiddlyWiki store array directly to standardized sections.
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

module.exports = { splitWiki };
