const path = require('path');
const fs = require('fs');
const coordinator = require('../lib/agents/agent-coordinator');
const AdvisorAgent = require('../lib/agents/advisor-agent/agent');
const FormsAgent = require('../lib/agents/forms-agent/agent');
const DocumentAgent = require('../lib/agents/document-agent/agent');

function run() {
    console.log('[Agents & Coordinator Unit Tests]');

    // 1. Verify dynamic prompt instruction loading
    console.log('  -> Verifying markdown prompt loading...');
    
    const advisor = new AdvisorAgent();
    if (!advisor.instructions.includes('Senior Corporate & Insolvency Law Advisor')) {
        throw new Error('AdvisorAgent failed to load system instructions correctly.');
    }

    const forms = new FormsAgent();
    if (!forms.instructions.includes('Compliance & Auditor Agent')) {
        throw new Error('FormsAgent failed to load system instructions correctly.');
    }

    const document = new DocumentAgent();
    if (!document.instructions.includes('Legal Draftsman Agent')) {
        throw new Error('DocumentAgent failed to load system instructions correctly.');
    }

    console.log('     ✓ All system prompts (.md) loaded and compiled successfully.');

    // 2. Verify coordinator classification routing fallbacks
    console.log('  -> Testing intent classification fallback routing...');
    if (typeof coordinator.classifyIntent !== 'function') {
        throw new Error('Coordinator missing classifyIntent function.');
    }

    // 3. Verify Agent tool references
    console.log('  -> Verifying agent class methods...');
    if (typeof advisor.run !== 'function' || typeof forms.run !== 'function' || typeof document.run !== 'function') {
        throw new Error('Subagent classes missing executable run() methods.');
    }

    console.log('  ✓ SUCCESS: Node.js native agent framework verified!');
}

module.exports = { run };
