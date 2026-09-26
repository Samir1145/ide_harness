const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const { getConceptsDir, isValidCaseDir } = require('../pipeline/common/helper');

const connections = new Map();
const repoRoot = path.resolve(__dirname, '../..');

function isProjectRepoRoot(dir) {
    if (!dir) return false;
    try {
        const resolved = path.resolve(dir);
        if (resolved === repoRoot) return true;
        if (fs.existsSync(path.join(resolved, 'frontend/applications/electron')) &&
            fs.existsSync(path.join(resolved, 'backend/package.json'))) {
            return true;
        }
    } catch (_) {}
    return false;
}

function getDb(caseDir) {
    if (connections.has(caseDir)) {
        return connections.get(caseDir);
    }

    let dbPath;
    const dbDir = getConceptsDir(caseDir);
    if (!caseDir || isProjectRepoRoot(caseDir) || !dbDir || !isValidCaseDir(caseDir)) {
        dbPath = ':memory:';
    } else {
        dbPath = path.join(dbDir, 'case_vault.db');
    }
    
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
            vector_type TEXT DEFAULT 'legal',
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

        CREATE TABLE IF NOT EXISTS case_entities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_key TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            aliases_json TEXT,
            primary_doc TEXT,
            properties_json TEXT,
            created_at TEXT NOT NULL,
            last_updated TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_entities_type ON case_entities(entity_type);
        CREATE INDEX IF NOT EXISTS idx_entities_key ON case_entities(entity_key);

        CREATE TABLE IF NOT EXISTS case_entity_edges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_key TEXT NOT NULL,
            target_key TEXT NOT NULL,
            edge_type TEXT NOT NULL,
            severity TEXT DEFAULT 'info',
            source_doc TEXT,
            target_doc TEXT,
            details_json TEXT,
            created_at TEXT NOT NULL,
            last_updated TEXT NOT NULL,
            UNIQUE(source_key, target_key, edge_type) ON CONFLICT REPLACE
        );
        CREATE INDEX IF NOT EXISTS idx_edges_source ON case_entity_edges(source_key);
        CREATE INDEX IF NOT EXISTS idx_edges_target ON case_entity_edges(target_key);
        CREATE INDEX IF NOT EXISTS idx_edges_type ON case_entity_edges(edge_type);
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

    // Self-healing migration: Add 'vector_type', 'model_name', and 'dimension' columns to document_vectors if they do not exist
    try {
        const vecColumns = db.prepare('PRAGMA table_info(document_vectors)').all();
        const hasVectorType = vecColumns.some(col => col.name === 'vector_type');
        if (!hasVectorType) {
            db.exec("ALTER TABLE document_vectors ADD COLUMN vector_type TEXT DEFAULT 'legal';");
            console.log('[SQLite Store] Altered table document_vectors to add vector_type column.');
        }
        const hasModelName = vecColumns.some(col => col.name === 'model_name');
        if (!hasModelName) {
            db.exec("ALTER TABLE document_vectors ADD COLUMN model_name TEXT DEFAULT 'nomic-embed-text-v1.5';");
            console.log('[SQLite Store] Altered table document_vectors to add model_name column.');
        }
        const hasDimension = vecColumns.some(col => col.name === 'dimension');
        if (!hasDimension) {
            db.exec("ALTER TABLE document_vectors ADD COLUMN dimension INTEGER DEFAULT 768;");
            console.log('[SQLite Store] Altered table document_vectors to add dimension column.');
        }
    } catch (e) {
        console.error('[SQLite Store] Failed to check/alter document_vectors table:', e.message);
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
