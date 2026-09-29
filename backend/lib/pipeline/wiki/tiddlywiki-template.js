'use strict';

const fs = require('fs');
const path = require('path');

const EMPTY_TW_PATH = path.join(__dirname, 'empty.html');

/**
 * Generates an authoritative, standalone Single-File Legal TiddlyWiki HTML string
 * powered by the official canonical empty.html from tiddlywiki.com.
 *
 * @param {string} wikiTitle - Title of the Wiki
 * @param {Array<Object>} tiddlers - Array of tiddler objects { title, text, tags, created, modified }
 * @param {string|number} apiPort - Port of the local Hayagriva backend
 * @param {string} caseName - Active case name
 * @param {string} fileName - Target wiki filename (.wiki.html)
 * @returns {string} Standalone official TiddlyWiki5 HTML document string
 */
function generateTiddlyWikiHtml(wikiTitle = 'Hayagriva Case Wiki', tiddlers = [], apiPort = 3210, caseName = '', fileName = '') {
    if (!fs.existsSync(EMPTY_TW_PATH)) {
        throw new Error(`Official TiddlyWiki empty template not found at: ${EMPTY_TW_PATH}`);
    }

    const templateHtml = fs.readFileSync(EMPTY_TW_PATH, 'utf8');
    const nowStr = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17);

    // Locate the standard TiddlyWiki5 JSON tiddler store
    const storeRegex = /<script\s+class=["']tiddlywiki-tiddler-store["']\s+type=["']application\/json["']>([\s\S]*?)<\/script>/i;
    const match = templateHtml.match(storeRegex);
    if (!match) {
        throw new Error('Malformed TiddlyWiki empty.html: missing tiddlywiki-tiddler-store script tag.');
    }

    let coreTiddlers = [];
    try {
        coreTiddlers = JSON.parse(match[1]);
    } catch (e) {
        console.warn('[TiddlyWiki Hydration] Warning parsing existing store, initializing empty store:', e.message);
        coreTiddlers = [];
    }

    const firstCardTitle = tiddlers.length > 0 && tiddlers[0].title ? tiddlers[0].title : 'Getting Started';

    // Default configuration tiddlers for the case wiki (Stock Vanilla Snow White look)
    const configTiddlers = [
        {
            title: '$:/SiteTitle',
            text: wikiTitle,
            tags: '$:/tags/SiteTitle'
        },
        {
            title: '$:/SiteSubtitle',
            text: 'Autonomous Sovereign Case Knowledge Base',
            tags: '$:/tags/SiteSubtitle'
        },
        {
            title: '$:/DefaultTiddlers',
            text: `[[${firstCardTitle}]]`,
            tags: ''
        },
        {
            title: '$:/StoryList',
            list: `[[${firstCardTitle}]]`
        },
        {
            title: '$:/theme',
            text: '$:/themes/tiddlywiki/snowwhite'
        },
        {
            title: '$:/palette',
            text: '$:/palettes/Vanilla'
        },
        {
            title: '$:/state/sidebar',
            text: 'yes'
        },
        {
            title: '$:/config/Navigation/openLinkFromInsideRiver',
            text: 'top'
        },
        {
            title: '$:/config/Navigation/openLinkFromOutsideRiver',
            text: 'top'
        },
        {
            title: '$:/config/StoryView',
            text: 'classic'
        },
        {
            title: '$:/config/AutoSave',
            text: 'yes'
        },
        // Harmonize typography metrics seamlessly with the surrounding IDE Harness
        {
            title: '$:/themes/tiddlywiki/vanilla/metrics/bodyfontsize',
            text: '13px'
        },
        {
            title: '$:/themes/tiddlywiki/vanilla/metrics/bodylineheight',
            text: '19px'
        },
        {
            title: '$:/themes/tiddlywiki/vanilla/metrics/fontsize',
            text: '13px'
        },
        {
            title: '$:/themes/tiddlywiki/vanilla/metrics/lineheight',
            text: '19px'
        },
        {
            title: '$:/themes/tiddlywiki/vanilla/settings/fontfamily',
            text: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
        },
        {
            title: '$:/themes/tiddlywiki/vanilla/settings/codefontfamily',
            text: 'Menlo, Monaco, Consolas, "Courier New", monospace'
        },
        {
            title: '$:/hayagriva/harness-harmony.css',
            text: `
/* Harmonize title and sidebar proportions with the IDE harness */
.tc-titlebar, .tc-tiddler-title {
    font-size: 1em !important;
}
.tc-title {
    font-size: 1.55em !important; /* 13px * 1.55 = 20.15px, perfect harmony */
    font-weight: 600 !important;
    letter-spacing: -0.01em;
}
.tc-site-title {
    font-size: 1.5em !important;
    font-weight: 600 !important;
    line-height: 1.3 !important;
}
.tc-site-subtitle {
    font-size: 11px !important;
    color: #64748b !important;
}
.tc-tiddler-body h1 {
    font-size: 1.5em !important;
}
.tc-tiddler-body h2 {
    font-size: 1.3em !important;
}
.tc-tiddler-body h3 {
    font-size: 1.15em !important;
}
.tc-tab-buttons button {
    font-size: 12px !important;
}
`,
            tags: '$:/tags/Stylesheet',
            type: 'text/css'
        },
        {
            title: '$:/UploadURL',
            text: `http://127.0.0.1:${apiPort}/api/hayagriva/tiddlywiki/save?case=${encodeURIComponent(caseName)}&file=${encodeURIComponent(fileName)}`,
            tags: ''
        },
        {
            title: '$:/UploadWithUrlOnly',
            text: 'yes',
            tags: ''
        }
    ];

    if (tiddlers.length === 0) {
        configTiddlers.push({
            title: 'GettingStarted',
            text: `Welcome to **${wikiTitle}**!\n\nThis Chamber Legal Wiki is stored directly in your case directory:\n\`${caseName}/wiki/${fileName}\`\n\n- Powered by authentic, official **TiddlyWiki 5** (Stock Vanilla).\n- Edit, add, and tag concept cards freely.\n- Edits save directly to your chamber repository.`,
            created: nowStr,
            modified: nowStr,
            tags: 'GettingStarted Overview'
        });
    }

    // Merge existing core tiddlers with configuration and case tiddlers
    const tiddlerMap = new Map();
    coreTiddlers.forEach(t => {
        if (t && t.title) tiddlerMap.set(t.title, t);
    });
    configTiddlers.forEach(t => {
        if (t && t.title) tiddlerMap.set(t.title, t);
    });
    tiddlers.forEach(t => {
        if (t && t.title) {
            const existing = tiddlerMap.get(t.title) || {};
            tiddlerMap.set(t.title, {
                ...existing,
                ...t,
                created: t.created || existing.created || nowStr,
                modified: nowStr
            });
        }
    });

    const finalTiddlers = Array.from(tiddlerMap.values()).map(t => {
        const sanitized = {};
        for (const [k, v] of Object.entries(t)) {
            if (v === null || v === undefined) {
                sanitized[k] = '';
            } else if (typeof v !== 'string') {
                sanitized[k] = String(v);
            } else {
                sanitized[k] = v;
            }
        }
        return sanitized;
    });

    // Escape '<' to prevent HTML parser prematurely closing the script tag
    const serializedStore = JSON.stringify(finalTiddlers).replace(/</g, '\\u003c');

    let hydratedHtml = templateHtml.replace(
        storeRegex,
        () => `<script class="tiddlywiki-tiddler-store" type="application/json">${serializedStore}</script>`
    );

    const electronShim = `\n<script>\n/* Sovereign Hayagriva: Shield TiddlyWiki DOM boot from Electron Node environment */\nif (typeof window !== "undefined") {\n    if (typeof exports !== "undefined") {\n        try { delete window.exports; } catch (e) { window.exports = undefined; }\n    }\n    if (typeof module !== "undefined") {\n        try { delete window.module; } catch (e) { window.module = undefined; }\n    }\n    if (typeof process !== "undefined" && !window.process?.browser) {\n        window._electron_process = window.process;\n        try { delete window.process; } catch (e) { window.process = undefined; }\n    }\n}\n</script>\n`;

    if (!hydratedHtml.includes('Sovereign Hayagriva: Shield TiddlyWiki DOM boot')) {
        hydratedHtml = hydratedHtml.replace('<head>', `<head>${electronShim}`);
    }

    return hydratedHtml;
}

