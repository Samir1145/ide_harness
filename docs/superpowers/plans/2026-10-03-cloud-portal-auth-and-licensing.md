# Cloud Portal Authentication & Licensing Verification Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Link Hayagriva Desktop IDE's license verification and user authentication directly to the live cloud portal (`https://app-apnet-net.onrender.com`), implement the remote `POST /api/auth/login` endpoint on the Next.js cloud portal, wire the IDE's backend and frontend auth layers to authenticate against the cloud API with offline grace fallback, and update all user-facing login and license links to point directly to `https://app-apnet-net.onrender.com`.

**Architecture:** 
1. **Cloud Portal (`admin-panel`):** Implement `POST /api/auth/login` in Next.js App Router (`src/app/api/auth/login/route.ts`), validating credentials against database/mock store, attaching active licenses, and returning signed tokens.
2. **Desktop IDE Backend (`backend`):** Update `auth-service.js` to dispatch login requests to `https://app-apnet-net.onrender.com/api/auth/login`, sync credentials and attached licenses into `~/.hayagriva/user_accounts.json`, and retain offline cached verification with a 7-day grace window.
3. **Desktop IDE Frontend (`frontend`):** Update `auth-modal.ts`, `profile-widget.ts`, and `commands.ts` with direct portal URLs (`https://app-apnet-net.onrender.com/login`, `/register`, `/dashboard/licenses`), and wire both License Key Activation and Account Sign In tabs to the live cloud API.

**Tech Stack:** TypeScript, Next.js 15 App Router (Cloud Portal), Node.js HTTP/Fetch (Backend), Eclipse Theia / InversifyJS (Frontend Desktop IDE).

**Spec:** [`docs/superpowers/specs/2026-10-02-auth-profile-gating-design.md`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/superpowers/specs/2026-10-02-auth-profile-gating-design.md) & [`docs/superpowers/specs/2026-10-03-licensing-bridge-and-gating-design.md`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/superpowers/specs/2026-10-03-licensing-bridge-and-gating-design.md)

## Global Constraints

- **Offline-First Resilience:** Ingestion, Monaco editing, and local document browsing must remain 100% free and functional without any login or active internet connection.
- **7-Day Offline Grace Window:** When internet connection to `https://app-apnet-net.onrender.com` fails, previously authenticated litigators must have full access to local AI Agents for 7 days via cached credentials in `~/.hayagriva/user_accounts.json`.
- **Portal Base URL Single Source of Truth:** `https://app-apnet-net.onrender.com` is the authoritative portal URL across all backend services and frontend UI components, configurable via `process.env.HAYAGRIVA_PORTAL_URL`.
- **Cross-Matter Scoping:** Authentication state and license envelopes must reside globally in `~/.hayagriva/`, never polluting individual case folders (`HAYA_MATTERS/`).

## Review Focus

1. **Incorrect Password Failure:** When invalid credentials are submitted, `POST /api/auth/login` must return HTTP 401 with `{ ok: false, error: 'Invalid email or password' }` without leaking internal stack traces.
2. **Network Offline Fallback:** When `https://app-apnet-net.onrender.com` is unreachable (DNS error, offline, or timeout), backend `authenticateUser()` must check local `~/.hayagriva/user_accounts.json` and return `{ ok: true, isOfflineGrace: true }` if credentials match local cache.
3. **Device Limit Enforcement:** When activating a license key exceeding permitted hardware seats, the response must return HTTP 403 with `DEVICE_LIMIT_EXCEEDED` and a direct link to `https://app-apnet-net.onrender.com/dashboard/licenses`.
4. **License Auto-Attachment on Login:** When an advocate logs in via email/password, any active license already attached to their cloud account must automatically sync and activate locally in the IDE without requiring manual copy-pasting of license keys.
5. **CORS / Preflight Handling:** The Next.js cloud portal endpoint `POST /api/auth/login` must return proper CORS headers (`Access-Control-Allow-Origin`, `Access-Control-Allow-Headers`) to support browser and desktop clients.

