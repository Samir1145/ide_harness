'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Resolves the appropriate system prompt for an agent, checking for:
 * 1. Per-case custom prompt overlay in <caseDir>/prompts/<agentId>.md or <caseDir>/concepts/prompts/<agentId>.md
 * 2. Specific prompt variant in agent.promptVariants[variant]
 * 3. Default agent.instructions fallback
 */
function resolveAgentPrompt(agentInstance, caseDir, variant = 'default') {
    const agentId = (agentInstance.id || agentInstance.name || '').toLowerCase().replace(/agent$/, '');
    
    // 1. Check per-case custom prompt override
    if (caseDir) {
        const customCandidates = [
            path.join(caseDir, 'prompts', `${agentId}.md`),
            path.join(caseDir, 'concepts', 'prompts', `${agentId}.md`),
            path.join(caseDir, `${agentId}_prompt.md`)
        ];
        for (const cand of customCandidates) {
            if (fs.existsSync(cand)) {
                try {
                    const customText = fs.readFileSync(cand, 'utf8').trim();
                    if (customText.length > 0) {
                        return customText;
                    }
                } catch (_) {}
            }
        }
    }

    // 2. Check prompt variants
    if (agentInstance.promptVariants && typeof agentInstance.promptVariants === 'object') {
        if (agentInstance.promptVariants[variant]) {
            return agentInstance.promptVariants[variant];
        }
    }

    // 3. Fall back to default compiled instructions
    return agentInstance.instructions || 'You are a specialized HAYAGRIVA subagent.';
}

module.exports = { resolveAgentPrompt };
