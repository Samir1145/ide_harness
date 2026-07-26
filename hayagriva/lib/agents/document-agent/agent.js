const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../core/llm-client');
const { ragRetrieve, formatContextBlock } = require('../skills/rag-retrieve');
const { loadSkeleton, listSkeletons, fillPlaceholders, extractPlaceholders } = require('../skills/skeleton-load');
const { readAllKV } = require('../skills/kv-write');
const { appendToMarkdown } = require('../skills/md-append');
const { buildTimeline, formatTimelineBlock } = require('../skills/timeline-build');

// Repo root (lib/agents/document-agent → 4 levels up)
const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');

// Intent → skeleton template name mapping
const INTENT_SKELETON_MAP = [
    { patterns: ['sec 7', 'section 7', 'financial creditor petition'],          skeleton: 'sec7-petition' },
    { patterns: ['sec 9', 'section 9', 'operational creditor petition'],         skeleton: 'sec9-petition' },
    { patterns: ['sec 10', 'section 10', 'corporate debtor petition'],           skeleton: 'sec10-petition' },
    { patterns: ['slp', 'special leave petition', 'supreme court'],              skeleton: 'slp-sc' },
    { patterns: ['nclat', 'ibc section 61', 'section 61', 'appeal'],             skeleton: 'ibc-sec61-appeal' },
    { patterns: ['reply', 'reply to revision', 'revision petition'],             skeleton: 'reply-revision-petition' },
    { patterns: ['writ', 'high court'],                                           skeleton: 'writ-petition-hc' },
    { patterns: ['directors report', 'annual report', 'board report'],           skeleton: 'directors-report' },
    { patterns: ['liquidation report', 'liquidator report'],                     skeleton: 'liquidation-report' },
    { patterns: ['coc resolution', 'committee of creditors', 'coc meeting'],     skeleton: 'committee-of-creditors-resolution' },
    { patterns: ['extension', 'time extension', 'additional time cirp'],        skeleton: 'extension-application' },
    { patterns: ['claim for b', 'claim b', 'form b', 'operational creditor claim'], skeleton: 'cirp-form-b' },
    { patterns: ['claim for c', 'claim c', 'form c', 'financial creditor claim'],  skeleton: 'cirp-form-c' },
    { patterns: ['liquidation claim', 'claim in liquidation', 'liq form c'],    skeleton: 'liq-form-c' },
    { patterns: ['avoidance', 'section 43', 'section 45', 'section 66'],         skeleton: 'avoidance-application-sec43-45-50-66' },
    { patterns: ['plan approval', 'section 31', 'approval of resolution plan'],  skeleton: 'plan-approval-application' },
    { patterns: ['liquidation application', 'section 33'],                      skeleton: 'liquidation-application-sec33' },
];

function detectSkeleton(userMessage) {
    const msg = userMessage.toLowerCase();
    for (const { patterns, skeleton } of INTENT_SKELETON_MAP) {
        if (patterns.some(p => msg.includes(p))) return skeleton;
    }
    // Dynamic fallback: multi-tier search across all 224 available templates in skeletons/
    try {
        const available = listSkeletons(REPO_ROOT);
        const cleaned = msg.replace(/@document|\/draft|\b(please|prepare|draft|the|of|for|blank|template)\b/gi, '').trim();
        const slug = cleaned.replace(/\s+/g, '-').toLowerCase();

        // 1. Exact match
        const exact = available.find(s => s.toLowerCase() === slug || s.toLowerCase() === cleaned.toLowerCase());
        if (exact) return exact;

        // 2. Contains match
        const contains = available.find(s => s.toLowerCase().includes(slug));
        if (contains) return contains;

        // 3. Token match
        const tokens = cleaned.split(/[\s\-]+/).filter(t => t.length > 2);
        if (tokens.length > 0) {
            const tokenMatch = available.find(s => tokens.every(t => s.toLowerCase().includes(t)));
            if (tokenMatch) return tokenMatch;
        }
    } catch (_) {}
    return null;
}

