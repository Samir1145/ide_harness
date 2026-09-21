'use strict';

/**
 * Resolution Bazaar (RBZ) Standalone Cloud HTTP Server
 * ----------------------------------------------------
 * High-performance MCP HTTP Daemon on Port 4001.
 * Provides Asynchronous Queueing, In-Memory Entity Caching, and
 * standard Model Context Protocol (MCP) JSON-RPC 2.0 endpoints.
 */

const http = require('http');
const url = require('url');

const relatedPartyServer = require('./related-party-server-agent');
const { entityCache } = require('./entity-cache');
const { taskQueue } = require('./task-queue');

const DEFAULT_PORT = 4001;

function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 5 * 1024 * 1024) { // 5MB limit
                reject(new Error('Payload too large'));
            }
        });
        req.on('end', () => {
            if (!body.trim()) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(body));
            } catch (err) {
                reject(new Error(`Invalid JSON body: ${err.message}`));
            }
        });
        req.on('error', reject);
    });
}

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Case-ID'
    });
    res.end(JSON.stringify(data));
}

function getMcpToolDefinitions() {
    return [
        {
            name: 'resolution_bazaar:put_report_task',
            description: 'Enqueues an asynchronous forensic inquest or audit report request to Resolution Bazaar Cloud.',
            parameters: {
                type: 'object',
                properties: {
                    task_id: { type: 'string', description: 'Client-generated unique task reference' },
                    case_id: { type: 'string', description: 'Workspace or CIRP case identifier' },
                    report_type: { type: 'string', enum: ['RELATED_PARTY_AUDIT', 'SECTION_65_INQUEST'], description: 'Type of audit dossier' },
                    payload: {
                        type: 'object',
                        properties: {
                            corporate_debtor: { type: 'string' },
                            cin: { type: 'string' },
                            registered_office: { type: 'string' },
                            case_number: { type: 'string' },
                            admission_date: { type: 'string' },
                            irp_name: { type: 'string' }
                        },
                        required: ['corporate_debtor', 'cin']
                    }
                },
                required: ['task_id', 'payload']
            }
        },
        {
            name: 'resolution_bazaar:get_report_result',
            description: 'Polls the status or downloads the finalized dossier, 1-to-1 GST invoice, and HMAC signature.',
            parameters: {
                type: 'object',
                properties: {
                    task_id: { type: 'string', description: 'The task_id previously submitted via put_report_task' }
                },
                required: ['task_id']
            }
        },
        {
            name: 'resolution_bazaar:screen_related_parties',
            description: 'Quick forensic check for connected entities, AS-18 holding companies, and Section 21(2) voting disqualification.',
            parameters: {
                type: 'object',
                properties: {
                    cin: { type: 'string' },
                    company_name: { type: 'string' }
                },
                required: ['cin']
            }
        }
    ];
}

