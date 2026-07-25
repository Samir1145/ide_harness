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
];

function detectSkeleton(userMessage) {
    const msg = userMessage.toLowerCase();
    for (const { patterns, skeleton } of INTENT_SKELETON_MAP) {
        if (patterns.some(p => msg.includes(p))) return skeleton;
    }
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

            draftSection = `[Draft Engine]\n- Template: ${skeletonFile}\n- Draft saved: drafts/${draftName}\n- Placeholders filled: ${filledCount}/${placeholders.length}\n${timelineBlock ? `\n${timelineBlock}` : ''}`;
            placeholderReport = unfilledList.length > 0
                ? `\n[Unfilled Placeholders — require manual input]:\n${unfilledList.map(n => `  ⚠️ ${n}`).join('\n')}`
                : '\n✅ All placeholders auto-filled from case data.';
        } else {
            // No skeleton found: RAG-assisted open-ended drafting
            const chunks = await ragRetrieve(caseDir, userMessage, 4);
            const contextBlock = formatContextBlock(chunks, 'Case Context');
            draftSection = `[Open-ended drafting — no skeleton matched]\n${contextBlock}`;

            if (available.length > 0) {
                placeholderReport = `\n[Available Templates]: ${available.join(', ')}\nTip: Use "/draft <template-name>" to target a specific skeleton.`;
            }
        }

        // 7. Build LLM prompt for summary + guidance
        const messages = [{ role: 'system', content: this.instructions }];
        history.forEach(h => messages.push({ role: h.role, content: h.content }));
        messages.push({
            role: 'user',
            content: `${draftSection}${placeholderReport}\n\n[User Command]\n${userMessage}`
        });

        return await getChatResponse(messages, { caseDir });
    }
}

module.exports = DocumentAgent;
