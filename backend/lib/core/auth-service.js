// backend/lib/core/auth-service.js
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = process.env.HAYAGRIVA_AUTH_SECRET || 'hayagriva_sovereign_jwt_secret_key_2026_x89f2a';
const TOKEN_EXPIRY_DAYS = 7;
const LEASE_DURATION_MS = TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

// User store path
function getUserStoreDbPath() {
    const home = process.env.HOME || process.env.USERPROFILE || '.';
    const dir = path.join(home, '.hayagriva');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, 'user_accounts.json');
}

// Built-in default chamber accounts
const DEFAULT_ACCOUNTS = [
    {
        id: 'usr_adv_01',
        name: 'Adv. Atul Grover',
        email: 'admin@hayagriva.app',
        passwordHash: hashPassword('hayagriva_secure_password'),
        org: 'Grover & Associates Chambers',
        role: 'managing_partner',
        tier: 'enterprise'
    },
    {
        id: 'usr_adv_02',
        name: 'Legal Counsel',
        email: 'counsel@hayagriva.app',
        passwordHash: hashPassword('counsel123'),
        org: 'Sovereign Law Chambers',
        role: 'advocate',
        tier: 'professional'
    }
];

function hashPassword(plainText) {
    return crypto.createHash('sha256').update(plainText + '_haya_salt_2026').digest('hex');
}

function loadAccounts() {
    const storePath = getUserStoreDbPath();
    if (!fs.existsSync(storePath)) {
        fs.writeFileSync(storePath, JSON.stringify(DEFAULT_ACCOUNTS, null, 2), 'utf8');
        return DEFAULT_ACCOUNTS;
    }
    try {
        const raw = fs.readFileSync(storePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
        }
    } catch (_) {}
    return DEFAULT_ACCOUNTS;
}

function base64UrlEncode(str) {
    return Buffer.from(str)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64UrlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) {
        str += '=';
    }
    return Buffer.from(str, 'base64').toString('utf8');
}

/**
 * Generates a signed HMAC-SHA256 JWT
 */
function generateToken(user, ttlSeconds = TOKEN_EXPIRY_DAYS * 86400) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        sub: user.id,
        name: user.name,
        email: user.email,
        org: user.org,
        role: user.role,
        tier: user.tier,
        iat: now,
        exp: now + ttlSeconds
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verifies a signed JWT token
 */
function verifyToken(token) {
    if (!token || typeof token !== 'string') {
        return { valid: false, error: 'No token provided' };
    }
    const parts = token.split('.');
    if (parts.length !== 3) {
        return { valid: false, error: 'Malformed token structure' };
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSig = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    if (signature !== expectedSig) {
        return { valid: false, error: 'Invalid signature' };
    }

    try {
        const payload = JSON.parse(base64UrlDecode(encodedPayload));
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
            return { valid: false, error: 'Token expired', expired: true };
        }
        return { valid: true, payload };
    } catch (e) {
        return { valid: false, error: 'Failed to parse payload: ' + e.message };
    }
}

function saveAccount(account) {
    try {
        const storePath = getUserStoreDbPath();
        const accounts = loadAccounts();
        const idx = accounts.findIndex(a => a.email.toLowerCase() === account.email.toLowerCase());
        if (idx >= 0) {
            accounts[idx] = { ...accounts[idx], ...account };
        } else {
            accounts.unshift(account);
        }
        fs.writeFileSync(storePath, JSON.stringify(accounts, null, 2), 'utf8');
    } catch (_) {}
}

/**
 * Authenticates user credentials against cloud portal API with local/offline fallback
 */
async function authenticateUser(email, password) {
    if (!email || !password) {
        return { ok: false, error: 'Email and password are required' };
    }
    const cleanEmail = email.trim().toLowerCase();
    const portalUrl = (process.env.HAYAGRIVA_PORTAL_URL || 'https://app-apnet-net.onrender.com').replace(/\/+$/, '');

    // 1. Attempt Online Cloud Authentication via Portal API
    try {
        const response = await fetch(`${portalUrl}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Hayagriva-Desktop-IDE/2.4.0'
            },
            body: JSON.stringify({ email: cleanEmail, password }),
            signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
            const data = await response.json();
            if (data && (data.ok || data.success)) {
                const userProfile = {
                    id: data.user?.id || `usr_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`,
                    name: data.user?.name || cleanEmail.split('@')[0],
                    email: data.user?.email || cleanEmail,
                    org: data.user?.org || data.user?.organization || 'Legal Chambers',
                    role: data.user?.role || 'advocate',
                    tier: data.user?.plan?.toLowerCase() || data.user?.tier || 'enterprise'
                };

                // Cache in local user store for offline fallback
                const hash = hashPassword(password);
                saveAccount({
                    ...userProfile,
                    passwordHash: hash
                });

                // Auto-activate license if returned by cloud portal
                if (data.license && data.license.licenseKey) {
                    try {
                        const { activateLicenseWithCloud } = require('./license-manager');
                        await activateLicenseWithCloud(data.license.licenseKey);
                    } catch (_) {}
                }

                const token = data.token || generateToken(userProfile);
                const leaseExpiresAt = data.leaseExpiresAt || new Date(Date.now() + LEASE_DURATION_MS).toISOString();

                return {
                    ok: true,
                    token,
                    user: userProfile,
                    license: data.license || null,
                    leaseExpiresAt,
                    isOfflineGrace: false,
                    source: 'cloud'
                };
            }
        } else if (response.status === 401 || response.status === 403) {
            const errData = await response.json().catch(() => ({}));
            return {
                ok: false,
                error: errData.error || errData.message || 'Invalid email or password'
            };
        }
    } catch (networkErr) {
        // Network timeout / connection error -> proceed to local offline fallback below
    }

    // 2. Offline Fallback to Local Cached Accounts
    const hash = hashPassword(password);
    const accounts = loadAccounts();
    const matched = accounts.find(a => a.email.toLowerCase() === cleanEmail && a.passwordHash === hash);
    if (!matched) {
        return { ok: false, error: 'Invalid email or password' };
    }

    const userProfile = {
        id: matched.id,
        name: matched.name,
        email: matched.email,
        org: matched.org,
        role: matched.role,
        tier: matched.tier
    };

    const token = generateToken(userProfile);
    const leaseExpiresAt = new Date(Date.now() + LEASE_DURATION_MS).toISOString();

    return {
        ok: true,
        token,
        user: userProfile,
        leaseExpiresAt,
        isOfflineGrace: true,
        source: 'local'
    };
}

/**
 * Extracts bearer token from HTTP Authorization header
 */
function extractBearerToken(req) {
    const authHeader = req.headers && (req.headers['authorization'] || req.headers['Authorization']);
    if (!authHeader || typeof authHeader !== 'string') {
        return null;
    }
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
}

module.exports = {
    authenticateUser,
    generateToken,
    verifyToken,
    extractBearerToken,
    LEASE_DURATION_MS,
    DEFAULT_ACCOUNTS
};
