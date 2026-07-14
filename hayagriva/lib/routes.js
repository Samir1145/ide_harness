const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const xlsx = require('xlsx');
const { query, retrieveContexts, buildPrompt } = require('./core/rag');
const { ingestFile, updateStatus, queueForLazyProcessing, startLazyWorker, ensureAuditDocs } = require('./daemon/watcher');
const { pendingPdfQueue, completedPdfSet } = require('./daemon/lazy_pdf_worker');
const { streamChat } = require('./core/llm-client');
const { cancelConversion } = require('./core/converter');
const { resolveTrigger, searchLaws, getVaultVersion, isVaultReady } = require('./utils/vault-loader');

function resolveCaseDir(docsRoot, caseParam) {
    if (caseParam && (caseParam.startsWith('/') || caseParam.includes(':\\') || caseParam.startsWith('file:///'))) {
        let clean = caseParam;
        if (clean.startsWith('file:///')) {
            clean = clean.substring(7);
            if (process.platform === 'win32' && clean.startsWith('/')) {
                clean = clean.substring(1);
            }
        }
        return clean;
    }
    return path.join(docsRoot, caseParam || 'Case_Alpha');
}

const DEFAULT_SETTINGS = {
    processingProfile: 'standard',
    activeMode: 'local',
    localRunner: 'ollama',
    localEndpoint: 'http://127.0.0.1:11434',
    localChatModel: 'qwen2.5-coder:1.5b',
    localEmbedModel: 'nomic-embed-text',
    cloudProvider: 'gemini',
    cloudModel: 'gemini-1.5-flash'
};

function ensureCaseSettings(caseDir) {
    try {
        const configDirs = ['.theia', '.vscode'];
        for (const dirName of configDirs) {
            const dirPath = path.join(caseDir, dirName);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            const settingsPath = path.join(dirPath, 'settings.json');
            let settings = {};
            if (fs.existsSync(settingsPath)) {
                try {
                    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                } catch (_) {}
            }
            if (!settings['files.exclude']) {
                settings['files.exclude'] = {};
            }
            let changed = false;
            const excludeRules = {
                '**/wiki': true,
                '**/concepts': true,
                '**/conversions': true,
                'wiki': true,
                'concepts': true,
                'conversions': true,
                '**/wiki/**': true,
                '**/concepts/**': true,
                '**/conversions/**': true,
                'wiki/': true,
                'concepts/': true,
                'conversions/': true,
                '**/*.md': true,
                '**/*.status': true,
                '**/*.footer': true,
                '**/*.cache': true
            };
            for (const [key, val] of Object.entries(excludeRules)) {
                if (settings['files.exclude'][key] !== val) {
                    settings['files.exclude'][key] = val;
                    changed = true;
                }
            }
            if (settings['explorer.openEditors.visible'] !== 0) {
                settings['explorer.openEditors.visible'] = 0;
                changed = true;
            }
            if (changed) {
                fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
                console.log(`[API Server] Dynamic settings updated at: ${settingsPath}`);
            }
        }
    } catch (e) {
        console.warn(`[API Server] Failed to enforce case settings for ${caseDir}:`, e.message);
    }
}

function getDefaultCaseName(docsRoot) {
    try {
        const dirs = fs.readdirSync(docsRoot).filter(f => {
            const p = path.join(docsRoot, f);
            return fs.statSync(p).isDirectory() && !f.startsWith('.');
        });
        if (dirs.length > 0) {
            return dirs[0];
        }
    } catch (_) {}
    return 'Case_Alpha';
}

