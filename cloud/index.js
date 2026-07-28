/**
 * index.js — Hayagriva Activation API Server
 * Deployed at: api.hayagriva.app (Railway)
 *
 * Endpoints:
 *   POST /activate          { licenseKey } → { ok, vaultType, vaultKey, version }
 *   GET  /vaults/latest.json               → version manifest for all vaults
 *   GET  /health                           → { ok, uptime }
 */

'use strict';

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const fs         = require('fs');

const { findLicense, touchActivated } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3400;

// ── CORS ──────────────────────────────────────────────────────────
// Allow requests from the Electron app (file://) and any future web dashboard
app.use(cors({
  origin: (origin, cb) => {
    // Allow: no origin (Electron/desktop), localhost, hayagriva.app
    if (!origin || origin.startsWith('file://') || /hayagriva\.app$/.test(origin)) {
      return cb(null, true);
    }
    cb(new Error('CORS: origin not allowed'));
  },
  methods: ['GET', 'POST'],
}));

app.use(express.json({ limit: '4kb' }));

// ── Rate Limiting ─────────────────────────────────────────────────
const activateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // max 10 activation attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many activation attempts. Try again later.' },
});

// ── Helpers ───────────────────────────────────────────────────────

const LICENSE_REGEX = /^HAYG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

function sanitizeKey(raw) {
  return String(raw || '').trim().toUpperCase();
}

// ── Routes ────────────────────────────────────────────────────────

/**
 * GET /health
 * Simple liveness probe for Railway health checks.
 */
app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: Math.floor(process.uptime()) });
});

/**
 * POST /activate
 * Body: { licenseKey: "HAYG-XXXX-XXXX-XXXX" }
 *
 * On success returns the vault key (64-char hex) that the app stores
 * in the OS Keychain under service="hayagriva" account=vaultType.
 *
 * The vault key is fetched from the per-license DB row — all licenses
 * for the same vault type share the same key in practice, but the DB
 * design allows per-license rotation if ever needed.
 */
app.post('/activate', activateLimiter, (req, res) => {
  const raw = sanitizeKey(req.body?.licenseKey);

  if (!LICENSE_REGEX.test(raw)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid license key format. Expected HAYG-XXXX-XXXX-XXXX.',
    });
  }

  const license = findLicense(raw);

  if (!license) {
    return res.status(404).json({ ok: false, error: 'License key not found.' });
  }

  if (license.revoked) {
    return res.status(403).json({
      ok: false,
      error: 'This license has been revoked. Please contact support@hayagriva.app.',
    });
  }

  // Record first activation timestamp (idempotent)
  touchActivated(raw);

  return res.json({
    ok:         true,
    vaultType:  license.vault_type,
    vaultKey:   license.vault_key_hex,
    // Tell the client the current vault version so it knows what to download
    latestUrl:  `https://api.hayagriva.app/vaults/latest.json`,
  });
});

/**
 * GET /vaults/latest.json
 * Returns the version manifest for all available vaults.
 * In production this is updated by publish-vaults.sh after each monthly release.
 */
const LATEST_JSON_PATH = process.env.LATEST_JSON_PATH
  || path.join(__dirname, 'data', 'latest.json');

app.get('/vaults/latest.json', (_req, res) => {
  if (!fs.existsSync(LATEST_JSON_PATH)) {
    return res.status(404).json({ ok: false, error: 'Version manifest not yet available.' });
  }
  try {
    const data = JSON.parse(fs.readFileSync(LATEST_JSON_PATH, 'utf8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to read version manifest.' });
  }
});

// ── 404 Fallback ──────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'Not found.' });
});

// ── Error Handler ─────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[api-server] Unhandled error:', err.message);
  res.status(500).json({ ok: false, error: 'Internal server error.' });
});

// ── Start ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[api-server] Hayagriva API listening on port ${PORT}`);
  console.log(`[api-server] Environment: ${process.env.NODE_ENV || 'development'}`);
});
