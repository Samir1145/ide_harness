// backend/lib/core/license-manager.js
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const TOLERANCE_DRIFT_MS = 5 * 60 * 1000; // 5 minutes tolerance for legitimate NTP sync
const DEFAULT_MAX_HOURS = 150.0; // 150 active agent hours default
const DEFAULT_MAX_TURNS = 1000;  // 1,000 drafting turns default

// Global licensing vault path in user home directory to prevent case-reset bypass
function getGlobalVaultDbPath() {
    const home = process.env.HOME || process.env.USERPROFILE || '.';
    const dir = path.join(home, '.hayagriva');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, 'license_vault.db');
}

// In-memory monotonic anchor latch
let _reanchorState = null; // { epochMs, hrtimeBigInt }

/**
 * Connects to the local SQLite license store and ensures schema.
 */
function getLicenseDb(customDbPath) {
    const dbPath = customDbPath || getGlobalVaultDbPath();
    const db = new DatabaseSync(dbPath);

    db.exec(`
        CREATE TABLE IF NOT EXISTS license_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            license_key TEXT,
            licensee TEXT,
            tier TEXT NOT NULL,
            status TEXT NOT NULL,
            issued_at TEXT,
            valid_until TEXT,
            max_active_hours REAL,
            accumulated_active_seconds REAL NOT NULL,
            max_agent_turns INTEGER,
            turns_used INTEGER NOT NULL,
            max_wall_clock INTEGER NOT NULL,
            last_reanchor_utc TEXT,
            last_heartbeat_at TEXT,
            tamper_reason TEXT
        );
    `);

    // Ensure single state row
    const row = db.prepare('SELECT id FROM license_state WHERE id = 1').get();
    if (!row) {
        const now = Date.now();
        const stmt = db.prepare(`
            INSERT INTO license_state (
                id, license_key, licensee, tier, status, issued_at, valid_until,
                max_active_hours, accumulated_active_seconds, max_agent_turns, turns_used,
                max_wall_clock, last_reanchor_utc, last_heartbeat_at, tamper_reason
            ) VALUES (
                1, NULL, 'Evaluation User', 'trial', 'ACTIVE', ?, ?,
                ?, 0.0, ?, 0,
                ?, NULL, ?, NULL
            )
        `);
        const validUntil = new Date(now + 30 * 86400000).toISOString();
        stmt.run(
            new Date(now).toISOString(),
            validUntil,
            DEFAULT_MAX_HOURS,
            DEFAULT_MAX_TURNS,
            now,
            new Date(now).toISOString()
        );
    }

    return db;
}

/**
 * Checks whether the right-panel agentic engine is permitted to execute.
 * Immune to client clock rollbacks and enforces monotonic active hours.
 * 
 * @param {string} [caseDir]
 * @param {string} [customDbPath]
 * @returns {{ allowed: boolean, status: string, reason?: string, message?: string, stats?: object }}
 */
