/**
 * Skill Module: sqlite-exporter.js
 * Part of bank-forensic-audit Skill Package
 * Leverages native Node.js v24 `node:sqlite` (zero external dependencies)
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

class SqliteExporter {
    /**
     * Exports normalized bank transactions, accounts, and red-flags into a local SQLite database
     * @param {string} caseDir - Absolute path to the case directory
     * @param {object} bankData - Ingested bank statements data
     * @param {object} forensicData - Forensic engine analysis outputs
     * @returns {string} - Absolute path to the compiled SQLite database
     */
    static exportToSqlite(caseDir, bankData = {}, forensicData = {}) {
        const ledgersDir = path.join(caseDir, 'ledgers');
        if (!fs.existsSync(ledgersDir)) {
            fs.mkdirSync(ledgersDir, { recursive: true });
        }

        const dbPath = path.join(ledgersDir, 'bank_forensic.db');
        
        // Remove existing DB file to ensure clean deterministic compilation
        if (fs.existsSync(dbPath)) {
            try {
                fs.unlinkSync(dbPath);
            } catch (e) {
                // In case locked, will overwrite tables
            }
        }

        const db = new DatabaseSync(dbPath);

        // 1. Create Schema
        db.exec(`
            CREATE TABLE IF NOT EXISTS transactions (
                id TEXT PRIMARY KEY,
                date TEXT,
                bank TEXT,
                account_no TEXT,
                source_file TEXT,
                narration TEXT,
                cleaned_narration TEXT,
                chq_ref_no TEXT,
                type TEXT,
                debit REAL,
                credit REAL,
                amount REAL,
                balance REAL,
                is_contra INTEGER DEFAULT 0,
                category TEXT,
                category_label TEXT,
                is_related_party INTEGER DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(date);
            CREATE INDEX IF NOT EXISTS idx_txn_category ON transactions(category);
            CREATE INDEX IF NOT EXISTS idx_txn_contra ON transactions(is_contra);
            CREATE INDEX IF NOT EXISTS idx_txn_bank_acc ON transactions(bank, account_no);
            CREATE INDEX IF NOT EXISTS idx_txn_amount ON transactions(amount);

            CREATE TABLE IF NOT EXISTS accounts (
                bank TEXT,
                account_no TEXT,
                source_file TEXT,
                opening_balance REAL,
                tx_count INTEGER,
                PRIMARY KEY (bank, account_no)
            );

            CREATE TABLE IF NOT EXISTS red_flags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT,
                severity TEXT,
                statutory_section TEXT,
                title TEXT,
                description TEXT,
                entity TEXT,
                total_volume REAL
            );

            CREATE TABLE IF NOT EXISTS distress_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT,
                bank TEXT,
                account_no TEXT,
                amount REAL,
                narration TEXT,
                chq_ref_no TEXT
            );

            CREATE TABLE IF NOT EXISTS pdf_forensics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT,
                verdict TEXT,
                risk_score REAL,
                is_tampered INTEGER,
                producer TEXT,
                creator TEXT,
                creation_date TEXT,
                modification_date TEXT,
                revision_count INTEGER,
                fonts_count INTEGER,
                findings_json TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_forensics_verdict ON pdf_forensics(verdict);

            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `);

        // 2. Insert Accounts
        if (Array.isArray(bankData.accounts)) {
            const insertAcc = db.prepare(`
                INSERT OR REPLACE INTO accounts (bank, account_no, source_file, opening_balance, tx_count)
                VALUES (?, ?, ?, ?, ?)
            `);
            for (const acc of bankData.accounts) {
                insertAcc.run(
                    acc.bank || 'Unknown',
                    String(acc.accountNo || 'Unspecified'),
                    acc.file || '',
                    acc.openingBalance !== null && acc.openingBalance !== undefined ? acc.openingBalance : 0,
                    acc.txnCount || 0
                );
            }
        }

        // 3. Insert Transactions
        const txns = bankData.transactions || [];
        if (txns.length > 0) {
            const insertTxn = db.prepare(`
                INSERT OR REPLACE INTO transactions (
                    id, date, bank, account_no, source_file, narration, cleaned_narration,
                    chq_ref_no, type, debit, credit, amount, balance,
                    is_contra, category, category_label, is_related_party
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            db.exec('BEGIN TRANSACTION;');
            for (const t of txns) {
                insertTxn.run(
                    t.id || `TXN_${Math.random()}`,
                    t.date || '',
                    t.bank || '',
                    String(t.account_no || ''),
                    t.source_file || '',
                    t.narration || '',
                    t.cleaned_narration || '',
                    t.chq_ref_no || '',
                    t.type || 'DEBIT',
                    t.debit || 0,
                    t.credit || 0,
                    t.amount || 0,
                    t.balance !== null && t.balance !== undefined ? t.balance : 0,
                    t.is_contra ? 1 : 0,
                    t.category || 'TRADE_OPERATIONAL',
                    t.category_label || 'Operational',
                    t.is_related_party ? 1 : 0
                );
            }
            db.exec('COMMIT;');
        }

        // 4. Insert Red Flags
        const redFlags = forensicData.redFlags || [];
        if (redFlags.length > 0) {
            const insertRf = db.prepare(`
                INSERT INTO red_flags (type, severity, statutory_section, title, description, entity, total_volume)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            for (const rf of redFlags) {
                insertRf.run(
                    rf.type || '',
                    rf.severity || 'MEDIUM',
                    rf.statutorySection || '',
                    rf.title || '',
                    rf.description || '',
                    rf.entity || '',
                    rf.totalVolume || 0
                );
            }
        }

        // 5. Insert Distress Events
        const distress = forensicData.distressMetrics || {};
        if (Array.isArray(distress.dishonoredEvents) && distress.dishonoredEvents.length > 0) {
            const insertDistress = db.prepare(`
                INSERT INTO distress_events (date, bank, account_no, amount, narration, chq_ref_no)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            for (const d of distress.dishonoredEvents) {
                insertDistress.run(
                    d.date || d.rawDate || '',
                    d.bank || '',
                    String(d.accountNo || ''),
                    d.amount || 0,
                    d.narration || '',
                    d.chqRef || ''
                );
            }
        }

        // 6. Insert PDF Forensics Reports
        const pdfReports = forensicData.pdfForensics || [];
        if (Array.isArray(pdfReports) && pdfReports.length > 0) {
            const insertPdf = db.prepare(`
                INSERT INTO pdf_forensics (
                    filename, verdict, risk_score, is_tampered, producer, creator,
                    creation_date, modification_date, revision_count, fonts_count, findings_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const p of pdfReports) {
                insertPdf.run(
                    p.filename || 'unknown.pdf',
                    p.verdict || 'GENUINE',
                    p.riskScore !== undefined ? p.riskScore : 0,
                    p.isTampered ? 1 : 0,
                    p.producer || '',
                    p.creator || '',
                    p.creationDate || '',
                    p.modificationDate || '',
                    p.revisionCount || 1,
                    p.fontsCount || 0,
                    JSON.stringify(p.findings || [])
                );
            }
        }

        // 7. Insert Metadata
        const insertMeta = db.prepare(`INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)`);
        insertMeta.run('compiled_at', new Date().toISOString());
        insertMeta.run('total_transactions', String(txns.length));
        insertMeta.run('total_accounts', String((bankData.accounts || []).length));
        if (forensicData.balanceProof) {
            insertMeta.run('balance_proof_status', forensicData.balanceProof.isBalanced ? 'BALANCED' : 'UNRECONCILED');
            insertMeta.run('balance_variance', String(forensicData.balanceProof.variance));
        }
        if (distress.earliestDishonorDate) {
            insertMeta.run('earliest_dishonor_date', distress.earliestDishonorDate);
        }

        db.close();
        return dbPath;
    }
}

module.exports = SqliteExporter;
