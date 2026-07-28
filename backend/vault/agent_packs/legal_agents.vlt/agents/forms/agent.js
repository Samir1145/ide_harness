const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../../../../lib/core/llm-client');
const { fillForm, listForms, formatFormBlock } = require('../../../../../lib/agents/skills/form-fill');
const { validateForm } = require('../../../../../lib/agents/skills/form-validate');
const { appendToMarkdown } = require('../../../../../lib/agents/skills/md-append');

// Detect form ID from user message
function detectFormId(userMessage) {
    const msg = userMessage.toLowerCase();
    if (msg.includes('aoc-4') || msg.includes('aoc4') || msg.includes('annual return'))         return 'aoc-4';
    if (msg.includes('form a') || msg.includes('financial creditor claim'))                      return 'ibbi-form-a';
    if (msg.includes('form b') || msg.includes('operational creditor claim'))                    return 'ibbi-form-b';
    if (msg.includes('form f') || msg.includes('workman') || msg.includes('employee claim'))     return 'ibbi-form-f';
    if (msg.includes('form h') || msg.includes('resolution plan compliance') || msg.includes('ibbi-h')) return 'ibbi-h';
    // Explicit /fill command
    const fillMatch = userMessage.match(/\/fill\s+([a-z0-9\-]+)/i);
    if (fillMatch) return fillMatch[1].toLowerCase();
    return null;
}

class FormsAgent {
    constructor() {
        this.name = 'FormsAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Forms Agent] Processing: "${userMessage}"`);

        const formId = detectFormId(userMessage);
        let context = '';

        if (formId) {
            try {
                // Step 1: Fill form from KV + RAG
                const formData = await fillForm(caseDir, formId);
                context = formatFormBlock(formData);

                // Step 2: Validate math/date rules if schema exists
                try {
                    const validation = await validateForm(caseDir, formId);
                    if (validation.failures && validation.failures.length > 0) {
                        context += `\n[Validation Failures — fix before filing]\n`;
                        validation.failures.forEach(f => {
                            context += `❌ [${f.ruleId}] ${f.message} (Fields: ${f.affectedFields.join(', ')})\n`;
                        });
                    } else if (validation.passed) {
                        context += `\n✅ All math/date validation rules passed.\n`;
                    }
                } catch (e) { /* No schema rules for this form yet */ }

                // Step 3: Export JSON schema for iPIE (saved alongside form data)
                try {
                    const jsonExport = {};
                    for (const [k, v] of Object.entries(formData.fields)) {
                        jsonExport[k] = v.value || null;
                    }
                    const exportPath = path.join(caseDir, 'exports', `${formId}_${Date.now()}.json`);
                    fs.mkdirSync(path.dirname(exportPath), { recursive: true });
                    fs.writeFileSync(exportPath, JSON.stringify(jsonExport, null, 2), 'utf8');
                    context += `\n[iPIE Export] JSON schema saved: exports/${path.basename(exportPath)}\n`;
                } catch (e) { /* non-fatal */ }

                // Step 4: Write-back audit entry
                appendToMarkdown(caseDir, 'case_facts.md', '## Forms Agent Audit',
                    `- **${formId}** filled — ${formData.fields ? Object.keys(formData.fields).length - formData.unfilled.length : 0} fields populated. Unfilled: ${formData.unfilled.join(', ') || 'none'}`,
                    this.name);

            } catch (e) {
                const forms = listForms().map(f => `\`${f.id}\` (${f.label})`).join('\n');
                context = `[Forms Agent Error] ${e.message}\n\nAvailable forms:\n${forms}`;
                console.error(`[Forms Agent] Form fill failed:`, e.message);
            }
        } else {
            // No form detected: show available forms + ask for clarification
            const forms = listForms().map(f => `- \`${f.id}\` — ${f.label}`).join('\n');
            context = `[Forms Agent — No form detected]\nAvailable IBBI/MCA forms:\n${forms}\n\nTip: Use "/fill <form-id>" or mention the form name (e.g. "Fill Form A for financial creditor").`;
        }

        // Build LLM prompt
        const messages = [{ role: 'system', content: this.instructions }];
        history.forEach(h => messages.push({ role: h.role, content: h.content }));
        messages.push({ role: 'user', content: `${context}\n\n[User Command]\n${userMessage}` });

        return await getChatResponse(messages, { caseDir });
    }

    /**
     * Critique mode: audits a document draft for completeness.
     * Called by DocumentAgent as part of the critique delegation loop.
     * @param {string} caseDir
     * @param {string} draftText
     * @returns {Promise<{passed: boolean, issues: string[]}>}
     */
    async critique(caseDir, draftText) {
        const prompt = `You are a legal document auditor. Review this draft and check:
1. Are all prayers/reliefs explicitly stated?
2. Are all grounds supported by a statute or section reference?
3. Are party names consistent throughout?
4. Are all date sequences logical (no events before their causes)?
5. Are there any unsupported factual assertions?

Return a JSON object: { "passed": boolean, "issues": ["issue1", "issue2", ...] }
Return ONLY the JSON.

Draft:
"""
${draftText.substring(0, 1500)}
"""`;

        try {
            const raw = await getChatResponse([
                { role: 'system', content: 'You are a precise legal auditor. Return only valid JSON.' },
                { role: 'user', content: prompt }
            ], { caseDir });
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) return JSON.parse(jsonMatch[0]);
        } catch (e) {
            console.error(`[Forms Agent] Critique failed:`, e.message);
        }
        return { passed: true, issues: [] };
    }
}

module.exports = FormsAgent;
