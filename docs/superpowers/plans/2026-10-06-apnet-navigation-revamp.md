# APNET Website 4-Pillar Navigation Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the `apnet_website` navigation header into Four Sovereign Pillars (`WORKBENCH`, `INTELLIGENCE`, `AGENTS`, `COMMUNITY`) with 3-column mega menus, `Powered by Hayagriva OS` branding, and a `Chamber Login` + `Download Hayagriva` dual action cluster.

**Architecture:** Refactor `header.html` into 4 sovereign dropdown blocks using clean semantic HTML and FontAwesome iconography. Keep all 30+ internal HTML showcase pages intact. Ensure all relative links resolve to existing files on disk, and wire the action cluster to built-in modals without external portal redirects.

**Tech Stack:** HTML5, CSS3 (Vanilla), JavaScript, FontAwesome 6, Chrome CDP / Playwright for visual regression testing.

**Spec:** `docs/superpowers/specs/2026-10-06-apnet-navigation-revamp-design.md`

## Global Constraints
- Target workspace directory: `/Users/atulgrover/Desktop/HAYAGRIVA/apnet_website`.
- Do NOT rewrite or alter the body content of existing individual showcase pages.
- Omit "Pricing & Practice Suites" completely from the top navigation.
- Do NOT add external links or redirects to `localhost:3300` (zero portal bleed).
- Brand header must display `AGENTIC PROFESSIONALS NETWORK` with subtitle `Powered by Hayagriva OS • www.apnet.co.in`.
- Header action cluster must provide `Chamber Login` (triggering `#account-modal` / `openAccountModal()`) and `Download Hayagriva` (triggering `openIdeDownloadModal()`).

## Review Focus
- Broken internal links: Every `href` in all 4 mega-menus must exist on the local filesystem.
- Dropdown overflow on standard screens (1280px-1440px): 3-column mega-menus must stay within viewport boundaries without horizontal body scroll.
- Modal trigger regressions: Ensure `openIdeDownloadModal()` correctly displays `#hayagriva-ide-modal` without console errors.
- ARIA accessibility: Correct `aria-haspopup="true"` and `aria-expanded="false"` on menu buttons.
- Mobile toggle responsiveness: Hamburger menu toggle must continue to work cleanly on small screens.

---

### Task 1: Navigation Test Suite & Link Validator

**Files:**
- Create: `scratch/test_apnet_header.js`

**Interfaces:**
- Produces: Node.js test script asserting `header.html` structure, required pillar tokens, and verifying that every `href` points to a real file in `/Users/atulgrover/Desktop/HAYAGRIVA/apnet_website/`.

- [ ] **Step 1: Write test script `scratch/test_apnet_header.js`**
- [ ] **Step 2: Run test to observe baseline failures against current `header.html`**
- [ ] **Step 3: Commit test (`git commit -m "test(apnet): add test suite for 4-pillar navigation and link integrity"`)**

---

### Task 2: Brand Header & Master Navigation Structure

**Files:**
- Modify: `apnet_website/header.html:15-45`

**Interfaces:**
- Consumes: Brand styling in `css/components.css`.
- Produces:
  - Brand block with `AGENTIC PROFESSIONALS NETWORK` and `Powered by Hayagriva OS • www.apnet.co.in`.
  - Master `<ul>` navigation with 4 dropdown wrappers: `dropdown-workbench-wrapper`, `dropdown-intelligence-wrapper`, `dropdown-agents-wrapper`, `dropdown-community-wrapper`.

- [ ] **Step 1: Update brand block and master navigation tab bar in `header.html`**
- [ ] **Step 2: Run validation test to verify brand and tab headers pass**
- [ ] **Step 3: Commit changes (`git commit -m "feat(apnet): update brand header and 4-pillar navigation structure"`)**

---

### Task 3: Pillar 1 (`WORKBENCH`) & Pillar 2 (`INTELLIGENCE`) Mega-Menus

**Files:**
- Modify: `apnet_website/header.html` (WORKBENCH & INTELLIGENCE dropdown blocks)

**Interfaces:**
- Produces:
  - `WORKBENCH` 3-Column Mega Menu:
    - Col 1: Desktop Harness Core (`harness_haya_workbench.html`, `harness_haya_engine.html`, `harness_haya_ingest.html`)
    - Col 2: In-Chamber Workspaces (`harness_haya_studio.html`, `harness_haya_wiki.html`, `chatroom.html`)
    - Col 3: Local AI Engines (`harness_haya_models.html`, `models_embeddings.html`, `models_domain_slms.html`)
  - `INTELLIGENCE` 3-Column Mega Menu:
    - Col 1: Statutory Law (`vaults_law.html`, Bare Acts, Zero-RAM runtime)
    - Col 2: Practice Suites & Playbooks (`vaults_suites.html#insolvency`, `vaults_suites.html#commercial`, `vaults_suites.html#adr`)
    - Col 3: Precedents & Formats (`vaults_formats.html`, `vaults_precedence.html`, `vaults_contracts.html`)

