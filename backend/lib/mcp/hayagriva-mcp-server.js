'use strict';

const readline = require('readline');
const { executeTool } = require('../agents/skills/tool-dispatcher');

/**
 * Returns the list of standard Model Context Protocol (MCP) tool schemas.
 */
function getMcpToolDefinitions() {
    return [
        {
            name: 'hayagriva_search_rag',
            description: 'Performs semantic & keyword hybrid RAG retrieval over case files using InLegal-SBERT or Finance-Embeddings.',
            riskClass: 'read',
            inputSchema: {
                type: 'object',
                properties: {
                    caseDir: { type: 'string', description: 'Absolute path to the case directory.' },
                    query: { type: 'string', description: 'The search query or factual question to look up.' },
                    limit: { type: 'number', description: 'Maximum contextual passages to retrieve (default: 4).' }
                },
                required: ['caseDir', 'query']
            }
        },
        {
            name: 'hayagriva_get_kv_fact',
            description: 'Fetches verified case facts (e.g. corporate debtor name, default date, admitted claim amounts) from the case KV dictionary.',
            riskClass: 'read',
            inputSchema: {
                type: 'object',
                properties: {
                    caseDir: { type: 'string', description: 'Absolute path to the case directory.' },
                    key: { type: 'string', description: 'The exact fact key name to fetch (e.g. "corporate_debtor", "date_of_default").' }
                },
                required: ['caseDir', 'key']
            }
        },
        {
            name: 'hayagriva_query_timeline',
            description: 'Queries the reconstructed case chronology events and CIRP statutory timeline milestones (T0 -> T330).',
            riskClass: 'read',
            inputSchema: {
                type: 'object',
                properties: {
                    caseDir: { type: 'string', description: 'Absolute path to the case directory.' }
                },
                required: ['caseDir']
            }
        },
        {
            name: 'hayagriva_vault_lookup',
            description: 'Queries the encrypted Indian Law & Precedent Vault for statutory sections, tribunal rules, and Supreme Court ratios.',
            riskClass: 'read',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Statutory section or legal keyword (e.g. "Section 7 IBC financial creditor").' },
                    limit: { type: 'number', description: 'Maximum statutory sections to return (default: 3).' }
                },
                required: ['query']
            }
        },
        {
            name: 'hayagriva_cross_reference',
            description: 'Cross-checks factual statements against case evidence to identify corroborating records or contradicting documents.',
            riskClass: 'read',
            inputSchema: {
                type: 'object',
                properties: {
                    caseDir: { type: 'string', description: 'Absolute path to the case directory.' },
                    statement: { type: 'string', description: 'The factual claim or assertion to cross-verify against case documents.' }
                },
                required: ['caseDir', 'statement']
            }
        },
        {
            name: 'hayagriva_lint_draft',
            description: 'Analyzes legal drafts for antecedent basis flaws, vague statutory terms, and atomic limitation clarity.',
            riskClass: 'read',
            inputSchema: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'The drafting content to lint.' }
                },
                required: ['text']
            }
        },
        {
            name: 'hayagriva_write_kv',
            description: 'Persists a verified case fact into the case KV dictionary and database.',
            riskClass: 'write_local',
            inputSchema: {
                type: 'object',
                properties: {
                    caseDir: { type: 'string', description: 'Absolute path to the case directory.' },
                    key: { type: 'string', description: 'Fact key identifier.' },
                    value: { type: 'string', description: 'Fact value to persist.' }
                },
                required: ['caseDir', 'key', 'value']
            }
        }
    ];
}

/**
 * Handles incoming JSON-RPC 2.0 MCP requests.
 */
async function handleMcpRequest(req) {
    if (!req || typeof req !== 'object') {
        return {
            jsonrpc: '2.0',
            id: null,
            error: { code: -32600, message: 'Invalid Request: payload must be a JSON object' }
        };
    }

    const { id, method, params } = req;

    switch (method) {
        case 'initialize':
            return {
                jsonrpc: '2.0',
                id,
                result: {
                    protocolVersion: (params && params.protocolVersion) || '2024-11-05',
                    capabilities: {
                        tools: {}
                    },
                    serverInfo: {
                        name: 'hayagriva-mcp-server',
                        version: '1.0.0'
                    }
                }
            };

        case 'notifications/initialized':
            return null; // Notifications return no response

        case 'tools/list':
            return {
                jsonrpc: '2.0',
                id,
                result: {
                    tools: getMcpToolDefinitions()
                }
            };

        case 'tools/call': {
            if (!params || !params.name) {
                return {
                    jsonrpc: '2.0',
                    id,
                    error: { code: -32602, message: 'Invalid params: "name" is required for tools/call' }
                };
            }

            const toolName = params.name;
            const args = params.arguments || {};
            const caseDir = args.caseDir || '';

            try {
                let toolResult;
                switch (toolName) {
                    case 'hayagriva_search_rag':
                        toolResult = await executeTool(caseDir, 'retrieveContexts', args);
                        break;
                    case 'hayagriva_get_kv_fact':
                        toolResult = await executeTool(caseDir, 'getKVValue', args);
                        break;
                    case 'hayagriva_query_timeline':
                        toolResult = await executeTool(caseDir, 'queryTimeline', args);
                        break;
                    case 'hayagriva_vault_lookup':
                        toolResult = await executeTool(caseDir, 'vaultLookup', args);
                        break;
                    case 'hayagriva_cross_reference':
                        toolResult = await executeTool(caseDir, 'checkCrossReference', args);
                        break;
                    case 'hayagriva_lint_draft':
                        toolResult = await executeTool(caseDir, 'lintDraft', args);
                        break;
                    case 'hayagriva_write_kv':
                        toolResult = await executeTool(caseDir, 'writeKV', args);
                        break;
                    default:
                        return {
                            jsonrpc: '2.0',
                            id,
                            error: { code: -32601, message: `Tool not found: ${toolName}` }
                        };
                }

                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            {
                                type: 'text',
                                text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2)
                            }
                        ]
                    }
                };
            } catch (err) {
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        isError: true,
                        content: [
                            {
                                type: 'text',
                                text: `Error executing tool ${toolName}: ${err.message}`
                            }
                        ]
                    }
                };
            }
        }

        default:
            return {
                jsonrpc: '2.0',
                id,
                error: { code: -32601, message: `Method not found: ${method}` }
            };
    }
}

/**
 * CLI Entry point: Starts stdio JSON-RPC loop when run directly.
 */
function startStdioServer() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });

    rl.on('line', async (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
            const req = JSON.parse(trimmed);
            const res = await handleMcpRequest(req);
            if (res) {
                process.stdout.write(JSON.stringify(res) + '\n');
            }
        } catch (e) {
            process.stdout.write(JSON.stringify({
                jsonrpc: '2.0',
                id: null,
                error: { code: -32700, message: `Parse error: ${e.message}` }
            }) + '\n');
        }
    });

    process.stderr.write('[HAYAGRIVA MCP Server] Stdio listener active (v1.0.0).\n');
}

if (require.main === module) {
    startStdioServer();
}

module.exports = {
    getMcpToolDefinitions,
    handleMcpRequest,
    startStdioServer
};
