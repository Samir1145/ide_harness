# User Registration & Automatic License Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement self-service practitioner registration (`/register`), backend registration API (`POST /api/auth/register`), automatic 1-device Starter license key provisioning (`HAYA-STR-...`), auto-login session cookies, and login page navigation links.

**Architecture:** A responsive Next.js 15 App Router registration page with dual-theme styling; a transactional registration handler querying/inserting into Neon Serverless PostgreSQL (`users` + `licenses` tables) with mock store fallback; password hashing; automatic generation of a 1-device Starter license; and signed session cookie issuance redirecting to `/dashboard/licenses`.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Lucide Icons, Drizzle ORM, `@neondatabase/serverless`, Playwright E2E.

**Spec:** [`docs/superpowers/specs/2026-10-02-user-registration-flow.md`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/superpowers/specs/2026-10-02-user-registration-flow.md)

---

## Global Constraints

- Must deploy seamlessly on Vercel and Render with zero connection pool limits using `@neondatabase/serverless` and Drizzle ORM.
- Email uniqueness is strictly enforced (`409 Conflict` on duplicate).
- New registered users receive `role = 'ADVOCATE'` and `plan = 'STARTER'`.
- Automatically provisions exactly 1 active Starter license key with `max_devices = 1`.
- Registration immediately sets the `hayagriva_session` cookie and redirects to `/dashboard/licenses`.
- All forms support dual-theme parity (Dark Slate default + Light SaaS mode).

---

## Review Focus

1. **Duplicate Email Rejection:** Ensure submitting an already-registered email returns a clean user-facing error message and does not create orphan records.
2. **Password Mismatch & Minimum Length:** Ensure passwords shorter than 8 characters or non-matching confirmation passwords are rejected both client-side and server-side.
3. **Automatic License Provisioning:** Verify that every new user record is atomically accompanied by a valid Starter license in the `licenses` table.
4. **Immediate Auto-Login & Session Cookie:** Ensure the practitioner is immediately logged in upon successful registration without needing to visit `/login`.
5. **Activation Compatibility:** Ensure the auto-provisioned Starter license key works with `POST /api/v1/activate` from the desktop harness.

---

### Task 1: Registration Service & Backend API Route (`POST /api/auth/register`)

**Files:**
- Create: `admin-panel/src/lib/services/registration.ts`
- Create: `admin-panel/src/app/api/auth/register/route.ts`
- Test: `admin-panel/src/tests/registration_api.test.ts`

**Interfaces:**
- Produces: `registerPractitioner(data: RegisterInput): Promise<{ user: User, license: License, sessionToken: string }>`
- Consumes: `users`, `licenses` tables in `admin-panel/src/lib/db/schema.ts` and `tokens.ts`.

- [x] **Step 1: Write failing test for registration service and API**
  Create `admin-panel/src/tests/registration_api.test.ts` testing:
  - Successful registration with auto-provisioned Starter license.
  - Rejection of duplicate email with `409 Conflict`.
  - Rejection of passwords < 8 characters.
  - Generation of valid session cookie payload.

- [x] **Step 2: Run test to verify it fails**
  Run: `npx tsx admin-panel/src/tests/registration_api.test.ts`
  Expected: FAIL (module not found).

- [x] **Step 3: Implement `registration.ts` service and `/api/auth/register` route handler**
  Build input validation, email duplicate guard, password hashing, user insertion (`role: 'ADVOCATE', plan: 'STARTER'`), license generation (`HAYA-STR-...`), and session cookie creation.

- [x] **Step 4: Run test to verify it passes**
  Run: `npx tsx admin-panel/src/tests/registration_api.test.ts`
  Expected: PASS.

- [x] **Step 5: Commit**
  ```bash
  git add admin-panel/src/lib/services/registration.ts admin-panel/src/app/api/auth/register/ admin-panel/src/tests/registration_api.test.ts
  git commit -m "feat(auth): implement registration service and auto-license provisioning API"
  ```

---

### Task 2: Registration UI View (`/register`) & Theme Harmony

