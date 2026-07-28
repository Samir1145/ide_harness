const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDb } = require('./sqlite-store');

async function archiveCase(caseDir) {
    console.log(`[Archive Service] Archiving case workspace: ${caseDir}`);
    const db = getDb(caseDir);
    
    // Clear old archive data
    db.exec('DELETE FROM case_archive;');
    
    const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO case_archive (filepath, file_blob, mime_type, last_modified, sha256_hash)
        VALUES (?, ?, ?, ?, ?)
    `);

    const scanAndArchive = (dir) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            const lower = file.toLowerCase();
            
            if (stat.isDirectory()) {
                // Do not archive the concepts directory (it contains this database itself!)
                if (lower !== 'concepts' && 
                    lower !== 'node_modules' && 
                    lower !== '.git' && 
                    lower !== 'build' && 
                    lower !== 'dist' && 
                    lower !== 'out') {
                    scanAndArchive(filePath);
                }
            } else {
                // Skip database files
                if (lower.endsWith('.db') || lower.endsWith('.db-wal') || lower.endsWith('.db-shm')) {
                    continue;
                }
                const relative = path.relative(caseDir, filePath).replace(/\\/g, '/');
                const file_blob = fs.readFileSync(filePath);
                const last_modified = stat.mtime.toISOString();
                const sha256_hash = crypto.createHash('sha256').update(file_blob).digest('hex');
                
                let mime_type = 'text/plain';
                if (lower.endsWith('.pdf')) mime_type = 'application/pdf';
                else if (lower.endsWith('.docx')) mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                else if (lower.endsWith('.xlsx')) mime_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                else if (lower.endsWith('.json')) mime_type = 'application/json';
                else if (lower.endsWith('.md')) mime_type = 'text/markdown';
                
                insertStmt.run(relative, file_blob, mime_type, last_modified, sha256_hash);
                console.log(`[Archive Service] Packed: ${relative} (${file_blob.length} bytes)`);
            }
        }
    };

    scanAndArchive(caseDir);
    console.log(`[Archive Service] Case archived successfully in database.`);
}

async function restoreCase(caseDir) {
    console.log(`[Archive Service] Restoring case workspace: ${caseDir}`);
    const db = getDb(caseDir);
    
    let rows;
    try {
        const query = db.prepare('SELECT filepath, file_blob FROM case_archive');
        rows = query.all();
    } catch (e) {
        console.error(`[Archive Service] Failed to select from case_archive:`, e.message);
        return false;
    }
    
    if (rows.length === 0) {
        console.warn(`[Archive Service] No files found in case_archive to restore.`);
        return false;
    }

    for (const row of rows) {
        const relative = row.filepath;
        const blob = row.file_blob;
        const destPath = path.join(caseDir, relative);
        
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, blob);
        console.log(`[Archive Service] Restored file: ${relative} (${blob.length} bytes)`);
    }
    
    console.log(`[Archive Service] Case workspace restored successfully.`);
    return true;
}

module.exports = {
    archiveCase,
    restoreCase
};
