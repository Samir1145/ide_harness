# Client Portal, Licensing Server & User Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready Client Portal (`/dashboard/*`), Desktop IDE Licensing Server (`POST /api/v1/activate`), hardware device slot management, and MCP Bearer Token generator in Next.js 15, Tailwind CSS, shadcn/ui, TanStack Table, Drizzle ORM, and Neon Serverless PostgreSQL.

**Architecture:** Additive database schema (`licenses`, `activations`, `api_keys`); cryptographic server-side token signing engine (Offline Tokens + MCP Bearer Tokens); edge middleware enforcing role-aware routing (`SUPER_ADMIN` vs `ADVOCATE`); and 6 high-density client portal views with full dark/light theme support.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Lucide Icons, `@tanstack/react-table`, Drizzle ORM, `@neondatabase/serverless`, Recharts, `next-themes`, Playwright.

**Spec:** [`docs/superpowers/specs/2026-10-02-client-portal-licensing-design.md`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/superpowers/specs/2026-10-02-client-portal-licensing-design.md)

---

## Global Constraints

- Must deploy seamlessly on Vercel Free Tier with zero connection pool limits using `@neondatabase/serverless` and Drizzle ORM.
- All client queries and actions must strictly scope data fetching to the authenticated `user.id`.
- The Email field on Profile & Security must be strictly locked (`🔒 IMMUTABLE`).
- The Desktop IDE must never self-generate MCP tokens or self-sign offline tokens; all tokens are cryptographically generated and signed by the backend server.
- Existing Super Admin routes (`/admin/*`) must remain fully functional with zero regressions.

---

## Review Focus

1. **Activation Handshake Integrity:** Verify `POST /api/v1/activate` handles initial activation, re-activation from the same hardware (idempotent), and device limit rejections (`403 DEVICE_LIMIT_EXCEEDED`).
2. **Cryptographic Signature Verification:** Ensure Offline Tokens are signed by server private secret and verifiable offline by the desktop IDE.
3. **Data Isolation:** Ensure an advocate cannot see or manipulate another user's licenses, devices, invoices, or logs.
4. **Device Slot Deactivation:** Ensure 1-click device deactivation immediately frees up a hardware slot.
5. **Dual-Theme & Responsive Shell:** Seamless visual parity between Dark Slate and Light SaaS themes.

---

### Task 1: Schema Extensions (`licenses`, `activations`, `api_keys`) & Mock Seed Store

**Files:**
- Modify: `admin-panel/src/lib/db/schema.ts`
- Modify: `admin-panel/src/lib/db/seed.ts`
- Test: `admin-panel/src/tests/licensing_db.test.ts`

**Interfaces:**
- Produces: `licenses`, `activations`, `apiKeys` schema tables, updated `seedInitialData()` with realistic licenses and devices.

- [x] **Step 1: Write the failing test for licensing schema and seed store**
  Create `admin-panel/src/tests/licensing_db.test.ts` asserting definition of `licenses`, `activations`, and `apiKeys` tables and seed data initialization.

- [x] **Step 2: Run test to verify it fails**
  Run: `npx tsx admin-panel/src/tests/licensing_db.test.ts`
  Expected: FAIL (missing exports).

- [x] **Step 3: Implement schema tables and seed data**
  Add `licenses`, `activations`, and `apiKeys` to `schema.ts`, and populate realistic advocate licenses in `seed.ts`.

- [x] **Step 4: Run test to verify it passes**
  Run: `npx tsx admin-panel/src/tests/licensing_db.test.ts`
  Expected: PASS.

- [x] **Step 5: Commit**
  ```bash
  git add admin-panel/src/lib/db/
  git commit -m "feat(licensing): add licenses, activations, and api_keys schema tables"
  ```

---

### Task 2: Cryptographic Token Signing Engine & Licensing Handshake API

**Files:**
- Create: `admin-panel/src/lib/security/tokens.ts`
- Create: `admin-panel/src/lib/services/licensing.ts`
- Create: `admin-panel/src/app/api/v1/activate/route.ts`
- Create: `admin-panel/src/app/api/v1/deactivate/route.ts`
- Test: `admin-panel/src/tests/token_engine.test.ts`
- Test: `admin-panel/src/tests/activation_handshake.test.ts`

**Interfaces:**
- Produces: `generateOfflineToken()`, `verifyOfflineToken()`, `generateMcpBearerToken()`, `activateDevice()`, `deactivateDevice()`.

- [x] **Step 1: Write failing tests for token engine and activation handshake**
  Assert HMAC signature creation/verification, tamper detection, new activation, device limit check, and device deactivation.

- [x] **Step 2: Run tests to verify they fail**
  Run: `npx tsx admin-panel/src/tests/token_engine.test.ts`
  Expected: FAIL.

- [x] **Step 3: Implement token signing engine, licensing service, and activation route handlers**
  Build token cryptographic utilities, activation pipeline, and `/api/v1/activate` + `/api/v1/deactivate` endpoints.

