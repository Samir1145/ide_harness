'use strict';

const assert = require('assert');
const lightRagVoiceAgent = require('../lib/agents/lightrag-voice-agent');
const lightRagClient = require('../lib/core/lightrag-client');
const sarvamClient = require('../lib/seams/sarvam/sarvam-client');

async function runTests() {
    console.log('=== Task 2: Decoupled Multilingual Precedent Pipeline Tests ===');

    // Mock lightRagClient.queryPrecedents to return a rich precedent answer
    const originalQueryPrecedents = lightRagClient.queryPrecedents;
    let querySentToLightRag = '';
    lightRagClient.queryPrecedents = async (query, opts) => {
        querySentToLightRag = query;
        return {
            success: true,
            answer: 'In Swiss Ribbons Pvt. Ltd. v. Union of India (2019), the Supreme Court upheld the constitutional validity of the IBC. The Court held that the primary objective of the Code is resolution, not liquidation. Financial creditors and operational creditors are distinct classes with different roles in the Committee of Creditors.',
            references: [
                {
                    title: 'Swiss Ribbons Pvt. Ltd. v. Union of India (2019) 4 SCC 17',
                    ratio: 'Primary focus of the Code is to ensure revival and continuation of the corporate debtor by protecting the corporate debtor from its own management.',
                    file_path: 'supreme_court/2019_swiss_ribbons.pdf'
                }
            ]
        };
    };

    try {
        // 1. Test English Query Pipeline
        console.log('\n1. Testing standard English inquiry...');
        const englishRes = await lightRagVoiceAgent.inquire('What is the objective of the IBC under Swiss Ribbons?');
        assert.strictEqual(englishRes.success, true, 'English inquest succeeds');
        assert.strictEqual(querySentToLightRag, 'What is the objective of the IBC under Swiss Ribbons?', 'English query sent directly');
        assert(englishRes.spokenText.length > 20, 'Spoken text extracted cleanly');
        assert(englishRes.fullDossier.includes('Swiss Ribbons'), 'Dossier cites Swiss Ribbons');
        assert(englishRes.fullDossier.includes('Supreme Court'), 'Dossier includes court citations');
        assert.strictEqual(englishRes.languageCode, 'en-IN', 'Default language is en-IN');
        console.log('✓ Standard English inquest verified (zero local model dependency)');

        // 2. Test Indic Language Query Pipeline (Hindi Input)
        console.log('\n2. Testing Indic inquiry (Hindi Input)...');
        // Mock sarvamClient.translateText
        const originalTranslate = sarvamClient.translateText;
        let translationsCalled = [];
        sarvamClient.translateText = async (params) => {
            translationsCalled.push({ source: params.sourceLanguage, target: params.targetLanguage, text: params.text });
            if (params.targetLanguage === 'en-IN') {
                return {
                    success: true,
                    translatedText: 'What is the objective of the IBC according to Supreme Court?',
                    detectedSourceLanguage: 'hi-IN'
                };
            } else if (params.targetLanguage === 'hi-IN') {
                return {
                    success: true,
                    translatedText: 'स्विस रिबन्स मामले में सुप्रीम कोर्ट ने माना कि आईबीसी का प्राथमिक उद्देश्य कंपनी का पुनरुद्धार है, परिसमापन नहीं।',
                    detectedSourceLanguage: 'en-IN'
                };
            }
            return { success: true, translatedText: params.text };
        };

        const hindiQuery = 'सुप्रीम कोर्ट के अनुसार आईबीसी का मुख्य उद्देश्य क्या है?';
        const hindiRes = await lightRagVoiceAgent.inquire(hindiQuery, { languageCode: 'hi-IN' });

        assert.strictEqual(hindiRes.success, true, 'Hindi inquest succeeds');
        assert.strictEqual(querySentToLightRag, 'What is the objective of the IBC according to Supreme Court?', 'Inbound translation correctly routed to LightRAG');
        assert.strictEqual(hindiRes.languageCode, 'hi-IN', 'Language code is hi-IN');
        assert(hindiRes.spokenText.includes('सुप्रीम कोर्ट'), 'Spoken text translated back to Hindi');
        assert(hindiRes.fullDossier.includes('Swiss Ribbons'), 'Dossier preserves official English court citations');
        assert(hindiRes.fullDossier.includes('सुप्रीम कोर्ट') || hindiRes.fullDossier.includes('पुनरुद्धार'), 'Dossier includes Hindi holding');
        console.log('✓ Bidirectional AskHaya -> Sarvam -> LightRAG -> Sarvam -> AskHaya pipeline verified');

        // Restore mocks
        sarvamClient.translateText = originalTranslate;
    } finally {
        lightRagClient.queryPrecedents = originalQueryPrecedents;
    }

    console.log('\n=== ALL TASK 2 MULTILINGUAL INQUEST TESTS PASSED! ===\n');
}

runTests().catch(err => {
    console.error('Task 2 Test Failed:', err);
    process.exit(1);
});