function checkAgentAccess(caseDir = '', customDbPath = null) {
    const db = getLicenseDb(customDbPath);
    const row = db.prepare('SELECT * FROM license_state WHERE id = 1').get();

    let effectiveNow = Date.now();
    let isReanchored = false;

    // If authoritative network anchor exists, compute effective time monotonically from kernel
    if (_reanchorState) {
        const elapsedMs = Number(process.hrtime.bigint() - _reanchorState.hrtimeBigInt) / 1e6;
        effectiveNow = Math.round(_reanchorState.epochMs + elapsedMs);
        isReanchored = true;
    }

    // 1. Clock Rollback Detection (High-Water Mark)
    // Only check local system clock if NOT reanchored from authoritative server
    if (!isReanchored && effectiveNow < (row.max_wall_clock - TOLERANCE_DRIFT_MS)) {
        const rollbackDeltaMins = Math.round((row.max_wall_clock - effectiveNow) / 60000);
        const updateTamper = db.prepare(`
            UPDATE license_state
            SET status = 'TAMPERED',
                tamper_reason = ?
            WHERE id = 1
        `);
        const reason = `System clock rollback detected: current time is ${rollbackDeltaMins} mins behind recorded ledger timestamp.`;
        updateTamper.run(reason);

        return {
            allowed: false,
            status: 'TAMPERED',
            reason: reason,
            message: 'System clock alteration detected. Agentic assistance paused until re-anchored with Resolution Bazaar.'
        };
    }

    // Advance high-water mark forward
    const newMax = Math.max(row.max_wall_clock, effectiveNow);
    db.prepare('UPDATE license_state SET max_wall_clock = ?, last_heartbeat_at = ? WHERE id = 1')
      .run(newMax, new Date(effectiveNow).toISOString());

    // 2. Prior Tamper Lockout
    if (row.status === 'TAMPERED' && !isReanchored) {
        return {
            allowed: false,
            status: 'TAMPERED',
            reason: row.tamper_reason || 'Clock tampering recorded.',
            message: 'System clock alteration detected. Connect to Resolution Bazaar or enter a valid renewal key.'
        };
    }

    // 3. Monotonic Active Hours Limit
    const activeHoursUsed = row.accumulated_active_seconds / 3600.0;
    if (row.max_active_hours > 0 && activeHoursUsed >= row.max_active_hours) {
        db.prepare("UPDATE license_state SET status = 'EXPIRED', tamper_reason = 'Active operating hours exhausted' WHERE id = 1").run();
        return {
            allowed: false,
            status: 'EXPIRED',
            reason: `Active agent hours exhausted (${activeHoursUsed.toFixed(1)} / ${row.max_active_hours} hrs).`,
            message: 'Your active agent working-hours budget has been reached. Please renew to continue autonomous drafting.'
        };
    }

    // 4. Action Turn Budget
    if (row.max_agent_turns > 0 && row.turns_used >= row.max_agent_turns) {
        db.prepare("UPDATE license_state SET status = 'EXHAUSTED', tamper_reason = 'Agent action turns quota reached' WHERE id = 1").run();
        return {
            allowed: false,
            status: 'EXHAUSTED',
            reason: `Agent drafting quota exhausted (${row.turns_used} / ${row.max_agent_turns} turns).`,
            message: 'Agent drafting quota reached. Please replenish your action credits.'
        };
    }

    // 5. Calendar Expiration (against effective monotonically tracked time)
    if (row.valid_until) {
        const expiryEpoch = new Date(row.valid_until).getTime();
        if (effectiveNow > expiryEpoch) {
            db.prepare("UPDATE license_state SET status = 'EXPIRED', tamper_reason = 'License expired' WHERE id = 1").run();
            return {
                allowed: false,
                status: 'EXPIRED',
                reason: `License expired on ${row.valid_until}.`,
                message: 'Your agentic lease has expired. Workspace files and local search remain 100% accessible.'
            };
        }
    }

    return {
        allowed: true,
        status: 'ACTIVE',
        stats: {
            licensee: row.licensee,
            tier: row.tier,
            active_hours_used: parseFloat(activeHoursUsed.toFixed(2)),
            max_active_hours: row.max_active_hours,
            turns_used: row.turns_used,
            max_agent_turns: row.max_agent_turns,
            valid_until: row.valid_until
        }
    };
}

/**
 * Records the completion of an agent turn, accumulating monotonic seconds.
 * 
 * @param {string} caseDir
 * @param {number} durationSeconds - Monotonic duration from process.hrtime
 * @param {string} [customDbPath]
 */
function recordAgentTurn(caseDir = '', durationSeconds = 0, customDbPath = null) {
    const db = getLicenseDb(customDbPath);
    const addedSecs = Math.max(0, parseFloat(durationSeconds) || 0);
    const stmt = db.prepare(`
        UPDATE license_state
        SET accumulated_active_seconds = accumulated_active_seconds + ?,
            turns_used = turns_used + 1,
            last_heartbeat_at = ?
        WHERE id = 1
    `);
    stmt.run(addedSecs, new Date().toISOString());
}

/**
 * Re-anchors the high-water mark against an authoritative server timestamp.
 * Recovers from clock rollback errors when connected to Resolution Bazaar.
 * 
 * @param {string|number} serverUtcTimestamp - ISO string or epoch ms from server
 * @param {string} [customDbPath]
 */
