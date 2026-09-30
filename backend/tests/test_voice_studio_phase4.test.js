'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const lightRagClient = require('../lib/core/lightrag-client');
const lightRagVoiceAgent = require('../lib/agents/lightrag-voice-agent');

async function runPhase4Tests() {
    console.log('--- Phase 4 Test: Voice Precedent Studio Cockpit UI & Local LightRAG ---');

    // 1. Verify Local LightRAG default URL
    assert.strictEqual(lightRagClient.config.apiUrl, 'http://127.0.0.1:9621', 'LightRAG client defaults to local port 9621');
    console.log('✓ LightRAG client default wired to local port 9621 (http://127.0.0.1:9621)');

    // 2. Verify Settings Dashboard HTML assets
    const htmlPath = path.join(__dirname, '..', 'lib', 'assets', 'settings-dashboard.html');
    assert(fs.existsSync(htmlPath), 'settings-dashboard.html exists');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // Modal & Interactive Elements
    assert(htmlContent.includes('id="voicePrecedentModal"'), 'Modal voicePrecedentModal exists');
    assert(htmlContent.includes('id="btnVoiceMic"'), 'Mic button btnVoiceMic exists');
    assert(htmlContent.includes('class="voice-pulse-ring"'), 'Pulse rings exist');
    assert(htmlContent.includes('class="voice-waveform"'), 'Waveform visualizer exists');
    assert(htmlContent.includes('id="voiceTranscriptArea"'), 'Live transcript area exists');
    assert(htmlContent.includes('id="voiceSpokenProse"'), 'Spoken prose card exists');
    assert(htmlContent.includes('id="voiceCitationsList"'), 'Citations list exists');
    console.log('✓ Voice Precedent Studio modal structure & waveform elements verified');

    // Header & Pill triggers
    assert(htmlContent.includes('id="btnHeaderVoiceStudio"'), 'Header quick-access button exists');
    assert(htmlContent.includes('id="pillVoiceStudio"'), 'Cockpit Nav Pill exists');
    assert(htmlContent.includes('Ask Haya'), 'Ask Haya label exists on nav pill');
    console.log('✓ Cockpit Navigation Pill & Header triggers verified for @AskHaya');

    // Coworker catalog
    assert(htmlContent.includes("handle: '@AskHaya'"), '@AskHaya registered in Coworkers catalog');
    assert(htmlContent.includes("handle: '@Hayagriva'"), '@Hayagriva registered in Coworkers catalog');
    assert(htmlContent.includes("id: 'voice_precedent'"), 'voice_precedent coworker card exists');
    console.log('✓ @AskHaya and @Hayagriva coworkers registered in Chamber Catalog');

    // Sarvam AI Elements
    assert(htmlContent.includes('id="voiceSarvamDot"'), 'Sarvam status dot exists');
    assert(htmlContent.includes('id="selectVoiceSarvamSpeaker"'), 'Speaker persona selector exists');
    assert(htmlContent.includes('id="inputVoiceSarvamKey"'), 'Sarvam API key field exists');
    console.log('✓ Sarvam AI UI controls verified');

    // Client functions
    assert(htmlContent.includes('function openVoiceStudioModal'), 'openVoiceStudioModal function defined');
    assert(htmlContent.includes('function toggleVoiceRecording'), 'toggleVoiceRecording function defined');
    assert(htmlContent.includes('function executeVoiceInquest'), 'executeVoiceInquest function defined');
    assert(htmlContent.includes('function speakSpokenCounsel'), 'speakSpokenCounsel function defined');
    assert(htmlContent.includes('function saveVoiceEndpointConfig'), 'saveVoiceEndpointConfig function defined');
    console.log('✓ All client speech recognition, inquest, and TTS functions verified');

    // 3. Test Inquest execution against local fallback
    const inquest = await lightRagVoiceAgent.inquire('Explain limitation period under Section 7 of IBC');
    assert.strictEqual(inquest.success, true, 'Voice inquest succeeds');
    assert(typeof inquest.spokenText === 'string' && inquest.spokenText.length > 20, 'Spoken text produced');
    assert(inquest.fullDossier.includes('## ⚖️ Precedent Voice Counsel Dossier'), 'Markdown dossier produced');
    assert(inquest.fullDossier.includes('@AskHaya'), 'Dossier footer cites @AskHaya');
    console.log('✓ End-to-end voice inquest executed successfully for oral legal counsel (@AskHaya)');

    console.log('\n--- ALL PHASE 4 TESTS PASSED! ---');
}

runPhase4Tests().catch(err => {
    console.error('Phase 4 test failed:', err);
    process.exit(1);
});
