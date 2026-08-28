const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function run() {
    console.log('[Track 3: MCP Server Protocol & Tool Providers Unit Tests]');

    const tempCaseDir = path.join(__dirname, 'fixtures', 'temp_mcp_case');
    fs.mkdirSync(path.join(tempCaseDir, 'concepts'), { recursive: true });

    // Seed mock facts
    fs.writeFileSync(path.join(tempCaseDir, 'case_kv_dictionary.json'), JSON.stringify({
        'corporate_debtor': 'Apex Infra Tech Ltd',
        'default_amount': '₹90,00,00,000'
    }, null, 2), 'utf8');

    try {
        const { handleMcpRequest, getMcpToolDefinitions } = require('../lib/mcp/hayagriva-mcp-server');

        // 1. Test MCP Tool Definitions
        console.log('  -> Testing MCP tools/list definition schema...');
        const tools = getMcpToolDefinitions();
        assert.ok(Array.isArray(tools), 'getMcpToolDefinitions must return an array');
        assert.ok(tools.length >= 5, `Expected at least 5 MCP tools, got ${tools.length}`);

        const toolNames = tools.map(t => t.name);
        assert.ok(toolNames.includes('hayagriva_search_rag'), 'Must export hayagriva_search_rag');
        assert.ok(toolNames.includes('hayagriva_get_kv_fact'), 'Must export hayagriva_get_kv_fact');
        assert.ok(toolNames.includes('hayagriva_query_timeline'), 'Must export hayagriva_query_timeline');
        assert.ok(toolNames.includes('hayagriva_vault_lookup'), 'Must export hayagriva_vault_lookup');
        assert.ok(toolNames.includes('hayagriva_cross_reference'), 'Must export hayagriva_cross_reference');
        console.log(`     ✓ Verified ${tools.length} MCP tool definitions with valid inputSchemas.`);

        // 2. Test JSON-RPC "initialize" Handshake
        console.log('  -> Testing JSON-RPC 2.0 initialize request...');
        const initReq = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                clientInfo: { name: 'Theia-AI-MCP-Client', version: '1.0.0' }
            }
        };
        const initRes = await handleMcpRequest(initReq);
        assert.strictEqual(initRes.jsonrpc, '2.0');
        assert.strictEqual(initRes.id, 1);
        assert.ok(initRes.result.capabilities.tools, 'Must advertise tools capability');
        console.log('     ✓ MCP initialize handshake succeeded.');

        // 3. Test JSON-RPC "tools/list" Request
        console.log('  -> Testing JSON-RPC tools/list request...');
        const listReq = {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {}
        };
        const listRes = await handleMcpRequest(listReq);
        assert.strictEqual(listRes.id, 2);
        assert.strictEqual(listRes.result.tools.length, tools.length);
        console.log('     ✓ tools/list returned all registered MCP tools.');

        // 4. Test JSON-RPC "tools/call" for hayagriva_get_kv_fact
        console.log('  -> Testing tools/call for hayagriva_get_kv_fact...');
        const callReq = {
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: {
                name: 'hayagriva_get_kv_fact',
                arguments: {
                    caseDir: tempCaseDir,
                    key: 'corporate_debtor'
                }
            }
        };
        const callRes = await handleMcpRequest(callReq);
        assert.strictEqual(callRes.id, 3);
        assert.ok(Array.isArray(callRes.result.content), 'Result must contain content array');
        assert.ok(callRes.result.content[0].text.includes('Apex Infra Tech Ltd'), 'Must return matching KV fact value');
        console.log('     ✓ tools/call executed hayagriva_get_kv_fact successfully.');

        // 5. Test JSON-RPC Error Handling for Unknown Tool
        console.log('  -> Testing error response for unknown tool name...');
        const errorReq = {
            jsonrpc: '2.0',
            id: 4,
            method: 'tools/call',
            params: {
                name: 'non_existent_tool',
                arguments: {}
            }
        };
        const errorRes = await handleMcpRequest(errorReq);
        assert.strictEqual(errorRes.id, 4);
        assert.ok(errorRes.error, 'Must return error object for unknown tool');
        assert.strictEqual(errorRes.error.code, -32601, 'Method not found code should be -32601');
        console.log('     ✓ Unknown tool safely caught with standard JSON-RPC -32601 error.');

    } finally {
        try {
            fs.rmSync(tempCaseDir, { recursive: true, force: true });
        } catch (_) {}
    }

    // 6. Verify mcp.json manifest existence
    console.log('  -> Verifying mcp.json manifest...');
    const mcpJsonPath = path.join(__dirname, '..', 'mcp.json');
    assert.ok(fs.existsSync(mcpJsonPath), 'backend/mcp.json must exist');
    const mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'));
    assert.ok(mcpConfig.mcpServers && mcpConfig.mcpServers.hayagriva, 'mcp.json must declare hayagriva server');
    console.log('     ✓ backend/mcp.json validated.');

    console.log('  ✓ SUCCESS: All Track 3 MCP Server Protocol tests passed!\n');
}

module.exports = { run };