function reanchorFromNetwork(serverUtcTimestamp, customDbPath = null) {
    if (!serverUtcTimestamp) return;
    const epoch = typeof serverUtcTimestamp === 'number'
        ? serverUtcTimestamp
        : new Date(serverUtcTimestamp).getTime();

    if (isNaN(epoch) || epoch < 1700000000000) return; // Basic sanity check

    const db = getLicenseDb(customDbPath);
    const row = db.prepare('SELECT * FROM license_state WHERE id = 1').get();

    let newStatus = row.status;
    let tamperReason = row.tamper_reason;

    // If previously marked TAMPERED, check if server time is within valid lease
    if (row.status === 'TAMPERED') {
        const expiryEpoch = row.valid_until ? new Date(row.valid_until).getTime() : Infinity;
        if (epoch <= expiryEpoch) {
            newStatus = 'ACTIVE';
            tamperReason = null;
        } else {
            newStatus = 'EXPIRED';
            tamperReason = 'License expired based on server authoritative timestamp.';
        }
    }

    _reanchorState = {
        epochMs: epoch,
        hrtimeBigInt: process.hrtime.bigint()
    };

    const stmt = db.prepare(`
        UPDATE license_state
        SET max_wall_clock = MAX(max_wall_clock, ?),
            last_reanchor_utc = ?,
            status = ?,
            tamper_reason = ?
        WHERE id = 1
    `);
    stmt.run(epoch, new Date(epoch).toISOString(), newStatus, tamperReason);

    return { success: true, reanchored_at: new Date(epoch).toISOString(), status: newStatus };
}

/**
 * Activates a cryptographically signed license key.
 * 
 * @param {string} licenseKey
 * @param {string} [caseDir]
 * @param {string} [customDbPath]
 */
function activateLicense(licenseKey, caseDir = '', customDbPath = null) {
    const { validateLicenseEnvelope } = require('../utils/license-validator');
    const verification = validateLicenseEnvelope(licenseKey);

    if (!verification.valid) {
        return { success: false, error: verification.error };
    }

    const payload = verification.payload;
    const db = getLicenseDb(customDbPath);
    const now = Date.now();

    const stmt = db.prepare(`
        UPDATE license_state
        SET license_key = ?,
            licensee = ?,
            tier = ?,
            status = 'ACTIVE',
            issued_at = ?,
            valid_until = ?,
            max_active_hours = ?,
            accumulated_active_seconds = 0.0,
            max_agent_turns = ?,
            turns_used = 0,
            max_wall_clock = MAX(max_wall_clock, ?),
            last_heartbeat_at = ?,
            tamper_reason = NULL
        WHERE id = 1
    `);

    stmt.run(
        licenseKey,
        payload.sub || 'Licensed Practitioner',
        payload.tier || 'professional',
        payload.issued_at || new Date(now).toISOString(),
        payload.valid_until || payload.expiresAt || new Date(now + 365 * 86400000).toISOString(),
        payload.max_active_hours || DEFAULT_MAX_HOURS,
        payload.max_agent_turns || DEFAULT_MAX_TURNS,
        now,
        new Date(now).toISOString()
    );

    return {
        success: true,
        licensee: payload.sub,
        tier: payload.tier,
        valid_until: payload.valid_until || payload.expiresAt
    };
}

/**
 * Returns full diagnostic status of the licensing vault.
 */
function getLicenseStatus(customDbPath = null) {
    const db = getLicenseDb(customDbPath);
    const row = db.prepare('SELECT * FROM license_state WHERE id = 1').get();
    const activeHoursUsed = row.accumulated_active_seconds / 3600.0;
    return {
        licensee: row.licensee,
        tier: row.tier,
        status: row.status,
        issued_at: row.issued_at,
        valid_until: row.valid_until,
        accumulated_active_seconds: row.accumulated_active_seconds,
        active_hours_used: parseFloat(activeHoursUsed.toFixed(4)),
        max_active_hours: row.max_active_hours,
        turns_used: row.turns_used,
        max_agent_turns: row.max_agent_turns,
        max_wall_clock_iso: new Date(row.max_wall_clock).toISOString(),
        last_reanchor_utc: row.last_reanchor_utc,
        tamper_reason: row.tamper_reason
    };
}

module.exports = {
    getLicenseDb,
    checkAgentAccess,
    recordAgentTurn,
    reanchorFromNetwork,
    activateLicense,
    getLicenseStatus
};
