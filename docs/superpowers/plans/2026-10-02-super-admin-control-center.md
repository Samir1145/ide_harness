# Super Admin Control Center & Telemetry Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready, high-density Super Admin Control Center in Next.js 15, Tailwind CSS, shadcn/ui, TanStack Table, Drizzle ORM, and Neon Serverless PostgreSQL, ready for 1-click deployment on Vercel Free Tier.

**Architecture:** Next.js 15 App Router application with serverless Neon PostgreSQL integration via `@neondatabase/serverless` and Drizzle ORM; high-density responsive dashboard shell with 7 views; TanStack Table data grids with column filters and sorting; RBAC middleware protecting `/admin/*` routes; soft-deletion with immutable audit log capture; and dual-theme support (`next-themes`).

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Lucide Icons, `@tanstack/react-table`, Drizzle ORM, `@neondatabase/serverless`, Recharts, `next-themes`, Playwright.

**Spec:** [`docs/superpowers/specs/2026-10-02-super-admin-control-center-design.md`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/superpowers/specs/2026-10-02-super-admin-control-center-design.md)

## Global Constraints

- Must deploy cleanly on Vercel Free Tier without serverless connection limits.
- The project must use `@neondatabase/serverless` with Drizzle ORM HTTP adapter.
- The Email field on User Edit page (`/admin/users/[id]/edit`) must be strictly locked/disabled.
- User deletion must be a Soft Deletion (`is_deleted = true`) recording admin ID and timestamp.
- Every administrative action must write an immutable entry to `admin_audit_logs`.
- Must provide dual-theme support (Default Dark Slate + 1-Click Light SaaS theme).

## Review Focus

1. **Neon Serverless Cold Boot:** Must gracefully fall back to seed data if `DATABASE_URL` is unset or database is initializing.
2. **TanStack Table Performance:** Data table sorting, global fuzzy search, and faceted filtering must remain snappy with large datasets.
3. **Locked Email Integrity:** Editing user form must not submit or allow modification of the email address.
4. **Soft Delete vs Hard Delete:** Ensure deleting a user sets `is_deleted = true` without removing the row from PostgreSQL.
5. **RBAC Edge Guard:** Unauthenticated or non-`SUPER_ADMIN` requests to `/admin/*` must be intercepted and redirected before page rendering.

---

### Task 1: Next.js 15 Project Scaffolding, Neon PostgreSQL Schema & Drizzle ORM Data Layer

**Files:**
- Create: `admin-panel/package.json`
- Create: `admin-panel/tsconfig.json`
- Create: `admin-panel/tailwind.config.ts`
- Create: `admin-panel/drizzle.config.ts`
- Create: `admin-panel/src/lib/db/schema.ts`
- Create: `admin-panel/src/lib/db/index.ts`
- Create: `admin-panel/src/lib/db/seed.ts`
- Test: `admin-panel/src/tests/db.test.ts`

**Interfaces:**
- Produces: `db`, `schema` (users, system_logs, invoices, download_telemetry, support_tickets, admin_audit_logs), `seedDatabase()`

- [x] **Step 1: Write the failing test for schema and seed operations**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Scaffold Next.js project and implement Drizzle schema + Neon DB adapter**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: Global Shell Layout, Top Header, Dark/Light Theme & RBAC Middleware

**Files:**
- Create: `admin-panel/src/middleware.ts`
- Create: `admin-panel/src/app/layout.tsx`
- Create: `admin-panel/src/app/admin/layout.tsx`
- Create: `admin-panel/src/components/admin/sidebar.tsx`
- Create: `admin-panel/src/components/admin/header.tsx`
- Create: `admin-panel/src/components/theme-provider.tsx`
- Test: `admin-panel/src/tests/auth_rbac.test.ts`

**Interfaces:**
- Consumes: `users` table
- Produces: Persistent 7-item sidebar, top command header, theme toggle, and `SUPER_ADMIN` route guard

