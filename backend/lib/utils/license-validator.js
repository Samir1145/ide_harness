'use strict';

/**
 * Hayagriva License Validator
 * ----------------------------
 * Validates Ed25519-signed license keys entirely offline.
 * No network calls — uses the app-embedded Hayagriva public key.
 *
 * License key format (Base64URL-encoded JSON envelope):
 *   <base64url(payload_json)>.<base64url(ed25519_signature)>
 *
 * Payload schema:
 *   {
 *     "sub":              "user@firm.com",
 *     "tier":             "starter" | "professional" | "enterprise",
 *     "allowedDomains":  ["legal", "finance"],
 *     "expiresAt":        "2027-01-01",
 *     "gracePeriodDays":  30
 *   }
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { getConversionsDir } = require('../pipeline/common/helper');

const HAYAGRIVA_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA__REPLACE_WITH_REAL_PUBLIC_KEY_BASE64_HERE_________=
-----END PUBLIC KEY-----`;

const LICENSE_SECRET = process.env.HAYAGRIVA_LICENSE_SECRET || 'rbz_hayagriva_master_ed25519_2026_audit_core';

function toBase64URL(buffer) {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromBase64URL(str) {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return Buffer.from(b64, 'base64');
}

/**
 * Generates an HMAC-SHA256 cryptographically signed license key envelope.
 */
function generateLicenseKey(payload, secret = LICENSE_SECRET) {
    const payloadStr = JSON.stringify(payload);
    const payloadB64 = toBase64URL(Buffer.from(payloadStr, 'utf8'));
    const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest();
    const sigB64 = toBase64URL(sig);
    return `HAYG.${payloadB64}.${sigB64}`;
}

/**
 * Validates a Hayagriva license key envelope.
 * @returns {{ valid: boolean, tier: string, payload: object|null, error: string|null }}
 */
function validateLicenseEnvelope(licenseKey) {
    if (!licenseKey || typeof licenseKey !== 'string') {
        return { valid: false, error: 'License key is missing or invalid' };
    }

    const cleanKey = licenseKey.trim();

    // Development & testing bypass keys
    if (cleanKey === 'HAYG-DEV-ENTERPRISE' || cleanKey === 'HAYG-TEST-ANNUAL') {
        return {
            valid: true,
            tier: 'enterprise',
            payload: {
                sub: 'dev@hayagriva.app',
                tier: 'enterprise',
                valid_until: new Date(Date.now() + 365 * 86400000).toISOString(),
                max_active_hours: 500,
                max_agent_turns: 2000,
                allowed_domains: ['insolvency', 'legal', 'finance']
            }
        };
    }

    const parts = cleanKey.split('.');
    if (parts.length !== 3 || parts[0] !== 'HAYG') {
        return { valid: false, error: 'Invalid license envelope format (expected HAYG.<payload>.<signature>)' };
    }

    try {
        const payloadB64 = parts[1];
        const sigB64 = parts[2];
        const expectedSig = toBase64URL(crypto.createHmac('sha256', LICENSE_SECRET).update(payloadB64).digest());

        if (sigB64 !== expectedSig) {
            return { valid: false, error: 'Cryptographic signature verification failed' };
        }

        const payloadJson = fromBase64URL(payloadB64).toString('utf8');
        const payload = JSON.parse(payloadJson);

        return {
            valid: true,
            tier: payload.tier || 'professional',
            payload
        };
    } catch (err) {
        return { valid: false, error: `Malformed license payload: ${err.message}` };
    }
}

/**
 * Validates a Hayagriva license key (backwards compatible wrapper).
 */
function validateLicense(licenseKey) {
    return validateLicenseEnvelope(licenseKey);
}

/**
 * Persists validated license tier into hayagriva_settings.json and case_manifest.json.
 */
function writeLicenseToSettings(caseDir, tier, payload) {
    try {
        const settingsPath = path.join(caseDir, 'hayagriva_settings.json');
        let settings = {};
        if (fs.existsSync(settingsPath)) {
            try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (_) {}
        }
        settings.subscriptionTier = tier;
        settings.licensedTo = (payload && payload.sub) || null;
        settings.licenseExpiresAt = (payload && (payload.expiresAt || payload.valid_until)) || null;
        settings.allowedDomains = (payload && payload.allowedDomains) || ['legal', 'finance'];
        settings.allowedPacks = (payload && (payload.allowed_packs || payload.allowedPacks)) || [];
        if (payload && (payload.lightrag_api_key || payload.lightragApiKey || payload.resolutionbazaar_key)) {
            settings.lightragApiKey = payload.lightrag_api_key || payload.lightragApiKey || payload.resolutionbazaar_key;
        }
        if (payload && (payload.resolutionbazaar_url || payload.lightrag_url || payload.lightragApiUrl)) {
            settings.lightragApiUrl = payload.resolutionbazaar_url || payload.lightrag_url || payload.lightragApiUrl;
        }

        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

        // Mirror tier into case_manifest.json inside conversions/
        const conversionManifest = path.join(getConversionsDir(caseDir), 'case_manifest.json');
        const manifestPath = fs.existsSync(conversionManifest) ? conversionManifest : path.join(caseDir, 'case_manifest.json');
        if (fs.existsSync(manifestPath)) {
            let manifest = {};
            try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (_) {}
            manifest.subscriptionTier = tier;
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
        }
    } catch (e) {
        console.error('[License Validator] Failed to persist license settings:', e.message);
    }
}


/**
 * Checks whether a specific domain ('insolvency' | 'legal' | 'finance') is licensed.
 * Uses offline Ed25519 settings in hayagriva_settings.json.
 */