---

### Task 1: Implement Cloud Login API in `admin-panel`

**Files:**
- Create: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/app/api/auth/login/route.ts`
- Modify: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/lib/services/registration.ts`
- Test: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/tests/auth_login_api.test.ts`

**Interfaces:**
- Consumes: `getMockStore()` from `src/lib/db/seed.ts`, `findUserByCredentials()` from `src/lib/services/registration.ts`
- Produces: `POST /api/auth/login` returning `{ success: boolean, ok: boolean, token: string, user: UserProfile, license?: LicenseSummary, leaseExpiresAt: string }`

- [x] **Step 1: Write the failing automated test for Cloud Login API**

Create `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/tests/auth_login_api.test.ts` asserting:
- Valid credentials (`superadmin@hayagriva.app`, `hayagriva_secure_password`) return `200 OK` with valid JWT token, user profile, and `ok: true`.
- Invalid password returns `401 Unauthorized` with `ok: false`.
- Missing fields return `400 Bad Request`.

- [x] **Step 2: Run test to verify it fails**

Run: `node --loader ts-node/esm /Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/tests/auth_login_api.test.ts` or `tsx /Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/tests/auth_login_api.test.ts`
Expected: FAIL (route or module not found).

- [x] **Step 3: Implement `POST /api/auth/login` and credential matcher**

Implement `src/app/api/auth/login/route.ts` and export helper in `src/lib/services/registration.ts`:
- Validate email/password against registered users and seed users.
- Fetch attached active license from store.
- Return signed session token and cookies.
- Include CORS headers (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: POST, OPTIONS`).

- [x] **Step 4: Run test to verify it passes**

Run: `tsx /Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/tests/auth_login_api.test.ts`
Expected: PASS.

- [x] **Step 5: Commit `admin-panel` changes**

```bash
git -C /Users/atulgrover/Desktop/HAYAGRIVA/admin-panel add src/app/api/auth/login/route.ts src/lib/services/registration.ts src/tests/auth_login_api.test.ts
git -C /Users/atulgrover/Desktop/HAYAGRIVA/admin-panel commit -m "feat(api): add POST /api/auth/login endpoint for desktop IDE authentication"
```

---

### Task 2: Update Desktop IDE Backend Auth Service for Cloud Login & Auto-License Sync

**Files:**
- Modify: `/Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/lib/core/auth-service.js`
- Modify: `/Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/lib/routes.js`
- Test: `/Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/tests/test_cloud_auth_integration.test.js`

**Interfaces:**
- Consumes: `https://app-apnet-net.onrender.com/api/auth/login`, `activateLicenseWithCloud` from `backend/lib/core/license-manager.js`
- Produces: `authenticateUser(email, password)` (async) returning `{ ok: boolean, token?: string, user?: AuthUser, leaseExpiresAt?: string, isOfflineGrace?: boolean, error?: string }`

- [x] **Step 1: Write the failing integration test**

Create `/Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/tests/test_cloud_auth_integration.test.js`:
- Mock/test `authenticateUser` dispatching to `HAYAGRIVA_PORTAL_URL`.
- Assert online 200 OK saves user to `~/.hayagriva/user_accounts.json`.
- Assert network error triggers graceful offline fallback using cached user account.
- Assert invalid credentials return `ok: false`.

- [x] **Step 2: Run test to verify it fails**

Run: `node /Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/tests/test_cloud_auth_integration.test.js`
Expected: FAIL (missing async cloud dispatch or offline fallback logic).

- [x] **Step 3: Implement cloud authentication in `auth-service.js` and `routes.js`**

