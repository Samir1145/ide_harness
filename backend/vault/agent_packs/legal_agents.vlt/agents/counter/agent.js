const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../../../../lib/core/llm-client');
const { ragRetrieve, formatContextBlock } = require('../../../../../lib/agents/skills/rag-retrieve');
const { crossReferenceCheck } = require('../../../../../lib/agents/skills/cross-ref-check');

class CounterAgent {
    constructor() {
        this.name = 'CounterAgent';
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Counter Agent] Anticipating opposing counsel defenses...`);

        // 1. RAG retrieval for petitioner's claims & grounds
        const chunks = await ragRetrieve(caseDir, userMessage, 4);
        const contextBlock = formatContextBlock(chunks, 'Case Petition Context');

        // 2. Cross-reference check for contradicting evidence
        const xref = await crossReferenceCheck(caseDir, userMessage.substring(0, 80), 5);

        const contradictBlock = xref.contradicting.length > 0
            ? `\n[Potentially Contradicting Documents in Case File]:\n${xref.contradicting.map(c => `- ${c.docName}: ${c.title}`).join('\n')}`
            : '\nNo direct contradicting documents found in case file.';

        // 3. Prompt LLM to act as opposing counsel
        const messages = [
            {
                role: 'system',
                content: `You are HAYAGRIVA, playing the role of Opposing Counsel (Respondent's Senior Advocate).
Analyse the petitioner's argument and provide:
1. Top 3 defenses / objections opposing counsel WILL raise before NCLT (e.g. limitation, pre-existing dispute, defective notice, lack of authorization).
2. Probable strength of each defense (HIGH / MEDIUM / LOW).
3. Recommended strategic counter-rebuttals and evidence to prepare in advance.`
            }
        ];
        history.forEach(h => messages.push({ role: h.role, content: h.content }));
        messages.push({
            role: 'user',
            content: `${contextBlock}${contradictBlock}\n\n[Petitioner's Argument to Challenge]\n${userMessage}`
        });

        return await getChatResponse(messages, { caseDir });
    }
}

module.exports = CounterAgent;
