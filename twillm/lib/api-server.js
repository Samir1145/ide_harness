const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { query, retrieveContexts, buildPrompt } = require('./rag');
const { ingestFile, startLazyWorker } = require('./watcher');
const { streamChat } = require('./llm-client');
const { cancelConversion } = require('./converter');
const { resolveTrigger, searchLaws, getVaultVersion, isVaultReady } = require('./vault-loader');


function startApiServer(docsRoot, port = 3210) {
    const server = http.createServer(async (req, res) => {
        // Enable CORS for all local webview / extension requests
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;

        if (pathname === '/api/twillm/cases' && req.method === 'GET') {
            try {
                const dirs = fs.readdirSync(docsRoot).filter(f => {
                    const p = path.join(docsRoot, f);
                    return fs.statSync(p).isDirectory() && !f.startsWith('.');
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ cases: dirs }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        } else if (pathname === '/api/twillm/wiki-port' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ port: null }));

        // ── Law Vault Endpoints ──────────────────────────────────────────────
        } else if (pathname === '/api/laws/query' && req.method === 'GET') {
            // Resolve a @@ trigger or free-text search against the law vault.
            // Query params: ?q=<trigger_text>&n=<topN>
            const q    = (parsedUrl.query.q || '').trim();
            const topN = Math.min(parseInt(parsedUrl.query.n || '5', 10), 20);
            console.log(`[API Server] /api/laws/query: q="${q}", topN=${topN}`);


            if (!isVaultReady()) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Law vault not loaded. Ensure vault/laws-open.json exists.' }));
                return;
            }
            if (!q) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing query parameter: q' }));
                return;
            }
            const results = resolveTrigger(q, topN);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ query: q, results }));

        } else if (pathname === '/api/laws/search' && req.method === 'GET') {
            // Free-text BM25 search. Query params: ?q=<text>&n=<topN>
            const q    = (parsedUrl.query.q || '').trim();
            const topN = Math.min(parseInt(parsedUrl.query.n || '5', 10), 20);

            if (!isVaultReady()) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Law vault not loaded.' }));
                return;
            }
            const results = searchLaws(q, topN).map(r => ({
                id: r.id, title: r.title, section: r.section, score: r.score,
                preview: r.text.slice(0, 300)
            }));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ query: q, results }));

        } else if (pathname === '/api/laws/version' && req.method === 'GET') {
            // Returns vault version metadata.
            const ver = getVaultVersion();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(ver || { version: null, ready: isVaultReady() }));
        // ────────────────────────────────────────────────────────────────────

        } else if (pathname === '/api/twillm/wiki-cards' && req.method === 'GET') {
            try {
                const caseName = parsedUrl.query.case || 'Case_Alpha';
                const caseDir = path.join(docsRoot, caseName);
                const wikiDir = path.join(caseDir, 'wiki');
                
                const { parseMarkdownWithFrontmatter } = require('./okf');
                
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
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        } else if (pathname === '/api/twillm/read-file' && req.method === 'GET') {
            try {
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
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        } else if (pathname === '/api/twillm/switch-context' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const caseName = data.case;
                    const docName = data.doc;
                    if (!caseName || !docName) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing case or doc parameter' }));
                        return;
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, activeBag: docName }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        } else if (pathname === '/api/twillm/query' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const caseName = data.case || 'Case_Alpha';
                    const caseDir = path.join(docsRoot, caseName);
                    if (!fs.existsSync(caseDir)) {
                        fs.mkdirSync(caseDir, { recursive: true });
                        fs.mkdirSync(path.join(caseDir, 'concepts'), { recursive: true });
                    }
                    const qResult = await query(caseDir, data.query || 'Hello', { model: data.model });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(qResult));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        } else if (pathname === '/api/twillm/query-stream' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const caseName = data.case || 'Case_Alpha';
                    const caseDir = path.join(docsRoot, caseName);
                    if (!fs.existsSync(caseDir)) {
                        fs.mkdirSync(caseDir, { recursive: true });
                        fs.mkdirSync(path.join(caseDir, 'concepts'), { recursive: true });
                    }

                    const queryText = data.query || 'Hello';
                    console.log(`[API Server] Streaming RAG query for ${caseName}: "${queryText}"`);
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
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        } else if (pathname === '/api/twillm/cancel-ocr' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    if (!data.file) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing file path' }));
                        return;
                    }
                    console.log(`[API Server] Request to cancel conversion for: ${data.file}`);
                    const success = cancelConversion(data.file);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        } else if (pathname === '/api/twillm/ingest' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const caseName = data.case || 'Case_Alpha';
                    const caseDir = path.join(docsRoot, caseName);
                    if (!fs.existsSync(caseDir)) {
                        fs.mkdirSync(caseDir, { recursive: true });
                        fs.mkdirSync(path.join(caseDir, 'concepts'), { recursive: true });
                    }
                    if (!data.file) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing file path' }));
                        return;
                    }
                                        console.log(`[API Server] Ingesting ${data.file} for case ${caseName} (disableDoc2Query: ${data.disableDoc2Query === true})`);
                    const result = await ingestFile(caseDir, data.file, data.disableDoc2Query === true);
                    if (result && result.companionPath) {
                        console.log(`[API Server] Slicing companion Markdown: ${result.companionPath}`);
                        await ingestFile(caseDir, result.companionPath, data.disableDoc2Query === true);
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, result }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        } else if (pathname === '/api/twillm/upload' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const caseName = data.case || 'Case_Alpha';
                    const caseDir = path.join(docsRoot, caseName);
                    if (!fs.existsSync(caseDir)) {
                        fs.mkdirSync(caseDir, { recursive: true });
                        fs.mkdirSync(path.join(caseDir, 'concepts'), { recursive: true });
                    }
                    if (!data.filename || !data.content) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing filename or content' }));
                        return;
                    }

                    const filePath = path.join(caseDir, data.filename);
                    const buffer = Buffer.from(data.content, 'base64');
                    fs.writeFileSync(filePath, buffer);
                    console.log(`[API Server] Uploaded file saved to: ${filePath}`);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, filePath }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    });

    server.listen(port, '127.0.0.1', () => {
        console.log(`[API Server] listening on http://127.0.0.1:${port}`);
        // Start background lazy worker for Q&A and summaries
        startLazyWorker();
    });

    return server;
}

module.exports = { startApiServer };
