const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const connections = new Map();

function getDb(caseDir) {
    if (connections.has(caseDir)) {
        return connections.get(caseDir);
    }
    const dbDir = path.join(caseDir, 'concepts');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, 'case_vault.db');
    
    let db;
    try {
        db = new DatabaseSync(dbPath);
    } catch (err) {
        console.error(`[SQLite Store] Failed to open DB at ${dbPath}:`, err.message);
        throw err;
    }
    
    // Enable WAL mode for high performance concurrency
    try {
        db.exec('PRAGMA journal_mode = WAL;');
    } catch (_) {}
    
    // Setup tables
    db.exec(`
        CREATE TABLE IF NOT EXISTS documents (
            filename TEXT PRIMARY KEY,
            title TEXT,
            status TEXT,
            size_bytes INTEGER,
            priority INTEGER DEFAULT 5,
            extracted_at TEXT,
            indexed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS document_sections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT,
            title TEXT,
            page_start INTEGER,
            page_end INTEGER,
            parent_title TEXT,
            hierarchy_level INTEGER,
            content TEXT,
            FOREIGN KEY(filename) REFERENCES documents(filename) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS case_facts (
            key TEXT PRIMARY KEY,
            filename TEXT,
            value TEXT,
            source_clause TEXT,
            verified_by_user INTEGER DEFAULT 0,
            last_updated TEXT
        );

        CREATE TABLE IF NOT EXISTS qna_cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT,
            section_title TEXT,
            question TEXT,
            answer TEXT,
            page_number INTEGER,
            FOREIGN KEY(filename) REFERENCES documents(filename) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS compliance_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT,
            risk_level TEXT,
            rule_violated TEXT,
            description TEXT,
            remediation TEXT,
            FOREIGN KEY(filename) REFERENCES documents(filename) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS case_archive (
            filepath TEXT PRIMARY KEY,
            file_blob BLOB,
            mime_type TEXT,
            last_modified TEXT,
            sha256_hash TEXT
        );

        CREATE TABLE IF NOT EXISTS secure_secrets (
            secret_key TEXT PRIMARY KEY,
            secret_value TEXT
        );

        CREATE TABLE IF NOT EXISTS document_vectors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT,
            section_title TEXT,
            page_number INTEGER,
            chunk_index INTEGER,
            content TEXT,
            vector_blob BLOB,
            FOREIGN KEY(filename) REFERENCES documents(filename) ON DELETE CASCADE
        );
    `);

    // Setup FTS5 virtual table
    try {
        db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS fts_chunks USING fts5(
                filename UNINDEXED,
                section_title UNINDEXED,
                page_number UNINDEXED,
                chunk_index UNINDEXED,
                content
            );
        `);
    } catch (e) {
        console.error('[SQLite Store] Failed to create FTS5 virtual table:', e.message);
    }

    connections.set(caseDir, db);
    return db;
}

function closeDb(caseDir) {
    if (connections.has(caseDir)) {
        try {
            connections.get(caseDir).close();
        } catch (_) {}
        connections.delete(caseDir);
    }
}

function closeAllDbs() {
    for (const [caseDir, db] of connections.entries()) {
        try {
            db.close();
        } catch (_) {}
    }
    connections.clear();
}

module.exports = {
    getDb,
    closeDb,
    closeAllDbs
};
