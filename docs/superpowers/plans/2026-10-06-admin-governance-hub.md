# Admin Governance Hub, Asset Control & Agent Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Super Admin Governance & Asset Management suite in the `admin-panel` web portal to oversee Desktop Harness releases, Statutory Bare Act Vaults, AI Models, and Custom Agent Cartridges.

**Architecture:** Next.js 15 (App Router) + React 19 + Tailwind CSS + Drizzle ORM in `admin-panel`. Adds comprehensive admin oversight across: (1) Harness desktop binary release control; (2) Statutory Bare Act Vaults India Code mirror status; (3) AI Models GGUF distribution telemetry; (4) Custom Agent Cartridges moderation & promotion; and (5) Executive Dashboard metrics expansion.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Lucide React, Drizzle ORM, Neon PostgreSQL.

---

## Global Constraints

- Keep `admin-panel` styling strictly aligned with the dark theme: slate-900 / zinc-950 cards with amber-500 / gold accents (`#f59e0b`).
- Admin views must provide authoritative governance controls (promotion to official templates, India Code re-sync triggers, checksum inspections).
- Keep code DRY, modular, and type-safe using exported types from `src/lib/db/schema.ts` and `src/components/agents/archetypes.ts`.

## Review Focus

1. **RBAC Guard:** Ensure all `/admin/*` routes remain strictly gated to `SUPER_ADMIN` and `ADMIN` roles.
2. **Schema Integration:** Ensure custom agents listed in `/admin/agents` reflect records from the `customAgents` table.
3. **Responsive Layouts:** Tables and management cards must render cleanly on wide screens (≥ 1280px) and wrap cleanly on smaller viewports.
4. **Zero Build Regressions:** Next.js production build (`npm run build`) must compile cleanly with 0 errors.

---

### Task 1: Admin Sidebar Segregation & Navigation Update

**Files:**
- Modify: `admin-panel/src/components/admin/sidebar.tsx`
- Test: `admin-panel/src/tests/admin_sidebar.test.ts`

**Interfaces:**
- Produces segregated sections:
  - `Control Center`: Executive Dashboard (`/admin/dashboard`), Users & Hardware Seats (`/admin/users`)
  - `Asset & Distribution Engine`: Desktop Harness Releases (`/admin/harness`), Statutory Bare Act Vaults (`/admin/vaults`), AI Models Registry (`/admin/models`), Asset Telemetry (`/admin/downloads`)
  - `Agent Foundry Management`: Agent Cartridges Directory (`/admin/agents`)
  - `Commercial & Governance`: Billing & Invoices (`/admin/invoices`), System & API Logs (`/admin/logs`), Support Tickets (`/admin/support`), Admin Profile (`/admin/profile`)

- [ ] **Step 1: Write test for admin sidebar segregated navigation routes**
- [ ] **Step 2: Update `AdminSidebar` in `src/components/admin/sidebar.tsx` with 4 segregated management groups**
- [ ] **Step 3: Run test to verify pass**
- [ ] **Step 4: Commit changes (`git commit -m "feat(admin): segregate admin sidebar into control center, assets, agents, and governance"`)**

---

### Task 2: Desktop Harness Release Manager Page (`/admin/harness`)

**Files:**
- Create: `admin-panel/src/app/admin/harness/page.tsx`
- Test: `admin-panel/src/tests/admin_harness.test.ts`

**Interfaces:**
- Produces:
  - Active Release banner (`v1.2.0 (Stable)`) with release date, total installs count, and release notes editor.
  - Multi-platform binary cards (macOS ARM64, macOS x64, Windows x64, Linux AppImage) with download URLs, file sizes, and SHA-256 checksum fields.
  - "Publish New Release / Rollout Update" action modal/button.

- [ ] **Step 1: Write test for Harness Release Manager page**
- [ ] **Step 2: Implement `/admin/harness/page.tsx`**
- [ ] **Step 3: Run test to verify pass**
- [ ] **Step 4: Commit changes (`git commit -m "feat(admin): add desktop harness release management page"`)**

---

### Task 3: Statutory Bare Act Vaults Governance & India Code Sync (`/admin/vaults`)

**Files:**
- Create: `admin-panel/src/app/admin/vaults/page.tsx`
- Test: `admin-panel/src/tests/admin_vaults.test.ts`