class DocumentAgent {
    constructor() {
        this.name = 'DocumentAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Document Agent] Processing: "${userMessage}"`);

        // 0. Intercept template list / inventory queries (e.g. "show me a list of all documents available for COC issues")
        const isListRequest = /\b(list|show\s+me|available|what|find|search|inventory|templates|formats)\b/i.test(userMessage) &&
                              /\b(document|documents|file|files|template|templates|format|formats|report|reports|petition|petitions|issues)\b/i.test(userMessage);

        if (isListRequest) {
            const available = listSkeletons(REPO_ROOT);
            const q = userMessage.toLowerCase();
            const topicTokens = q.replace(/show|me|list|all|the|documents|avaibale|available|for|issues|templates|formats|what|are|in|with|of|drafts/gi, '').trim().split(/\s+/).filter(t => t.length > 2);

            let matches = available;
            if (topicTokens.length > 0) {
                matches = available.filter(s => {
                    const name = s.toLowerCase();
                    return topicTokens.some(t => name.includes(t) || (t === 'coc' && (name.includes('coc') || name.includes('creditor'))));
                });
            }
            if (matches.length === 0) matches = available;

            let responseMarkdown = `### 📋 Available Document Templates Matching Your Query (${matches.length} Found)\n\n`;
            responseMarkdown += `| Sl. | Template Name | Category / Purpose | How to Request |\n`;
            responseMarkdown += `|---|---|---|---|\n`;
            matches.forEach((m, idx) => {
                const cleanName = m.replace(/[\-_]/g, ' ').toUpperCase();
                responseMarkdown += `| ${idx + 1}. | **${m}** | ${cleanName} | \`@Document draft ${m}\` |\n`;
            });

            responseMarkdown += `\n> 💡 **Tip:** Type \`@Document draft <template-name>\` or describe your specific requirements to auto-populate any format above with active case data.`;

            return responseMarkdown;
        }

        // 1. Detect target skeleton template from user intent
        let skeletonName = detectSkeleton(userMessage);

        // If user explicitly names a template (e.g. "/draft sec7-petition"), extract it
        const explicitMatch = userMessage.match(/\/draft\s+([a-z0-9\-]+)/i);
        if (explicitMatch) skeletonName = explicitMatch[1];

        // 2. Load skeleton (fallback: list available if not found)
        let skeletonContent = null;
        let skeletonFile = null;
        const available = listSkeletons(REPO_ROOT);

        if (skeletonName) {
            const loaded = loadSkeleton(skeletonName, REPO_ROOT);
            if (loaded) {
                skeletonContent = loaded.content;
                skeletonFile = loaded.name;
                console.log(`[Document Agent] Loaded skeleton: ${skeletonFile}`);
            }
        }

        let draftSection = '';
        let placeholderReport = '';

        if (skeletonContent) {
            // 3. Build timeline for context injection
            let timelineBlock = '';
            try {
                const events = await buildTimeline(caseDir);
                if (events.length > 0) {
                    timelineBlock = formatTimelineBlock(events.slice(0, 10));
                }
            } catch (e) { /* non-fatal */ }

            // 4. Fill {{ PLACEHOLDER }} gaps using KV + RAG
            const { filled, placeholders } = await fillPlaceholders(skeletonContent, caseDir, REPO_ROOT);
            const filledCount  = placeholders.filter(p => p.filled).length;
            const unfilledList = placeholders.filter(p => !p.filled).map(p => p.name);

            // 5. Save draft to case folder
            const timestamp = Date.now();
            const draftName = `draft_${(skeletonFile || 'document').replace('.md', '')}_${timestamp}.md`;
            const draftPath = path.join(caseDir, 'drafts', draftName);
            fs.mkdirSync(path.dirname(draftPath), { recursive: true });
            fs.writeFileSync(draftPath, filled, 'utf8');

            // 6. Write-back: log draft event to case_facts.md
            appendToMarkdown(caseDir, 'case_facts.md', '## Document Agent Drafts',
                `- **${draftName}** — ${filledCount}/${placeholders.length} placeholders filled. Unfilled: ${unfilledList.join(', ') || 'none'}`,
                this.name);

            const { loadLlmConfig } = require('../../core/llm-client');
            const config = loadLlmConfig({ caseDir });
            if (config.activeMode === 'lite') {
                return `> ℹ️ **Draft Generated from Template (\`${skeletonFile}\`) in Lite Mode:**\n- **Draft Saved:** \`drafts/${draftName}\`\n- **Placeholders Filled (from KV Dictionary):** ${filledCount}/${placeholders.length}\n${unfilledList.length > 0 ? `- **Unfilled Placeholders:** ${unfilledList.map(n => `\`[${n}]\``).join(', ')}\n` : ''}\n---\n\n${filled}`;
            }

            draftSection = `[Draft Engine]\n- Template: ${skeletonFile}\n- Draft saved: drafts/${draftName}\n- Placeholders filled: ${filledCount}/${placeholders.length}\n${timelineBlock ? `\n${timelineBlock}` : ''}`;
            placeholderReport = unfilledList.length > 0
                ? `\n[Unfilled Placeholders — require manual input]:\n${unfilledList.map(n => `  ⚠️ ${n}`).join('\n')}`
                : '\n✅ All placeholders auto-filled from case data.';
        } else {
            // No skeleton found: RAG-assisted open-ended drafting
            const chunks = await ragRetrieve(caseDir, userMessage, 2);
            const contextBlock = formatContextBlock(chunks, 'Case Context').substring(0, 1000);
            draftSection = `[Open-ended drafting — no skeleton matched]\n${contextBlock}`;

            if (available.length > 0) {
                placeholderReport = `\n[Available Templates]: ${available.join(', ')}\nTip: Use "/draft <template-name>" to target a specific skeleton.`;
            }
        }

        // 7. Build LLM prompt for summary + guidance
        try {
            const messages = [{ role: 'system', content: this.instructions }];
            const recentHistory = (history || []).slice(-2);
            recentHistory.forEach(h => messages.push({ role: h.role, content: (h.content || '').substring(0, 300) }));
            messages.push({
                role: 'user',
                content: `${draftSection}${placeholderReport}\n\n[User Command]\n${userMessage}`
            });
            return await getChatResponse(messages, { caseDir });
        } catch (err) {
            if (err && (err.code === 'LITE_MODE' || err.code === 'CONTEXT_EXCEEDED' || (err.message && (err.message.includes('Lite Mode') || err.message.includes('Context Window'))))) {
                return `> ℹ️ **Notice:** ${err.message}\n\n${draftSection}\n${placeholderReport}`;
            }
            throw err;
        }
    }
}

DocumentAgent.detectSkeleton = detectSkeleton;
module.exports = DocumentAgent;
