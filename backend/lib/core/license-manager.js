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
            tamper_reason TEXT,
            initial_kyc_completed INTEGER DEFAULT 0,
            stage2_valid_until TEXT
        );
    `);

    // Self-healing schema migrations for existing vaults
    try { db.exec("ALTER TABLE license_state ADD COLUMN initial_kyc_completed INTEGER DEFAULT 1;"); } catch (_) {}
    try { db.exec("ALTER TABLE license_state ADD COLUMN stage2_valid_until TEXT;"); } catch (_) {}
    try { db.exec("ALTER TABLE license_state ADD COLUMN trial_started_at TEXT;"); } catch (_) {}
    try { db.exec("ALTER TABLE license_state ADD COLUMN trial_expires_at TEXT;"); } catch (_) {}
    try { db.exec("ALTER TABLE license_state ADD COLUMN trial_consumed INTEGER DEFAULT 0;"); } catch (_) {}

    // Ensure single state row
    const row = db.prepare('SELECT id, license_key FROM license_state WHERE id = 1').get();
    if (!row) {
        const now = Date.now();
        const stmt = db.prepare(`
            INSERT INTO license_state (
                id, license_key, licensee, tier, status, issued_at, valid_until,
                max_active_hours, accumulated_active_seconds, max_agent_turns, turns_used,
                max_wall_clock, last_reanchor_utc, last_heartbeat_at, tamper_reason,
                initial_kyc_completed, stage2_valid_until
            ) VALUES (
                1, NULL, 'Unactivated User', 'starter', 'UNACTIVATED', ?, ?,
                ?, 0.0, ?, 0,
                ?, NULL, ?, NULL,
                0, NULL
            )
        `);
        // New installs start as UNACTIVATED until ₹1 KYC payment
        stmt.run(
            new Date(now).toISOString(),
            null,
            DEFAULT_MAX_HOURS,
            DEFAULT_MAX_TURNS,
            now,
            new Date(now).toISOString()
        );
    }

    return db;
}

/**
 * Checks Tri-Tier Hybrid Access:
 * Stage 1 (DMS): Perpetual lifetime free workbench (₹0, zero KYC).
 * Stage 2 (Local AI & Autonomous Agents): 7-day free trial, then ₹25,000/year subscription.
 * Stage 3 (Global Cloud): Always allowed, pay-per-use via Resolution Bazaar.
 *
 * @param {string} [caseDir]
 * @param {string} [customDbPath]
 */
function checkTriTierAccess(caseDir = '', customDbPath = null) {
    const db = getLicenseDb(customDbPath);
    const row = db.prepare('SELECT * FROM license_state WHERE id = 1').get();

    let effectiveNow = Date.now();
    if (_reanchorState) {
        const elapsedMs = Number(process.hrtime.bigint() - _reanchorState.hrtimeBigInt) / 1e6;
        effectiveNow = Math.round(_reanchorState.epochMs + elapsedMs);
    }

    const isSubscribed = Boolean(row.license_key && row.status !== 'TAMPERED' && (!row.valid_until || new Date(row.valid_until).getTime() > effectiveNow));
    const subExpiry = row.stage2_valid_until || row.valid_until;
    const subEpoch = subExpiry ? new Date(subExpiry).getTime() : 0;
    const subDaysRemaining = (isSubscribed && subEpoch > effectiveNow) ? Math.ceil((subEpoch - effectiveNow) / 86400000) : 0;

    const trialEpoch = row.trial_expires_at ? new Date(row.trial_expires_at).getTime() : 0;
    const inTrial = Boolean(row.trial_consumed && trialEpoch && effectiveNow <= trialEpoch && row.status !== 'TAMPERED');
    const trialExpired = Boolean(row.trial_consumed && trialEpoch && effectiveNow > trialEpoch);
    const trialAvailable = Boolean(!row.trial_consumed && !isSubscribed);
    const trialDaysRemaining = inTrial ? Math.ceil((trialEpoch - effectiveNow) / 86400000) : 0;

    let stage2Status = 'TRIAL_AVAILABLE';
    let stage2Allowed = false;
    let stage2Mode = 'none';
    let stage2DaysRem = 0;
    let stage2Reason = null;

    if (row.status === 'TAMPERED') {
        stage2Status = 'TAMPERED';
        stage2Reason = row.tamper_reason || 'System clock alteration detected.';
    } else if (isSubscribed) {
        stage2Status = 'ACTIVE';
        stage2Allowed = true;
        stage2Mode = 'annual_pro';
        stage2DaysRem = subDaysRemaining;
    } else if (inTrial) {
        stage2Status = 'ACTIVE';
        stage2Allowed = true;
        stage2Mode = 'trial';
        stage2DaysRem = trialDaysRemaining;
    } else if (trialExpired) {
        stage2Status = 'TRIAL_EXPIRED';
        stage2Reason = 'Your 7-day free trial has concluded. Subscribe to Hayagriva Pro (₹25,000/year) to unlock autonomous agents.';
    } else {
        stage2Status = 'TRIAL_AVAILABLE';
        stage2Reason = 'Start your 7-day free trial of autonomous IBC agents.';
        stage2DaysRem = 7;
    }

    return {
        initial_kyc_completed: true, // Stage 1 is free out-of-the-box, no upfront KYC needed
        workbench_free: true,
        status: stage2Status,
        tier: isSubscribed ? (row.tier || 'pro') : (inTrial ? 'trial' : 'starter'),
        licensee: row.licensee,
        is_subscribed: isSubscribed,
        in_trial: inTrial,
        trial_available: trialAvailable,
        trial_expired: trialExpired,
        trial_days_remaining: trialDaysRemaining,
        trial_expires_at: row.trial_expires_at,
        stage1_dms: {
            allowed: true,
            status: 'ACTIVE',
            mode: 'perpetual_free',
            reason: null
        },
        stage2_local: {
            allowed: stage2Allowed,
            status: stage2Status,
            mode: stage2Mode,
            valid_until: isSubscribed ? subExpiry : (inTrial ? row.trial_expires_at : null),
            days_remaining: stage2DaysRem,
            reason: stage2Reason
        },
        stage3_global: {
            allowed: true,
            status: 'ACTIVE',
            mode: 'pay_per_use',
            billing: 'resolution_bazaar_diligence_ledger'
        }
    };
}

/**
 * Starts the 7-day free trial for autonomous agents.
 * 
 * @param {number} [trialDays=7]
 * @param {string} [customDbPath]
 */
function startTrial(trialDays = 7, customDbPath = null) {
    const db = getLicenseDb(customDbPath);
    const row = db.prepare('SELECT * FROM license_state WHERE id = 1').get();

    if (row.trial_consumed) {
        return {
            success: false,
            error: 'Trial has already been consumed on this device.',
            trial_expires_at: row.trial_expires_at,
            expired: true
        };
    }

    const now = Date.now();
    const expiresAt = new Date(now + trialDays * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
        UPDATE license_state
        SET trial_started_at = ?,
            trial_expires_at = ?,
            trial_consumed = 1,
            status = 'TRIAL_ACTIVE',
            stage2_valid_until = ?
        WHERE id = 1
    `).run(new Date(now).toISOString(), expiresAt, expiresAt);

    return {
        success: true,
        trial_started_at: new Date(now).toISOString(),
        trial_expires_at: expiresAt,
        days_remaining: trialDays
    };
}