module.exports = {
    GET: {
        '/api/hayagriva/cases': (req, res, parsedUrl, docsRoot) => {
            const dirs = fs.readdirSync(docsRoot).filter(f => {
                const p = path.join(docsRoot, f);
                return fs.statSync(p).isDirectory() && !f.startsWith('.');
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ cases: dirs }));
        },

        '/api/hayagriva/wiki-port': (req, res, parsedUrl, docsRoot) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ port: null }));
        },

        '/api/hayagriva/documents': (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || '';
            const caseDir = path.join(docsRoot, caseName);
            const documents = [];

            // 1. Collect indexed docs from index.json
            const indexPath = path.join(caseDir, 'concepts', 'index.json');
            let indexedBasenames = new Set();
            if (fs.existsSync(indexPath)) {
                try {
                    const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
                    for (const doc of (idx.documents || [])) {
                        documents.push({ ...doc, status: doc.status || 'indexed' });
                        indexedBasenames.add(doc.title);
                    }
                } catch (_) {}
            }

            // 2. Scan for statuses in concepts/statuses.json
            const statusesJsonPath = path.join(caseDir, 'concepts', 'statuses.json');
            let persistentStatuses = {};
            if (fs.existsSync(statusesJsonPath)) {
                try {
                    persistentStatuses = JSON.parse(fs.readFileSync(statusesJsonPath, 'utf8')) || {};
                } catch (_) {}
            }

            for (const [relative, statusVal] of Object.entries(persistentStatuses)) {
                const ext = path.extname(relative);
                const basename = path.basename(relative, ext);
                if (indexedBasenames.has(basename)) continue;

                const mdPath = path.join(caseDir, relative.replace(/\.[a-zA-Z0-9]+$/, '.md'));
                const pdfPath = path.join(caseDir, relative.replace(/\.[a-zA-Z0-9]+$/, '.pdf'));
                const queueEntry = pendingPdfQueue.find(q => q.filePath === pdfPath);
                documents.push({
                    title: basename,
                    filename: relative,
                    status: statusVal,
                    companionPath: mdPath,
                    totalPages: queueEntry ? queueEntry.totalPages : null,
                    nextPage: queueEntry ? queueEntry.nextPage : null,
                    conversionComplete: completedPdfSet.has(pdfPath)
                });
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ documents }));
        },

        '/api/hayagriva/office-preview': async (req, res, parsedUrl, docsRoot) => {
            const filePath = parsedUrl.query.path || '';
            if (!filePath || !fs.existsSync(filePath)) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('File not found');
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            try {
                if (ext === '.docx' || ext === '.doc') {
                    const { value } = await mammoth.convertToHtml({ path: filePath });
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    background-color: var(--theia-editor-background, #fff);
    color: var(--theia-editor-foreground, #333);
    font-family: var(--theia-editor-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
    font-size: 14px;
    line-height: 1.6;
    margin: 0;
    padding: 30px;
    display: flex;
    justify-content: center;
  }
  .document-content {
    max-width: 800px;
    width: 100%;
    background: var(--theia-layout-color1, #fff);
    border: 1px solid var(--theia-border-color, #e0e0e0);
    padding: 40px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    border-radius: 4px;
    overflow-x: auto;
  }
  table { border-collapse: collapse; width: 100%; margin: 15px 0; }
  th, td { border: 1px solid var(--theia-border-color, #ccc); padding: 8px; text-align: left; }
  th { background-color: var(--theia-layout-color2, #f5f5f5); }
  p { margin-bottom: 12px; }
  h1, h2, h3, h4 { margin-top: 20px; margin-bottom: 10px; color: var(--theia-brand-color1, #0ea5e9); }
</style>
<script>
  function syncTheme() {
    if (!window.parent) return;
    const ps = window.parent.getComputedStyle(window.parent.document.documentElement);
    const ds = document.documentElement.style;
    ['--theia-editor-background','--theia-editor-foreground','--theia-editor-font-family',
     '--theia-layout-color1','--theia-layout-color2','--theia-border-color','--theia-brand-color1'].forEach(v => {
      const val = ps.getPropertyValue(v); if (val) ds.setProperty(v, val);
    });
  }
  window.onload = () => {
    syncTheme();
    if (window.parent && window.parent.document.documentElement) {
      new MutationObserver(syncTheme).observe(
        window.parent.document.documentElement,
        { attributes: true, attributeFilter: ['class', 'style'] }
      );
    }
  };
</script>
</head>
<body>
  <div class="document-content">
    ${value}
  </div>
</body>
</html>`);
                } else if (ext === '.xlsx' || ext === '.xls') {
                    const workbook = xlsx.readFile(filePath);
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    background-color: var(--theia-editor-background, #fff);
    color: var(--theia-editor-foreground, #333);
    font-family: var(--theia-editor-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
    font-size: 13px;
    margin: 0;
    padding: 20px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
  }
  .tab-bar {
    display: flex;
    border-bottom: 1px solid var(--theia-border-color, #e0e0e0);
    margin-bottom: 15px;
    flex-shrink: 0;
    overflow-x: auto;
  }
  .tab-btn {
    padding: 8px 16px;
    cursor: pointer;
    border: 1px solid transparent;
    border-bottom: none;
    background: none;
    color: var(--theia-editor-foreground, #555);
    font-weight: bold;
    font-size: 12px;
    white-space: nowrap;
    outline: none;
    transition: all 0.15s;
  }
  .tab-btn:hover {
    color: var(--theia-brand-color1, #0ea5e9);
  }
  .tab-btn.active {
    border-color: var(--theia-border-color, #e0e0e0);
    background-color: var(--theia-layout-color1, #fff);
    border-radius: 4px 4px 0 0;
    color: var(--theia-brand-color1, #0ea5e9);
  }
  .sheet-container {
    flex: 1;
    overflow: auto;
    background-color: var(--theia-layout-color1, #fff);
    border: 1px solid var(--theia-border-color, #e0e0e0);
    border-radius: 4px;
  }
  .sheet-content { display: none; padding: 15px; }
  .sheet-content.active { display: block; }
  table { border-collapse: collapse; min-width: 100%; }
  th, td { border: 1px solid var(--theia-border-color, #ccc); padding: 6px 12px; text-align: left; }
  th { background-color: var(--theia-layout-color2, #f5f5f5); font-weight: bold; }
</style>
<script>
  function showSheet(idx) {
    document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === idx));
    document.querySelectorAll('.sheet-content').forEach((c, i) => c.classList.toggle('active', i === idx));
  }
  function syncTheme() {
    if (!window.parent) return;
    const ps = window.parent.getComputedStyle(window.parent.document.documentElement);
    const ds = document.documentElement.style;
    ['--theia-editor-background','--theia-editor-foreground','--theia-editor-font-family',
     '--theia-layout-color1','--theia-layout-color2','--theia-border-color','--theia-brand-color1'].forEach(v => {
      const val = ps.getPropertyValue(v); if (val) ds.setProperty(v, val);
    });
  }
  window.onload = () => {
    syncTheme();
    if (window.parent && window.parent.document.documentElement) {
      new MutationObserver(syncTheme).observe(
        window.parent.document.documentElement,
        { attributes: true, attributeFilter: ['class', 'style'] }
      );
    }
  };
</script>
</head>
<body>
  <div class="tab-bar">
    ${workbook.SheetNames.map((name, i) => `<button class="tab-btn ${i === 0 ? 'active' : ''}" onclick="showSheet(${i})">${name}</button>`).join('')}
  </div>
  <div class="sheet-container">
    ${workbook.SheetNames.map((name, i) => {
      const sheet = workbook.Sheets[name];
      const html = xlsx.utils.sheet_to_html(sheet);
      return `<div class="sheet-content ${i === 0 ? 'active' : ''}">${html}</div>`;
    }).join('')}
  </div>
</body>
</html>`);
                } else if (ext === '.pdf') {
                    res.writeHead(200, { 'Content-Type': 'application/pdf' });
                    fs.createReadStream(filePath).pipe(res);
                } else {
                    res.writeHead(400, { 'Content-Type': 'text/plain' });
                    res.end('Unsupported file format for preview');
                }
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Preview generation failed: ${err.message}`);
            }
        },

        '/api/hayagriva/ingest-status': (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || '';
            const basename = parsedUrl.query.basename || '';
            const caseDir = path.join(docsRoot, caseName);
            const pdfPath = path.join(caseDir, basename + '.pdf');
            const queueEntry = pendingPdfQueue.find(q => q.filePath === pdfPath);
            const complete = completedPdfSet.has(pdfPath);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                converting: !!queueEntry,
                complete,
                nextPage: queueEntry ? queueEntry.nextPage : null,
                totalPages: queueEntry ? queueEntry.totalPages : null
            }));
        },

        '/api/hayagriva/file-statuses': (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || '';
            const caseDir = resolveCaseDir(docsRoot, caseName);
            
            if (fs.existsSync(caseDir)) {
                ensureCaseSettings(caseDir);
            }

            const statuses = {};

            if (fs.existsSync(caseDir)) {
                const { getDb } = require('./core/sqlite-store');
                let dbStatusesMap = {};
                try {
                    const db = getDb(caseDir);
                    const rows = db.prepare('SELECT filename, status FROM documents').all();
                    for (const row of rows) {
                        dbStatusesMap[row.filename] = row.status;
                    }
                } catch (e) {
                    console.warn('[API Server] Failed to query file statuses from SQLite:', e.message);
                }

                const docExts = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.wiki.html'];
                const scan = (dir) => {
                    const files = fs.readdirSync(dir);
                    for (const file of files) {
                        const filePath = path.join(dir, file);
                        const stat = fs.statSync(filePath);
                        const lower = file.toLowerCase();
                        if (stat.isDirectory()) {
                            if (!file.startsWith('.') && 
                                lower !== 'concepts' && 
                                lower !== 'wiki' && 
                                lower !== 'conversions' && 
                                lower !== 'reviews' && 
                                lower !== 'drafts' && 
                                lower !== 'exports' &&
                                lower !== 'node_modules' &&
                                lower !== 'bower_components' &&
                                lower !== 'dist' &&
                                lower !== 'build' &&
                                lower !== 'out' &&
                                lower !== '.git' &&
                                lower !== '.github' &&
                                lower !== '.theia') {
                                scan(filePath);
                            }
                        } else {
                            const isWikiHtml = file.endsWith('.wiki.html');
                            const ext = isWikiHtml ? '.wiki.html' : path.extname(file).toLowerCase();
                            if (docExts.includes(ext)) {
                                const relative = path.relative(caseDir, filePath);
                                const docStatus = dbStatusesMap[relative] || 'unprocessed';

                                // Resolve dot colors based on docStatus
                                // Dot 1 (Companion)
                                let dot1 = 'grey';
                                if (isWikiHtml) {
                                    dot1 = 'reviewed';
                                } else {
                                    if (['companion_ready', 'reviewed', 'ingesting', 'indexed', 'failed_ingest', 'enriching', 'enriched', 'failed_enrich'].includes(docStatus)) {
                                        dot1 = 'companion_ready';
                                    } else if (docStatus === 'converting' || docStatus === 'processing') {
                                        dot1 = 'blue';
                                    } else if (docStatus === 'failed_convert') {
                                        dot1 = 'red';
                                    }
                                }

                                // Dot 2 (Index)
                                let dot2 = 'grey';
                                if (['indexed', 'enriching', 'enriched', 'failed_enrich'].includes(docStatus)) {
                                    dot2 = 'indexed';
                                } else if (docStatus === 'ingesting') {
                                    dot2 = 'blue';
                                } else if (docStatus === 'failed_ingest') {
                                    dot2 = 'red';
                                }

                                // Dot 3 (AI Enrichment)
                                let dot3 = 'grey';
                                if (docStatus === 'enriched') {
                                    dot3 = 'green';
                                } else if (docStatus === 'enriching') {
                                    dot3 = 'blue';
                                } else if (docStatus === 'failed_enrich') {
                                    dot3 = 'red';
                                }

                                 let errorMsg = '';
                                 if (docStatus.startsWith('failed_')) {
                                     try {
                                         const base = isWikiHtml ? path.basename(file, '.wiki.html') : path.basename(file, ext);
                                         const subfolder = path.dirname(relative);
                                         const errorPath = subfolder === '.' ? 
                                             path.join(caseDir, 'conversions', `${base}.error`) : 
                                             path.join(caseDir, 'conversions', subfolder, `${base}.error`);
                                         if (fs.existsSync(errorPath)) {
                                             errorMsg = fs.readFileSync(errorPath, 'utf8').trim();
                                         }
                                     } catch (_) {}
                                 }

                                 statuses[relative] = { dot1, dot2, dot3, error: errorMsg };
                            }
                        }
                    }
                };
                try {
                    scan(caseDir);
                } catch (_) {}
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ statuses }));
        },

        '/api/laws/query': async (req, res, parsedUrl, docsRoot) => {
            const q = (parsedUrl.query.q || '').trim();
            const topN = Math.min(parseInt(parsedUrl.query.n || '5', 10), 20);

            if (!isVaultReady()) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Vault is not ready or missing VAULT_KEY' }));
                return;
            }
            if (!q) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing query parameter: q' }));
                return;
            }
            const results = await resolveTrigger(q, topN);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ query: q, results }));
        },

        '/api/laws/search': async (req, res, parsedUrl, docsRoot) => {
            const q = (parsedUrl.query.q || '').trim();
            const topN = Math.min(parseInt(parsedUrl.query.n || '5', 10), 20);

            if (!isVaultReady()) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Vault is not ready or missing VAULT_KEY' }));
                return;
            }
            const results = (await searchLaws(q, topN)).map(r => ({
                id: r.id, title: r.title, section: r.section, score: r.score,
                preview: r.text.slice(0, 300)
            }));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ query: q, results }));
        },

        '/api/laws/version': (req, res, parsedUrl, docsRoot) => {
            const ver = getVaultVersion();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(ver || { version: null, ready: isVaultReady() }));
        },

        '/api/hayagriva/wiki-cards': (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || getDefaultCaseName(docsRoot);
            const caseDir = path.join(docsRoot, caseName);
            const wikiDir = path.join(caseDir, 'wiki');
            
            const { parseMarkdownWithFrontmatter } = require('./utils/okf');
            
            if (!fs.existsSync(wikiDir)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ cards: [] }));
                return;
            }
            const files = fs.readdirSync(wikiDir)
                .filter(f => f.endsWith('.md'))
                .map(f => {
                    const content = fs.readFileSync(path.join(wikiDir, f), 'utf8');
                    const { frontmatter } = parseMarkdownWithFrontmatter(content);
                    return {
                        filename: f,
                        title: frontmatter.title || f.replace('.md', ''),
                        tags: frontmatter.tags || []
                    };
                });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ cards: files }));
        },

        '/api/hayagriva/concepts': (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || getDefaultCaseName(docsRoot);
            const caseDir = path.join(docsRoot, caseName);
            const conceptsDir = path.join(caseDir, 'concepts');
            const list = [];
            
            if (fs.existsSync(conceptsDir)) {
                const folders = fs.readdirSync(conceptsDir).filter(f => {
                    return fs.statSync(path.join(conceptsDir, f)).isDirectory() && !f.startsWith('.');
                });
                for (const doc of folders) {
                    const docDir = path.join(conceptsDir, doc);
                    const files = fs.readdirSync(docDir).filter(f => f.endsWith('.md') && f !== 'index.md');
                    for (const f of files) {
                        list.push({
                            title: f.replace('.md', ''),
                            relativePath: `concepts/${doc}/${f}`
                        });
                    }
                }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ concepts: list }));
        },



        '/api/hayagriva/read-file': (req, res, parsedUrl, docsRoot) => {
            const filePath = parsedUrl.query.path;
            if (!filePath) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing path' }));
                return;
            }
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(docsRoot, filePath);
            if (!fs.existsSync(absolutePath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'File not found' }));
                return;
            }
            const content = fs.readFileSync(absolutePath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(content);
        },

        '/api/forms/kv-dictionary': (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || '';
            const caseDir = path.join(docsRoot, caseName);
            const dictPath = path.join(caseDir, 'reviews', 'case_kv_dictionary.json');
            let dictionary = {};
            if (fs.existsSync(dictPath)) {
                dictionary = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ dictionary }));
        },

        '/api/forms/instance': async (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || '';
            const formId = parsedUrl.query.formId || '';
            if (!caseName || !formId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing case or formId' }));
                return;
            }
            const caseDir = path.join(docsRoot, caseName);
            const instancePath = path.join(caseDir, 'reviews', `filled-${formId}.json`);
            let fields = {};
            if (fs.existsSync(instancePath)) {
                fields = JSON.parse(fs.readFileSync(instancePath, 'utf8'));
            } else {
                const { populateFormInstance } = require('./pipeline/forms/mapper');
                fields = await populateFormInstance(caseDir, formId);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ fields }));
        },

        '/api/formats/registry': (req, res, parsedUrl, docsRoot) => {
            const workspaceRoot = path.join(__dirname, '../..');
            const formatsRoot = path.join(workspaceRoot, 'templates');
            const list = [];
            if (fs.existsSync(formatsRoot)) {
                const folders = fs.readdirSync(formatsRoot).filter(f => {
                    return fs.statSync(path.join(formatsRoot, f)).isDirectory() && !f.startsWith('.');
                });
                for (const f of folders) {
                    const schemaPath = path.join(formatsRoot, f, 'prompt.txt');
                    if (fs.existsSync(schemaPath)) {
                        const name = f.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                        list.push({ formatId: f, name });
                    }
                }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ formats: list }));
        }
    },

    POST: {
        // Called by the frontend at workspace startup to synchronously write settings.json
        // BEFORE Theia renders the sidebar — so Open Editors is hidden from the first render.
        '/api/hayagriva/bootstrap-case': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const caseName = data.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    if (caseDir && fs.existsSync(caseDir)) {
                        ensureCaseSettings(caseDir);
                        ensureAuditDocs(caseDir);
                        console.log(`[API Server] bootstrap-case: settings and audit docs initialized for ${caseDir}`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, caseDir }));
                    } else {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Case directory not found', caseDir }));
                    }
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        },

        '/api/hayagriva/archive-case': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const caseName = data.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    if (caseDir && fs.existsSync(caseDir)) {
                        const { archiveCase } = require('./core/archive-service');
                        await archiveCase(caseDir);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, message: 'Case archived successfully in sqlite database' }));
                    } else {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Case directory not found', caseDir }));
                    }
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        },

        '/api/hayagriva/restore-case': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const caseName = data.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    if (caseDir && fs.existsSync(caseDir)) {
                        const { restoreCase } = require('./core/archive-service');
                        const restored = await restoreCase(caseDir);
                        if (restored) {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true, message: 'Case restored successfully from sqlite database' }));
                        } else {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'No archive records found in database to restore' }));
                        }
                    } else {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Case directory not found', caseDir }));
                    }
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        },
        '/api/hayagriva/settings/panel': (req, res, parsedUrl, docsRoot) => {
            const htmlPath = path.join(__dirname, 'assets', 'settings-dashboard.html');
            if (!fs.existsSync(htmlPath)) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Settings Panel view file not found');
                return;
            }
            const content = fs.readFileSync(htmlPath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
        },

        '/api/hayagriva/settings/get': (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || '';
            const caseDir = resolveCaseDir(docsRoot, caseName);
            const settingsPath = path.join(caseDir, 'hayagriva_settings.json');
            
            let config = { ...DEFAULT_SETTINGS };
            if (fs.existsSync(settingsPath)) {
                try {
                    const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                    config = { ...config, ...saved };
                } catch (_) {}
            }

            // Check if API key exists in SQLite secure_secrets table
            let hasCloudKey = false;
            try {
                const { getDb } = require('./core/sqlite-store');
                const db = getDb(caseDir);
                const secretKey = `${config.cloudProvider}_api_key`;
                const row = db.prepare("SELECT secret_value FROM secure_secrets WHERE secret_key = ?").get(secretKey);
                if (row && row.secret_value) {
                    hasCloudKey = true;
                }
            } catch (err) {
                console.error("Error reading secure key:", err);
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ...config, hasCloudKey }));
        },

        '/api/hayagriva/settings/save': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const caseName = data.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    
                    if (!fs.existsSync(caseDir)) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Case directory not found' }));
                        return;
                    }

                    const settingsPath = path.join(caseDir, 'hayagriva_settings.json');
                    
                    // Filter and save standard settings
                    const savedConfig = {
                        processingProfile: data.processingProfile || 'standard',
                        activeMode: data.activeMode || 'local',
                        localRunner: data.localRunner || 'ollama',
                        localEndpoint: data.localEndpoint || 'http://127.0.0.1:11434',
                        localChatModel: data.localChatModel || 'qwen2.5-coder:1.5b',
                        localEmbedModel: data.localEmbedModel || 'nomic-embed-text',
                        cloudProvider: data.cloudProvider || 'gemini',
                        cloudModel: data.cloudModel || 'gemini-1.5-flash'
                    };

                    fs.writeFileSync(settingsPath, JSON.stringify(savedConfig, null, 2), 'utf8');

                    // If API key is provided and not empty/placeholder, save to SQLite secure_secrets table
                    if (data.cloudApiKey && data.cloudApiKey.trim() !== '') {
                        const { getDb } = require('./core/sqlite-store');
                        const db = getDb(caseDir);
                        const secretKey = `${savedConfig.cloudProvider}_api_key`;
                        db.prepare("INSERT OR REPLACE INTO secure_secrets (secret_key, secret_value) VALUES (?, ?)").run(secretKey, data.cloudApiKey.trim());
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
        },

        '/api/hayagriva/switch-context': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const data = JSON.parse(body);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, activeBag: data.doc }));
            });
        },

        '/api/hayagriva/query': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                const data = JSON.parse(body);
                const caseName = data.case || 'Case_Alpha';
                const caseDir = path.join(docsRoot, caseName);
                const qResult = await query(caseDir, data.query || 'Hello', { model: data.model });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(qResult));
            });
        },

        '/api/hayagriva/query-stream': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                const data = JSON.parse(body);
                const caseName = data.case || 'Case_Alpha';
                const caseDir = path.join(docsRoot, caseName);
                const queryText = data.query || 'Hello';
                const contexts = await retrieveContexts(caseDir, queryText);
                
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                });

                if (contexts.length === 0) {
                    res.write(`data: ${JSON.stringify({ content: 'I could not find matching concepts in the case files.' })}\n\n`);
                    res.write(`data: ${JSON.stringify({ done: true, sources: [] })}\n\n`);
                    res.end();
                    return;
                }

                const prompt = buildPrompt(queryText, contexts);
                const messages = [{ role: 'user', content: prompt }];
                
                try {
                    const stream = streamChat(messages, { model: data.model });
                    for await (const chunk of stream) {
                        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
                    }
                    const sources = Array.from(new Set(contexts.map(c => c.docName)));
                    res.write(`data: ${JSON.stringify({ done: true, sources })}\n\n`);
                } catch (e) {
                    res.write(`data: ${JSON.stringify({ content: `\nError calling local LLM: ${e.message}` })}\n\n`);
                    res.write(`data: ${JSON.stringify({ done: true, sources: [] })}\n\n`);
                }
                res.end();
            });
        },

        '/api/hayagriva/cancel-ocr': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const data = JSON.parse(body);
                const success = cancelConversion(data.file);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success }));
            });
        },

        '/api/hayagriva/convert-to-md': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const data = JSON.parse(body);
                const file = data.file || data.filePath;
                if (!file) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing file parameter' }));
                    return;
                }
                const caseName = data.case || 'Case_Alpha';
                const caseDir = resolveCaseDir(docsRoot, caseName);
                ensureCaseSettings(caseDir);
                const relative = path.relative(caseDir, file);
                const ext = path.extname(file).toLowerCase();
                const basename = path.basename(file, ext);

                // Perform clean-up if forced regeneration is requested
                if (data.force) {
                    console.log(`[API Server] Forced regeneration requested for: ${relative}. Cleaning up old sidecar assets...`);
                    const companionPath = file.replace(/\.[a-zA-Z0-9]+$/, '.md');
                    const statusPath1 = companionPath.replace(/\.md$/, '.status');
                    
                    const subfolder = path.dirname(relative);
                    const conversionsDir = path.join(caseDir, 'conversions');
                    const destDir = subfolder === '.' ? conversionsDir : path.join(conversionsDir, subfolder);
                    const statusPath2 = path.join(destDir, `${basename}.status`);
                    
                    const footerPath = file.toLowerCase().endsWith('.pdf') ? file.replace(/\.pdf$/i, '.footer') : '';
                    const cachePath = companionPath + '.cache';

                    const safeDelete = (p) => {
                        try {
                            if (p && p !== file && fs.existsSync(p)) {
                                fs.unlinkSync(p);
                                console.log(`[API Server] Cleaned up asset: ${path.basename(p)}`);
                            }
                        } catch (_) {}
                    };

                    safeDelete(companionPath);
                    safeDelete(statusPath1);
                    safeDelete(statusPath2);
                    if (footerPath) safeDelete(footerPath);
                    safeDelete(cachePath);

                    // Clear the completedPdfSet to reset lazy loading state
                    try {
                        const { completedPdfSet } = require('./daemon/lazy_pdf_worker');
                        if (completedPdfSet && typeof completedPdfSet.delete === 'function') {
                            completedPdfSet.delete(file);
                            console.log(`[API Server] Reset completedPdfSet for: ${file}`);
                        }
                    } catch (e) {
                        console.warn('[API Server] Could not clear completedPdfSet:', e.message);
                    }
                }

                updateStatus(caseDir, relative, 'converting');

                ingestFile(caseDir, file, { 
                    conversionOnly: true,
                    multimodal: !!data.multimodal
                }).then(result => {
                    if (result && result.companionPath) {
                        updateStatus(caseDir, relative, 'companion_ready');
                    } else {
                        updateStatus(caseDir, relative, 'failed_convert');
                    }
                }).catch(err => {
                    console.error(`[API Server] Conversion failed for ${basename}:`, err.message);
                    updateStatus(caseDir, relative, 'failed_convert');
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, status: 'converting' }));
            });
        },

        '/api/hayagriva/ingest-to-context': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const data = JSON.parse(body);
                const file = data.file || data.filePath;
                if (!file) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing file parameter' }));
                    return;
                }
                const caseName = data.case || 'Case_Alpha';
                const caseDir = resolveCaseDir(docsRoot, caseName);
                ensureCaseSettings(caseDir);
                const relative = path.relative(caseDir, file);
                const isWikiHtml = file.endsWith('.wiki.html');
                const ext = isWikiHtml ? '.wiki.html' : path.extname(file).toLowerCase();
                const basename = isWikiHtml ? path.basename(file, '.wiki.html') : path.basename(file, ext);

                updateStatus(caseDir, relative, 'ingesting');

                const companionPath = isWikiHtml ? file : file.replace(/\.[a-zA-Z0-9]+$/, '.md');

                ingestFile(caseDir, companionPath, { 
                    conversionOnly: false,
                    disableDoc2Query: true 
                }).then(result => {
                    if (result) {
                        updateStatus(caseDir, relative, 'indexed');
                    } else {
                        updateStatus(caseDir, relative, 'failed_ingest');
                    }
                }).catch(err => {
                    console.error(`[API Server] Ingestion failed for ${basename}:`, err.message);
                    updateStatus(caseDir, relative, 'failed_ingest');
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, status: 'ingesting' }));
            });
        },

        '/api/hayagriva/ingest-to-ai': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const data = JSON.parse(body);
                const file = data.file || data.filePath;
                if (!file) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing file parameter' }));
                    return;
                }
                const caseName = data.case || 'Case_Alpha';
                const caseDir = resolveCaseDir(docsRoot, caseName);
                ensureCaseSettings(caseDir);
                const relative = path.relative(caseDir, file);
                const isWikiHtml = file.endsWith('.wiki.html');
                const ext = isWikiHtml ? '.wiki.html' : path.extname(file).toLowerCase();
                const basename = isWikiHtml ? path.basename(file, '.wiki.html') : path.basename(file, ext);
                const subfolder = path.dirname(relative);

                // Phase 1: Set status to ingesting
                updateStatus(caseDir, relative, 'ingesting');

                const companionPath = isWikiHtml ? file : file.replace(/\.[a-zA-Z0-9]+$/, '.md');

                ingestFile(caseDir, companionPath, { 
                    conversionOnly: false,
                    disableDoc2Query: true 
                }).then(result => {
                    if (result) {
                        console.log(`[API Server] Ingested context for: ${basename}. Auto-starting AI enrichment...`);
                        updateStatus(caseDir, relative, 'indexed');

                        const pageIndexTreePath = path.join(caseDir, 'concepts', subfolder, basename, 'pageindex_tree.json');
                        if (fs.existsSync(pageIndexTreePath)) {
                            let treeData;
                            try {
                                treeData = JSON.parse(fs.readFileSync(pageIndexTreePath, 'utf8'));
                                const sections = [];
                                function collectSections(node) {
                                    if (node.metadata && node.metadata.type === 'section') {
                                        sections.push(node);
                                    }
                                    if (node.children) {
                                        node.children.forEach(collectSections);
                                    }
                                }
                                if (treeData.tree) {
                                    collectSections(treeData.tree);
                                }

                                // Phase 2: Set status to enriching & run AI pipeline
                                updateStatus(caseDir, relative, 'enriching');
                                queueForLazyProcessing(caseDir, basename, sections, relative);
                            } catch (e) {
                                console.error(`[API Server] AI Enrichment auto-trigger failed for ${basename}:`, e.message);
                                updateStatus(caseDir, relative, 'failed_enrich');
                            }
                        } else {
                            console.error(`[API Server] pageindex_tree.json not found for auto enrichment: ${pageIndexTreePath}`);
                            updateStatus(caseDir, relative, 'failed_enrich');
                        }
                    } else {
                        updateStatus(caseDir, relative, 'failed_ingest');
                    }
                }).catch(err => {
                    console.error(`[API Server] IngestToAi pipeline failed for ${basename}:`, err.message);
                    updateStatus(caseDir, relative, 'failed_ingest');
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, status: 'ingesting' }));
            });
        },

        '/api/hayagriva/mark-reviewed': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const file = data.file || data.filePath;
                    if (!file) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing file parameter' }));
                        return;
                    }
                    const caseName = data.case || 'Case_Alpha';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    const relative = path.relative(caseDir, file);
                    updateStatus(caseDir, relative, 'reviewed');

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, status: 'reviewed' }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        },

        '/api/hayagriva/approve-outline': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const file = data.file || data.filePath;
                    if (!file) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing file parameter' }));
                        return;
                    }
                    const caseName = data.case || 'Case_Alpha';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    const relative = path.relative(caseDir, file);
                    updateStatus(caseDir, relative, 'outline_approved');

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, status: 'outline_approved' }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        },

        '/api/hayagriva/enrich-with-ai': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const data = JSON.parse(body);
                const file = data.file || data.filePath;
                if (!file) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing file parameter' }));
                    return;
                }
                const caseName = data.case || 'Case_Alpha';
                const caseDir = resolveCaseDir(docsRoot, caseName);
                const relative = path.relative(caseDir, file);
                const isWikiHtml = file.endsWith('.wiki.html');
                const ext = isWikiHtml ? '.wiki.html' : path.extname(file).toLowerCase();
                const basename = isWikiHtml ? path.basename(file, '.wiki.html') : path.basename(file, ext);
                const subfolder = path.dirname(relative);

                const pageIndexTreePath = path.join(caseDir, 'concepts', subfolder, basename, 'pageindex_tree.json');
                if (!fs.existsSync(pageIndexTreePath)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'PageIndex tree not found. Ingest to context first.' }));
                    return;
                }

                let treeData;
                try {
                    treeData = JSON.parse(fs.readFileSync(pageIndexTreePath, 'utf8'));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to read PageIndex tree: ' + e.message }));
                    return;
                }

                // Read sections list from treeData
                const sections = [];
                function collectSections(node) {
                    if (node.metadata && node.metadata.type === 'section') {
                        sections.push(node);
                    }
                    if (node.children) {
                        node.children.forEach(collectSections);
                    }
                }
                if (treeData.tree) {
                    collectSections(treeData.tree);
                }

                updateStatus(caseDir, relative, 'enriching');

                // Queue to lazy worker
                queueForLazyProcessing(caseDir, basename, sections, relative);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, status: 'enriching' }));
            });
        },

        '/api/forms/kv-dictionary/update': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const data = JSON.parse(body);
                const caseDir = path.join(docsRoot, data.case);
                const reviewsDir = path.join(caseDir, 'reviews');
                fs.mkdirSync(reviewsDir, { recursive: true });
                const dictPath = path.join(reviewsDir, 'case_kv_dictionary.json');
                fs.writeFileSync(dictPath, JSON.stringify(data.dictionary, null, 2), 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            });
        },

        '/api/forms/populate': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                const data = JSON.parse(body);
                const caseDir = path.join(docsRoot, data.case);
                const { populateFormInstance } = require('./pipeline/forms/mapper');
                const fields = await populateFormInstance(caseDir, data.formId);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, fields }));
            });
        },

        '/api/forms/instance/save': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const data = JSON.parse(body);
                const caseDir = path.join(docsRoot, data.case);
                const workspaceRoot = path.join(__dirname, '..');
                const schemaPath = path.join(__dirname, '../..', 'forms', data.formId, 'schema.json');
                const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
                
                const flatData = {};
                for (const k in data.fields) {
                    flatData[k] = data.fields[k].value;
                }
                
                const { validateFormRules } = require('./pipeline/forms/rules_validator');
                const failures = validateFormRules(flatData, schema.rules || []);
                
                for (const key in data.fields) {
                    delete data.fields[key].validationError;
                }
                for (const fail of failures) {
                    for (const fieldKey of fail.affectedFields || []) {
                        if (data.fields[fieldKey]) {
                            data.fields[fieldKey].validationError = fail.message;
                        }
                    }
                }

                const instancePath = path.join(caseDir, 'reviews', `filled-${data.formId}.json`);
                fs.writeFileSync(instancePath, JSON.stringify(data.fields, null, 2), 'utf8');
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, fields: data.fields, validationErrors: failures }));
            });
        },

        '/api/forms/instance/export': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                const data = JSON.parse(body);
                const caseDir = path.join(docsRoot, data.case);
                const instancePath = path.join(caseDir, 'reviews', `filled-${data.formId}.json`);
                const fields = JSON.parse(fs.readFileSync(instancePath, 'utf8'));
                
                const { exportFormInstance } = require('./pipeline/forms/exporter');
                const result = await exportFormInstance(caseDir, data.formId, fields);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    filledHtmlPath: result.filledHtmlPath,
                    filledHtmlName: result.filledHtmlName,
                    bookmarkletCode: result.bookmarkletCode
                }));
            });
        },

        '/api/formats/draft': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                const data = JSON.parse(body);
                const caseDir = path.join(docsRoot, data.case);
                const { draftDocument } = require('./core/drafting');
                const result = await draftDocument(caseDir, data.formatId);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    draftPath: result.draftPath,
                    draftName: result.draftName,
                    version: result.version,
                    placeholders: result.placeholders
                }));
            });
        },

        '/api/agents/chat': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                const data = JSON.parse(body);
                const caseDir = path.join(docsRoot, data.case);
                const coordinator = require('./agents/agent-coordinator');
                const responseText = await coordinator.run(caseDir, data.message, data.history || []);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, response: responseText }));
            });
        },

        '/api/hayagriva/upload': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const data = JSON.parse(body);
                let caseDir;
                if (data.case && (data.case.startsWith('/') || data.case.includes(':\\') || data.case.startsWith('file:///'))) {
                    let cleanCase = data.case;
                    if (cleanCase.startsWith('file:///')) {
                        cleanCase = cleanCase.substring(7); // Remove file://
                        if (process.platform === 'win32' && cleanCase.startsWith('/')) {
                            cleanCase = cleanCase.substring(1);
                        }
                    }
                    caseDir = cleanCase;
                } else {
                    caseDir = path.join(docsRoot, data.case || 'Case_Alpha');
                }

                if (!fs.existsSync(caseDir)) {
                    fs.mkdirSync(caseDir, { recursive: true });
                    fs.mkdirSync(path.join(caseDir, 'concepts'), { recursive: true });
                }
                ensureCaseSettings(caseDir);
                const filePath = path.join(caseDir, data.filename);
                const buffer = Buffer.from(data.content, 'base64');
                fs.writeFileSync(filePath, buffer);
                console.log(`[API Server] Uploaded file saved to: ${filePath}`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, filePath }));
            });
        }
    }
};