- [x] **Step 4: Run tests to verify they pass**
  Run: `npx tsx admin-panel/src/tests/token_engine.test.ts`
  Run: `npx tsx admin-panel/src/tests/activation_handshake.test.ts`
  Expected: PASS (100% tests pass).

- [x] **Step 5: Commit**
  ```bash
  git add admin-panel/src/lib/security/ admin-panel/src/lib/services/licensing.ts admin-panel/src/app/api/v1/
  git commit -m "feat(licensing): implement cryptographic token signing engine and activation handshake"
  ```

---

### Task 3: Client Portal Shell Layout, Sidebar Navigation & Role-Aware Routing

**Files:**
- Create: `admin-panel/src/components/client/sidebar.tsx`
- Create: `admin-panel/src/components/client/header.tsx`
- Create: `admin-panel/src/app/dashboard/layout.tsx`
- Modify: `admin-panel/src/middleware.ts`
- Modify: `admin-panel/src/app/login/page.tsx`
- Test: `admin-panel/src/tests/client_portal_rbac.test.ts`

**Interfaces:**
- Produces: 6-item client sidebar, top client header, and role-based login redirection (`SUPER_ADMIN` -> `/admin/dashboard`, `ADVOCATE` -> `/dashboard`).

- [x] **Step 1: Write failing test for role-aware routing and client data isolation**
  Assert access permissions for `/dashboard/*` and verification that non-superadmins are prevented from `/admin/*`.

- [x] **Step 2: Run test to verify it fails**
  Run: `npx tsx admin-panel/src/tests/client_portal_rbac.test.ts`
  Expected: FAIL.

- [x] **Step 3: Implement client sidebar, header, dashboard layout, and update login/middleware**
  Build the client navigation shell with live cloud status badge, theme switcher, and role-aware login routing.

- [x] **Step 4: Run test to verify it passes**
  Run: `npx tsx admin-panel/src/tests/client_portal_rbac.test.ts`
  Expected: PASS.

- [x] **Step 5: Commit**
  ```bash
  git add admin-panel/src/components/client/ admin-panel/src/app/dashboard/layout.tsx admin-panel/src/middleware.ts admin-panel/src/app/login/
  git commit -m "feat(client): implement client portal shell, sidebar navigation, and role-aware routing"
  ```

---

### Task 4: Practitioner Overview Dashboard (`/dashboard`)

**Files:**
- Create: `admin-panel/src/lib/services/client_overview.ts`
- Create: `admin-panel/src/app/api/user/overview/route.ts`
- Create: `admin-panel/src/app/dashboard/page.tsx`
- Test: `admin-panel/src/tests/client_overview.test.ts`

**Interfaces:**
- Consumes: `licenses`, `activations`, `system_logs`, `invoices` (filtered by `user_id`)
- Produces: Aggregated stats `{ license, activeDevices, maxDevices, apiRequestsUsed, apiQuota, recentLogs }`.

- [x] **Step 1: Write failing test for client overview calculation**
  Assert calculation of device capacity percentage, API request usage meter, and user-scoped recent activity.

- [x] **Step 2: Run test to verify it fails**
  Run: `npx tsx admin-panel/src/tests/client_overview.test.ts`
  Expected: FAIL.

- [x] **Step 3: Implement client overview service, `/api/user/overview` endpoint, and Dashboard UI**
  Build License Capacity card, API Usage Progress Bar, Subscription Renewal card, and Recent Activity Feed.

- [x] **Step 4: Run test to verify it passes**
  Run: `npx tsx admin-panel/src/tests/client_overview.test.ts`
  Expected: PASS.

- [x] **Step 5: Commit**
  ```bash
  git add admin-panel/src/lib/services/client_overview.ts admin-panel/src/app/api/user/overview/ admin-panel/src/app/dashboard/page.tsx
  git commit -m "feat(client): implement practitioner overview dashboard with license capacity and api usage meters"
  ```

---

### Task 5: Licenses & Device Management (`/dashboard/licenses`)

**Files:**
- Create: `admin-panel/src/components/client/deactivate-modal.tsx`
- Create: `admin-panel/src/app/api/user/licenses/route.ts`
- Create: `admin-panel/src/app/dashboard/licenses/page.tsx`
- Test: `admin-panel/src/tests/client_licenses_ui.test.ts`

**Interfaces:**
- Consumes: `licenses`, `activations`
- Produces: License key card with reveal/copy toggle, active devices table, 1-click device deactivation, and desktop installers links.

- [x] **Step 1: Write failing test for user licenses query and deactivation**
  Assert querying user licenses and deactivating a registered hardware device.

- [x] **Step 2: Run test to verify it fails**
  Run: `npx tsx admin-panel/src/tests/client_licenses_ui.test.ts`
  Expected: FAIL.

- [x] **Step 3: Implement `/api/user/licenses` route, Deactivate Modal, and Licenses & Devices Page UI**
  Build license key reveal/copy card, registered devices data table, deactivation modal, and platform download pills.

