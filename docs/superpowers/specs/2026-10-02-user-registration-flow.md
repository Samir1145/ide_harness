# User Self-Registration & Automatic License Provisioning Spec

## 1. Objective
Enable legal and insolvency practitioners to self-register for a Hayagriva account on the Web Portal (`/register`), receive an automatically generated 1-device Starter license key (`HAYA-STR-...`), and be seamlessly auto-logged into `/dashboard/licenses` with immediate desktop installer downloads.

---

## 2. Requirements & UX Flow

### 2.1 Navigation & Placement
1. **Login Page (`/login`):**
   - Footer link: `"Don't have an account? Create Free Account →"` routing to `/register`.
   - Header button: `"Sign Up"` pill in the top navigation bar.
2. **Registration Page (`/register`):**
   - Header title: `"🐎 HAYAGRIVA | Sovereign Legal Operating System"`.
   - Card headline: `"Create Your Practitioner Account"` with subtitle `"Start drafting court-ready pleadings with air-gapped local AI"`.
   - Bottom link: `"Already have an account? Sign In"`.

### 2.2 Form Fields & Validation
1. **Full Name (`name`):** Required, min 2 chars.
2. **Chamber / Work Email (`email`):** Required, valid email format, uniqueness check against Neon PostgreSQL `users` table. Stored as immutable once created.
3. **Password (`password`):** Required, min 8 chars.
4. **Confirm Password (`confirmPassword`):** Required, must match `password`.
5. **Professional Role (`role` / `designation`):** Dropdown selector:
   - `Advocate / Litigator` (Default)
   - `Insolvency Professional (IP / IRP / RP)`
   - `Law Firm Partner / Associate`
   - `Chartered Accountant / Forensic Auditor`
   - `Corporate In-House Counsel`
6. **Chamber / Law Firm Name (`firmName`):** Optional string (e.g. `Deshmukh & Associates Law Chambers`).
7. **Bar Council / IBBI Enrollment No. (`barCouncilEnrollment`):** Optional string (e.g. `MAH/1482/2019`).
8. **Terms Acceptance (`termsAccepted`):** Checkbox required.

### 2.3 Backend Registration Logic (`POST /api/auth/register`)
1. **Input Validation:** Reject missing required fields, password mismatches (< 8 chars), or invalid emails.
2. **Duplicate Email Check:** If user with `email` already exists, return `409 Conflict` with `{"error": "EMAIL_ALREADY_EXISTS", "message": "An account with this email already exists. Please sign in."}`.
3. **Password Hashing:** Hash password using SHA-256 / bcrypt equivalent.
4. **User Creation:** Insert row into `users`:
   - `id`: `usr_reg_<timestamp>_<random>`
   - `role`: `'ADVOCATE'`
   - `plan`: `'STARTER'`
   - `status`: `'ACTIVE'`
   - `name`, `email`, `firmName`, `designation`, `barCouncilEnrollment`
5. **Automatic Starter License Key Provisioning:**
   - Format: `HAYA-STR-XXXX-XXXX-XXXX` (random alphanumeric chunks).
   - Insert row into `licenses`:
     - `id`: `lic_str_<timestamp>_<random>`
     - `userId`: newly created user's ID
     - `licenseKey`: generated key
     - `planTier`: `'STARTER'`
     - `maxDevices`: `1`
     - `status`: `'ACTIVE'`
     - `expiresAt`: `Date.now() + 30 days` (or 1 year)
6. **Session Creation & Auto-Login:**
   - Generate signed `hayagriva_session` cookie containing `{ userId, email, role: 'ADVOCATE', name }`.
   - Set cookie with `httpOnly: true, secure: true, sameSite: 'lax', path: '/'`.
7. **Client Redirection:**
   - Auto-redirect to `/dashboard/licenses?new_registration=true`.
   - The Licenses page displays a prominent Welcome Alert:
     *"Welcome to Hayagriva! Your 1-Device Starter License Key is ready below. Download the desktop installer and paste your key to begin."*

---

## 3. Database Impact
- Uses existing Drizzle ORM schema (`users`, `licenses`).
- Compatible with Neon Serverless PostgreSQL and fallback mock store.
