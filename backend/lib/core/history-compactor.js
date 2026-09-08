'use strict';

/**
 * Mathematical Context Auto-Compactor for Hayagriva.
 * Adapted from Andrew Ng's OpenWorker architecture (coworker/compaction.py).
 * 
 * Calibrated for strict local LLMs (LegalParam-2.9B & FinanceParam-2.9B)
 * with a 2,048-token context window.
 * 
 * Invariants:
 * 1. Disk retention: Persisted transcript (transcript.jsonl) is never modified.
 * 2. Outbound view: Only outbound messages sent to the model are compacted.
 * 3. Working set: Recent turns (last 25% token budget) are preserved verbatim.
 * 4. Zero hallucination: Facts, files, and user prompts are extracted mechanically.
 * 5. Stale tool clipping: Historical RAG / tool dumps are truncated to 400 chars.
 */

const DEFAULT_CONTEXT_WINDOW = 2048;
const DEFAULT_THRESHOLD_PCT = 0.80; // Triggers at 80% (1,638 tokens)
const DEFAULT_CAP_TOKENS = 1600;     // Hard ceiling for 2,048-token window
const KEEP_RECENT_FRACTION = 0.25;  // ~400 tokens of working memory
const SPAN_TOOL_RESULT_CLIP = 400;  // Stale tool dumps clipped to 400 chars
const USER_MESSAGE_CLIP = 400;      // Historical user prompts clipped to 400 chars
const USER_MESSAGES_MAX = 20;       // Max historical user prompts preserved

/**
 * Estimates token count as (chars / 4) over serialized messages.
 * Matches standard token approximation used in local LLM runtimes.
 * 
 * @param {Array<Object>} messages 
 * @returns {number} Estimated token count
 */
function estimateTokens(messages) {
    if (!Array.isArray(messages) || messages.length === 0) return 0;
    let totalChars = 0;
    for (const msg of messages) {
        if (!msg) continue;
        if (typeof msg.content === 'string') {
            totalChars += msg.content.length;
        } else if (msg.content) {
            try {
                totalChars += JSON.stringify(msg.content).length;
            } catch {
                totalChars += String(msg.content).length;
            }
        }
        if (msg.tool_calls) {
            try {
                totalChars += JSON.stringify(msg.tool_calls).length;
            } catch {
                // Ignore serialization error
            }
        }
    }
    return Math.max(1, Math.floor(totalChars / 4));
}

/**
 * Computes trigger token threshold.
 */
function triggerTokens(contextWindow = DEFAULT_CONTEXT_WINDOW, thresholdPct = DEFAULT_THRESHOLD_PCT, capTokens = DEFAULT_CAP_TOKENS) {
    const window = contextWindow || DEFAULT_CONTEXT_WINDOW;
    return Math.min(Math.floor(thresholdPct * window), capTokens);
}

/**
 * Determines whether messages exceed the compaction threshold.
 */
function shouldCompact(messages, contextWindow = DEFAULT_CONTEXT_WINDOW, options = {}) {
    const thresholdPct = typeof options.thresholdPct === 'number' ? options.thresholdPct : DEFAULT_THRESHOLD_PCT;
    const capTokens = typeof options.capTokens === 'number' ? options.capTokens : DEFAULT_CAP_TOKENS;
    const trigger = triggerTokens(contextWindow, thresholdPct, capTokens);
    const tokens = estimateTokens(messages);
    return tokens >= trigger;
}

/**
 * Candidate boundary indexes past `start`:
 * user-message indexes (turn starts, preferred) and assistant indexes (iteration starts).
 */
function _turnStarts(messages, start = 0) {
    const users = [];
    const assistants = [];
    for (let i = start; i < messages.length; i++) {
        const role = messages[i] ? messages[i].role : null;
        if (role === 'user') {
            users.push(i);
        } else if (role === 'assistant') {
            assistants.push(i);
        }
    }
    return { users, assistants };
}

/**
 * Picks the boundary index dividing the historical span from the verbatim tail.
 * Returns the earliest index whose tail fits within the keep budget.
 * 
 * @param {Array<Object>} messages 
 * @param {number} keepTokens 
 * @returns {number|null}
 */
