/**
 * lite-fallback.js
 * Shared helper for building graceful Lite Mode / CONTEXT_EXCEEDED responses.
 * Used by all vault agents when getChatResponse() throws LITE_MODE or CONTEXT_EXCEEDED.
 *
 * Design spec: AGENTS.md — "Offline Fallback" rule:
 *   When LLM engine is offline, subagents populate all case facts from kv_dictionary
 *   into standard skeleton templates, save drafts to drafts/, and display a notice.
 */

const { appendToMarkdown } = require('./md-append');

/**
 * Build a graceful Lite Mode response from pre-retrieved context data.
 * Always fires the case_facts.md write-back so findings persist across sessions.
 */
function buildLiteFallback(opts = {}) {
    const {
        caseDir,
        agentName = 'Agent',
        agentIcon = '🤖',
        userMessage = '',
        contexts = [],
        vaultText = '',
        preBlock = '',
        writeBack = true,
    } = opts;

    const liteNotice =
        '> ℹ️ **Lite Mode** — LLM Engine is offline. The sections below are sourced directly from your indexed case files.\n' +
        '> Start the engine in **Settings → Mode & Engine** for full AI-generated analysis.\n';

    const lines = [
        liteNotice,
        '---',
        `### ${agentIcon} ${agentName} — Case File Findings\n`,
        `**Your query:** ${userMessage}\n`,
    ];

    if (preBlock) {
        lines.push(preBlock);
        lines.push('');
    }

    if (contexts.length > 0) {
        lines.push(`#### 📄 Relevant Passages (${Math.min(contexts.length, 4)} of ${contexts.length} matches)\n`);
        contexts.slice(0, 4).forEach((c, i) => {
            const snippet = (c.content || '').substring(0, 400).trim().replace(/\n/g, '\n> ');
            const docName = c.docName || 'Document';
            const section = c.title || c.section || '';
            lines.push(`**[${i + 1}] ${docName}**${section ? ` — *${section}*` : ''}`);
            lines.push(`> ${snippet}\n`);
        });
    } else {
        lines.push('> *No matching passages found in indexed case documents for this query.*\n');
    }

    if (vaultText) {
        lines.push('#### ⚖️ Applicable Law (from Vault)\n');
        lines.push(vaultText);
        lines.push('');
    }

    lines.push('---\n*Start the LLM Engine in Settings for a full AI-generated narrative and recommendations.*');

    const response = lines.join('\n');

    if (writeBack && caseDir) {
        try {
            const shortQ = userMessage.length > 80 ? userMessage.substring(0, 80) + '...' : userMessage;
            const shortA = response.length > 300 ? response.substring(0, 300) + '...' : response;
            appendToMarkdown(
                caseDir,
                'case_facts.md',
                `## ${agentName} Findings`,
                `**Q:** ${shortQ}\n**A (Lite Mode):** ${shortA}`,
                agentName
            );
        } catch (_) { /* non-fatal */ }
    }

    return response;
}

module.exports = { buildLiteFallback };
