const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
let nodemailer;
try {
    nodemailer = require('nodemailer');
} catch (_) {}

const DEFAULT_CONFIG_PATH = path.resolve(__dirname, '..', '..', '..', 'config', 'user_profile.default.json');
const USER_GLOBAL_PROFILE_PATH = path.join(os.homedir(), '.hayagriva', 'user_profile.json');

// In-memory verification OTP cache: email -> { code, expiresAt, attempts }
const _otpCache = new Map();

/**
 * Loads practitioner profile with precedence:
 * 1. Matter override (<caseDir>/profile_override.json)
 * 2. User global profile (~/.hayagriva/user_profile.json)
 * 3. Default harness seed (backend/../config/user_profile.default.json)
 *
 * @param {string} [caseDir] - Optional active matter directory
 * @returns {Object} Deep-merged practitioner profile
 */
function getProfile(caseDir = null) {
    let base = {};
    if (fs.existsSync(DEFAULT_CONFIG_PATH)) {
        try {
            base = JSON.parse(fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8'));
        } catch (_) {}
    }

    let globalProfile = {};
    if (fs.existsSync(USER_GLOBAL_PROFILE_PATH)) {
        try {
            globalProfile = JSON.parse(fs.readFileSync(USER_GLOBAL_PROFILE_PATH, 'utf8'));
        } catch (_) {}
    }

    let matterProfile = {};
    if (caseDir && fs.existsSync(path.join(caseDir, 'profile_override.json'))) {
        try {
            matterProfile = JSON.parse(fs.readFileSync(path.join(caseDir, 'profile_override.json'), 'utf8'));
        } catch (_) {}
    }

    const merged = deepMerge(deepMerge(base, globalProfile), matterProfile);

    // Ensure identity object has defaults
    if (!merged.identity) merged.identity = {};
    if (!merged.contact) merged.contact = {};
    if (!merged.branding) merged.branding = {};

    return merged;
}

/**
 * Saves practitioner profile to ~/.hayagriva/user_profile.json
 * Generates user_id and hardware lock hash.
 */
function saveProfile(updatedProfile, machineId = '') {
    const hayagrivaDir = path.dirname(USER_GLOBAL_PROFILE_PATH);
    if (!fs.existsSync(hayagrivaDir)) {
        fs.mkdirSync(hayagrivaDir, { recursive: true });
    }

    const current = getProfile();
    const merged = deepMerge(current, updatedProfile);

    // Derive deterministic user_id if not set
    if (!merged.identity.userId) {
        const reg = merged.identity.ibbiRegNo || merged.identity.barEnrollmentNo || '';
        const cleanReg = reg.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        if (cleanReg) {
            merged.identity.userId = `usr_${cleanReg.slice(-12)}`;
        } else {
            merged.identity.userId = `usr_${crypto.randomBytes(4).toString('hex')}`;
        }
    }

    // Hardware lock anchor
    if (machineId) {
        merged.identity.machineId = machineId;
        const seed = `${merged.identity.userId}|${merged.contact.email || ''}|${merged.identity.fullName || ''}|${machineId}`;
        merged.identity.profileSignature = crypto.createHash('sha256').update(seed).digest('hex');
    }

    merged.identity.updatedAt = new Date().toISOString();

    fs.writeFileSync(USER_GLOBAL_PROFILE_PATH, JSON.stringify(merged, null, 2), 'utf8');
    return merged;
}

/**
 * Sends a 6-digit verification code to the Master Practitioner Email.
 * Uses Google Workspace SMTP (or custom SMTP) if configured, with dev console fallback.
 */
async function sendOtp(email) {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
        throw new Error('Valid email address is required for identity verification.');
    }

    const cleanEmail = email.trim().toLowerCase();
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + (5 * 60 * 1000); // 5 minutes

    _otpCache.set(cleanEmail, {
        code,
        expiresAt,
        attempts: 0
    });

    let sentViaSmtp = false;
    let smtpError = null;

    // Check Google Workspace / SMTP credentials
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS;
    const smtpHost = process.env.SMTP_HOST;

    if (nodemailer && ((gmailUser && gmailPass) || smtpHost)) {
        try {
            let transporter;
            if (gmailUser && gmailPass) {
                transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: { user: gmailUser, pass: gmailPass }
                });
            } else {
                transporter = nodemailer.createTransport({
                    host: smtpHost,
                    port: parseInt(process.env.SMTP_PORT || '587'),
                    secure: process.env.SMTP_SECURE === 'true',
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS
                    }
                });
            }

            const mailOptions = {
                from: `"Hayagriva Practice Cockpit" <${gmailUser || process.env.SMTP_USER}>`,
                to: cleanEmail,
                subject: `🔐 Hayagriva Identity Verification Code: ${code}`,
                html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; background: #0f172a; color: #f8fafc; border-radius: 12px; border: 1px solid #334155; padding: 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                        <div style="border-bottom: 2px solid #0ea5e9; padding-bottom: 12px; margin-bottom: 20px;">
                            <h2 style="margin: 0; color: #0ea5e9; font-size: 20px; letter-spacing: 0.5px;">HAYAGRIVA STATUTORY COCKPIT</h2>
                            <div style="color: #94a3b8; font-size: 11px; margin-top: 2px;">Practitioner Identity &amp; Workstation Binding</div>
                        </div>
                        <p style="font-size: 14px; color: #cbd5e1; line-height: 1.5; margin-bottom: 20px;">
                            Enter the following 6-digit verification code in your Hayagriva Practice Governance Cockpit to anchor your statutory registration to this workstation:
                        </p>
                        <div style="background: #1e293b; border: 1px solid #0ea5e9; border-radius: 8px; text-align: center; padding: 18px; margin: 24px 0;">
                            <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #38bdf8; font-family: monospace;">${code}</span>
                            <div style="font-size: 11px; color: #64748b; margin-top: 6px;">Valid for 5 minutes • Do not share this code</div>
                        </div>
                        <p style="font-size: 12px; color: #64748b; line-height: 1.4; margin-top: 24px; border-top: 1px solid #1e293b; padding-top: 14px;">
                            This code secures your digital attestation stamps, SHA-256 diligence vouchers, and CIRP expense audit trail.
                        </p>
                    </div>
                `
            };

            await transporter.sendMail(mailOptions);
            sentViaSmtp = true;
            console.log(`[AUTH-OTP] ✓ Verification email delivered to ${cleanEmail} via Google Workspace SMTP`);
        } catch (err) {
            smtpError = err.message;
            console.warn(`[AUTH-OTP] Warning: SMTP delivery failed (${err.message}). Falling back to terminal log.`);
        }
    }

    if (!sentViaSmtp) {
        console.log(`\n================================================================`);
        console.log(`[AUTH-OTP] 🔐 Verification OTP for ${cleanEmail}: ${code}`);
        console.log(`           (Valid for 5 mins • Dev/Sandbox Fallback)`);
        console.log(`================================================================\n`);
    }

    return {
        success: true,
        email: cleanEmail,
        expiresAt,
        sentViaSmtp,
        smtpError,
        devHint: !sentViaSmtp ? code : undefined
    };
}

/**
 * Validates the 6-digit OTP and stamps the profile with isVerified: true and hardware lock.
 */
function verifyOtp(email, inputCode, machineId = '') {
    if (!email || !inputCode) {
        throw new Error('Email and verification code are required.');
    }

    const cleanEmail = email.trim().toLowerCase();
    const record = _otpCache.get(cleanEmail);

    if (!record) {
        throw new Error('No active verification code found for this email. Please request a new code.');
    }

    if (Date.now() > record.expiresAt) {
        _otpCache.delete(cleanEmail);
        throw new Error('Verification code has expired. Please request a new code.');
    }

    if (record.attempts >= 5) {
        _otpCache.delete(cleanEmail);
        throw new Error('Too many invalid attempts. Please request a new code.');
    }

    if (record.code !== inputCode.trim()) {
        record.attempts += 1;
        throw new Error('Invalid verification code. Please check and try again.');
    }

    // Code verified! Remove from cache
    _otpCache.delete(cleanEmail);

    // Update profile
    const profile = getProfile();
    profile.identity.isVerified = true;
    profile.identity.verifiedAt = new Date().toISOString();
    if (cleanEmail) {
        profile.contact.email = cleanEmail;
    }

    const saved = saveProfile(profile, machineId);
    return {
        success: true,
        message: 'Practitioner identity verified and cryptographically locked to workstation.',
        profile: saved
    };
}

function deepMerge(target, source) {
    const output = Object.assign({}, target);
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target)) {
                    Object.assign(output, { [key]: source[key] });
                } else {
                    output[key] = deepMerge(target[key], source[key]);
                }
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}

function isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Renders Markdown / HTML Letterhead Banner
 */
function renderLetterhead(profile) {
    const id = profile.identity || {};
    const contact = profile.contact || {};
    const brand = profile.branding || {};

    return `
<div class="letterhead-container" style="border-bottom: 2px solid ${brand.themeColor || '#0369a1'}; padding-bottom: 12px; margin-bottom: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="display: flex; justify-content: space-between; align-items: flex-start;">
    <div>
      <h1 style="margin: 0; font-size: 16pt; color: ${brand.themeColor || '#0369a1'}; letter-spacing: 0.5px; text-transform: uppercase;">${id.fullName || 'LEGAL PRACTITIONER'}</h1>
      <div style="font-size: 9.5pt; font-weight: 600; color: #1e293b; margin-top: 2px;">${id.designation || 'Advocate & Insolvency Professional'}</div>
      <div style="font-size: 8.5pt; color: #475569; margin-top: 1px;">${id.firmName || ''}</div>
      <div style="font-size: 7.5pt; color: #64748b; margin-top: 3px;">
        Enrollment: <strong>${id.barEnrollmentNo || 'N/A'}</strong> | IBBI Reg: <strong>${id.ibbiRegNo || 'N/A'}</strong>
      </div>
    </div>
    <div style="text-align: right; font-size: 7.5pt; color: #475569; line-height: 1.4;">
      <div>${contact.officeAddress || ''}</div>
      <div>Email: <a href="mailto:${contact.email || ''}" style="color: ${brand.themeColor || '#0369a1'}; text-decoration: none;">${contact.email || ''}</a></div>
      <div>Phone: ${contact.phone || ''}</div>
      <div>PAN: ${id.pan || 'N/A'} | GSTIN: ${id.gstin || 'N/A'}</div>
    </div>
  </div>
</div>
`;
}

/**
 * Renders statutory closing attestation stamp for legal pleadings and reports.
 */
function renderAttestationStamp(profile, machineId = '') {
    const id = profile.identity || {};
    const contact = profile.contact || {};

    const name = id.fullName || 'Advocate & Insolvency Professional';
    const designation = id.designation || 'Insolvency Resolution Professional';
    const regNo = id.ibbiRegNo ? `IBBI Reg: ${id.ibbiRegNo}` : '';
    const bar = id.barEnrollmentNo ? `Bar Enrolment: ${id.barEnrollmentNo}` : '';
    const afa = id.afaValidity ? `AFA: ${id.afaValidity}` : '';
    const firm = id.firmName ? `${id.firmName}` : '';
    const address = contact.officeAddress ? `Chambers: ${contact.officeAddress}` : '';
    const email = contact.email ? `Email: ${contact.email}` : '';
    const phone = contact.phone ? `Phone: ${contact.phone}` : '';
    const mId = machineId || id.machineId || 'DEVICE-UNVERIFIED';

    const credentials = [regNo, bar, afa].filter(Boolean).join(' | ');
    const contacts = [email, phone].filter(Boolean).join(' | ');

    return `
__________________________________________________________________
[${name.toUpperCase()}]
${designation}${firm ? ` • ${firm}` : ''}
${credentials}
${address}
${contacts}
[Workstation Anchor: ${mId} • Verified via Hayagriva]
`;
}

module.exports = {
    getProfile,
    saveProfile,
    sendOtp,
    verifyOtp,
    renderLetterhead,
    renderAttestationStamp,
    USER_GLOBAL_PROFILE_PATH,
    DEFAULT_CONFIG_PATH
};
