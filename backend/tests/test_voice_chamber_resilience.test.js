'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const sarvamClient = require('../lib/seams/sarvam/sarvam-client');
const lightRagClient = require('../lib/core/lightrag-client');
const lightRagVoiceAgent = require('../lib/agents/lightrag-voice-agent');

async function runResilienceTests() {
    console.log('--- Testing Sovereign Chamber Distribution & Voice Resilience ---');

    // ── 1. Test Global Chamber Profile Resolution (~/.hayagriva/chamber_config.json) ──
    const chamberDir = path.join(os.homedir(), '.hayagriva');
    const chamberFile = path.join(chamberDir, 'chamber_config.json');
    if (!fs.existsSync(chamberDir)) fs.mkdirSync(chamberDir, { recursive: true });

    // Backup existing chamber config if present
    let originalConfig = null;
    if (fs.existsSync(chamberFile)) {
        originalConfig = fs.readFileSync(chamberFile, 'utf8');
    }

    try {
        // Write mock chamber profile
        const mockProfile = {
            sarvamApiKey: 'test_sarvam_chamber_key_2026',
            sarvamSpeaker: 'aditya',
            sarvamLanguage: 'en-IN',
            lightragApiUrl: 'http://127.0.0.1:9621',
            lightragApiKey: 'test_lr_chamber_key'
        };
        fs.writeFileSync(chamberFile, JSON.stringify(mockProfile, null, 2), 'utf8');

        // Test Sarvam key resolution without any caseSettings passed
        const resolvedSarvamKey = sarvamClient.resolveApiKey({});
        assert.strictEqual(resolvedSarvamKey, 'test_sarvam_chamber_key_2026', 'Should resolve Sarvam key from ~/.hayagriva/chamber_config.json');

        const resolvedSpeaker = sarvamClient.resolveSpeaker({});
        assert.strictEqual(resolvedSpeaker, 'aditya', 'Should resolve speaker from chamber profile');

        const status = sarvamClient.getStatus({});
        assert.strictEqual(status.configured, true, 'Status should be configured');
        assert.strictEqual(status.activeEngine, 'sarvam', 'Active engine should be sarvam');
        assert.strictEqual(status.activeSpeaker, 'aditya', 'Active speaker should be aditya');
        console.log('✓ Phase 2 verified: Global Chamber Profile resolution works seamlessly without case settings');

        // Test LightRAG resolution from chamber profile
        lightRagClient.refreshConfig(null);
        assert.strictEqual(lightRagClient.config.apiUrl, 'http://127.0.0.1:9621', 'Should resolve LightRAG URL from chamber profile');
        console.log('✓ Phase 2 verified: LightRAG client inherits chamber profile defaults');

        // ── 2. Test Graceful Degradation when Key is Missing / Expired ──
        // Case override with empty key
        const emptyOverride = { sarvamApiKey: '' };
        // Temporarily delete chamber key to simulate offline/free chamber
        fs.writeFileSync(chamberFile, JSON.stringify({ sarvamApiKey: '' }, null, 2), 'utf8');
        sarvamClient.activeKey = '';
        delete process.env.SARVAM_API_KEY;

        const unconfiguredStatus = sarvamClient.getStatus(emptyOverride);
        assert.strictEqual(unconfiguredStatus.configured, false, 'Should be unconfigured without key');
        assert.strictEqual(unconfiguredStatus.activeEngine, 'browser', 'Active engine must degrade to browser');
        assert.strictEqual(unconfiguredStatus.engineReason, 'browser_fallback', 'Reason should be browser_fallback');
        assert.strictEqual(unconfiguredStatus.activeSpeaker, 'OS Native Browser Voice', 'Speaker should be OS Native');

        const synthRes = await sarvamClient.synthesizeSpeech({ text: 'Test legal query', caseSettings: emptyOverride });
        assert.strictEqual(synthRes.success, false, 'Synthesis should fail gracefully');
        assert.strictEqual(synthRes.fallback, true, 'Should set fallback: true for browser SpeechSynthesis');
        console.log('✓ Phase 2 verified: Zero-failure floor degrades to browser SpeechSynthesis');

        // ── 3. Test Full Substantive Ratio Extraction (No 2-Sentence or Colon Cutoff) ──
        const mockAnalysis = `## Operative Legal Analysis
Under Section 7 of the Insolvency and Bankruptcy Code, 2016, a financial creditor may file an application for initiating corporate insolvency resolution process against a corporate debtor before the Adjudicating Authority when a default has occurred.
The Hon'ble Supreme Court of India in Innoventive Industries Limited versus ICICI Bank Limited categorically established the following core legal principles:
First, the Adjudicating Authority must only be satisfied that a default has occurred.
Second, if the Adjudicating Authority is satisfied that a default has occurred, the application must be admitted.
Third, the pendency of any dispute is completely irrelevant for financial creditors under Section 7.

### References
1. Innoventive Industries Ltd v. ICICI Bank Ltd (2018) 1 SCC 407
/vaults/rulings/innoventive.pdf`;

        const spokenProse = lightRagVoiceAgent._extractSpokenProseFromAnswer('Section 7 criteria', mockAnalysis, [], true);
        assert(spokenProse.length > 100, 'Spoken prose should be substantive and rich');
        assert(!spokenProse.endsWith(':'), 'Spoken prose must NEVER end on a colon');
        assert(spokenProse.includes('Innoventive Industries Limited versus ICICI Bank Limited'), 'Abbreviation sanitization preserved');
        assert(spokenProse.includes('First'), 'Criteria follow-up points included after colon');
        assert(!spokenProse.includes('### References'), 'References cleanly stripped');
        console.log('✓ Phase 1 verified: Spoken prose extracted complete substantive ratio without dangling colon cutoff');

    } finally {
        // Restore original chamber config
        if (originalConfig !== null) {
            fs.writeFileSync(chamberFile, originalConfig, 'utf8');
        } else if (fs.existsSync(chamberFile)) {
            try { fs.unlinkSync(chamberFile); } catch (_) {}
        }
    }

    console.log('\n--- ALL SOVEREIGN RESILIENCE TESTS PASSED! ---');
}

runResilienceTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
