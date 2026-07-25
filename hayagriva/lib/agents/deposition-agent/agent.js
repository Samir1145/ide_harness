const fs = require('fs');
const path = require('path');
const { loadSkeleton, fillPlaceholders } = require('../skills/skeleton-load');

class DepositionAgent {
    constructor() {
        this.name = 'DepositionAgent';
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Deposition Agent] Drafting sworn affidavit...`);

        const repoRoot = path.join(__dirname, '..', '..', '..');
        const loaded = loadSkeleton('affidavit-template', repoRoot);

        if (!loaded) {
            return 'Error: affidavit-template.md skeleton not found.';
        }

        const { filled, placeholders } = await fillPlaceholders(loaded.content, caseDir, repoRoot);

        // Save affidavit draft into case drafts folder
        const draftsDir = path.join(caseDir, 'drafts');
        if (!fs.existsSync(draftsDir)) fs.mkdirSync(draftsDir, { recursive: true });

        const draftPath = path.join(draftsDir, `affidavit_draft_${Date.now()}.md`);
        fs.writeFileSync(draftPath, filled, 'utf8');

        const unfilled = placeholders.filter(p => !p.filled).map(p => p.name);
        const gapNotice = unfilled.length > 0
            ? `\n\n⚠️ **Unfilled Details Needing Manual Review (${unfilled.length}):**\n${unfilled.map(u => `- \`{{ ${u} }}\``).join('\n')}`
            : '\n\n✓ All affidavit fields auto-populated from case KV dictionary & documents.';

        return `### ✍️ Court Affidavit Drafted\n\nI have prepared the sworn affidavit and saved it to [\`drafts/${path.basename(draftPath)}\`](${draftPath}).${gapNotice}\n\n\`\`\`markdown\n${filled.substring(0, 1000)}\n...\n\`\`\``;
    }
}

module.exports = DepositionAgent;
