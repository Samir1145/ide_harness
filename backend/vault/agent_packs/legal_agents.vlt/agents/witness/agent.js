const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../../../../lib/core/llm-client');
const { loadSkeleton, fillPlaceholders } = require('../../../../../lib/agents/skills/skeleton-load');
const { appendToMarkdown } = require('../../../../../lib/agents/skills/md-append');
const { readAllKV } = require('../../../../../lib/agents/skills/kv-write');

class WitnessAgent {
    constructor() {
        this.name = 'WitnessAgent';
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Witness Agent] Building proof-to-fact evidence matrix...`);

        const repoRoot = path.join(__dirname, '..', '..', '..');
        const loaded = loadSkeleton('evidence-matrix-template', repoRoot);

        if (!loaded) {
            return 'Error: evidence-matrix-template.md skeleton not found.';
        }

        // Fill placeholders
        const { filled } = await fillPlaceholders(loaded.content, caseDir, repoRoot);

        // Save evidence_matrix.md in case directory
        const matrixPath = path.join(caseDir, 'evidence_matrix.md');
        fs.writeFileSync(matrixPath, filled, 'utf8');

        // Also append log to case_facts.md
        const summary = `### Witness & Evidence Matrix Generated (${new Date().toLocaleDateString()})\nSaved proof-to-fact mapping table to \`evidence_matrix.md\`.\n`;
        appendToMarkdown(caseDir, 'case_facts.md', summary);

        return `### 📋 Evidence & Proof-to-Fact Matrix Built\n\nI have generated the proof-to-fact witness matrix and saved it to [\`evidence_matrix.md\`](${matrixPath}).\n\n\`\`\`markdown\n${filled.substring(0, 1200)}\n...\n\`\`\``;
    }
}

module.exports = WitnessAgent;
