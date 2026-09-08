'use strict';

const assert = require('assert');
const {
    DEFAULT_CONTEXT_WINDOW,
    DEFAULT_THRESHOLD_PCT,
    DEFAULT_CAP_TOKENS,
    estimateTokens,
    triggerTokens,
    shouldCompact,
    pickBoundary,
    extractWorkingState,
    extractUserDirectives,
    clipStaleToolOutputs,
    buildCompactedBlock,
    deterministicFallbackSummary,
    compactHistory
} = require('../lib/core/history-compactor');

async function runTests() {
    console.log('[Mathematical Context Auto-Compaction Unit & Integration Tests]');

    // 1. Token Estimation (estimateTokens)
    console.log('  -> Test 1: estimateTokens calculates (chars / 4) over messages');
    const sampleMsgs = [
        { role: 'user', content: 'Hello '.repeat(20) }, // 120 chars -> ~30 tokens
        { role: 'assistant', content: 'World '.repeat(20) } // 120 chars -> ~30 tokens
    ];
    const tokens = estimateTokens(sampleMsgs);
    assert(tokens >= 55 && tokens <= 65, `Expected ~60 tokens, got ${tokens}`);

    // 2. Trigger Tokens (triggerTokens)
    console.log('  -> Test 2: triggerTokens calculates 80% threshold of 2,048-token window');
    const trigger = triggerTokens(2048, 0.80, 1600);
    assert.strictEqual(trigger, 1600, `Expected capped trigger 1600, got ${trigger}`);

    const uncapped = triggerTokens(1000, 0.80, 1600);
    assert.strictEqual(uncapped, 800, `Expected 800 tokens, got ${uncapped}`);

    // 3. shouldCompact threshold check
    console.log('  -> Test 3: shouldCompact triggers only when exceeding threshold');
    const shortConv = [
        { role: 'system', content: 'You are an Insolvency Assistant.' },
        { role: 'user', content: 'Who is the corporate debtor?' },
        { role: 'assistant', content: 'The corporate debtor is Acme Infra Ltd.' }
    ];
    assert.strictEqual(shouldCompact(shortConv, 2048), false, 'Short conversation should not trigger compaction');

    const bigContent = 'Comprehensive CIRP statutory filing review with detailed claims ledger. '.repeat(120); // ~9,000 chars -> ~2,250 tokens
    const longConv = [
        { role: 'system', content: 'You are an Insolvency Assistant.' },
        { role: 'user', content: bigContent },
        { role: 'assistant', content: 'Acknowledged.' }
    ];
    assert.strictEqual(shouldCompact(longConv, 2048), true, 'Large conversation should trigger compaction');

    // 4. Boundary Selection (pickBoundary)
    console.log('  -> Test 4: pickBoundary identifies earliest turn fitting working memory budget');
    const multiTurn = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Turn 1: ' + 'x'.repeat(400) },
        { role: 'assistant', content: 'Answer 1: ' + 'x'.repeat(400) },
        { role: 'user', content: 'Turn 2: ' + 'y'.repeat(400) },
        { role: 'assistant', content: 'Answer 2: ' + 'y'.repeat(400) },
        { role: 'user', content: 'Turn 3: ' + 'z'.repeat(100) },
        { role: 'assistant', content: 'Answer 3: ' + 'z'.repeat(100) }
    ];
    // Keep budget = 100 tokens (~400 chars). Turn 3 fits (~50 tokens).
    const b = pickBoundary(multiTurn, 100);
    assert(b !== null, 'Boundary should be identified');
    assert(b >= 5, `Expected boundary at turn 3 (index >= 5), got ${b}`);

    // 5. Zero-Hallucination Mechanical State Extraction (extractWorkingState)
    console.log('  -> Test 5: extractWorkingState captures facts, files, and tools deterministically');
    const toolSpan = [
        {
            role: 'assistant',
            content: 'Let me look up the case documents and save the draft.',
            tool_calls: [
                {
                    function: {
                        name: 'retrieveContexts',
                        arguments: JSON.stringify({ query: 'claim amounts' })
                    }
                },
                {
                    function: {
                        name: 'writeKV',
                        arguments: JSON.stringify({ key: 'corporate_debtor', value: 'Acme Infra Ltd' })
                    }
                },
                {
                    function: {
                        name: 'saveArtifact',
                        arguments: JSON.stringify({ targetFile: 'drafts/form_h.md', content: '# Form H' })
                    }
                }
            ]
        },
        { role: 'tool', name: 'retrieveContexts', content: 'Passages retrieved.' }
    ];

    const state = extractWorkingState(toolSpan);
    assert(state.includes('corporate_debtor: Acme Infra Ltd'), 'Expected fact extraction');
    assert(state.includes('drafts/form_h.md'), 'Expected file extraction');
    assert(state.includes('retrieveContexts'), 'Expected tool usage tracking');

    // 6. Historical User Directives Extraction (extractUserDirectives)
    console.log('  -> Test 6: extractUserDirectives preserves prompts and clips long queries');
    const promptSpan = [
        { role: 'user', content: 'First query: Check date of default.' },
        { role: 'assistant', content: 'Done.' },
        { role: 'user', content: 'Second query: ' + 'A'.repeat(500) }
    ];
    const directives = extractUserDirectives(promptSpan, 20, 100);
    assert.strictEqual(directives.length, 2);
    assert.strictEqual(directives[0], 'First query: Check date of default.');
    assert(directives[1].endsWith('…'), 'Long query should be clipped with ellipsis');

    // 7. Stale Tool Result Truncation (clipStaleToolOutputs)
    console.log('  -> Test 7: clipStaleToolOutputs truncates historical multi-page dumps');
    const hugeDump = 'Page text '.repeat(300); // ~3,000 chars
    const rawSpan = [
        { role: 'tool', content: hugeDump }
    ];
    const clipped = clipStaleToolOutputs(rawSpan, 400);
    assert(clipped[0].content.length < 500, `Expected clipped content under 500 chars, got ${clipped[0].content.length}`);
    assert(clipped[0].content.includes('[truncated'), 'Expected truncation notice');

    // 8. buildCompactedBlock formatting
    console.log('  -> Test 8: buildCompactedBlock renders markdown divider');
    const block = buildCompactedBlock(
        'The parties agreed on resolution plan terms.',
        '- Fact: default_date = 15/03/2023',
        ['Check claim validity', 'Draft Section 30(2) certificate']
    );
    assert(block.includes('[Context auto-compacted'), 'Missing compaction header');
    assert(block.includes('## Strategic Summary'), 'Missing summary header');
    assert(block.includes('## Mechanical Working State'), 'Missing state header');
    assert(block.includes('## Historical User Directives'), 'Missing user directives header');

    // 9. Full End-to-End Compaction Simulation (compactHistory)
    console.log('  -> Test 9: compactHistory reduces 3,000+ token history to <1,200 tokens');
    const simulationMessages = [
        { role: 'system', content: 'You are Hayagriva Legal Drafting Assistant.' }
    ];

    // Build 15 realistic turns with RAG dumps and discussions
    for (let i = 1; i <= 15; i++) {
        simulationMessages.push({
            role: 'user',
            content: `Turn ${i}: Investigate claims component ${i} for corporate debtor Acme Infra Ltd and verify Section 30(2).`
        });
        simulationMessages.push({
            role: 'assistant',
            content: `Analysis for turn ${i}: All statutory thresholds under IBC Regulation 39 have been reviewed. ` + 'Evidence reviewed thoroughly. '.repeat(10),
            tool_calls: [
                {
                    function: {
                        name: 'writeKV',
                        arguments: JSON.stringify({ key: `claim_item_${i}`, value: `Admitted Rs ${i * 10} Crores` })
                    }
                }
            ]
        });
        simulationMessages.push({
            role: 'tool',
            name: 'retrieveContexts',
            content: `RAG Context chunk for Turn ${i}: Corporate Debtor record default dates, resolution applicant profile details. ` + 'Additional financial records table. '.repeat(15)
        });
    }

    const initialTokens = estimateTokens(simulationMessages);
    assert(initialTokens > 1600, `Expected simulation to exceed threshold, got ${initialTokens} tokens`);

    const result = await compactHistory(simulationMessages, { contextWindow: 2048 });
    assert.strictEqual(result.compacted, true, 'Compaction should report true');
    assert(result.compactedTokens < 1200, `Expected compacted tokens under 1,200, got ${result.compactedTokens}`);
    assert(result.compactedTokens < result.originalTokens, 'Compacted tokens must be strictly less than original');

    // Verify system prompt preserved at index 0
    assert.strictEqual(result.messages[0].role, 'system');
    assert.strictEqual(result.messages[0].content, 'You are Hayagriva Legal Drafting Assistant.');

    // Verify compacted block is at index 1
    assert.strictEqual(result.messages[1].role, 'system');
    assert(result.messages[1].content.includes('[Context auto-compacted'));

    // Verify recent turn is preserved at the tail
    const lastMsg = result.messages[result.messages.length - 1];
    assert(lastMsg.content.includes('Turn 15'), 'Most recent turn must be preserved in working memory');

    // 10. Immutability guarantee: Original array is untouched
    console.log('  -> Test 10: Original input message array remains unmutated');
    assert.strictEqual(simulationMessages.length, 1 + (15 * 3), 'Original array length must not be altered');

    console.log('  ✓ SUCCESS: All 10 Mathematical Context Auto-Compaction tests passed!');
}

if (require.main === module) {
    runTests().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { run: runTests, runTests };
