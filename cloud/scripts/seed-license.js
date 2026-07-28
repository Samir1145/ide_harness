/**
 * scripts/seed-license.js
 * ─────────────────────────────────────────────────────────────────
 * Insert or update license records in licenses.db.
 *
 * Usage:
 *   node scripts/seed-license.js
 *
 * Edit the LICENSES array below to add new keys before seeding.
 * For production, add keys here and re-run before each release.
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { getDb } = require('../db');

// ── Add your license keys here ────────────────────────────────────
//
// vaultKeyHex: the 64-char VAULT_KEY for that vault type.
//              All "cases" licenses share the same cases vault key,
//              all "laws" licenses share the laws vault key, etc.
//
//              Store these securely — they are read from .env below.
//
const VAULT_KEYS = {
  laws:      process.env.VAULT_KEY_LAWS      || '',
  cases:     process.env.VAULT_KEY_CASES     || '',
  documents: process.env.VAULT_KEY_DOCUMENTS || '',
  forms:     process.env.VAULT_KEY_FORMS     || '',
};

// ── Licenses to seed (add new ones here monthly) ──────────────────
const LICENSES = [
  // Test license — safe to commit (uses test keys from .env)
  {
    key:         'HAYG-TEST-0000-0001',
    vaultType:   'cases',
    email:       'test@hayagriva.app',
  },
  {
    key:         'HAYG-TEST-0000-0002',
    vaultType:   'laws',
    email:       'test@hayagriva.app',
  },
  // ── Add real licenses below before running seed ──────────────
  // { key: 'HAYG-XXXX-XXXX-XXXX', vaultType: 'cases', email: 'client@example.com' },
];

// ── Seed ──────────────────────────────────────────────────────────
function seed() {
  const db = getDb();

  let inserted = 0;
  let skipped  = 0;

  const upsert = db.prepare(`
    INSERT INTO licenses (key, vault_type, vault_key_hex, email)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      vault_key_hex = excluded.vault_key_hex,
      email         = excluded.email
  `);

  for (const lic of LICENSES) {
    const vaultKey = VAULT_KEYS[lic.vaultType];
    if (!vaultKey || vaultKey.length !== 64) {
      console.warn(`[seed] ⚠ Skipping ${lic.key} — VAULT_KEY_${lic.vaultType.toUpperCase()} not set or invalid in .env`);
      skipped++;
      continue;
    }

    upsert.run(lic.key, lic.vaultType, vaultKey, lic.email || null);
    console.log(`[seed] ✓ ${lic.key}  type=${lic.vaultType}  email=${lic.email || '—'}`);
    inserted++;
  }

  console.log(`\n[seed] Done — ${inserted} inserted/updated, ${skipped} skipped.`);
}

seed();
