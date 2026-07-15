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
        db.exec('PRAGMA busy_timeout = 5000;');
    } catch (_) {}
    
    // Load sqlite-vss extension dynamically if available
    let vssLoaded = false;
    try {
        if (typeof db.loadExtension === 'function') {
            db.loadExtension('vss0');
            vssLoaded = true;
            console.log('[SQLite Store] Native sqlite-vss extension successfully loaded.');
        }
    } catch (e) {
        console.warn(`[SQLite Store] sqlite-vss native extension could not be loaded: ${e.message}. Using in-memory fallback.`);
    }
    db.vssEnabled = vssLoaded;
    
    // Setup tables
    db.exec(`
        CREATE TABLE IF NOT EXISTS documents (
            filename TEXT PRIMARY KEY,
            title TEXT,
            status TEXT,
            size_bytes INTEGER,
            priority INTEGER DEFAULT 5,
            extracted_at TEXT,
            indexed_at TEXT,
            hash TEXT
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

        CREATE TABLE IF NOT EXISTS claims (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            creditor TEXT,
            claimed_amount REAL,
            admitted_amount REAL,
            admitted_interest REAL,
            rejected_amount REAL,
            rejection_reason TEXT,
            claim_date TEXT,
            status TEXT,
            last_updated TEXT
        );

        CREATE TABLE IF NOT EXISTS avoidance_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_date TEXT,
            amount REAL,
            debited_account TEXT,
            credited_party TEXT,
            related_party_status TEXT,
            applicable_section TEXT,
            forensic_notes TEXT,
            last_updated TEXT
        );
    `);

    // Self-healing migration: Add 'hash' column to documents if it does not exist
    try {
        const columns = db.prepare('PRAGMA table_info(documents)').all();
        const hasHash = columns.some(col => col.name === 'hash');
        if (!hasHash) {
            db.exec('ALTER TABLE documents ADD COLUMN hash TEXT;');
            console.log('[SQLite Store] Altered table documents to add hash column.');
        }
    } catch (e) {
        console.error('[SQLite Store] Failed to check/alter documents table:', e.message);
    }

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

    // Setup sqlite-vss virtual table if enabled
    if (db.vssEnabled) {
        try {
            db.exec(`
                CREATE VIRTUAL TABLE IF NOT EXISTS vss_document_vectors USING vss0(
                    vector_blob(384)
                );
            `);
            console.log('[SQLite Store] vss_document_vectors virtual table initialized.');
        } catch (e) {
            console.error('[SQLite Store] Failed to create vss_document_vectors virtual table:', e.message);
        }
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
