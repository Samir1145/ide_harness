'use strict';

const assert = require('assert');
const sarvamClient = require('../lib/seams/sarvam/sarvam-client');

async function runTests() {
    console.log('=== Task 1: Sarvam Translation & Language Intelligence Seam Tests ===');

    // 1. Test Script Detection
    console.log('\n1. Testing Script Detection...');
    assert.strictEqual(typeof sarvamClient.detectScript, 'function', 'detectScript must be a function');

    const englishSample = 'What is the limitation period under Section 7 of the IBC?';
    assert.strictEqual(sarvamClient.detectScript(englishSample), 'en-IN', 'Detects English text');

    const hindiSample = 'क्या धारा 7 के तहत 14 दिन की समय सीमा अनिवार्य है?';
    assert.strictEqual(sarvamClient.detectScript(hindiSample), 'hi-IN', 'Detects Devanagari (Hindi) text');

    const tamilSample = 'பிரிவு 7 இன் கீழ் வரம்பு காலம் என்ன?';
    assert.strictEqual(sarvamClient.detectScript(tamilSample), 'ta-IN', 'Detects Tamil script');

    const teluguSample = 'సెక్షన్ 7 కింద పరిమితి కాలం ఎంత?';
    assert.strictEqual(sarvamClient.detectScript(teluguSample), 'te-IN', 'Detects Telugu script');

    const bengaliSample = 'ধারা 7 এর অধীনে সীমাবদ্ধতার সময়কাল কী?';
    assert.strictEqual(sarvamClient.detectScript(bengaliSample), 'bn-IN', 'Detects Bengali script');

    console.log('✓ Script detection verified across English, Hindi, Tamil, Telugu, and Bengali');

    // 2. Test English Pass-through (Zero latency / no HTTP call for English)
    console.log('\n2. Testing English Pass-through optimization...');
    assert.strictEqual(typeof sarvamClient.translateText, 'function', 'translateText must be a function');

    const passThroughRes = await sarvamClient.translateText({
        text: 'What are the grounds for rejection of a resolution plan?',
        sourceLanguage: 'en-IN',
        targetLanguage: 'en-IN'
    });

    assert.strictEqual(passThroughRes.success, true, 'English pass-through succeeds');
    assert.strictEqual(passThroughRes.translatedText, 'What are the grounds for rejection of a resolution plan?');
    assert.strictEqual(passThroughRes.cachedOrPassthrough, true, 'Flagged as pass-through');
    console.log('✓ English pass-through verified');

    // 3. Test Translation with Mock Server or Live Key
    console.log('\n3. Testing Translation API Contract...');
    // Test with missing API key handling
    const noKeyClient = new (sarvamClient.constructor)({ apiKey: '' });
    const noKeyRes = await noKeyClient.translateText({
        text: hindiSample,
        sourceLanguage: 'hi-IN',
        targetLanguage: 'en-IN',
        caseSettings: { sarvamApiKey: '' }
    });
    assert.strictEqual(noKeyRes.success, false);
    assert.strictEqual(noKeyRes.fallback, true, 'Returns fallback flag when key is unconfigured');

    console.log('✓ Graceful fallback when unauthenticated verified');

    console.log('\n=== ALL TASK 1 SARVAM TRANSLATION TESTS PASSED! ===\n');
}

runTests().catch(err => {
    console.error('Task 1 Test Failed:', err);
    process.exit(1);
});
