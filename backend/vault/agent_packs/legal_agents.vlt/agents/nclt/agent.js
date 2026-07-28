const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../../../../lib/core/llm-client');
const { ragRetrieve, formatContextBlock } = require('../../../../../lib/agents/skills/rag-retrieve');
const { vaultLookup, formatVaultBlock } = require('../../../../../lib/agents/skills/vault-lookup');
const { buildTimeline, formatTimelineBlock } = require('../../../../../lib/agents/skills/timeline-build');
const { loadSkeleton, fillPlaceholders } = require('../../../../../lib/agents/skills/skeleton-load');
const { readAllKV } = require('../../../../../lib/agents/skills/kv-write');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');

// Map user message keywords → appropriate NCLT petition skeleton
function detectNcltSkeleton(msg) {
    const m = msg.toLowerCase();
    if (m.includes('sec 7') || m.includes('section 7') || m.includes('financial creditor')) return 'sec7-petition';
    if (m.includes('sec 9') || m.includes('section 9') || m.includes('operational creditor')) return 'sec9-petition';
    if (m.includes('sec 10') || m.includes('section 10') || m.includes('corporate debtor')) return 'sec10-petition';
    if (m.includes('extension') || m.includes('time limit')) return 'extension-application';
    return 'sec7-petition'; // Default for NCLT
}

class NcltDrafterAgent {
    constructor() {
        this.name = 'NcltDrafterAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[NCLT Drafter Agent] Generating petition: "${userMessage}"`);

        // 1. Build case timeline for facts-of-the-case section
        let timelineBlock = '';
        try {
            const events = await buildTimeline(caseDir);
            if (events.length > 0) {
                timelineBlock = formatTimelineBlock(events.slice(0, 12));
                console.log(`[NCLT Drafter] Injecting ${events.length} timeline events`);
            }
        } catch (e) {
            console.error('[NCLT Drafter] Timeline build failed:', e.message);
        }

        // 2. Load petition skeleton + fill placeholders
        let skeletonBlock = '';
        try {
            const skeletonName = detectNcltSkeleton(userMessage);
            const skeleton = loadSkeleton(skeletonName, REPO_ROOT);
            if (skeleton) {
                const { filled, placeholders } = await fillPlaceholders(skeleton.content, caseDir, REPO_ROOT);
                const unfilled = placeholders.filter(p => !p.filled);
                skeletonBlock = `[Skeleton Template: ${skeleton.name}]\nAuto-filled placeholders: ${placeholders.length - unfilled.length}/${placeholders.length}\n${unfilled.length > 0 ? `Remaining gaps: ${unfilled.map(p => p.name).join(', ')}` : 'All placeholders filled.'}`;

                // Save draft
                const draftPath = path.join(caseDir, 'drafts', `nclt_${skeletonName}_${Date.now()}.md`);
                fs.mkdirSync(path.dirname(draftPath), { recursive: true });
                fs.writeFileSync(draftPath, filled, 'utf8');
                skeletonBlock += `\nDraft saved: ${path.basename(draftPath)}`;
            }
        } catch (e) { /* Skeleton optional — proceed without */ }

        // 3. RAG retrieval for petition-specific context
        const ragQuery = `legal petition synopsis date chronology corporate debtor grounds prayers NCLT application ${userMessage}`;
        const chunks = await ragRetrieve(caseDir, ragQuery, 4);
        const dbContext = formatContextBlock(chunks, 'Relevant Legal Brief Context');

        // 4. Vault lookup for applicable IBC sections
        const laws = await vaultLookup(userMessage, 3);
        const vaultContext = formatVaultBlock(laws);

        // 5. Load case KV dictionary
        const kv = readAllKV(caseDir);
        const dictData = Object.keys(kv).length > 0
            ? `\nCase Variables:\n${Object.entries(kv).map(([k,v]) => `- ${k}: ${v}`).join('\n')}`
            : '';

        // 6. Build messages
        const messages = [{ role: 'system', content: this.instructions }];
        history.forEach(h => messages.push({ role: h.role, content: h.content }));

        const contextParts = [];
        if (timelineBlock) contextParts.push(timelineBlock);
        if (skeletonBlock)  contextParts.push(skeletonBlock);
        if (vaultContext)   contextParts.push(vaultContext);
        if (dbContext)      contextParts.push(dbContext);
        if (dictData)       contextParts.push(dictData);

        messages.push({
            role: 'user',
            content: `[Context Information]\n${contextParts.join('\n\n')}\n\n[User Message]\n${userMessage}`
        });

        return await getChatResponse(messages, { caseDir });
    }
}

module.exports = NcltDrafterAgent;