- In `auth-service.js`: make `authenticateUser` async:
  - Query `fetch(`${portalUrl}/api/auth/login`, { method: 'POST', body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(5000) })`.
  - If successful: cache user profile in `~/.hayagriva/user_accounts.json`. If cloud user has `license?.licenseKey`, invoke `activateLicenseWithCloud(license.licenseKey)`.
  - If 401: return `{ ok: false, error: 'Invalid email or password' }`.
  - If network fails: check local accounts with `offlineGrace: true`.
- In `routes.js`: make `/api/auth/login` handler asynchronous (`await authService.authenticateUser(...)`).

- [x] **Step 4: Run test to verify it passes**

Run: `node /Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/tests/test_cloud_auth_integration.test.js`
Expected: PASS.

- [x] **Step 5: Commit `backend` changes**

```bash
git -C /Users/atulgrover/Desktop/HAYAGRIVA/harness add backend/lib/core/auth-service.js backend/lib/routes.js backend/tests/test_cloud_auth_integration.test.js
git -C /Users/atulgrover/Desktop/HAYAGRIVA/harness commit -m "feat(auth): integrate backend auth with cloud portal API and offline fallback"
```

---

### Task 3: Align License Manager & Settings URLs with `app-apnet-net.onrender.com`

**Files:**
- Modify: `/Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/lib/core/license-manager.js`
- Modify: `/Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/lib/assets/settings-dashboard.html`
- Test: `/Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/tests/test_license_manager_urls.test.js`

**Interfaces:**
- Consumes: `HAYAGRIVA_PORTAL_URL || 'https://app-apnet-net.onrender.com'`
- Produces: Consistent cloud verification links and device limit redirect URLs

- [x] **Step 1: Write the failing test for license URLs**

Create `/Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/tests/test_license_manager_urls.test.js`:
- Assert `portalUrl` defaults to `'https://app-apnet-net.onrender.com'`.
- Assert device limit errors return `https://app-apnet-net.onrender.com/dashboard/licenses`.

- [x] **Step 2: Run test to verify it fails**

Run: `node /Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/tests/test_license_manager_urls.test.js`
Expected: FAIL.

- [x] **Step 3: Update `license-manager.js` and `settings-dashboard.html`**

- Ensure all portal URLs explicitly default to `https://app-apnet-net.onrender.com`.
- Verify `settings-dashboard.html` contains direct portal links:
  - `https://app-apnet-net.onrender.com/dashboard/licenses`
  - `https://app-apnet-net.onrender.com/login`

- [x] **Step 4: Run test to verify it passes**

Run: `node /Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/tests/test_license_manager_urls.test.js`
Expected: PASS.

- [x] **Step 5: Commit changes**

```bash
git -C /Users/atulgrover/Desktop/HAYAGRIVA/harness add backend/lib/core/license-manager.js backend/lib/assets/settings-dashboard.html backend/tests/test_license_manager_urls.test.js
git -C /Users/atulgrover/Desktop/HAYAGRIVA/harness commit -m "fix(licensing): align license verification and portal URLs to app-apnet-net.onrender.com"
```

---

### Task 4: Update Desktop IDE Frontend (`AuthModal`, `ProfileWidget`, `commands.ts`)

**Files:**
- Modify: `/Users/atulgrover/Desktop/HAYAGRIVA/harness/frontend/theia-extensions/hayagriva/src/browser/auth-modal.ts`
- Modify: `/Users/atulgrover/Desktop/HAYAGRIVA/harness/frontend/theia-extensions/hayagriva/src/browser/profile-widget.ts`
- Modify: `/Users/atulgrover/Desktop/HAYAGRIVA/harness/frontend/theia-extensions/hayagriva/src/browser/commands.ts`
- Test: `/Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/tests/test_frontend_auth_links.test.js`

**Interfaces:**
- Consumes: `AuthModal`, `ProfileWidget`
- Produces: Clean UI links to `https://app-apnet-net.onrender.com/login`, `/register`, and `/dashboard/licenses`

- [x] **Step 1: Write static assertion test for frontend links**