**Interfaces:**
- Produces:
  - Legislative Mirror Overview header tracking 6 chamber bare acts (IBC, CIRP Regs, CCA, CPC, CA, NI Act) with total sections count (1,108 sections), encrypted storage size (31.2 MB), and average boot RAM (~81 KB).
  - Telemetry Table with columns: Vault File, Statute Name, Act Code, Sections Count, Legislative Sync Source (`indiacode.gov.in`), Encryption (`AES-256-GCM`), SHA-256 Hash, and Actions ("Trigger India Code Re-Sync", "Inspect Vault Manifest").

- [ ] **Step 1: Write test for Statutory Vaults governance page**
- [ ] **Step 2: Implement `/admin/vaults/page.tsx`**
- [ ] **Step 3: Run test to verify pass**
- [ ] **Step 4: Commit changes (`git commit -m "feat(admin): add statutory bare act vaults governance page"`)**

---

### Task 4: AI Models & GGUF Quantization Registry (`/admin/models`)

**Files:**
- Create: `admin-panel/src/app/admin/models/page.tsx`
- Test: `admin-panel/src/tests/admin_models.test.ts`

**Interfaces:**
- Produces:
  - AI Engine Distribution telemetry tracking downloads of `DeepSeek-R1-7B`, `Llama-3.2-3B`, and `BGE-Small-ONNX`.
  - Model Registry cards displaying Architecture, Quantization (`Q4_K_M`), Size, Recommended VRAM/RAM, Drop Paths, and Download Endpoints.
  - "Register New GGUF/ONNX Model" action button.

- [ ] **Step 1: Write test for AI Models Registry page**
- [ ] **Step 2: Implement `/admin/models/page.tsx`**
- [ ] **Step 3: Run test to verify pass**
- [ ] **Step 4: Commit changes (`git commit -m "feat(admin): add AI models and quantization registry page"`)**

---

### Task 5: Agent Cartridges Directory & Moderation (`/admin/agents`)

**Files:**
- Create: `admin-panel/src/app/admin/agents/page.tsx`
- Test: `admin-panel/src/tests/admin_agents.test.ts`

**Interfaces:**
- Produces:
  - Agent Foundry Metrics header: Total Custom Agents, Official Chamber Cartridges, Total `.haya` Downloads, Most Active Archetype.
  - Filter bar: Search by name/handle, filter by Archetype, and filter by Status (`All`, `Official`, `Community`, `Pending Review`).
  - Master Table: Agent Name & Version, Author & Firm, Archetype, Bound Vaults, Downloads Count, Status Badge, and Actions ("Inspect Manifest", "Download .haya", "Promote to Official Chamber Template").

- [ ] **Step 1: Write test for Agent Cartridges directory page**
- [ ] **Step 2: Implement `/admin/agents/page.tsx`**
- [ ] **Step 3: Run test to verify pass**
- [ ] **Step 4: Commit changes (`git commit -m "feat(admin): add agent cartridges directory and moderation page"`)**

---

### Task 6: Executive Dashboard Metrics Expansion (`/admin/dashboard`)

**Files:**
- Modify: `admin-panel/src/app/admin/dashboard/page.tsx`

**Interfaces:**
- Expands executive overview metrics:
  - Adds "Active Agent Cartridges" metric card
  - Adds "Chamber Bare Act Vaults" metric card
  - Adds quick-action links to `/admin/agents` and `/admin/vaults`

- [ ] **Step 1: Update `/admin/dashboard/page.tsx` with expanded asset and agent metrics**
- [ ] **Step 2: Verify dashboard builds and renders cleanly**
- [ ] **Step 3: Commit changes (`git commit -m "feat(admin): expand executive dashboard with agent and vault metrics"`)**

---

### Task 7: Production Build & Full Verification

**Files:**
- Run: `npm run build`
- Run: Full test suite execution across all admin tests
- Run: Chrome CDP screenshot capture for showcase

- [ ] **Step 1: Run `npm run build` in `admin-panel` to ensure 0 compilation or lint errors**
- [ ] **Step 2: Run all admin test suites**
- [ ] **Step 3: Capture Chrome CDP screenshots of `/admin/agents`, `/admin/vaults`, `/admin/models`, and `/admin/harness`**
- [ ] **Step 4: Embed screenshots and present completion report**
