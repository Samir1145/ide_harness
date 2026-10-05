# Sovereign Agent Foundry, Builder & Cartridge Compiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Hayagriva Agent Foundry, Split-Pane Builder, Cartridge Compiler, and Segregated Asset & Downloads Hub within the `admin-panel` web portal.

**Architecture:** Next.js 15 (App Router) + React 19 + Tailwind CSS + Drizzle ORM (PostgreSQL) in `admin-panel`. The system provides: (1) segregated download hubs for Harness binaries, bare act vaults, and GGUF models; (2) an OpenAI/Mistral-inspired split-screen Agent Builder with 5 Court Archetype templates; and (3) an air-gapped `.haya` cartridge compiler that produces portable zip bundles for the `harness` sovereign desktop IDE.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Lucide React, JSZip, Drizzle ORM, Neon PostgreSQL, Playwright / CDP Browser Automation.

**Spec:** [`docs/superpowers/specs/2026-10-05-agent-builder-foundry-design.md`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/superpowers/specs/2026-10-05-agent-builder-foundry-design.md)

---

## Global Constraints

- Keep `admin-panel` styling strictly aligned with the dark theme: slate-900 / zinc-950 cards with amber-500 / gold accents (`#f59e0b`).
- Segregate commercial accounting (Billing & Invoices) completely from technical assets (Harness, Vaults, Models, Agents).
- All compiled `.haya` cartridges must strictly conform to the cartridge schema containing `manifest.json`, `system_prompt.md`, `rules.json`, `templates/`, and `medallion.svg`.
- The UI must adhere to Dyad's design principles: "Never a dead end", "Quiet confidence", and "Protect the moment of intent".

## Review Focus

1. **Cartridge Integrity:** Exported `.haya` archive must be a valid, uncorrupted zip file readable by standard unzippers and chokidar watchers.
2. **State Preservation:** Switching between tabs (Sandbox Simulator vs. Cartridge JSON) must preserve all in-progress prompt edits without data loss.
3. **Archetype Selection:** Selecting any of the 5 archetypes must pre-populate all configuration fields (name, prompt, vaults, delegation toggle) cleanly.
4. **Offline Capability:** Download pages must render all binary, vault, and model metadata with SHA-256 hashes and copy-paste installation paths.
5. **No Layout Shift / Responsiveness:** The split-screen studio must fit comfortably on desktop screens (≥ 1280px) and stack gracefully on narrower viewports.

---

### Task 1: Sidebar Information Architecture & Navigation Segregation

**Files:**
- Modify: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/components/client/sidebar.tsx`
- Test: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/__tests__/sidebar.test.tsx` (or route check)

**Interfaces:**
- Produces navigation sections:
  - `Overview` (`/dashboard`)
  - `Downloads & Runtime`: Desktop Harness (`/dashboard/harness`), Bare Act Vaults (`/dashboard/vaults`), AI Models Hub (`/dashboard/models`)
  - `Agent Foundry`: Agent Studio & Registry (`/dashboard/agents`), My Sovereign Inventory (`/dashboard/my-assets`)
  - `Governance & Accounting`: Licenses & Devices (`/dashboard/licenses`), Billing & Tax Invoices (`/dashboard/billing`), Profile & Security (`/dashboard/profile`), Support (`/dashboard/support`)

- [ ] **Step 1: Write test/verification check for sidebar navigation routes**
- [ ] **Step 2: Update `ClientSidebar` in `admin-panel/src/components/client/sidebar.tsx` with segregated groups**
- [ ] **Step 3: Verify sidebar renders without TypeScript or styling errors**
- [ ] **Step 4: Commit changes (`git commit -m "feat(portal): segregate sidebar navigation into assets, foundry, and billing"`)**

---

### Task 2: Database Schema & Telemetry Extensions

**Files:**
- Modify: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/lib/db/schema.ts`
- Test: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/__tests__/schema.test.ts`

**Interfaces:**
- Consumes: Drizzle ORM pg-core primitives (`pgTable`, `text`, `varchar`, `boolean`, `integer`, `jsonb`, `timestamp`, `numeric`)
- Produces: `customAgents` table, `assetDownloads` table, and exported TypeScript types (`CustomAgent`, `NewCustomAgent`, `AssetDownload`, `NewAssetDownload`)