Create `/Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/tests/test_frontend_auth_links.test.js`:
- Assert `auth-modal.ts` contains `https://app-apnet-net.onrender.com/login`.
- Assert `auth-modal.ts` contains `https://app-apnet-net.onrender.com/register`.
- Assert `auth-modal.ts` contains `https://app-apnet-net.onrender.com/dashboard/licenses`.
- Assert `profile-widget.ts` contains link to `https://app-apnet-net.onrender.com`.

- [x] **Step 2: Run test to verify it fails**

Run: `node /Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/tests/test_frontend_auth_links.test.js`
Expected: FAIL (missing register link or portal button).

- [x] **Step 3: Update `auth-modal.ts`, `profile-widget.ts`, and `commands.ts`**

- In `auth-modal.ts`:
  - Tab 1 (`⚡ License Key`):
    - Update link: `"Don't have a key? Get License on Portal →"` -> `https://app-apnet-net.onrender.com/login`
  - Tab 2 (`🔑 Account Sign In`):
    - Add helper link row: `"Need an account? Register on Portal →"` -> `https://app-apnet-net.onrender.com/register`
    - Add web fallback link: `"Open Web Portal Login →"` -> `https://app-apnet-net.onrender.com/login`
  - Error rendering: when device limit reached, make `https://app-apnet-net.onrender.com/dashboard/licenses` an active clickable anchor.
- In `profile-widget.ts`:
  - Add button in Popover: `"🌐 Open Cloud Portal"` linking to `https://app-apnet-net.onrender.com/dashboard`.
  - When authenticated, link to `"Manage Licenses & Devices →"` -> `https://app-apnet-net.onrender.com/dashboard/licenses`.

- [x] **Step 4: Run test to verify it passes**

Run: `node /Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/tests/test_frontend_auth_links.test.js`
Expected: PASS.

- [x] **Step 5: Commit frontend changes**

```bash
git -C /Users/atulgrover/Desktop/HAYAGRIVA/harness add frontend/theia-extensions/hayagriva/src/browser/auth-modal.ts frontend/theia-extensions/hayagriva/src/browser/profile-widget.ts frontend/theia-extensions/hayagriva/src/browser/commands.ts backend/tests/test_frontend_auth_links.test.js
git -C /Users/atulgrover/Desktop/HAYAGRIVA/harness commit -m "feat(ui): update AuthModal and ProfileWidget links to app-apnet-net.onrender.com"
```

---

## Verification Plan

### Automated Tests
```bash
# 1. Cloud Portal Login API Test
tsx /Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/tests/auth_login_api.test.ts

# 2. Desktop Backend Cloud Auth Integration & Offline Fallback Test
node /Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/tests/test_cloud_auth_integration.test.js

# 3. License Manager URL Alignment Test
node /Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/tests/test_license_manager_urls.test.js

# 4. Frontend UI Link Integrity Test
node /Users/atulgrover/Desktop/HAYAGRIVA/harness/backend/tests/test_frontend_auth_links.test.js
```

### Manual Verification
1. **Modal UI Verification:**
   - Launch IDE or inspect `AuthModal` in browser.
   - Verify **Tab 1 (`⚡ License Key`)** has working link to `https://app-apnet-net.onrender.com/login`.
   - Verify **Tab 2 (`🔑 Account Sign In`)** has working links to `https://app-apnet-net.onrender.com/register` and `https://app-apnet-net.onrender.com/login`.
2. **API Login Verification:**
   - Enter credentials in Tab 2 and submit.
   - Verify request dispatches through to `POST /api/auth/login` contacting `https://app-apnet-net.onrender.com`.
   - Verify user initials appear on the bottom-left profile anchor with green pip.
3. **Offline Grace Mode Verification:**
   - Simulate offline environment (disable network / mock endpoint).
   - Enter valid cached credentials.
   - Verify system signs in with `Offline Grace Mode (7 days remaining)`.
