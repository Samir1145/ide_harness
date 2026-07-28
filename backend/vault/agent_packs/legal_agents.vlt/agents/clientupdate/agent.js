const fs = require('fs');
const path = require('path');
const { loadSkeleton, fillPlaceholders } = require('../../../../../lib/agents/skills/skeleton-load');

class ClientUpdateAgent {
    constructor() {
        this.name = 'ClientUpdateAgent';
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Client Update Agent] Preparing executive briefing status update...`);

        const repoRoot = path.join(__dirname, '..', '..', '..');
        const loaded = loadSkeleton('client-brief-template', repoRoot);

        if (!loaded) {
            return 'Error: client-brief-template.md skeleton not found.';
        }

        const { filled } = await fillPlaceholders(loaded.content, caseDir, repoRoot);

        // Save client update draft into drafts folder
        const draftsDir = path.join(caseDir, 'drafts');
        if (!fs.existsSync(draftsDir)) fs.mkdirSync(draftsDir, { recursive: true });

        const draftPath = path.join(draftsDir, `client_update_${Date.now()}.md`);
        fs.writeFileSync(draftPath, filled, 'utf8');

        return `### ✉️ Client Briefing Status Report Prepared\n\nI have generated the executive client status update report and saved it to [\`drafts/${path.basename(draftPath)}\`](${draftPath}).\n\n\`\`\`markdown\n${filled.substring(0, 1000)}\n...\n\`\`\``;
    }
}

module.exports = ClientUpdateAgent;
