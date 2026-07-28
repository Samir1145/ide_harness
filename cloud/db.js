/**
 * db.js — SQLite license store for api.hayagriva.app
 *
 * Schema:
 *   licenses(key, vault_type, vault_key_hex, email, issued_at, activated_at, revoked)
 *
 * The vault_key_hex is stored per-license row so different vault types
 * can carry different keys, and individual licenses can be revoked cleanly.
 */

'use strict';

const path    = require('path');
const fs      = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'licenses.db');

let _db = null;

function getDb() {
  if (_db) return _db;

  // Ensure directory exists (for Railway volume mounts)
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // ── Create tables if not present ──────────────────────────────
  _db.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
      key           TEXT PRIMARY KEY,
      vault_type    TEXT NOT NULL,
      vault_key_hex TEXT NOT NULL,
      email         TEXT,
      issued_at     TEXT NOT NULL DEFAULT (datetime('now')),
      activated_at  TEXT,
      revoked       INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_licenses_vault_type ON licenses(vault_type);
    CREATE INDEX IF NOT EXISTS idx_licenses_email      ON licenses(email);
  `);

  return _db;
}

// ── Queries ───────────────────────────────────────────────────────

/**
 * Look up a license key. Returns the row or null.
 */
function findLicense(key) {
  return getDb()
    .prepare('SELECT * FROM licenses WHERE key = ?')
    .get(key) || null;
}

/**
 * Mark a license as activated (record first-use timestamp).
 * Idempotent — safe to call on every activation request.
 */
function touchActivated(key) {
  getDb()
    .prepare(`
      UPDATE licenses
      SET activated_at = COALESCE(activated_at, datetime('now'))
      WHERE key = ?
    `)
    .run(key);
}

/**
 * Insert a new license (used by seed script and admin tooling).
 */
function insertLicense({ key, vaultType, vaultKeyHex, email }) {
  getDb()
    .prepare(`
      INSERT INTO licenses (key, vault_type, vault_key_hex, email)
      VALUES (?, ?, ?, ?)
    `)
    .run(key, vaultType, vaultKeyHex, email || null);
}

/**
 * Revoke a license (prevents future activations).
 */
function revokeLicense(key) {
  getDb()
    .prepare('UPDATE licenses SET revoked = 1 WHERE key = ?')
    .run(key);
}

module.exports = { getDb, findLicense, touchActivated, insertLicense, revokeLicense };