function pickBoundary(messages, keepTokens) {
    if (!Array.isArray(messages) || messages.length <= 2) return null;
    const start = messages[0] && messages[0].role === 'system' ? 1 : 0;
    const { users, assistants } = _turnStarts(messages, start);

    // Try earliest-first among user turn boundaries
    for (const i of users) {
        if (estimateTokens(messages.slice(i)) <= keepTokens) {
            return i;
        }
    }

    // If newest user turn alone exceeds budget, cut inside at recent assistant iteration
    if (users.length > 0) {
        const lastUser = users[users.length - 1];
        const inside = assistants.filter(i => i > lastUser);
        for (const i of inside) {
            if (estimateTokens(messages.slice(i)) <= keepTokens) {
                return i;
            }
        }
        if (inside.length > 0) {
            return inside[inside.length - 1];
        }
        return lastUser;
    }

    // Fallback to assistants
    for (const i of assistants) {
        if (estimateTokens(messages.slice(i)) <= keepTokens) {
            return i;
        }
    }

    // Safety fallback: keep at least the last message
    const fallback = messages.length - 1;
    return fallback > start ? fallback : null;
}

/**
 * Mechanically extracts working state from tool calls within the span (zero hallucination).
 * Tracks verified facts, files written/edited, and tools invoked.
 * 
 * @param {Array<Object>} span 
 * @returns {string} Markdown formatted working state block
 */
function extractWorkingState(span) {
    if (!Array.isArray(span) || span.length === 0) return '';

    const facts = new Map(); // key -> value
    const filesWritten = new Set();
    const toolsUsed = new Map(); // toolName -> count

    for (const msg of span) {
        if (!msg) continue;

        // Check tool_calls in assistant messages
        if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
            for (const tc of msg.tool_calls) {
                const name = (tc.function && tc.function.name) || tc.name || '';
                if (name) {
                    toolsUsed.set(name, (toolsUsed.get(name) || 0) + 1);
                }

                let args = {};
                try {
                    args = typeof tc.function?.arguments === 'string'
                        ? JSON.parse(tc.function.arguments)
                        : (tc.function?.arguments || {});
                } catch {
                    args = {};
                }

                // Fact updates
                if (/write_?kv/i.test(name) && args.key) {
                    facts.set(args.key, args.value !== undefined ? String(args.value) : '[set]');
                }

                // Files written
                const targetPath = args.targetFile || args.filePath || args.path || args.filename;
                if (targetPath && /write|save|append|patch|create/i.test(name)) {
                    filesWritten.add(String(targetPath));
                }
            }
        }

        // Direct tool message inspection
        if (msg.role === 'tool' && msg.name) {
            toolsUsed.set(msg.name, (toolsUsed.get(msg.name) || 0) + 1);
        }
    }

    const lines = [];

    if (facts.size > 0) {
        lines.push('Facts Verified / Updated:');
        for (const [k, v] of facts.entries()) {
            lines.push(`- ${k}: ${v}`);
        }
    }

    if (filesWritten.size > 0) {
        lines.push('Files Created or Modified:');
        for (const f of filesWritten) {
            lines.push(`- ${f}`);
        }
    }

    if (toolsUsed.size > 0) {
        const counts = Array.from(toolsUsed.entries())
            .map(([t, count]) => `${t} (${count})`)
            .join(', ');
        lines.push(`Tools Invoked: ${counts}`);
    }

    return lines.join('\n');
}

/**
 * Extracts and trims historical user directives to preserve core intent.
 * 
 * @param {Array<Object>} span 
 * @param {number} maxMessages 
 * @param {number} clipChars 
 * @returns {Array<string>}
 */
function extractUserDirectives(span, maxMessages = USER_MESSAGES_MAX, clipChars = USER_MESSAGE_CLIP) {
    const userPrompts = [];
    for (const msg of span) {
        if (msg && msg.role === 'user' && typeof msg.content === 'string') {
            const trimmed = msg.content.trim().replace(/\s+/g, ' ');
            if (trimmed) {
                const clipped = trimmed.length > clipChars
                    ? trimmed.slice(0, clipChars) + '…'
                    : trimmed;
                userPrompts.push(clipped);
            }
        }
    }
    // Keep most recent user prompts up to maxMessages
    return userPrompts.slice(-maxMessages);
}

/**
 * Clips stale tool output dumps in the span to avoid carrying redundant multi-page text.
 * 
 * @param {Array<Object>} span 
 * @param {number} clipChars 
 * @returns {Array<Object>}
 */
