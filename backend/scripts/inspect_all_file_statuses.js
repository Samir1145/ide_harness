'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');

function inspectAllStatuses() {
    const caseDir = '/Users/atulgrover/Documents/ipie_mca_ibbi';
    console.log(`[Inspect All Statuses] Querying API for case: ${caseDir}`);

    http.get(`http://127.0.0.1:3210/api/hayagriva/file-statuses?case=${encodeURIComponent(caseDir)}`, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const json = JSON.parse(body);
                console.log('\n================ ALL FILE STATUSES ================');
                for (const [file, status] of Object.entries(json.statuses || {})) {
                    const companionRel = status.files?.companion?.path || '';
                    const companionAbs = path.join(caseDir, companionRel);
                    const companionExistsOnDisk = fs.existsSync(companionAbs);

                    console.log(`File: "${file}"`);
                    console.log(` - dot1: ${status.dot1} | dot2: ${status.dot2} | dot3: ${status.dot3}`);
                    console.log(` - companion path: "${companionRel}"`);
                    console.log(` - companion exists on disk: ${companionExistsOnDisk}`);
                    if ((status.dot1 === 'reviewed' || status.dot1 === 'companion_ready' || status.dot1 === 'green' || status.dot1 === '#10b981') && !companionExistsOnDisk && !file.endsWith('.html') && !file.endsWith('.wiki.html')) {
                        console.log(` *** ALERT: FALSE POSITIVE GREEN DOT DETECTED FOR: ${file} ***`);
                    }
                    console.log('----------------------------------------------------');
                }
            } catch (e) {
                console.error('Failed to parse response:', e.message);
            }
        });
    }).on('error', err => {
        console.error('HTTP Request failed:', err.message);
    });
}

inspectAllStatuses();
