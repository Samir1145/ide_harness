const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../../../../lib/core/llm-client');
const { ragRetrieve, formatContextBlock } = require('../../../../../lib/agents/skills/rag-retrieve');
const { crossReferenceCheck } = require('../../../../../lib/agents/skills/cross-ref-check');
const { readAllKV } = require('../../../../../lib/agents/skills/kv-write');
const { buildLiteFallback } = require('../../../../../lib/agents/skills/lite-fallback');

class StrengthAgent {
    constructor() {
        this.name = 'StrengthAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Strength Agent] Evaluating argument strength...`);

        // 1. Find active draft to evaluate (most recent in drafts/ folder, or current editor content from message)
        let draftText = '';
        const draftsDir = path.join(caseDir, 'drafts');
        if (fs.existsSync(draftsDir)) {
            const drafts = fs.readdirSync(draftsDir)
                .filter(f => f.endsWith('.md'))
                .sort((a, b) => {
                    const ta = fs.statSync(path.join(draftsDir, a)).mtimeMs;
                    const tb = fs.statSync(path.join(draftsDir, b)).mtimeMs;
                    return tb - ta; // Newest first
                });
            if (drafts.length > 0) {
                draftText = fs.readFileSync(path.join(draftsDir, drafts[0]), 'utf8');
            }
        }

        // 2. Extract Grounds and Prayers from draft
        const groundsMatch = draftText.match(/(?:grounds?|reasons?)[:\s]*\n([\s\S]*?)(?:prayers?|reliefs?|wherefore|$)/i);
        const prayersMatch = draftText.match(/(?:prayers?|reliefs?|wherefore)[:\s]*\n([\s\S]*?)$/i);

        const groundsText = groundsMatch ? groundsMatch[1].trim() : '';
        const prayersText = prayersMatch ? prayersMatch[1].trim() : '';

        // Parse individual grounds (numbered or bulleted)
        const grounds = groundsText
            .split(/\n(?=\d+\.|[a-z]\)|•|-\s)/)
            .map(g => g.trim())
            .filter(g => g.length > 20);

        // 3. Score each ground: RAG + cross-reference check
        const scoredGrounds = [];
        for (const ground of grounds.slice(0, 8)) {
            const supporting = await ragRetrieve(caseDir, ground, 2);
            const xref = await crossReferenceCheck(caseDir, ground.substring(0, 60), 4);

            const hasStatute = /sec(?:tion)?\.?\s*\d+|ibc|companies act|ibbi|reg(?:ulation)?/i.test(ground);
            const hasEvidence = supporting.length > 0;
            const hasConflict = xref.contradicting.length > 0;

            let score = 'WEAK';
            if (hasStatute && hasEvidence && !hasConflict) score = 'STRONG';
            else if ((hasStatute || hasEvidence) && !hasConflict) score = 'MODERATE';
            else if (hasConflict) score = 'CONTESTED';

            scoredGrounds.push({
                text: ground.substring(0, 120),
                score,
                hasStatute,
                hasEvidence,
                hasConflict,
                supportingDocs: supporting.map(s => s.docName).filter((v, i, a) => a.indexOf(v) === i),
            });
        }

        // 4. Build analysis block for LLM
        const kv = readAllKV(caseDir);
        const contextBlock = formatContextBlock(await ragRetrieve(caseDir, userMessage, 3), 'Case Context');

        const scoreEmoji = { STRONG: '🟢', MODERATE: '🟡', WEAK: '🔴', CONTESTED: '🟠' };
        const groundsReport = scoredGrounds.map((g, i) =>
            `${i + 1}. [${scoreEmoji[g.score]} ${g.score}] ${g.text}...\n   Evidence: ${g.hasEvidence ? '✅' : '❌'} | Statute: ${g.hasStatute ? '✅' : '❌'} | Conflicts: ${g.hasConflict ? '⚠️ YES' : 'None'}\n   Sources: ${g.supportingDocs.join(', ') || 'None found'}`
        ).join('\n\n');

        const draftAvailable = draftText ? `Latest draft: drafts/ (${grounds.length} grounds found, ${prayersText ? 'prayers present' : 'no prayers section found'})` : 'No draft found in case drafts/ folder.';

        const messages = [{
            role: 'system',
            content: `You are HAYAGRIVA, a senior legal strategist. You have scored each ground of a legal petition. 
Provide: (1) an overall case strength assessment, (2) specific advice to strengthen weak/contested grounds (what evidence or statute would help), 
(3) flag any missing prayer clauses. Be specific and actionable.`
        }];
        history.forEach(h => messages.push({ role: h.role, content: h.content }));
        messages.push({
            role: 'user',
            content: `[Argument Strength Analysis]\n${draftAvailable}\n\n${groundsReport}\n\n${contextBlock}\n\n[User Message]\n${userMessage}`
        });

        // Pre-block for Lite Mode: fully scored grounds table
        const scorePreBlock = scoredGrounds.length > 0
            ? `#### 📋 Argument Strength Analysis (${scoredGrounds.length} grounds)\n\n` +
              scoredGrounds.map((g, i) =>
                  `**${i + 1}. [${g.score}]** ${g.text}…\n` +
                  `   Evidence: ${g.hasEvidence ? '✅' : '❌'} | Statute: ${g.hasStatute ? '✅' : '❌'} | Conflicts: ${g.hasConflict ? '⚠️ YES' : 'None'}\n` +
                  `   Sources: ${g.supportingDocs.join(', ') || 'None found'}`
              ).join('\n\n')
            : `> No grounds found in the current draft. No draft detected in \`drafts/\`.`;

        try {
            return await getChatResponse(messages, { caseDir });
        } catch (e) {
            if (e.code === 'LITE_MODE' || e.code === 'CONTEXT_EXCEEDED') {
                return buildLiteFallback({
                    caseDir, agentName: 'Strength Analyser', agentIcon: '📋',
                    userMessage, contexts: [],
                    preBlock: scorePreBlock, writeBack: true
                });
            }
            throw e;
        }
    }
}

module.exports = StrengthAgent;
