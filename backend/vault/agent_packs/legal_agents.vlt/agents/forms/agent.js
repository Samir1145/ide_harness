const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../../../../lib/core/llm-client');
const { fillForm, listForms, formatFormBlock } = require('../../../../../lib/agents/skills/form-fill');
const { validateForm } = require('../../../../../lib/agents/skills/form-validate');
const { appendToMarkdown } = require('../../../../../lib/agents/skills/md-append');
const { buildLiteFallback } = require('../../../../../lib/agents/skills/lite-fallback');

const { resolveStatutoryTemplate, draftStatutoryForm, listAvailableStatutoryForms } = require('../../../../../lib/pipeline/forms/statutory-drafting');

// Detect form ID from user message
function detectFormId(userMessage) {
    const msg = userMessage.toLowerCase();
    
    // Check explicit /fill command
    const fillMatch = userMessage.match(/\/fill\s+([a-z0-9\-_]+)/i);
    if (fillMatch) return fillMatch[1].toLowerCase();

    // Check specific form keywords
    const statutory = resolveStatutoryTemplate(userMessage);
    if (statutory) return statutory.formSlug;

    if (msg.includes('aoc-4') || msg.includes('aoc4') || msg.includes('annual return')) return 'aoc-4';
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

        // Proactive Guardrail: Check for IP Form F Bifurcation Trap
        const { detectBifurcationTrap, getBifurcationWarning } = require('../../../../../lib/agents/skills/bifurcation-guard');
        const trap = detectBifurcationTrap(userMessage);
        if (trap) {
            console.log(`[Forms Agent] 🚨 Intercepted potential Form F bifurcation trap query!`);
            const warningBanner = getBifurcationWarning();
            return `${warningBanner}\n\n### 🛡️ Recommended Strategy for Your Claim:\n1. **Do not file Form F.** Filing Form F forfeits your seat and voting share in the Committee of Creditors (CoC) and places your core capital at the bottom of the liquidation waterfall.\n2. **File Form CA for the entire composite amount** (including both your principal capital consideration and all contractual lease arrears accrued up to the Insolvency Commencement Date).\n3. **Include the Section 5(8)(f) Preemptive Legal Rider** directly in Form CA (Item 6 & Annexure-E) to judicially estop the IP from bifurcating your claim.\n\n*Type \`@forms draft Form CA\` to generate your protected, court-ready claim package.*`;
        }

        // Check if user is requesting a statutory IBC form
        const statutory = resolveStatutoryTemplate(userMessage) || (detectFormId(userMessage) ? resolveStatutoryTemplate(detectFormId(userMessage)) : null);
        if (statutory) {
            console.log(`[Forms Agent] Drafting Statutory Form: ${statutory.formSlug} (${statutory.suiteName})`);
            try {
                const res = await draftStatutoryForm(caseDir, statutory.formSlug);

                const draftRelMd = path.relative(caseDir, res.draftMdPath);
                const draftRelDocx = res.draftDocxPath ? path.relative(caseDir, res.draftDocxPath) : null;

                let output = `### 📋 Statutory Form Drafted: ${res.formSlug.toUpperCase()} (${res.suiteName})\n\n`;
                output += `- **Draft Document:** [\`${draftRelMd}\`](file://${res.draftMdPath})\n`;
                if (res.draftDocxPath) {
                    output += `- **DOCX Export:** [\`${draftRelDocx}\`](file://${res.draftDocxPath})\n`;
                }
                output += `- **Field Completion:** ${res.filledCount} filled / ${res.unfilledCount} unfilled\n\n`;

                if (res.diagnostics.filled.length > 0) {
                    output += `#### ✅ Auto-Populated Fields:\n`;
                    output += `| Variable | Extracted Value |\n| :--- | :--- |\n`;
                    for (const f of res.diagnostics.filled) {
                        output += `| \`${f.variable}\` | ${f.value} |\n`;
                    }
                    output += `\n`;
                }

                if (res.diagnostics.unfilled.length > 0) {
                    output += `#### ⚠️ Needs Practitioner Review:\n`;
                    output += res.diagnostics.unfilled.map(u => `- \`{{ ${u.variable} }}\``).join('\n') + `\n\n`;
                }

                output += `> 💡 *Edit the draft directly in Monaco editor. Saved changes update the central KV dictionary automatically.*`;

                // Audit trail
                appendToMarkdown(caseDir, 'case_facts.md', '## Forms Agent Audit',
                    `- **${res.formSlug}** drafted — ${res.filledCount} fields populated, ${res.unfilledCount} unfilled. Export: [${draftRelDocx || draftRelMd}]`,
                    this.name);

                return output;
            } catch (err) {
                console.error(`[Forms Agent] Statutory drafting failed:`, err.message);
            }
        }

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

                // Step 3: Export JSON schema for iPIE
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
            // No form detected: show available statutory forms + MCA forms
            const statForms = listAvailableStatutoryForms();
            const suitesMap = {};
            for (const f of statForms) {
                if (!suitesMap[f.suiteName]) suitesMap[f.suiteName] = [];
                suitesMap[f.suiteName].push(`\`${f.formId}\``);
            }
            let formsList = '';
            for (const [sName, fList] of Object.entries(suitesMap)) {
                formsList += `**${sName}**:\n${fList.slice(0, 8).join(', ')} ...\n\n`;
            }
            context = `[Forms Agent — No specific form identified]\n\nAvailable Statutory IBC Suites:\n\n${formsList}\nTip: Type "@forms draft Form A", "@forms Form C", or "@forms Form B_LP".`;
        }


        // Build LLM prompt
        const messages = [{ role: 'system', content: this.instructions }];
        history.forEach(h => messages.push({ role: h.role, content: h.content }));
        messages.push({ role: 'user', content: `${context}\n\n[User Command]\n${userMessage}` });

        try {
            return await getChatResponse(messages, { caseDir });
        } catch (e) {
            if (e.code === 'LITE_MODE' || e.code === 'CONTEXT_EXCEEDED') {
                // Forms pre-filled skeleton is complete — return it directly with a lite notice
                return `> ℹ️ **Lite Mode** — LLM narrative unavailable. Pre-filled form skeleton below.\n\n${context}`;
            }
            throw e;
        }
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
            if (e.code === 'LITE_MODE' || e.code === 'CONTEXT_EXCEEDED') {
                // Return neutral audit result so DocumentAgent's delegation loop doesn't stall
                return { passed: true, issues: ['[Lite Mode] LLM critique unavailable — start the engine in Settings for full audit.'] };
            }
            console.error(`[Forms Agent] Critique failed:`, e.message);
        }
        return { passed: true, issues: [] };
    }
}

module.exports = FormsAgent;
