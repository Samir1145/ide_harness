const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { startLazyWorker } = require('./daemon/watcher');
const routes = require('./routes');

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
        const method = req.method;

        const methodRoutes = routes[method];
        if (methodRoutes && methodRoutes[pathname]) {
            try {
                await methodRoutes[pathname](req, res, parsedUrl, docsRoot);
            } catch (e) {
                console.error(`[API Server] Error handling ${method} ${pathname}:`, e.stack);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Not found: ${method} ${pathname}` }));
        }
    });

    server.listen(port, '127.0.0.1', () => {
        console.log(`[API Server] listening on http://127.0.0.1:${port}`);
        // Start background lazy worker for Q&A and summaries
        startLazyWorker();
    });

    // ── LSP WebSocket Bridge ────────────────────────────────────────────────
    // Attaches to the SAME http.Server — no new port opened.
    // Only WebSocket upgrade requests to path /lsp are routed here.
    // All HTTP routes on port 3210 continue to work unchanged.
    try {
        const { WebSocketServer } = require('ws');
        const { toSocket } = require('vscode-ws-jsonrpc');
        const { createWebSocketConnection, createServerProcess, forward } = require('vscode-ws-jsonrpc/server');

        const wss = new WebSocketServer({ server, path: '/lsp' });

        wss.on('connection', (socket, req) => {
            console.log(`[LSP WS] New client connected from ${req.socket.remoteAddress}`);

            const clientConnection = createWebSocketConnection(toSocket(socket));
            const serverConnection = createServerProcess(
                'HayagrivaLSP',
                process.execPath,
                [path.join(__dirname, 'core', 'lsp-server-process.js')],
                {
                    execArgv: ['--max-old-space-size=256']
                }
            );

            if (serverConnection) {
                forward(clientConnection, serverConnection);
            }
        });

        wss.on('error', (err) => {
            console.error(`[LSP WS Server] Error: ${err.message}`);
        });

        console.log(`[LSP WS] WebSocket bridge active at ws://127.0.0.1:${port}/lsp`);
    } catch (err) {
        // ws or vscode-ws-jsonrpc not installed — degrade gracefully
        console.warn(`[LSP WS] WebSocket bridge could not start: ${err.message}. Falling back to HTTP LSP routes.`);
    }

    return server;
}

module.exports = { startApiServer };