/**
 * Compiles parsed document section chunks into an array of TiddlyWiki tiddler objects.
 * @param {Array<Object>} chunks - List of chunks [{ section_title, content, page_number }]
 * @param {string} docTitle - Source document title
 * @returns {Array<Object>} List of tiddler card objects
 */
function buildTiddlersFromChunks(chunks = [], docTitle = 'Document') {
    const nowStr = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17);
    const tiddlers = [];
    const sectionNames = [];

    chunks.forEach((chunk, index) => {
        const title = chunk.section_title || `Section ${index + 1}`;
        sectionNames.push(title);
        
        tiddlers.push({
            title: title,
            text: chunk.content || '',
            created: nowStr,
            modified: nowStr,
            tags: `${docTitle} [[Chunk ${index + 1}]]`
        });
    });

    // Master index tiddler linking all sections
    const indexText = `## Master Index — ${docTitle}\n\nThis Legal Wiki was compiled from **${docTitle}** chunks.\n\n### Document Sections\n` + 
        sectionNames.map(name => `* [[${name}]]`).join('\n');

    tiddlers.unshift({
        title: `Index — ${docTitle}`,
        text: indexText,
        created: nowStr,
        modified: nowStr,
        tags: 'Master_Index Overview'
    });

    return tiddlers;
}

module.exports = { generateTiddlyWikiHtml, buildTiddlersFromChunks };