- [ ] **Step 1: Add `customAgents` and `assetDownloads` tables to `schema.ts`**
- [ ] **Step 2: Export TypeScript types `CustomAgent`, `NewCustomAgent`, `AssetDownload`, `NewAssetDownload`**
- [ ] **Step 3: Run `npm run build` or `npx tsc --noEmit` in `admin-panel` to verify schema type correctness**
- [ ] **Step 4: Commit changes (`git commit -m "feat(db): add customAgents and assetDownloads tables to schema"`)**

---

### Task 3: Sovereign Downloads Hub: Desktop Harness, Statutory Vaults & Models Hub

**Files:**
- Create: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/app/dashboard/harness/page.tsx`
- Create: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/app/dashboard/vaults/page.tsx`
- Create: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/app/dashboard/models/page.tsx`

**Interfaces:**
- Consumes: `ClientSidebar` navigation links
- Produces: 
  - Harness Page: Platform cards (macOS Apple Silicon `.dmg`, macOS Intel `.dmg`, Windows x64 `.exe`, Linux `.AppImage`), SHA-256 checksums, and 3-step installation guides.
  - Vaults Page: Sovereign Bare Act Cartridge catalog (`bare_ibc.vault`, `cirp_regs.vault`, `commercial_courts.vault`, `companies_act.vault`, `cpc_1908.vault`, `ni_act.vault`) with AES-256 encryption badges, file sizes, and 1-click download actions.
  - Models Hub: GGUF quantized models (`DeepSeek-R1-7B-Q4_K_M.gguf`, `Llama-3.2-3B-Instruct.gguf`) and dense ONNX embeddings with RAM requirement meters and destination directory badges (`~/.hayagriva/models/`).

- [ ] **Step 1: Create `/dashboard/harness/page.tsx` with multi-platform binary download cards**
- [ ] **Step 2: Create `/dashboard/vaults/page.tsx` with bare act cartridge inventory and hash verifications**
- [ ] **Step 3: Create `/dashboard/models/page.tsx` with GGUF reasoning engines and ONNX embeddings**
- [ ] **Step 4: Verify all 3 pages build and render with dark gold aesthetics**
- [ ] **Step 5: Commit changes (`git commit -m "feat(portal): add segregated harness, vaults, and models download hubs"`)**

---

### Task 4: My Sovereign Inventory & Billing Alignment

**Files:**
- Create: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/app/dashboard/my-assets/page.tsx`
- Modify: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/app/dashboard/billing/page.tsx`

**Interfaces:**
- Produces:
  - `/dashboard/my-assets`: Unified inventory showing:
    - Active Hardware Device Activations (from `activations`)
    - Chamber Bare Act Cartridges owned/downloaded
    - Custom `.haya` Agents created by the user
    - Quick-links to download and verify files
  - `/dashboard/billing`: Clean commercial accounting view showing current subscription tier, GST tax invoices table, seat management, and payment method details.

- [ ] **Step 1: Implement `/dashboard/my-assets/page.tsx` displaying user's hardware seats and cartridges**
- [ ] **Step 2: Review and align `/dashboard/billing/page.tsx` to ensure pure commercial separation**
- [ ] **Step 3: Verify TypeScript builds without errors**
- [ ] **Step 4: Commit changes (`git commit -m "feat(portal): add sovereign inventory page and align billing separation"`)**

---

### Task 5: Agent Registry Landing Page with 5 Court Archetypes

**Files:**
- Create: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/app/dashboard/agents/page.tsx`
- Create: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/components/agents/archetypes.ts`
- Create: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/components/agents/ArchetypeCard.tsx`

**Interfaces:**
- Produces:
  - `archetypes.ts`: Defines 5 Court Archetypes (Avoidance Auditor, Commercial Injunction Drafter, Claim Verifier, Section 29A Inquest, Custom Blank Canvas).
  - `ArchetypeCard.tsx`: Dyad/OpenAI-inspired interactive card with domain badges, icon, title, description, and "Use Template" CTA.
  - `/dashboard/agents/page.tsx`: Landing view with "Create Custom Agent" button, Starter Archetypes grid, and Active Chamber Agents table with status badges and download links.

- [ ] **Step 1: Define the 5 Court Archetypes in `src/components/agents/archetypes.ts`**
- [ ] **Step 2: Create `ArchetypeCard.tsx` with clean dark-mode card styling**
- [ ] **Step 3: Build `/dashboard/agents/page.tsx` featuring the archetypes grid and active agents list**
- [ ] **Step 4: Verify navigation from archetype selection to `/dashboard/agents/builder?archetype=<key>`**
- [ ] **Step 5: Commit changes (`git commit -m "feat(portal): add agent registry landing page with 5 court archetypes"`)**

