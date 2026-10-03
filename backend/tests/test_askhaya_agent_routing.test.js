'use strict';

const assert = require('assert');
const coordinator = require('../lib/agents/agent-coordinator');
const lightRagVoiceAgent = require('../lib/agents/lightrag-voice-agent');

async function runTests() {
    console.log('=== Task 3: @AskHaya Chat Agent & Coordinator Routing Tests ===');

    // Mock lightRagVoiceAgent.inquire to return a distinctive precedent dossier
    const originalInquire = lightRagVoiceAgent.inquire;
    let inquireCalledWith = '';
    lightRagVoiceAgent.inquire = async (query, opts) => {
        inquireCalledWith = query;
        return {
            success: true,
            spokenText: 'Under Section 7 of the IBC, a financial creditor may initiate CIRP upon default.',
            fullDossier: '## ⚖️ Precedent Voice Counsel Dossier\n\n### 📖 Authoritative Legal Synthesis\n\nSection 7 IBC financial creditor analysis.',
            citations: [{ id: 'ref-1', title: 'Swiss Ribbons' }],
            languageCode: 'en-IN'
        };
    };

    try {
        // 1. Direct explicit agent call: target = 'askhaya'
        console.log('\n1. Testing explicit target: "askhaya"...');
        const res1 = await coordinator.run(null, 'What is section 7 of the IBC', [], 'askhaya', { returnObject: true });
        assert(res1 && (res1.response || res1).includes('Precedent Voice Counsel Dossier'), 'Returns precedent voice counsel dossier');
        assert.strictEqual(inquireCalledWith, 'What is section 7 of the IBC');
        assert(!res1.response.includes('Lite Mode — LLM Engine is offline'), 'Does NOT dump Lite Mode case file search');
        console.log('✓ Direct "askhaya" target routing verified');

        // 2. Mentions in message: "@AskHaya What is Section 7"
        console.log('\n2. Testing prefix mention: "@AskHaya What is Section 7"...');
        const res2 = await coordinator.run(null, '@AskHaya What is section 7 of the IBC', [], '', { returnObject: true });
        assert(res2 && (res2.response || res2).includes('Precedent Voice Counsel Dossier'), 'Prefix @AskHaya routes to precedent voice counsel');
        assert(!res2.response.includes('Lite Mode — LLM Engine is offline'), 'Does NOT fall back to Advisor lease fragments');
        console.log('✓ Prefix @AskHaya routing verified');

    } finally {
        lightRagVoiceAgent.inquire = originalInquire;
    }

    console.log('\n=== ALL TASK 3 ASK HAYA ROUTING TESTS PASSED! ===\n');
}

runTests().catch(err => {
    console.error('Task 3 Test Failed:', err);
    process.exit(1);
});