function clipStaleToolOutputs(span, clipChars = SPAN_TOOL_RESULT_CLIP) {
    return span.map(msg => {
        if (!msg) return msg;
        if (msg.role === 'tool' && typeof msg.content === 'string' && msg.content.length > clipChars) {
            return {
                ...msg,
                content: msg.content.slice(0, clipChars) + `… [truncated ${msg.content.length - clipChars} chars of historical tool output]`
            };
        }
        return msg;
    });
}

/**
 * Formats the structured compacted context divider block.
 */
function buildCompactedBlock(summaryText, workingState, userDirectives) {
    const sections = [
        '[Context auto-compacted — earlier turns summarized to fit 2,048-token local LLM budget]'
    ];

    if (summaryText && summaryText.trim()) {
        sections.push(`## Strategic Summary\n${summaryText.trim()}`);
    }

    if (workingState && workingState.trim()) {
        sections.push(`## Mechanical Working State\n${workingState.trim()}`);
    }

    if (Array.isArray(userDirectives) && userDirectives.length > 0) {
        const items = userDirectives.map((d, i) => `${i + 1}. "${d}"`).join('\n');
        sections.push(`## Historical User Directives\n${items}`);
    }

    return sections.join('\n\n');
}

/**
 * Deterministic fallback summarizer for offline / Lite mode execution.
 * Extracts key decisions and topics without requiring an LLM call.
 */
function deterministicFallbackSummary(span) {
    const snippets = [];
    for (const msg of span) {
        if (msg && msg.role === 'assistant' && typeof msg.content === 'string') {
            const firstSentence = msg.content.split(/[.!?\n]/)[0].trim();
            if (firstSentence && firstSentence.length > 15) {
                snippets.push(firstSentence);
                if (snippets.length >= 3) break;
            }
        }
    }
    if (snippets.length > 0) {
        return `Prior discussion focused on:\n- ` + snippets.join('\n- ');
    }
    return 'Earlier legal dialogue addressed case facts, claim verification, and statutory milestones.';
}

/**
 * Compacts conversation history if token budget exceeds threshold.
 * 
 * @param {Array<Object>} messages 
 * @param {Object} [options] Configuration overrides
 * @param {Function} [summarizerFn] Optional async (span) => string for LLM summary
 * @returns {Promise<Object>} { compacted: boolean, messages: Array, originalTokens, compactedTokens, boundaryIndex }
 */
async function compactHistory(messages, options = {}, summarizerFn = null) {
    if (!Array.isArray(messages) || messages.length <= 2) {
        return {
            compacted: false,
            messages,
            tokens: estimateTokens(messages)
        };
    }

    const contextWindow = options.contextWindow || DEFAULT_CONTEXT_WINDOW;
    const thresholdPct = options.thresholdPct || DEFAULT_THRESHOLD_PCT;
    const capTokens = options.capTokens || DEFAULT_CAP_TOKENS;
    const trigger = triggerTokens(contextWindow, thresholdPct, capTokens);
    const originalTokens = estimateTokens(messages);

    if (originalTokens < trigger && !options.force) {
        return {
            compacted: false,
            messages,
            tokens: originalTokens
        };
    }

    const keepTokens = Math.floor(trigger * (options.keepRecentFraction || KEEP_RECENT_FRACTION));
    const boundary = pickBoundary(messages, keepTokens);

    if (boundary === null) {
        return {
            compacted: false,
            messages,
            tokens: originalTokens
        };
    }

    const hasSystem = messages[0] && messages[0].role === 'system';
    const systemMessage = hasSystem ? messages[0] : null;
    const spanStart = hasSystem ? 1 : 0;
    const span = messages.slice(spanStart, boundary);
    const tail = messages.slice(boundary);

    // Mechanical extraction (zero hallucination)
    const workingState = extractWorkingState(span);
    const userDirectives = extractUserDirectives(span);
    const clippedSpan = clipStaleToolOutputs(span);

    // Bridging summary synthesis
    let summaryText = '';
    if (typeof summarizerFn === 'function') {
        try {
            summaryText = await summarizerFn(clippedSpan);
        } catch (err) {
            console.warn('[History Compactor] Summarizer failed, using deterministic fallback:', err.message);
            summaryText = deterministicFallbackSummary(span);
        }
    } else {
        summaryText = deterministicFallbackSummary(span);
    }

    const compactedBlockContent = buildCompactedBlock(summaryText, workingState, userDirectives);
    const compactedMessage = {
        role: 'system',
        content: compactedBlockContent
    };

    const compactedMessages = [];
    if (systemMessage) {
        compactedMessages.push(systemMessage);
    }
    compactedMessages.push(compactedMessage);
    for (const msg of tail) {
        compactedMessages.push(msg);
    }

    const compactedTokens = estimateTokens(compactedMessages);

    return {
        compacted: true,
        messages: compactedMessages,
        originalTokens,
        compactedTokens,
        boundaryIndex: boundary
    };
}

