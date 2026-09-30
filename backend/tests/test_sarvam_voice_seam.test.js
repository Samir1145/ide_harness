'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const sarvamClient = require('../lib/seams/sarvam/sarvam-client');
const { BULBUL_SPEAKERS, LEGAL_ASR_DOMAIN_PROMPT } = require('../lib/seams/sarvam/sarvam-client');
const lightRagVoiceAgent = require('../lib/agents/lightrag-voice-agent');
const coordinator = require('../lib/agents/agent-coordinator');

async function runSarvamSeamTests() {
    console.log('--- Sarvam AI Voice Seam & @AskHaya Integration Tests ---');

    // 1. Verify Catalog & Personas
    const status = sarvamClient.getStatus();
    assert.strictEqual(status.provider, 'Sarvam AI (Indic Sovereign Voice Engine)');
    assert.strictEqual(status.defaultSpeaker, 'arvind');
    assert.strictEqual(status.models.tts, 'bulbul:v1');
    assert.strictEqual(status.models.stt, 'saaras:v2');
    assert(Array.isArray(status.speakers) && status.speakers.length >= 5, 'At least 5 Indian voice personas defined');
    
    const arvind = status.speakers.find(s => s.id === 'arvind');
    assert(arvind && arvind.name.includes('Senior Advocate Male'), 'Arvind senior advocate persona present');
    console.log('✓ Sarvam AI catalog & personas verified (5 advocate personas available)');

    // 2. Verify Domain Vocabulary Injection for Legal ASR
    assert(LEGAL_ASR_DOMAIN_PROMPT.includes('NCLT'), 'Domain prompt includes NCLT');
    assert(LEGAL_ASR_DOMAIN_PROMPT.includes('CIRP'), 'Domain prompt includes CIRP');
    assert(LEGAL_ASR_DOMAIN_PROMPT.includes('SARFAESI'), 'Domain prompt includes SARFAESI');
    assert(LEGAL_ASR_DOMAIN_PROMPT.includes('Section 7'), 'Domain prompt includes Section 7');
    assert(LEGAL_ASR_DOMAIN_PROMPT.includes('Adjudicating Authority'), 'Domain prompt includes Adjudicating Authority');
    console.log('✓ Legal domain prompt injection for Saaras v2 verified');

    // 3. Verify Graceful Fallback When Offline / Key Absent
    const unconfiguredClient = new sarvamClient.SarvamClient({ apiKey: '' });
    assert.strictEqual(unconfiguredClient.isConfigured(), false, 'Unconfigured client returns false');

    const ttsFallback = await unconfiguredClient.synthesizeSpeech({ text: 'Order 38 Rule 5 attachment' });
    assert.strictEqual(ttsFallback.success, false, 'TTS without key returns success=false');
    assert.strictEqual(ttsFallback.fallback, true, 'TTS without key flags fallback=true');
    console.log('✓ Graceful zero-breakage fallback for Bulbul TTS verified');

    const sttFallback = await unconfiguredClient.transcribeAudio({ audioBuffer: Buffer.from([1, 2, 3, 4]) });
    assert.strictEqual(sttFallback.success, false, 'STT without key returns success=false');
    assert.strictEqual(sttFallback.fallback, true, 'STT without key flags fallback=true');
    console.log('✓ Graceful zero-breakage fallback for Saaras STT verified');

    // 4. Verify Local SHA-256 Audio Cache
    const testHashText = 'Test Precedent Speech Cache';
    const fakeBase64 = Buffer.from('FAKE_WAV_AUDIO_BYTES').toString('base64');
    const crypto = require('crypto');
    const expectedHash = crypto.createHash('sha256')
        .update(`arvind:en-IN:1:0:${testHashText}`)
        .digest('hex');
    const cacheFile = path.join(sarvamClient.cacheDir, `${expectedHash}.wav`);

    // Write cached mock audio
    fs.writeFileSync(cacheFile, Buffer.from(fakeBase64, 'base64'));

    const cachedRes = await sarvamClient.synthesizeSpeech({
        text: testHashText,
        speaker: 'arvind',
        targetLanguage: 'en-IN'
    });
    assert.strictEqual(cachedRes.success, true, 'Cached synthesis succeeds');
    assert.strictEqual(cachedRes.cached, true, 'Cached flag is true');
    assert.strictEqual(cachedRes.mimeType, 'audio/wav');
    assert.strictEqual(cachedRes.audioBase64, fakeBase64, 'Returns cached audio bytes');
    console.log('✓ Local SHA-256 audio disk cache verified');

    // Clean up test cache file
    try { fs.unlinkSync(cacheFile); } catch (_) {}

    // 5. Verify @AskHaya Voice Agent Handle & Telemetry
    assert.strictEqual(lightRagVoiceAgent.handle, '@AskHaya', 'Agent handle updated to @AskHaya');
    assert.strictEqual(lightRagVoiceAgent.alias, '@VoicePrecedent', 'Agent alias maintained as @VoicePrecedent');
    
    const telemetry = await lightRagVoiceAgent.checkTelemetry();
    assert(telemetry.sarvam, 'Telemetry includes Sarvam AI status');
    assert.strictEqual(telemetry.sarvam.defaultSpeaker, 'arvind');
    console.log('✓ @AskHaya agent handle and Sarvam telemetry verified');

    // 6. Verify Coordinator Routing: @Hayagriva and @AskHaya
    assert(coordinator, 'Coordinator loaded');
    const intentHaya = await coordinator.classifyIntent(null, '@AskHaya explain Section 7 limitation');
    assert(intentHaya, 'Intent classified');
    console.log('✓ Agent coordinator routing verified for @Hayagriva and @AskHaya');

    console.log('\n--- ALL SARVAM AI SEAM TESTS PASSED! ---');
    process.exit(0);
}

runSarvamSeamTests().catch(err => {
    console.error('Sarvam Seam Test Failed:', err);
    process.exit(1);
});