---

### Task 6: Split-Pane Agent Studio Builder

**Files:**
- Create: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/app/dashboard/agents/builder/page.tsx`
- Create: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/components/agents/BuilderAccordion.tsx`
- Create: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/components/agents/SandboxCanvas.tsx`

**Interfaces:**
- Consumes: Archetype definitions from `archetypes.ts`
- Produces:
  - Split-pane studio layout:
    - Left Pane: Accordion controls for (1) Sovereign Identity & Medallion, (2) Model & Reasoning Effort, (3) Subagents & Delegation Loop toggle, (4) Statutory Bare Act Vault Bindings, (5) Practice Templates & Monaco Slash Triggers.
    - Right Pane: Dual-tab panel with (Tab 1) Live Test Sandbox Simulator (sample PDF drop + interactive chat test), and (Tab 2) Real-time Cartridge JSON Manifest inspector with 1-click copy.
  - Action Bar: "Save Draft", "Test Run", and "Compile & Download `.haya`" button.

- [ ] **Step 1: Implement `BuilderAccordion.tsx` containing all 5 configuration sections**
- [ ] **Step 2: Implement `SandboxCanvas.tsx` with dual tabs: Live Simulator + JSON Schema Inspector**
- [ ] **Step 3: Assemble `/dashboard/agents/builder/page.tsx` linking archetype URL query parameters**
- [ ] **Step 4: Verify state updates dynamically on both sides without losing focus**
- [ ] **Step 5: Commit changes (`git commit -m "feat(portal): implement split-pane agent studio builder"`)**

---

### Task 7: `.haya` Cartridge Compiler & API Routes

**Files:**
- Create: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/lib/compiler/cartridge-compiler.ts`
- Create: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/app/api/v1/agents/build/route.ts`
- Create: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/src/app/api/v1/agents/download/[id]/route.ts`

**Interfaces:**
- Consumes: Agent builder state from client POST request
- Produces:
  - `cartridge-compiler.ts`: Generates a zip archive containing:
    - `manifest.json` (typed cartridge schema)
    - `system_prompt.md` (air-gapped legal instructions)
    - `rules.json` (self-critique rules)
    - `medallion.svg` (32px circular gold coin icon)
    - `templates/primary_skeleton.md` (court drafting skeleton)
  - `POST /api/v1/agents/build`: Saves agent to database and returns compilation status.
  - `GET /api/v1/agents/download/[id]`: Streams the `.haya` zip package with appropriate `Content-Disposition: attachment; filename="<slug>-v<version>.haya"`.

- [ ] **Step 1: Install `jszip` in `admin-panel` (`npm install jszip && npm install -D @types/jszip`)**
- [ ] **Step 2: Implement `cartridge-compiler.ts` packaging the `.haya` archive**
- [ ] **Step 3: Implement `POST /api/v1/agents/build` and `GET /api/v1/agents/download/[id]` routes**
- [ ] **Step 4: Connect the "Compile & Download `.haya`" button in the builder to trigger direct browser download**
- [ ] **Step 5: Commit changes (`git commit -m "feat(portal): add .haya cartridge zip compiler and download endpoints"`)**

---

### Task 8: End-to-End Verification & Browser Validation

**Files:**
- Create: `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel/tests/e2e/agent_foundry.spec.ts` (or node verification script)
- Run: Browser CDP verification in Chrome

- [ ] **Step 1: Run Next.js production build (`npm run build`) in `admin-panel` to ensure zero compilation or lint errors**
- [ ] **Step 2: Start portal server on port 3300**
- [ ] **Step 3: Navigate via browser to `/dashboard/agents` and verify Archetypes grid**
- [ ] **Step 4: Click "Avoidance Inquest Auditor" and verify split-pane builder populates cleanly**
- [ ] **Step 5: Test "Compile & Download `.haya`" and inspect the downloaded `.haya` archive contents**
- [ ] **Step 6: Navigate to `/dashboard/harness`, `/dashboard/vaults`, `/dashboard/models`, and `/dashboard/my-assets` to verify segregated views**
- [ ] **Step 7: Capture screenshot/recording artifacts as verification evidence**
- [ ] **Step 8: Final commit and summary report**