- [x] **Step 4: Run test to verify it passes**
  Run: `npx tsx admin-panel/src/tests/client_licenses_ui.test.ts`
  Expected: PASS.

- [x] **Step 5: Commit**
  ```bash
  git add admin-panel/src/components/client/deactivate-modal.tsx admin-panel/src/app/api/user/licenses/ admin-panel/src/app/dashboard/licenses/
  git commit -m "feat(client): implement licenses and hardware device slot management"
  ```

---

### Task 6: Practitioner Profile, Security & MCP API Keys (`/dashboard/profile`)

**Files:**
- Create: `admin-panel/src/components/client/generate-key-modal.tsx`
- Create: `admin-panel/src/app/api/user/keys/route.ts`
- Create: `admin-panel/src/app/api/user/profile/route.ts`
- Create: `admin-panel/src/app/dashboard/profile/page.tsx`
- Test: `admin-panel/src/tests/client_profile_keys.test.ts`

**Interfaces:**
- Consumes: `users`, `api_keys`
- Produces: Profile update handler (with immutable email guard), change password, 2FA toggle, and MCP API key generator.

- [x] **Step 1: Write failing test for profile update constraints and MCP key generation**
  Assert locked email immutability and programmatic MCP API key creation/revocation.

- [x] **Step 2: Run test to verify it fails**
  Run: `npx tsx admin-panel/src/tests/client_profile_keys.test.ts`
  Expected: FAIL.

- [x] **Step 3: Implement `/api/user/keys`, `/api/user/profile`, Generate Key Modal, and Profile Page UI**
  Build personal details form with locked email badge, password change, 2FA wizard, and MCP API keys table.

- [x] **Step 4: Run test to verify it passes**
  Run: `npx tsx admin-panel/src/tests/client_profile_keys.test.ts`
  Expected: PASS.

- [x] **Step 5: Commit**
  ```bash
  git add admin-panel/src/components/client/generate-key-modal.tsx admin-panel/src/app/api/user/keys/ admin-panel/src/app/dashboard/profile/
  git commit -m "feat(client): implement profile, security, 2fa and mcp api key generation"
  ```

---

### Task 7: Client Billing, API Logs & Support Tickets Views

**Files:**
- Create: `admin-panel/src/app/api/user/invoices/route.ts` & `src/app/dashboard/billing/page.tsx`
- Create: `admin-panel/src/app/api/user/logs/route.ts` & `src/app/dashboard/logs/page.tsx`
- Create: `admin-panel/src/components/client/create-ticket-modal.tsx`
- Create: `admin-panel/src/app/api/user/support/route.ts` & `src/app/dashboard/support/page.tsx`
- Test: `admin-panel/src/tests/client_secondary_modules.test.ts`

**Interfaces:**
- Consumes: `invoices`, `system_logs`, `support_tickets` (strictly scoped to `userId`).

- [x] **Step 1: Write failing test for client billing, logs, and support ticket creation**
  Assert invoice download triggers, user log filtering, and support ticket submission.

- [x] **Step 2: Run test to verify it fails**
  Run: `npx tsx admin-panel/src/tests/client_secondary_modules.test.ts`
  Expected: FAIL.

- [x] **Step 3: Implement Billing & Invoices, API Logs, and Support Ticket filing pages**
  Create invoice ledger table with PDF download triggers, scoped logs table, and support ticket creation modal.

- [x] **Step 4: Run test to verify it passes**
  Run: `npx tsx admin-panel/src/tests/client_secondary_modules.test.ts`
  Expected: PASS.

- [x] **Step 5: Commit**
  ```bash
  git add admin-panel/src/app/dashboard/billing/ admin-panel/src/app/dashboard/logs/ admin-panel/src/app/dashboard/support/
  git commit -m "feat(client): implement billing invoices, scoped logs, and support ticketing views"
  ```

---

### Task 8: Playwright End-to-End Test Suite & Production Build Verification

**Files:**
- Create: `admin-panel/src/tests/e2e_client_portal_playwright.js`

- [x] **Step 1: Write Playwright E2E test script covering all 6 client views and activation handshake**
  Automate login as advocate, viewing overview, revealing license key, deactivating a device, creating an MCP key, filtering logs, submitting a support ticket, and theme toggle.

- [x] **Step 2: Execute Playwright test suite and capture visual screenshot artifacts**
  Run: `node admin-panel/src/tests/e2e_client_portal_playwright.js`
  Expected: 100% scenarios pass.

- [x] **Step 3: Verify Next.js Production Build**
  Run: `npm --prefix admin-panel run build`
  Expected: 0 TypeScript and ESLint errors.

- [x] **Step 4: Commit**
  ```bash
  git add admin-panel/src/tests/e2e_client_portal_playwright.js
  git commit -m "test(client): add comprehensive playwright e2e suite and verify production build"
  ```