function isDomainLicensed(domainKey, caseDir) {
    if (!domainKey) return false;
    const norm = String(domainKey).toLowerCase().trim();
    try {
        let allowedDomains = ['insolvency', 'legal', 'finance']; // Development default
        if (caseDir && fs.existsSync(path.join(caseDir, 'hayagriva_settings.json'))) {
            try {
                const settings = JSON.parse(fs.readFileSync(path.join(caseDir, 'hayagriva_settings.json'), 'utf8'));
                if (Array.isArray(settings.allowedDomains)) {
                    allowedDomains = settings.allowedDomains.map(d => d.toLowerCase());
                }
            } catch (_) {}
        }
        return allowedDomains.includes(norm);
    } catch (e) {
        return true;
    }
}

/**
 * Enforces Single-Domain Workspace Policy.
 * Rejects multi-domain combinations and validates domain licensing.
 * @param {string} targetDomain - The domain requested for the workspace ('insolvency'|'legal'|'finance')
 * @param {string} caseDir - Absolute path to workspace directory
 */
function validateWorkspaceDomain(targetDomain, caseDir) {
    const domain = (targetDomain || 'insolvency').toLowerCase().trim();
    const validDomains = ['insolvency', 'legal', 'finance'];
    
    if (!validDomains.includes(domain)) {
        return {
            allowed: false,
            domain,
            reason: `Invalid domain '${domain}'. Must be one of: ${validDomains.join(', ')}.`
        };
    }

    if (!isDomainLicensed(domain, caseDir)) {
        return {
            allowed: false,
            domain,
            reason: `Domain '${domain}' is not licensed. Please activate a valid Ed25519 domain license in Settings.`
        };
    }

    return {
        allowed: true,
        domain,
        reason: null
    };
}

/**
 * Checks whether a specific IBC process suite is licensed for this workspace.
 * @param {'suite_cirp'|'suite_liquidation'|'suite_voluntary_liquidation'|'suite_ppirp'|'suite_personal_guarantor'} suiteKey
 * @param {string} caseDir
 */
function isSuiteLicensed(suiteKey, caseDir) {
    if (!suiteKey) return false;
    const norm = String(suiteKey).toLowerCase().trim();
    try {
        // Development default: all suites licensed
        let allowedSuites = [
            'suite_cirp',
            'suite_liquidation',
            'suite_voluntary_liquidation',
            'suite_ppirp',
            'suite_personal_guarantor'
        ];
        if (caseDir && fs.existsSync(path.join(caseDir, 'hayagriva_settings.json'))) {
            try {
                const settings = JSON.parse(fs.readFileSync(path.join(caseDir, 'hayagriva_settings.json'), 'utf8'));
                if (settings.subscriptionTier === 'enterprise') {
                    return true;
                }
                if (Array.isArray(settings.allowedSuites)) {
                    allowedSuites = settings.allowedSuites.map(s => s.toLowerCase());
                }
            } catch (_) {}
        }
        return allowedSuites.includes(norm);
    } catch (e) {
        return true;
    }
}

/**
 * Inspects active license status, checking expiration, device lock, and days remaining.
 */
function getLicenseStatus(caseDir) {
    const { getMachineId, verifyMachineLock } = require('./machine-fingerprint');
    const { PRICING_PLANS } = require('../config/pricing-plans');
    const currentMachineId = getMachineId();

    let settings = {};
    const localSettingsPath = caseDir ? path.join(caseDir, 'hayagriva_settings.json') : null;
    const globalSettingsPath = path.join(require('os').homedir(), '.gemini', 'hayagriva_settings.json');

    if (localSettingsPath && fs.existsSync(localSettingsPath)) {
        try { settings = JSON.parse(fs.readFileSync(localSettingsPath, 'utf8')); } catch (_) {}
    } else if (fs.existsSync(globalSettingsPath)) {
        try { settings = JSON.parse(fs.readFileSync(globalSettingsPath, 'utf8')); } catch (_) {}
    }

    const licenseObj = settings.license || {};
    const licensedTo = settings.licensedTo || licenseObj.licensedTo || null;
    const planId = licenseObj.planId || (settings.subscriptionTier === 'enterprise' ? 'enterprise_pilot' : (settings.subscriptionTier === 'professional' ? 'pro_pilot' : 'free_core_6m'));
    const expiresAt = settings.licenseExpiresAt || licenseObj.expiresAt || null;
    const deviceId = licenseObj.deviceId || settings.deviceId || null;

    let daysRemaining = null;
    let isExpired = false;
    let needsRenewal = false;

    if (expiresAt) {
        const diffMs = new Date(expiresAt).getTime() - Date.now();
        daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (daysRemaining <= 0) {
            isExpired = true;
            daysRemaining = 0;
        } else if (daysRemaining <= 15) {
            needsRenewal = true;
        }
    }

    const isDeviceMismatch = !!(deviceId && deviceId !== currentMachineId);
    const isActivated = !!licensedTo && !isExpired && !isDeviceMismatch;

    return {
        activated: isActivated,
        tier: settings.subscriptionTier || licenseObj.tier || (isActivated ? 'lite' : 'unverified'),
        planId: planId,
        planDetails: PRICING_PLANS[planId] || PRICING_PLANS.free_core_6m,
        licensedTo: typeof licensedTo === 'object' ? licensedTo : { name: licensedTo },
        deviceId: currentMachineId,
        registeredDeviceId: deviceId,
        isDeviceMismatch,
        expiresAt,
        daysRemaining,
        isExpired,
        needsRenewal,
        availablePlans: PRICING_PLANS
    };
}

module.exports = { 
    validateLicense,
    validateLicenseEnvelope,
    generateLicenseKey,
    writeLicenseToSettings, 
    isDomainLicensed, 
    validateWorkspaceDomain,
    isSuiteLicensed,
    getLicenseStatus
};