/**
 * Reorders messages so every tool result immediately follows its call,
 * and synthesizes placeholder results for interrupted/orphaned calls.
 * 
 * Adapted from OpenWorker (commit 1789a0f).
 * 
 * Invariants:
 * 1. Moves a real tool result found later in the thread to sit right after its call.
 * 2. Synthesizes a placeholder result for a call with no matching tool message,
 *    BUT ONLY when the thread has moved past the call (i.e. not a trailing call).
 * 3. Trailing calls without results are left untouched as pending calls for the engine to resume.
 * 4. Interleaved user messages are pushed after the completed tool-call block.
 * 5. Idempotent: well-formed threads pass through unchanged.
 * 
 * @param {Array<Object>} messages 
 * @returns {Array<Object>} Repaired message array
 */
function repairToolPairing(messages) {
    if (!Array.isArray(messages) || messages.length === 0) return messages || [];

    // Collect tool_call ids from assistant messages
    const pendingCalls = new Map(); // callId -> index of assistant msg
    for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        if (m && m.role === 'assistant' && Array.isArray(m.tool_calls)) {
            for (const tc of m.tool_calls) {
                const callId = tc && tc.id;
                if (callId) pendingCalls.set(callId, i);
            }
        }
    }

    if (pendingCalls.size === 0) {
        return messages; // no tool calls at all
    }

    // Find tool results and where they sit relative to their calls
    const foundResults = new Map(); // callId -> index of tool result message
    for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        if (m && m.role === 'tool') {
            const callId = m.tool_call_id;
            if (callId && pendingCalls.has(callId)) {
                if (!foundResults.has(callId)) {
                    foundResults.set(callId, i);
                }
            }
        }
    }

    // Determine which calls are trailing (assistant block is the last message)
    const lastMsgIdx = messages.length - 1;
    const trailingCalls = new Set();
    for (const [callId, callIdx] of pendingCalls.entries()) {
        if (callIdx === lastMsgIdx) {
            trailingCalls.add(callId);
        }
    }

    // Check if repair is actually needed
    let needsRepair = false;
    for (const [callId, callIdx] of pendingCalls.entries()) {
        if (trailingCalls.has(callId) && !foundResults.has(callId)) {
            continue; // pending call at the end of thread - engine will resume
        }
        if (foundResults.has(callId)) {
            const resultIdx = foundResults.get(callId);
            if (resultIdx !== callIdx + 1) {
                needsRepair = true;
            }
        } else {
            needsRepair = true; // missing result on a completed turn
        }
    }

    if (!needsRepair) {
        return messages; // already well-formed
    }

    const consumedResultIndices = new Set();
    const repaired = [];

    for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        if (m && m.role === 'assistant' && Array.isArray(m.tool_calls)) {
            repaired.push(m);
            for (const tc of m.tool_calls) {
                const callId = tc && tc.id;
                if (!callId) continue;
                if (foundResults.has(callId)) {
                    const resultIdx = foundResults.get(callId);
                    if (!consumedResultIndices.has(resultIdx)) {
                        repaired.push(messages[resultIdx]);
                        consumedResultIndices.add(resultIdx);
                    }
                } else if (!trailingCalls.has(callId)) {
                    repaired.push({
                        role: 'tool',
                        tool_call_id: callId,
                        content: JSON.stringify({ error: 'tool result was lost during an interrupted turn' })
                    });
                }
            }
        } else if (consumedResultIndices.has(i)) {
            continue; // already moved up
        } else {
            repaired.push(m);
        }
    }

    return repaired;
}

module.exports = {
    DEFAULT_CONTEXT_WINDOW,
    DEFAULT_THRESHOLD_PCT,
    DEFAULT_CAP_TOKENS,
    KEEP_RECENT_FRACTION,
    SPAN_TOOL_RESULT_CLIP,
    USER_MESSAGE_CLIP,
    USER_MESSAGES_MAX,
    estimateTokens,
    triggerTokens,
    shouldCompact,
    pickBoundary,
    extractWorkingState,
    extractUserDirectives,
    clipStaleToolOutputs,
    buildCompactedBlock,
    deterministicFallbackSummary,
    compactHistory,
    repairToolPairing
};