/**
 * Checks whether an agentic engine or specific agent handle is permitted to execute.
 * Stage 3 Global Agents (@Precedent, @Forensic) are always allowed (pay-per-use).
 * Stage 1 DMS tasks are allowed unconditionally (perpetual free workbench).
 * Stage 2 Local Agents are gated by the 7-day trial or ₹25,000 annual subscription.
 *
 * @param {string} [caseDir]
 * @param {string} [customDbPath]
 * @param {string} [agentHandle]
 * @returns {{ allowed: boolean, status: string, reason?: string, message?: string, stats?: object, stage?: number, payPerUse?: boolean }}
 */
function checkAgentAccess(caseDir = '', customDbPath = null, agentHandle = null) {
    const tri = checkTriTierAccess(caseDir, customDbPath);
    const db = getLicenseDb(customDbPath);
    const row = db.prepare('SELECT * FROM license_state WHERE id = 1').get();

    // 1. Stage 3 Global Cloud Agents (@Precedent, @Forensic, Bank Analyzer)
    const normHandle = String(agentHandle || '').toLowerCase().replace(/^@/, '');
    const isStage3Agent = [
        'precedent', 'precedents', 'forensic', 'bank_analyzer',
        'bank-analyzer', 'bank_forensic', 'cashflow_agent', 'resolutionbazaar'
    ].includes(normHandle);

    if (isStage3Agent) {
        return {
            allowed: true,
            status: 'ACTIVE',
            stage: 3,
            isStage3Global: true,
            payPerUse: true,
            message: 'Stage 3 Global Agent active via Resolution Bazaar Pay-Per-Use.'
        };
    }

    // 2. Stage 1 Deterministic DMS Tasks (Always Allowed Free Forever)
    const isStage1Task = [
        'dms', 'skeletons', 'templates', 'bare_acts', 'template_inventory'
    ].includes(normHandle);

    if (isStage1Task) {
        return {
            allowed: true,
            status: 'ACTIVE',
            stage: 1,
            message: 'Stage 1 Lifetime DMS Active (Free Forever).'
        };
    }

    let effectiveNow = Date.now();
    let isReanchored = false;
    if (_reanchorState) {
        const elapsedMs = Number(process.hrtime.bigint() - _reanchorState.hrtimeBigInt) / 1e6;
        effectiveNow = Math.round(_reanchorState.epochMs + elapsedMs);
        isReanchored = true;
    }

    // 3. Clock Rollback Detection (High-Water Mark)
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
            stage: 2,
            reason: reason,
            message: 'System clock alteration detected. Connect to Resolution Bazaar or enter a valid renewal key.'
        };
    }

    // Advance high-water mark forward
    const newMax = Math.max(row.max_wall_clock, effectiveNow);
    db.prepare('UPDATE license_state SET max_wall_clock = ?, last_heartbeat_at = ? WHERE id = 1')
      .run(newMax, new Date(effectiveNow).toISOString());

    // 4. Prior Tamper Lockout
    if (row.status === 'TAMPERED' && !isReanchored) {
        return {
            allowed: false,
            status: 'TAMPERED',
            stage: 2,
            reason: row.tamper_reason || 'Clock tampering recorded.',
            message: 'System clock alteration detected. Connect to Resolution Bazaar or enter a valid renewal key.'
        };
    }

    // 5. Stage 2 Trial & Subscription Gating
    if (!tri.stage2_local.allowed) {
        if (tri.stage2_local.status === 'TRIAL_AVAILABLE') {
            return {
                allowed: false,
                status: 'TRIAL_AVAILABLE',
                stage: 2,
                trialDays: 7,
                reason: '7-day free trial available.',
                message: 'Start your 7-day free trial of autonomous IBC agents (@Advisor, @Forms, @Document).'
            };
        }

        return {
            allowed: false,
            status: 'TRIAL_EXPIRED',
            stage: 2,
            reason: tri.stage2_local.reason || '7-day free trial concluded.',
            message: 'Your 7-day free trial has concluded. Subscribe to Hayagriva Pro (₹25,000/year) to unlock autonomous agents and continuous updates.'
        };
    }

    // 7. Active hours and turn limits
    const activeHoursUsed = row.accumulated_active_seconds / 3600.0;
    if (row.max_active_hours > 0 && activeHoursUsed >= row.max_active_hours) {
        return {
            allowed: false,
            status: 'EXHAUSTED',
            stage: 2,
            reason: `Active agent hours exhausted (${activeHoursUsed.toFixed(1)} / ${row.max_active_hours} hrs).`,
            message: 'Your active agent working-hours budget has been reached. Please renew to continue autonomous drafting.'
        };
    }

    return {
        allowed: true,
        status: 'ACTIVE',
        stage: 2,
        stats: {
            licensee: row.licensee,
            tier: row.tier,
            active_hours_used: parseFloat(activeHoursUsed.toFixed(2)),
            max_active_hours: row.max_active_hours,
            turns_used: row.turns_used,
            max_agent_turns: row.max_agent_turns,
            valid_until: tri.stage2_local.valid_until,
            days_remaining: tri.stage2_local.days_remaining
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

    const stage2Expiry = payload.valid_until || payload.expiresAt || new Date(now + 90 * 86400000).toISOString();
    const stmt = db.prepare(`
        UPDATE license_state
        SET license_key = ?,
            licensee = ?,
            tier = ?,
            status = 'ACTIVE',
            issued_at = ?,
            valid_until = ?,
            stage2_valid_until = ?,
            initial_kyc_completed = 1,
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
        payload.tier || 'starter',
        payload.issued_at || new Date(now).toISOString(),
        stage2Expiry,
        stage2Expiry,
        payload.max_active_hours || DEFAULT_MAX_HOURS,
        payload.max_agent_turns || DEFAULT_MAX_TURNS,
        now,
        new Date(now).toISOString()
    );

    // Persist active license entitlements (allowed packs and LightRAG cloud key)
    try {
        const home = process.env.HOME || process.env.USERPROFILE || '.';
        const entitlementsDir = path.join(home, '.hayagriva');
        if (!fs.existsSync(entitlementsDir)) fs.mkdirSync(entitlementsDir, { recursive: true });
        const entitlementsPath = path.join(entitlementsDir, 'active_license_entitlements.json');
        const entitlementsData = {
            licensee: payload.sub || 'Licensed Practitioner',
            tier: payload.tier || 'starter',
            allowed_packs: payload.allowed_packs || payload.allowedPacks || [
                'suite_cirp', 'suite_finance', 'suite_liquidation', 'suite_msme', 'suite_guarantor', 'suite_litigation'
            ],
            lightrag_api_key: payload.lightrag_api_key || payload.lightragApiKey || '',
            valid_until: stage2Expiry,
            stage2_valid_until: stage2Expiry,
            initial_kyc_completed: true,
            activated_at: new Date(now).toISOString()
        };
        fs.writeFileSync(entitlementsPath, JSON.stringify(entitlementsData, null, 2), 'utf8');

        // If LightRAG API key provided, bind it to environment/runtime
        if (entitlementsData.lightrag_api_key) {
            process.env.LIGHTRAG_API_KEY = entitlementsData.lightrag_api_key;
        }
    } catch (err) {
        console.error('[LicenseManager] Failed to persist entitlements:', err.message);
    }

    return {
        success: true,
        licensee: payload.sub,
        tier: payload.tier,
        allowed_packs: payload.allowed_packs || payload.allowedPacks || [],
        lightrag_api_key: payload.lightrag_api_key || payload.lightragApiKey ? 'Configured' : 'None',
        valid_until: stage2Expiry,
        stage2_valid_until: stage2Expiry,
        initial_kyc_completed: true
    };
}

/**
 * Returns active license entitlements (allowed packs & cloud features).
 */
function getActiveEntitlements() {
    try {
        const home = process.env.HOME || process.env.USERPROFILE || '.';
        const entitlementsPath = path.join(home, '.hayagriva', 'active_license_entitlements.json');
        if (fs.existsSync(entitlementsPath)) {
            return JSON.parse(fs.readFileSync(entitlementsPath, 'utf8'));
        }
    } catch (e) {}
    return {
        licensee: 'Evaluation User',
        tier: 'trial',
        allowed_packs: [],
        lightrag_api_key: '',
        valid_until: null
    };
}

/**
 * Returns full diagnostic status of the licensing vault.
 */
function getLicenseStatus(customDbPath = null) {
    const db = getLicenseDb(customDbPath);
    const row = db.prepare('SELECT * FROM license_state WHERE id = 1').get();
    const activeHoursUsed = row.accumulated_active_seconds / 3600.0;
    const tri = checkTriTierAccess('', customDbPath);
    return {
        licensee: row.licensee,
        tier: row.tier,
        status: tri.status,
        issued_at: row.issued_at,
        valid_until: row.valid_until,
        stage2_valid_until: row.stage2_valid_until || row.valid_until,
        initial_kyc_completed: tri.initial_kyc_completed,
        workbench_free: true,
        trial_available: tri.trial_available,
        in_trial: tri.in_trial,
        trial_expired: tri.trial_expired,
        trial_started_at: row.trial_started_at,
        trial_expires_at: row.trial_expires_at,
        trial_consumed: Boolean(row.trial_consumed),
        trial_days_remaining: tri.trial_days_remaining,
        is_subscribed: tri.is_subscribed,
        accumulated_active_seconds: row.accumulated_active_seconds,
        active_hours_used: parseFloat(activeHoursUsed.toFixed(4)),
        max_active_hours: row.max_active_hours,
        turns_used: row.turns_used,
        max_agent_turns: row.max_agent_turns,
        max_wall_clock_iso: new Date(row.max_wall_clock).toISOString(),
        last_reanchor_utc: row.last_reanchor_utc,
        tamper_reason: row.tamper_reason,
        tri_tier: tri
    };
}

module.exports = {
    getLicenseDb,
    startTrial,
    checkAgentAccess,
    checkTriTierAccess,
    recordAgentTurn,
    reanchorFromNetwork,
    activateLicense,
    getLicenseStatus,
    getActiveEntitlements
};
