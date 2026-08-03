'use strict';

const http = require('http');

function testIngestToAi() {
    const payload = JSON.stringify({
        case: '/Users/atulgrover/Documents/ipie_mca_ibbi',
        file: '/Users/atulgrover/Documents/ipie_mca_ibbi/ipie.pdf',
        enrich: false
    });

    console.log('[Test Ingest-to-AI] Sending request to /api/hayagriva/ingest-to-ai...');
    const req = http.request('http://127.0.0.1:3210/api/hayagriva/ingest-to-ai', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            console.log('[Test Ingest-to-AI] Status Code:', res.statusCode);
            console.log('[Test Ingest-to-AI] Response Body:', body);
        });
    });

    req.on('error', err => {
        console.error('[Test Ingest-to-AI] Request failed:', err.message);
    });

    req.write(payload);
    req.end();
}

testIngestToAi();
