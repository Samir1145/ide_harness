'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Returns a standalone single-file TiddlyWiki HTML string with auto-saver protocol.
 * @param {string} wikiTitle - Title of the Wiki
 * @param {Array<Object>} tiddlers - Array of tiddler objects { title, text, tags, created, modified }
 * @param {string} apiPort - Port of the local Hayagriva backend
 * @param {string} caseName - Active case name
 * @param {string} fileName - Target wiki filename (.wiki.html)
 */
function generateTiddlyWikiHtml(wikiTitle = 'Hayagriva Case Wiki', tiddlers = [], apiPort = 3210, caseName = '', fileName = '') {
    const nowStr = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17);
    
    // Ensure default getting started tiddlers exist
    const defaultTiddlers = [
        {
            title: '$:/SiteTitle',
            text: wikiTitle,
            tags: '$:/tags/SiteTitle'
        },
        {
            title: '$:/SiteSubtitle',
            text: 'Autonomous Case Knowledge Base & Synthesis Engine',
            tags: '$:/tags/SiteSubtitle'
        },
        {
            title: '$:/DefaultTiddlers',
            text: '[[Getting Started]]',
            tags: ''
        },
        {
            title: 'Getting Started',
            text: `Welcome to **${wikiTitle}**!\n\nThis TiddlyWiki is stored directly in your case directory:\n\`${caseName}/wiki/${fileName}\`\n\n### Features\n- Every edit made here automatically syncs into Hayagriva's RAG vector database.\n- Link concepts together using \`[[Concept Name]]\` references.\n- Export or compile sections directly into legal briefs.`,
            created: nowStr,
            modified: nowStr,
            tags: 'Overview Index'
        }
    ];

    // Merge custom tiddlers, replacing duplicates
    const mergedMap = new Map();
    [...defaultTiddlers, ...tiddlers].forEach(tid => {
        if (tid && tid.title) {
            mergedMap.set(tid.title, tid);
        }
    });
    const finalTiddlers = Array.from(mergedMap.values());
    const jsonStore = JSON.stringify(finalTiddlers).replace(/</g, '\\u003c');

    return `<!doctype html>
<!--
Hayagriva Standalone TiddlyWiki — Local Auto-Sync Enabled
-->
<html lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html;charset=utf-8" />
<meta name="application-name" content="TiddlyWiki" />
<meta name="generator" content="Hayagriva Engine" />
<title>${wikiTitle}</title>
<style type="text/css">
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; background: #0f172a; color: #f8fafc; }
  .tw-container { max-width: 900px; margin: 0 auto; background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
  .tw-header { border-bottom: 2px solid #0ea5e9; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
  .tw-header h1 { margin: 0; font-size: 24px; color: #38bdf8; }
  .tw-header span { font-size: 12px; background: #0284c7; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; }
  .tw-save-bar { background: rgba(14, 165, 233, 0.1); border: 1px solid #0ea5e9; border-radius: 6px; padding: 10px 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
  .tw-save-btn { background: #0ea5e9; color: white; border: none; padding: 6px 14px; border-radius: 4px; font-weight: bold; cursor: pointer; transition: background 0.2s; }
  .tw-save-btn:hover { background: #0284c7; }
  .tiddler-card { background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 16px; margin-bottom: 16px; }
  .tiddler-card h3 { margin-top: 0; color: #38bdf8; border-bottom: 1px dashed #334155; padding-bottom: 6px; font-size: 16px; }
  .tiddler-card p { line-height: 1.6; white-space: pre-wrap; font-size: 14px; color: #cbd5e1; }
  .tag-badge { display: inline-block; background: #334155; color: #94a3b8; font-size: 11px; padding: 2px 6px; border-radius: 3px; margin-right: 4px; }
</style>
</head>
<body>
<div class="tw-container">
  <div class="tw-header">
    <h1>📄 ${wikiTitle}</h1>
    <span>Hayagriva Sync Active</span>
  </div>
  <div class="tw-save-bar">
    <div><strong>Case:</strong> ${caseName} | <strong>File:</strong> ${fileName}</div>
    <button class="tw-save-btn" onclick="saveWikiToCase()">💾 Save Changes to Case</button>
  </div>
  <div id="tiddlers-rendered-container"></div>
</div>

<script type="application/json" class="tiddlywiki-tiddler-store">
${jsonStore}
</script>

<script>
  const CASE_NAME = "${caseName}";
  const FILE_NAME = "${fileName}";
  const API_PORT = ${apiPort};

  function renderTiddlers() {
    try {
      const storeScript = document.querySelector('script.tiddlywiki-tiddler-store');
      if (!storeScript) return;
      const tiddlers = JSON.parse(storeScript.textContent);
      const container = document.getElementById('tiddlers-rendered-container');
      container.innerHTML = '';

      tiddlers.filter(t => t.title && !t.title.startsWith('$:/')).forEach(t => {
        const card = document.createElement('div');
        card.className = 'tiddler-card';
        
        const title = document.createElement('h3');
        title.innerText = '📌 ' + t.title;
        card.appendChild(title);

        if (t.tags) {
          const tagsDiv = document.createElement('div');
          tagsDiv.style.marginBottom = '8px';
          const tagList = Array.isArray(t.tags) ? t.tags : t.tags.split(' ');
          tagList.forEach(tg => {
            if (tg) {
              const badge = document.createElement('span');
              badge.className = 'tag-badge';
              badge.innerText = '#' + tg;
              tagsDiv.appendChild(badge);
            }
          });
          card.appendChild(tagsDiv);
        }

        const body = document.createElement('p');
        // Render simple wiki links [[Reference]] as clickable highlights
        let textContent = t.text || '';
        body.innerHTML = textContent
          .replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/\\[\\[([^\\]]+)\\]\\]/g, '<mark style="background:#0284c7;color:white;padding:2px 4px;border-radius:3px;cursor:pointer;">🔗 $1</mark>');
        card.appendChild(body);

        container.appendChild(card);
      });
    } catch(e) {
      console.error('Failed to render tiddlers:', e);
    }
  }

  async function saveWikiToCase() {
    try {
      const storeScript = document.querySelector('script.tiddlywiki-tiddler-store');
      const htmlDoc = '<!doctype html>' + document.documentElement.outerHTML;
      const res = await fetch(\`http://127.0.0.1:\${API_PORT}/api/hayagriva/tiddlywiki/save?case=\${encodeURIComponent(CASE_NAME)}&file=\${encodeURIComponent(FILE_NAME)}\`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/html' },
        body: htmlDoc
      });
      if (res.ok) {
        alert('✅ Saved successfully to case directory: ' + FILE_NAME);
      } else {
        alert('❌ Save failed: ' + res.statusText);
      }
    } catch(e) {
      alert('❌ Save error: ' + e.message);
    }
  }

  renderTiddlers();
</script>
</body>
</html>`;
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
            tags: `${docTitle} Chunk_${index + 1}`
        });
    });

    // Master index tiddler linking all sections
    const indexText = `## Master Index — ${docTitle}\n\nThis Wiki was auto-compiled from **${docTitle}** chunks.\n\n### Document Sections\n` + 
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