function createRbzServer() {
    return http.createServer(async (req, res) => {
        // Handle CORS preflight
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Case-ID'
            });
            res.end();
            return;
        }

        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;
        const method = req.method;

        try {
            // ── Optional Security Layer for Internet Tunnels ────────────────
            const expectedKey = process.env.RBZ_API_KEY;
            if (expectedKey && pathname.startsWith('/api/mcp/')) {
                const authHeader = req.headers['authorization'] || '';
                const token = authHeader.replace(/^Bearer\s+/i, '').trim();
                if (token !== expectedKey) {
                    return sendJson(res, 401, {
                        success: false,
                        error: 'Unauthorized: Invalid or missing Bearer API key'
                    });
                }
            }

            // ── 1. Health & Status ──────────────────────────────────────────
            if (pathname === '/health' && method === 'GET') {
                return sendJson(res, 200, {
                    status: 'ok',
                    service: 'Resolution Bazaar Cloud Intelligence Server',
                    version: '1.0.0',
                    timestamp: new Date().toISOString(),
                    queue: taskQueue.getStats(),
                    cache: entityCache.getStats()
                });
            }

            // ── 2. MCP Tools Discovery (tools/list) ─────────────────────────
            if (pathname === '/api/mcp/tools' && method === 'GET') {
                return sendJson(res, 200, {
                    tools: getMcpToolDefinitions()
                });
            }

            // ── 3. MCP PUT Endpoint: Asynchronous Task Submission ──────────
            if (pathname === '/api/mcp/tasks' && (method === 'POST' || method === 'PUT')) {
                const body = await parseJsonBody(req);
                if (!body.task_id) {
                    return sendJson(res, 400, {
                        success: false,
                        error: 'Missing required field: task_id'
                    });
                }

                const putResult = await relatedPartyServer.putReportTask(body);
                // Return 202 Accepted for async job queuing
                return sendJson(res, 202, putResult);
            }

            // ── 4. MCP GET Endpoint: Task Status & Dossier Retrieval ────────
            if (pathname.startsWith('/api/mcp/tasks/') && method === 'GET') {
                const taskId = pathname.split('/').pop();
                if (!taskId) {
                    return sendJson(res, 400, { success: false, error: 'Missing taskId in path' });
                }

                const result = await relatedPartyServer.getReportResult(taskId);
                if (result.status === 'NOT_FOUND') {
                    return sendJson(res, 404, result);
                }
                return sendJson(res, 200, result);
            }

            // ── 5. Standard JSON-RPC 2.0 MCP Handler ────────────────────────
            if (pathname === '/api/mcp/jsonrpc' && method === 'POST') {
                const rpc = await parseJsonBody(req);
                const rpcId = rpc.id || null;
                const rpcMethod = rpc.method;
                const rpcParams = rpc.params || {};

                if (rpcMethod === 'tools/list') {
                    return sendJson(res, 200, {
                        jsonrpc: '2.0',
                        id: rpcId,
                        result: { tools: getMcpToolDefinitions() }
                    });
                }

                if (rpcMethod === 'tools/call') {
                    const toolName = rpcParams.name;
                    const toolArgs = rpcParams.arguments || {};

                    if (toolName === 'resolution_bazaar:put_report_task') {
                        const putRes = await relatedPartyServer.putReportTask(toolArgs);
                        return sendJson(res, 200, {
                            jsonrpc: '2.0',
                            id: rpcId,
                            result: putRes
                        });
                    }

                    if (toolName === 'resolution_bazaar:get_report_result') {
                        const getRes = await relatedPartyServer.getReportResult(toolArgs.task_id);
                        return sendJson(res, 200, {
                            jsonrpc: '2.0',
                            id: rpcId,
                            result: getRes
                        });
                    }

                    return sendJson(res, 404, {
                        jsonrpc: '2.0',
                        id: rpcId,
                        error: { code: -32601, message: `Tool not found: ${toolName}` }
                    });
                }

                return sendJson(res, 400, {
                    jsonrpc: '2.0',
                    id: rpcId,
                    error: { code: -32600, message: `Unsupported method: ${rpcMethod}` }
                });
            }

            // Route Not Found
            return sendJson(res, 404, {
                error: `Not Found: ${method} ${pathname}`
            });
        } catch (err) {
            console.error(`[RBZ Server] Internal Error on ${method} ${pathname}:`, err);
            return sendJson(res, 500, {
                error: 'Internal Server Error',
                message: err.message
            });
        }
    });
}

function startRbzServer(port = DEFAULT_PORT) {
    const server = createRbzServer();
    return new Promise((resolve, reject) => {
        server.listen(port, '0.0.0.0', () => {
            console.log(`[Resolution Bazaar Cloud] Server listening on http://0.0.0.0:${port}`);
            console.log(`[Resolution Bazaar Cloud] • Health check   : http://127.0.0.1:${port}/health`);
            console.log(`[Resolution Bazaar Cloud] • MCP Tools      : http://127.0.0.1:${port}/api/mcp/tools`);
            console.log(`[Resolution Bazaar Cloud] • Task Queue     : Max 3 concurrent workers`);
            console.log(`[Resolution Bazaar Cloud] • Entity Cache   : Active (1h TTL)`);
            resolve(server);
        });
        server.on('error', reject);
    });
}

// Standalone execution entry point
if (require.main === module) {
    const port = parseInt(process.env.RBZ_SERVER_PORT || process.argv[2] || DEFAULT_PORT, 10);
    startRbzServer(port).catch(err => {
        console.error('[Resolution Bazaar Cloud] Failed to start server:', err);
        process.exit(1);
    });
}

module.exports = {
    createRbzServer,
    startRbzServer,
    DEFAULT_PORT
};
