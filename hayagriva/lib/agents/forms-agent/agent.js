const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../core/llm-client');
const { populateFormInstance } = require('../../pipeline/forms/mapper');
const { validateFormRules } = require('../../pipeline/forms/rules_validator');

class FormsAgent {
    constructor() {
        this.name = 'FormsAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Forms Agent] Processing task: "${userMessage}"`);

        // Extract metadata: detect if user wants a specific form evaluated (e.g. AOC-4)
        const aoc4Match = userMessage.match(/aoc[-_]?4/i);
        const formId = aoc4Match ? 'aoc-4' : null;

        let context = '';
        if (formId) {
            try {
                // Populate/read the active review instance
                const fields = await populateFormInstance(caseDir, formId);
                
                // Read rules from schema
                const workspaceRoot = path.join(__dirname, '..', '..', '..');
                const schemaPath = path.join(workspaceRoot, 'forms', formId, 'schema.json');
                let rules = [];
                if (fs.existsSync(schemaPath)) {
                    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
                    rules = schema.rules || [];
                }

                // Run mathematical and chronological validation rules
                const flatData = {};
                for (const k in fields) {
                    flatData[k] = fields[k].value;
                }
                const failures = validateFormRules(flatData, rules);

                context = `[Active Form Audit - ${formId.toUpperCase()}]\n`;
                context += `Populated Fields:\n`;
                for (const k in flatData) {
                    context += `- ${k}: ${flatData[k]} (source: ${fields[k].source || 'unknown'})\n`;
                }

                if (failures.length > 0) {
                    context += `\nValidation Failures Identified:\n`;
                    failures.forEach(f => {
                        context += `❌ [${f.ruleId}] ${f.message} (Fields: ${f.affectedFields.join(', ')})\n`;
                    });
                } else {
                    context += `\n✓ Validation Check: All equations and date hierarchies verified successfully.\n`;
                }
            } catch (e) {
                console.error(`[Forms Agent] Form extraction pre-run failed:`, e.message);
            }
        }

        // Build messages log
        const messages = [
            { role: 'system', content: this.instructions }
        ];

        history.forEach(h => {
            messages.push({ role: h.role, content: h.content });
        });

        let promptContent = userMessage;
        if (context) {
            promptContent = `${context}\n\n[User Command]\n${userMessage}`;
        }
        messages.push({ role: 'user', content: promptContent });

        return await getChatResponse(messages);
    }
}

module.exports = FormsAgent;
