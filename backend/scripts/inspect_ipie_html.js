'use strict';

const fs = require('fs');
const path = require('path');
const { parseWikiHtml } = require('../lib/pipeline/wiki/upload');

function inspectIpie() {
    const docsDir = path.join(process.env.HOME || '/Users/atulgrover', 'Documents');
    console.log(`[Inspect ipie.html] Searching for ipie.html in ${docsDir}...`);

    let ipiePath = null;
    const scan = (dir) => {
        const files = fs.readdirSync(dir);
        for (const f of files) {
            const p = path.join(dir, f);
            if (f.startsWith('.')) continue;
            const stat = fs.statSync(p);
            if (stat.isDirectory()) {
                scan(p);
            } else if (f.toLowerCase() === 'ipie.html' || f.toLowerCase().endsWith('ipie.wiki.html')) {
                ipiePath = p;
                break;
            }
        }
    };
    try { scan(docsDir); } catch (e) {}

    if (!ipiePath) {
        console.log('[Inspect ipie.html] ipie.html not found in Documents.');
        return;
    }

    console.log(`[Inspect ipie.html] Found file at: ${ipiePath}`);
    const sizeMb = (fs.statSync(ipiePath).size / (1024 * 1024)).toFixed(2);
    console.log(`[Inspect ipie.html] File size: ${sizeMb} MB`);

    const htmlContent = fs.readFileSync(ipiePath, 'utf8');
    console.log(`[Inspect ipie.html] Head snippet:`, htmlContent.substring(0, 500));

    // Test parseWikiHtml
    const tiddlers = parseWikiHtml(ipiePath);
    console.log(`[Inspect ipie.html] parseWikiHtml returned ${tiddlers.length} tiddlers.`);
    if (tiddlers.length > 0) {
        console.log(' - Sample tiddlers:', tiddlers.slice(0, 5).map(t => t.title));
    } else {
        console.log('[Inspect ipie.html] 0 tiddlers returned! Inspecting script/div store tags in file...');
        const scriptMatches = htmlContent.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi);
        console.log(` - Total <script> tags: ${scriptMatches ? scriptMatches.length : 0}`);
        if (scriptMatches) {
            scriptMatches.slice(0, 10).forEach((s, idx) => {
                if (s.toLowerCase().includes('tiddler') || s.toLowerCase().includes('json') || s.length > 200) {
                    console.log(`   Script ${idx}: length ${s.length}, snippet: ${s.substring(0, 150)}...`);
                }
            });
        }
    }
}

inspectIpie();
