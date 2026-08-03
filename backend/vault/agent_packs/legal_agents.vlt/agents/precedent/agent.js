const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../../../../lib/core/llm-client');
const { searchPrecedents } = require('../../../../../lib/agents/skills/precedent-search');
const { buildLiteFallback } = require('../../../../../lib/agents/skills/lite-fallback');

class PrecedentAgent {
    constructor() {
        this.name = 'PrecedentAgent';
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Precedent Agent] Searching case law precedents for: "${userMessage}"`);

        // 1. Search Law Vault for precedents
        const precedents = await searchPrecedents(userMessage, caseDir, 5);

        let precedentBlock = '';
        if (precedents.length > 0) {
            precedentBlock = 'Relevant Court & Tribunal Rulings:\n\n';
            precedents.forEach((p, i) => {
                precedentBlock += `[Ruling ${i + 1}] (${p.court} | Section/Title: ${p.title})\n${p.text.substring(0, 800)}\n\n`;
            });
        } else {
            precedentBlock = 'No direct statutory rulings found in Law Vault for this query.';
        }

        // 2. Build prompt for LLM
        const messages = [
            {
                role: 'system',
                content: `You are HAYAGRIVA, a senior legal researcher specializing in Indian insolvency law (IBC 2016 / 2026).
Analyse the retrieved court rulings and provide a structured legal opinion covering:
1. Key legal principles established by the Supreme Court / NCLAT.
2. Direct application to the user's scenario.
3. Relevant section citations.`
            }
        ];
        history.forEach(h => messages.push({ role: h.role, content: h.content }));
        messages.push({
            role: 'user',
            content: `${precedentBlock}\n\n[User Legal Query]\n${userMessage}`
        });

        try {
            return await getChatResponse(messages, { caseDir });
        } catch (e) {
            if (e.code === 'LITE_MODE' || e.code === 'CONTEXT_EXCEEDED') {
                // Raw vault rulings are the core value — return them directly
                return `> ℹ️ **Lite Mode** — LLM synthesis unavailable. Raw vault rulings below.\n\n` +
                       `**Query:** ${userMessage}\n\n` + precedentBlock;
            }
            throw e;
        }
    }
}

module.exports = PrecedentAgent;
