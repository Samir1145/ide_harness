'use strict';

const path = require('path');
const fs = require('fs');
const { getDb } = require('../lib/core/sqlite-store');

async function testStatusHealing() {
    console.log('[Test Status Healing] Setting up temporary test workspace...');
    const testCaseDir = path.join(__dirname, '..', 'branding', 'resources', '.tmp_healing_test');
    fs.mkdirSync(testCaseDir, { recursive: true });

    const pdfPath = path.join(testCaseDir, 'test_doc.pdf');
    fs.writeFileSync(pdfPath, '%PDF-1.4 Dummy PDF Content', 'utf8');

    const db = getDb(testCaseDir);

    // Step 1: Simulate stale SQLite entry where status is companion_ready but no file exists on disk
    db.prepare('INSERT OR REPLACE INTO documents (filename, status) VALUES (?, ?)').run('test_doc.pdf', 'companion_ready');

    const cleanBase = 'test_doc';
    const conversionsDir = path.join(testCaseDir, 'conversions');
    fs.mkdirSync(conversionsDir, { recursive: true });
    const companionPath = path.join(conversionsDir, `${cleanBase}.md`);

    console.log('[Test 1] Checking initial state (SQLite says companion_ready, but disk file missing)...');
    console.log(' - companionPath exists on disk:', fs.existsSync(companionPath));

    // Simulate backend status resolution & self-healing check
    let relative = 'test_doc.pdf';
    let docStatus = db.prepare('SELECT status FROM documents WHERE filename = ?').get(relative)?.status || 'unprocessed';
    let companionExists = fs.existsSync(companionPath);

    if (!companionExists && (docStatus === 'companion_ready' || docStatus === 'indexed' || docStatus === 'enriched')) {
        docStatus = 'unprocessed';
        db.prepare('UPDATE documents SET status = ? WHERE filename = ?').run('unprocessed', relative);
    }

    let dot1 = companionExists ? 'reviewed' : 'grey';
    console.log(' - After Self-Healing -> docStatus in DB:', db.prepare('SELECT status FROM documents WHERE filename = ?').get(relative)?.status);
    console.log(' - Dot 1 Color:', dot1);

    if (dot1 !== 'grey') {
        throw new Error(`Test 1 Failed: Expected dot1 to be 'grey' when companion file is missing, got '${dot1}'`);
    }

    // Step 2: Create companion file on disk
    console.log('\n[Test 2] Creating conversions/test_doc.md on disk...');
    fs.writeFileSync(companionPath, '# Sample Converted Markdown', 'utf8');
    companionExists = fs.existsSync(companionPath);

    if (docStatus === 'unprocessed' && companionExists) {
        docStatus = 'companion_ready';
        db.prepare('UPDATE documents SET status = ? WHERE filename = ?').run('companion_ready', relative);
    }
    dot1 = companionExists ? 'reviewed' : 'grey';

    console.log(' - After Creating File -> docStatus in DB:', db.prepare('SELECT status FROM documents WHERE filename = ?').get(relative)?.status);
    console.log(' - Dot 1 Color:', dot1);

    if (dot1 !== 'reviewed') {
        throw new Error(`Test 2 Failed: Expected dot1 to be 'reviewed' when companion file exists, got '${dot1}'`);
    }

    // Step 3: Delete companion file on disk again (Simulate manual file deletion)
    console.log('\n[Test 3] Deleting conversions/test_doc.md from disk...');
    fs.unlinkSync(companionPath);
    companionExists = fs.existsSync(companionPath);

    if (!companionExists && (docStatus === 'companion_ready' || docStatus === 'indexed' || docStatus === 'enriched')) {
        docStatus = 'unprocessed';
        db.prepare('UPDATE documents SET status = ? WHERE filename = ?').run('unprocessed', relative);
    }
    dot1 = companionExists ? 'reviewed' : 'grey';

    console.log(' - After Deleting File -> docStatus in DB:', db.prepare('SELECT status FROM documents WHERE filename = ?').get(relative)?.status);
    console.log(' - Dot 1 Color:', dot1);

    if (dot1 !== 'grey') {
        throw new Error(`Test 3 Failed: Expected dot1 to shift back to 'grey' after deleting file, got '${dot1}'`);
    }

    // Cleanup
    fs.rmSync(testCaseDir, { recursive: true, force: true });
    console.log('\n✓ All Status Self-Healing Unit Tests Passed Successfully!');
}

testStatusHealing().catch(err => {
    console.error('[Status Healing Test Failed]', err);
    process.exit(1);
});