- [x] **Step 1: Write the failing test for RBAC route protection**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Implement RBAC middleware, global layout, sidebar navigation, and header**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: Executive Dashboard (`/admin/dashboard`) with Stat Cards, Revenue Chart & Activity Stream

**Files:**
- Create: `admin-panel/src/app/admin/dashboard/page.tsx`
- Create: `admin-panel/src/components/admin/metrics-card.tsx`
- Create: `admin-panel/src/components/admin/revenue-chart.tsx`
- Create: `admin-panel/src/components/admin/activity-stream.tsx`
- Create: `admin-panel/src/app/api/admin/metrics/route.ts`
- Test: `admin-panel/src/tests/dashboard_metrics.test.ts`

**Interfaces:**
- Consumes: `download_telemetry`, `users`, `invoices`, `system_logs`
- Produces: Aggregated stats `{ downloads, activeUsers, totalRevenue, recentActivity }`

- [x] **Step 1: Write failing test for metrics computation**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Implement `/api/admin/metrics` and Dashboard Page UI**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: Users Management Datatable (`/admin/users`) with TanStack Table, Filters & View Drawer

**Files:**
- Create: `admin-panel/src/app/admin/users/page.tsx`
- Create: `admin-panel/src/components/admin/users-table.tsx`
- Create: `admin-panel/src/components/admin/user-view-drawer.tsx`
- Create: `admin-panel/src/components/admin/soft-delete-modal.tsx`
- Create: `admin-panel/src/app/api/admin/users/route.ts`
- Test: `admin-panel/src/tests/users_table.test.ts`

**Interfaces:**
- Consumes: `users` table, `admin_audit_logs`
- Produces: Paginated/filtered user list, soft-delete action, view drawer

- [x] **Step 1: Write failing test for users query and soft-deletion**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Implement Users Datatable, View Drawer, and Soft Delete modal**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: User Edit Page (`/admin/users/[id]/edit`) with Locked Email, Status Toggle & Password Reset

**Files:**
- Create: `admin-panel/src/app/admin/users/[id]/edit/page.tsx`
- Create: `admin-panel/src/components/admin/user-edit-form.tsx`
- Create: `admin-panel/src/app/api/admin/users/[id]/route.ts`
- Create: `admin-panel/src/app/api/admin/users/[id]/reset-password/route.ts`
- Test: `admin-panel/src/tests/user_edit.test.ts`

**Interfaces:**
- Consumes: `users` table
- Produces: User update action (rejecting email changes), password reset generator, status toggle

- [x] **Step 1: Write failing test for user edit form constraints**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Implement User Edit Page UI, locked email badge, and API endpoints**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 6: Overall Logs, Invoices, Download Analytics, Support Tickets & Profile Views

**Files:**
- Create: `admin-panel/src/app/admin/logs/page.tsx` & `src/app/api/admin/logs/route.ts`
- Create: `admin-panel/src/app/admin/invoices/page.tsx` & `src/app/api/admin/invoices/route.ts`
- Create: `admin-panel/src/app/admin/downloads/page.tsx` & `src/app/api/admin/downloads/route.ts`
- Create: `admin-panel/src/app/admin/support/page.tsx` & `src/app/api/admin/support/route.ts`
- Create: `admin-panel/src/app/admin/profile/page.tsx`
- Test: `admin-panel/src/tests/admin_modules.test.ts`

**Interfaces:**
- Consumes: `system_logs`, `invoices`, `download_telemetry`, `support_tickets`, `admin_audit_logs`

- [x] **Step 1: Write failing test for secondary module endpoints**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Implement Logs, Invoices, Downloads, Tickets, and Profile pages**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 7: Playwright End-to-End Verification Suite & Production Build

**Files:**
- Create: `admin-panel/playwright.config.ts`
- Create: `admin-panel/src/tests/e2e_admin_playwright.js`

- [x] **Step 1: Create Playwright test script verifying all 7 views and interactive controls**
- [x] **Step 2: Run Playwright test suite and capture visual evidence**
- [x] **Step 3: Verify Next.js production build**
- [x] **Step 4: Commit**
