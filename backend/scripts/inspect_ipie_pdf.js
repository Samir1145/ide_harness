'use strict';

const fs = require('fs');
const path = require('path');
const { getDb } = require('../lib/core/sqlite-store');

function inspectPdfStatus() {
    const caseDir = '/Users/atulgrover/Documents/ipie_mca_ibbi';
    console.log(`[Inspect PDF Status] Case Directory: ${caseDir}`);

    const db = getDb(caseDir);
    const rows = db.prepare('SELECT filename, status FROM documents').all();
    console.log('[SQLite documents Table Rows]:');
    for (const r of rows) {
        console.log(` - ${r.filename} | Status: ${r.status}`);
    }

    const pdfPath = path.join(caseDir, 'ipie.pdf');
    const companionPath = path.join(caseDir, 'ipie.md');
    const conceptsDir = path.join(caseDir, 'concepts', 'ipie');
    const treePath = path.join(conceptsDir, 'pageindex_tree.json');

    console.log('\n[Disk Check]:');
    console.log(` - ipie.pdf exists: ${fs.existsSync(pdfPath)}`);
    console.log(` - ipie.md (companion) exists: ${fs.existsSync(companionPath)}`);
    console.log(` - pageindex_tree.json exists: ${fs.existsSync(treePath)}`);
}

inspectPdfStatus();