- [ ] **Step 1: Construct 3-column mega-menu markup for `WORKBENCH`**
- [ ] **Step 2: Construct 3-column mega-menu markup for `INTELLIGENCE`**
- [ ] **Step 3: Run test script to verify link resolution and token matching**
- [ ] **Step 4: Commit changes (`git commit -m "feat(apnet): implement WORKBENCH and INTELLIGENCE mega menus"`)**

---

### Task 4: Pillar 3 (`AGENTS`) & Pillar 4 (`COMMUNITY`) Mega-Menus

**Files:**
- Modify: `apnet_website/header.html` (AGENTS & COMMUNITY dropdown blocks)

**Interfaces:**
- Produces:
  - `AGENTS` 3-Column Mega Menu:
    - Col 1: Court & Forensic Archetypes (`agents_insolvency.html`, `agents_legal.html`, `agents_claims.html`, `marketplace_reporting_resolution_compliance.html`, `agents_governance.html`)
    - Col 2: In-Chamber Specialist Team (`agents_process_agents.html`, `agents_financial.html`, `agents_reporting_agents.html`)
    - Col 3: Forensic Dossiers (`marketplace_reporting_assignment_forensics.html`, `marketplace_reporting_liability_shields.html`, `resolution_plan_verification_telephone_cables.html`)
  - `COMMUNITY` 3-Column Mega Menu:
    - Col 1: Accredited Directories (`directories_ip.html`, `directories_rv.html`, `directories_cl.html`, `directory_listing.html`)
    - Col 2: Distressed Asset Exchange (`resolutionbazaar.html`, `pipie_assets.html`)
    - Col 3: Knowledge Base & Training (`docs/FINAL_29A_COMPLIANCE_REPORT_APOGEE_ENTERPRISES.html`, `docs/`)

- [ ] **Step 1: Construct 3-column mega-menu markup for `AGENTS`**
- [ ] **Step 2: Construct 3-column mega-menu markup for `COMMUNITY`**
- [ ] **Step 3: Run test script to verify link resolution and token matching**
- [ ] **Step 4: Commit changes (`git commit -m "feat(apnet): implement AGENTS and COMMUNITY mega menus"`)**

---

### Task 5: Header Action Cluster (`Chamber Login` + `Download Hayagriva`) & Modal Wiring

**Files:**
- Modify: `apnet_website/header.html:350-380`
- Modify: `apnet_website/css/components.css` (button and action cluster styling)

**Interfaces:**
- Produces:
  - Dual action container on far right:
    - Subtle button/link: `Chamber Login` triggering `openAccountModal();` (or `#login`)
    - Primary gold CTA: `Download Hayagriva` triggering `openIdeDownloadModal();`
  - Zero external redirects to Render or localhost.

- [ ] **Step 1: Replace legacy download CTA with dual `Chamber Login` + `Download Hayagriva` cluster**
- [ ] **Step 2: Verify `openIdeDownloadModal()` and login modal hooks function properly**
- [ ] **Step 3: Run test script to verify action cluster tokens**
- [ ] **Step 4: Commit changes (`git commit -m "feat(apnet): add Chamber Login and Download Hayagriva action cluster"`)**

---

### Task 6: Dropdown Positioning & CSS Styling Refinement

**Files:**
- Modify: `apnet_website/css/components.css`

**Interfaces:**
- Produces:
  - Proper alignment and max-width bounds for 3-column mega menus so `COMMUNITY` and `AGENTS` dropdowns do not overflow the right edge of the screen (`dropdown-menu-end` or smart left/right bounding).
  - High-contrast typography and subtle hover pill styles.

- [ ] **Step 1: Adjust mega-menu widths and container alignment in `css/components.css`**
- [ ] **Step 2: Test dropdown appearance across viewports (1280px, 1440px, 1600px)**
- [ ] **Step 3: Commit changes (`git commit -m "style(apnet): refine mega menu dropdown bounds and styling"`)**

---

### Task 7: Full Verification & Visual CDP Screenshots

**Files:**
- Run: `node scratch/test_apnet_header.js`
- Create & Run: `scratch/capture_apnet_header.js`
- Capture:
  - `apnet_1_header_overview.png`
  - `apnet_2_workbench_dropdown.png`
  - `apnet_3_intelligence_dropdown.png`
  - `apnet_4_agents_dropdown.png`
  - `apnet_5_community_dropdown.png`

- [ ] **Step 1: Run full test suite asserting 100% link resolution and structure**
- [ ] **Step 2: Start local static server (`python3 -m http.server 8080`)**
- [ ] **Step 3: Capture browser screenshots over Chrome CDP demonstrating each mega-menu**
- [ ] **Step 4: Present final verification report with embedded screenshots**
