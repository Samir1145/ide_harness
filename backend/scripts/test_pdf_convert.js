'use strict';

const path = require('path');
const { ingestFile } = require('../lib/daemon/watcher');

async function testPdfConvert() {
    const caseDir = '/Users/atulgrover/Documents/ipie_mca_ibbi';
    const filePath = path.join(caseDir, 'ipie.pdf');

    console.log(`[Test PDF Convert] Starting ingestFile on ${filePath}...`);
    try {
        const result = await ingestFile(caseDir, filePath, { conversionOnly: true });
        console.log('[Test PDF Convert] Result:', result);
    } catch (err) {
        console.error('[Test PDF Convert Failed]', err);
    }
}

testPdfConvert();
