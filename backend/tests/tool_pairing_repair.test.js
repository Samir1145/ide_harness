'use strict';

const assert = require('assert');
const { repairToolPairing } = require('../lib/core/history-compactor');
const { repairToolPairing: exportedFromLlmClient } = require('../lib/core/llm-client');

console.log('[Tool-Pairing Self-Healing (_repair_tool_pairing) Tests]');

function assistantWithCalls(callId = 'c1', toolName = 'read_file') {
    return {
        role: 'assistant',
        content: null,
        tool_calls: [
            { id: callId, type: 'function', function: { name: toolName, arguments: '{}' } }
        ]
    };
}

function toolResult(callId = 'c1', content = '{"ok": true}') {
    return { role: 'tool', tool_call_id: callId, content };
}

function userMsg(text = 'continue') {
    return { role: 'user', content: text };
}

// Test 1: Passthrough well-formed
console.log('  -> Test 1: Well-formed thread with results immediately after calls is unchanged');
const wellFormed = [
    userMsg('go'),
    assistantWithCalls('c1'),
    toolResult('c1'),
    assistantWithCalls('c2'),
    toolResult('c2'),
    userMsg('done')
];
const out1 = repairToolPairing(wellFormed);
assert.deepStrictEqual(out1, wellFormed);

// Test 2: Interleaved user message between call and result
console.log('  -> Test 2: User message between tool call and result is moved after result');
const interleaved = [
    userMsg('go'),
    assistantWithCalls('c1'),
    userMsg('interleaved message that causes 400'),
    toolResult('c1')
];
const out2 = repairToolPairing(interleaved);
assert.strictEqual(out2.length, 4);
assert.strictEqual(out2[0].role, 'user');
assert.strictEqual(out2[1].role, 'assistant');
assert.strictEqual(out2[2].role, 'tool');
assert.strictEqual(out2[2].tool_call_id, 'c1');
assert.strictEqual(out2[3].role, 'user');
assert.strictEqual(out2[3].content, 'interleaved message that causes 400');

// Test 3: Dangling call on completed turn gets synthesized placeholder
console.log('  -> Test 3: Dangling tool call on interrupted turn gets synthesized error placeholder');
const dangling = [
    userMsg('go'),
    assistantWithCalls('c1'),
    userMsg('next user turn')
];
const out3 = repairToolPairing(dangling);
assert.strictEqual(out3.length, 4);
assert.strictEqual(out3[1].role, 'assistant');
assert.strictEqual(out3[2].role, 'tool');
assert.strictEqual(out3[2].tool_call_id, 'c1');
assert(out3[2].content.includes('tool result was lost during an interrupted turn'));
assert.strictEqual(out3[3].role, 'user');

// Test 4: Trailing pending call at end of thread is preserved for engine resume
console.log('  -> Test 4: Trailing call at end of thread is preserved without placeholder');
const trailing = [
    userMsg('go'),
    assistantWithCalls('c_pending')
];
const out4 = repairToolPairing(trailing);
assert.strictEqual(out4.length, 2);
assert.strictEqual(out4[1].tool_calls[0].id, 'c_pending');

// Test 5: Multi-call block gets results in call order
console.log('  -> Test 5: Multiple tool calls in one block emit results in matching order');
const multiCall = [
    userMsg('go'),
    {
        role: 'assistant',
        content: null,
        tool_calls: [
            { id: 'call_a', type: 'function', function: { name: 'run_shell', arguments: '{}' } },
            { id: 'call_b', type: 'function', function: { name: 'read_file', arguments: '{}' } }
        ]
    },
    userMsg('wait'),
    toolResult('call_b', '{"file": true}'),
    toolResult('call_a', '{"shell": true}')
];
const out5 = repairToolPairing(multiCall);
assert.strictEqual(out5.length, 5);
assert.strictEqual(out5[1].role, 'assistant');
assert.strictEqual(out5[2].role, 'tool');
assert.strictEqual(out5[2].tool_call_id, 'call_a');
assert.strictEqual(out5[3].role, 'tool');
assert.strictEqual(out5[3].tool_call_id, 'call_b');
assert.strictEqual(out5[4].role, 'user');
assert.strictEqual(out5[4].content, 'wait');

// Test 6: Idempotent
console.log('  -> Test 6: Running repair multiple times is strictly idempotent');
const once = repairToolPairing(interleaved);
const twice = repairToolPairing(once);
assert.deepStrictEqual(once, twice);

// Test 7: Threads without tool calls or empty arrays pass through cleanly
console.log('  -> Test 7: Empty lists and threads without tool calls pass through untouched');
assert.deepStrictEqual(repairToolPairing([]), []);
const noTools = [userMsg('hi'), { role: 'assistant', content: 'hello' }];
assert.deepStrictEqual(repairToolPairing(noTools), noTools);

// Test 8: Exported from llm-client
console.log('  -> Test 8: repairToolPairing is exported directly from llm-client');
assert.strictEqual(typeof exportedFromLlmClient, 'function');
assert.deepStrictEqual(exportedFromLlmClient(wellFormed), wellFormed);

console.log('  ✓ SUCCESS: All 8 Tool-Pairing Self-Healing tests passed!\n');
