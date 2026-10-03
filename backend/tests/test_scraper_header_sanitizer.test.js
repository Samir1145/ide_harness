'use strict';
const assert = require('assert');
const lightRagVoiceAgent = require('../lib/agents/lightrag-voice-agent');

function run() {
    console.log('Testing scraper header sanitization...');
    const rawScrapeText = `--- Act-Code: Companies Act 2013 (ca2013) Legal-Provision: Sections (sec) Folder-Name: mcachap20 File-Name: mcachap20windings325Applicationofinsolvencyrulesinw
# Section 325: Application of insolvency rules in winding up of insolvent companies

In the winding up of an insolvent company, the same rules shall prevail and be observed with regard to the respective rights of secured and unsecured creditors.`;

    assert(typeof lightRagVoiceAgent.cleanStatutoryText === 'function', 'cleanStatutoryText method must exist');
    const cleaned = lightRagVoiceAgent.cleanStatutoryText(rawScrapeText);
    assert(!cleaned.includes('Act-Code:'), 'Act-Code must be stripped');
    assert(!cleaned.includes('Folder-Name:'), 'Folder-Name must be stripped');
    assert(!cleaned.includes('File-Name:'), 'File-Name must be stripped');
    assert(!cleaned.includes('mcachap20'), 'Internal file stem must be stripped');
    assert(cleaned.includes('In the winding up of an insolvent company'), 'Substantive text preserved');

    console.log('Testing speech extraction from dirty text...');
    const spoken = lightRagVoiceAgent._extractSpokenProseFromAnswer('winding up rules', rawScrapeText, [], false);
    assert(!spoken.includes('Act-Code'), 'Spoken text must not contain Act-Code');
    assert(!spoken.includes('mcachap20'), 'Spoken text must not contain scraper filenames');
    assert(spoken.includes('In the winding up of an insolvent company'), 'Spoken text must contain substantive ratio');
    console.log('✓ Scraper header sanitization tests verified.');
}

try {
    run();
} catch (e) {
    console.error('Test Failed:', e.message);
    process.exit(1);
}