**Files:**
- Create: `admin-panel/src/app/register/page.tsx`
- Test: `admin-panel/src/tests/registration_page.test.ts`

**Interfaces:**
- Produces: Responsive registration form with Full Name, Email, Role Selector, Password, Confirm Password, Law Firm Name, Bar Council/IBBI ID, and Terms checkbox.
- Consumes: `POST /api/auth/register`.

- [x] **Step 1: Write test for registration page component logic and validation**
  Create `admin-panel/src/tests/registration_page.test.ts` verifying field presence, role options, and error state handling.

- [x] **Step 2: Run test to verify it fails**
  Run: `npx tsx admin-panel/src/tests/registration_page.test.ts`
  Expected: FAIL.

- [x] **Step 3: Implement `src/app/register/page.tsx`**
  Build the Next.js page with Tailwind CSS, shadcn card layout, role dropdown (`Advocate / Litigator`, `Insolvency Professional (IP)`, `Law Firm Partner`, `Chartered Accountant`, `Corporate In-House Counsel`), loading spinner, error alert banner, and direct auto-login redirection to `/dashboard/licenses`.

- [x] **Step 4: Run test to verify it passes**
  Run: `npx tsx admin-panel/src/tests/registration_page.test.ts`
  Expected: PASS.

- [x] **Step 5: Commit**
  ```bash
  git add admin-panel/src/app/register/page.tsx admin-panel/src/tests/registration_page.test.ts
  git commit -m "feat(auth): create practitioner registration view with role selectors and live validation"
  ```

---

### Task 3: Login Page Links & Welcome Banner on Licenses Page

**Files:**
- Modify: `admin-panel/src/app/login/page.tsx`
- Modify: `admin-panel/src/app/dashboard/licenses/page.tsx`
- Test: `admin-panel/src/tests/auth_links.test.ts`

**Interfaces:**
- Produces: `"Don't have an account? Create Free Account →"` on `/login`, and `new_registration` query parameter welcome alert on `/dashboard/licenses`.

- [x] **Step 1: Write test for navigation links and welcome banner trigger**
  Assert login page contains link to `/register` and licenses page renders welcome message when `?new_registration=true`.

- [x] **Step 2: Run test to verify it fails**
  Run: `npx tsx admin-panel/src/tests/auth_links.test.ts`
  Expected: FAIL.

- [x] **Step 3: Update `login/page.tsx` and `dashboard/licenses/page.tsx`**
  Add the registration CTA link on the login page and a vibrant welcome card on the licenses page when arriving from registration.

- [x] **Step 4: Run test to verify it passes**
  Run: `npx tsx admin-panel/src/tests/auth_links.test.ts`
  Expected: PASS.

- [x] **Step 5: Commit**
  ```bash
  git add admin-panel/src/app/login/page.tsx admin-panel/src/app/dashboard/licenses/page.tsx admin-panel/src/tests/auth_links.test.ts
  git commit -m "feat(ui): add registration links to login page and welcome banner on licenses dashboard"
  ```

---

### Task 4: Playwright End-to-End Registration Test & Production Verification

**Files:**
- Create: `admin-panel/src/tests/e2e_registration_playwright.js`

- [x] **Step 1: Write Playwright E2E test script covering the complete registration flow**
  Automate navigating from `/login` $\rightarrow$ clicking "Create Account" $\rightarrow$ filling registration form for a new advocate $\rightarrow$ submitting form $\rightarrow$ verifying redirect to `/dashboard/licenses` with active Starter license $\rightarrow$ verifying that the auto-generated license key successfully activates a device via `POST /api/v1/activate`.

- [x] **Step 2: Execute Playwright test suite and capture visual screenshot artifacts**
  Run: `node admin-panel/src/tests/e2e_registration_playwright.js`
  Expected: 100% scenarios pass.

- [x] **Step 3: Verify Next.js Production Build**
  Run: `npm --prefix admin-panel run build`
  Expected: 0 TypeScript and Next.js build errors.

- [x] **Step 4: Commit and Push to GitHub**
  ```bash
  git add .
  git commit -m "test(registration): add e2e playwright registration suite and verify production build"
  git push origin main
  ```
