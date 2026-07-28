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

// ---------------------------------------------------------------------------
// HAYAGRIVA PUBLIC KEY (Ed25519)
// Replace placeholder with real production key before shipping.
// Generate pair:
//   node -e "const c=require('crypto');
//   const {publicKey,privateKey}=c.generateKeyPairSync('ed25519');
//   console.log(publicKey.export({type:'spki',format:'pem'}));
//   console.log(privateKey.export({type:'pkcs8',format:'pem'}))"
// ---------------------------------------------------------------------------
const HAYAGRIVA_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA__REPLACE_WITH_REAL_PUBLIC_KEY_BASE64_HERE_________=
-----END PUBLIC KEY-----`;

const VALID_TIERS = ['starter', 'professional', 'enterprise'];

function fromBase64URL(str) {
    return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Validates a Hayagriva license key.
 * @returns {{ valid: boolean, tier: string, payload: object|null, error: string|null, warning?: string }}
 */
function validateLicense(licenseKey) {
    if (!licenseKey || typeof licenseKey !== 'string') {
        return { valid: false, tier: 'starter', payload: null, error: 'No license key provided.' };
    }

    const parts = licenseKey.trim().split('.');
    if (parts.length !== 2) {
        return { valid: false, tier: 'starter', payload: null, error: 'Invalid license key format.' };
    }

    const [payloadB64, signatureB64] = parts;

    // 1. Decode payload
    let payload;
    try {
        payload = JSON.parse(fromBase64URL(payloadB64).toString('utf8'));
    } catch (_) {
        return { valid: false, tier: 'starter', payload: null, error: 'License payload is malformed.' };
    }

    // 2. Verify Ed25519 signature
    try {
        const payloadBytes = fromBase64URL(payloadB64);
        const signatureBytes = fromBase64URL(signatureB64);
        const publicKey = crypto.createPublicKey(HAYAGRIVA_PUBLIC_KEY_PEM);
        const isValid = crypto.verify(null, payloadBytes, publicKey, signatureBytes);
        if (!isValid) {
            return { valid: false, tier: 'starter', payload: null, error: 'License signature is invalid.' };
        }
    } catch (e) {
        return { valid: false, tier: 'starter', payload: null, error: `Signature verification failed: ${e.message}` };
    }

    // 3. Validate tier
    const tier = payload.tier || 'starter';
    if (!VALID_TIERS.includes(tier)) {
        return { valid: false, tier: 'starter', payload, error: `Unknown subscription tier: ${tier}` };
    }

    // 4. Check expiry with grace period
    if (payload.expiresAt) {
        const expiryDate = new Date(payload.expiresAt);
        const graceDays = payload.gracePeriodDays || 30;
        const graceDate = new Date(expiryDate.getTime() + graceDays * 24 * 60 * 60 * 1000);
        const now = new Date();

        if (now > graceDate) {
            return {
                valid: false, tier: 'starter', payload,
                error: `License expired on ${payload.expiresAt} (grace period also elapsed).`
            };
        }
        if (now > expiryDate) {
            return {
                valid: true, tier, payload, error: null,
                warning: `License expired on ${payload.expiresAt}. ${Math.ceil((graceDate - now) / (24 * 60 * 60 * 1000))} grace days remaining.`
            };
        }
    }

    return { valid: true, tier, payload, error: null };
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
        settings.licensedTo = payload.sub || null;
        settings.licenseExpiresAt = payload.expiresAt || null;
        settings.allowedDomains = payload.allowedDomains || ['legal', 'finance'];
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

        // Mirror tier into case_manifest.json
        const manifestPath = path.join(caseDir, 'case_manifest.json');
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

module.exports = { validateLicense, writeLicenseToSettings };
