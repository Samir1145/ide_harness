# Unified Settings Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile and unify the 3 fragmented settings surfaces (Theia preferences, Hayagriva Command Center, User Profile) into a single-pane glassmorphic Command Center with live Theia bridge synchronization.

**Architecture:** Intercept built-in Theia preference commands (`Cmd+,`) and the bottom-left profile avatar to deep-link directly into the 3 sovereign pillars (`Chamber Governance`, `Practitioner Identity`, `Workspace Display`) of the Hayagriva Command Center (`settings-dashboard.html`). Changes to display and typography dynamically sync to Theia's `PreferenceService` via `postMessage`.

**Tech Stack:** TypeScript, Eclipse Theia Framework (`@theia/preferences`, `@theia/core`), Node.js native HTTP API, HTML5/CSS3 Glassmorphism, Webview messaging.

**Spec:** [`docs/superpowers/specs/2026-10-03-unified-settings-cockpit-design.md`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/superpowers/specs/2026-10-03-unified-settings-cockpit-design.md)

## Global Constraints

- Never break offline Lite Mode: Zero reliance on cloud APIs or external servers.
- Preserve all existing Chamber tabs: `hil`, `billing`, `telemetry`, `vaults`, `templates`, `settings` (engines), `agents`, `voice-studio`, `license`.
- Complete interception: Raw Theia preferences tree must never display when typing `Cmd+,`.
- Live real-time sync: Typography / theme changes must reflect across Monaco without requiring full IDE reload.

## Review Focus

- **Input:** Pressing `Cmd+,` on macOS (or `Ctrl+,` on Linux/Windows). **Expected:** Opens Command Center on `Display & Typography` tab.
- **Input:** Clicking "Manage Identity" from bottom-left avatar popover. **Expected:** Opens Command Center on `Practitioner Identity & Stamp` tab.
- **Input:** Slider change on font size (e.g. from 14px to 18px). **Expected:** Immediately updates active Monaco editor line height and font size via `PreferenceService.set()`.
- **Input:** Selecting "Sepia Legal Paper" theme. **Expected:** Updates editor background and typography tones smoothly.
- **Input:** Searching "Ollama" or "IBBI" in universal search bar. **Expected:** Filters and highlights relevant settings cards across all 3 pillars.

---

### Task 1: Backend Settings & Display Preferences API

**Files:**
- Modify: `backend/lib/core/profile-manager.js`
- Modify: `backend/lib/routes.js`
- Test: `backend/tests/test_unified_settings_api.test.js`

- [ ] **Step 1.1: Write failing test for Display Preferences & Unified Profile API**
  Create `backend/tests/test_unified_settings_api.test.js` testing `GET /api/hayagriva/settings/display`, `POST /api/hayagriva/settings/display`, and `GET /api/hayagriva/profile/full`.
- [ ] **Step 1.2: Run test and ensure it fails**
  Run `node backend/tests/test_unified_settings_api.test.js`.
- [ ] **Step 1.3: Extend `profile-manager.js` with Display Defaults**
  Add `display` config defaults (`fontFamily: 'Merriweather'`, `fontSize: 14`, `lineHeight: 1.6`, `theme: 'dark'`, `wordWrap: 'on'`, `minimap: false`) to `getProfile()` and `saveProfile()`.
- [ ] **Step 1.4: Add Display Endpoints in `routes.js`**
  Implement `GET /api/hayagriva/settings/display` and `POST /api/hayagriva/settings/display` in `backend/lib/routes.js`.
- [ ] **Step 1.5: Run test and verify it passes**
  Run `node backend/tests/test_unified_settings_api.test.js`.
- [ ] **Step 1.6: Commit**
  `git add backend/lib/core/profile-manager.js backend/lib/routes.js backend/tests/test_unified_settings_api.test.js && git commit -m "feat(backend): add display preferences and unified profile endpoints"`

---

### Task 2: Glassmorphic Display & Typography Pillar in Settings Dashboard

**Files:**
- Modify: `backend/lib/assets/settings-dashboard.html`
- Test: `backend/tests/test_settings_dashboard_tabs.test.js`

- [ ] **Step 2.1: Write failing test for new tabs and universal search**
  Create `backend/tests/test_settings_dashboard_tabs.test.js` asserting existence of `#pillDisplay`, `#pillIdentity`, `#tabPanelDisplay`, `#tabPanelIdentity`, and universal search input `#universalSettingsSearch`.
- [ ] **Step 2.2: Run test and ensure it fails**
  Run `node backend/tests/test_settings_dashboard_tabs.test.js`.
- [ ] **Step 2.3: Implement Display & Typography Tab Panel in `settings-dashboard.html`**
  Add `#pillDisplay` nav button, `#tabPanelDisplay` container with font selector, font size slider (12px–22px), line height slider (1.4–1.8), theme picker (Dark / Clean Light / Sepia Legal Paper), and word wrap toggle.
- [ ] **Step 2.4: Implement Universal Settings Search & Deep-Linking**
  Add `#universalSettingsSearch` input with real-time DOM card filtering across all tabs. Parse URL hash / query param (e.g. `?tab=display` or `#tab=identity`) on load to activate the designated tab automatically.
- [ ] **Step 2.5: Add Webview postMessage dispatchers**
  When typography or theme sliders move, emit `window.parent.postMessage({ type: 'set-workspace-preference', key, value }, '*')`.
- [ ] **Step 2.6: Run test and verify it passes**
  Run `node backend/tests/test_settings_dashboard_tabs.test.js`.
- [ ] **Step 2.7: Commit**
  `git add backend/lib/assets/settings-dashboard.html backend/tests/test_settings_dashboard_tabs.test.js && git commit -m "feat(ui): add display pillar and universal search to settings dashboard"`

---

### Task 3: Live Theia Preference Bridge & Real-Time Sync

**Files:**
- Modify: `frontend/theia-extensions/hayagriva/src/browser/extension.ts`
- Modify: `frontend/theia-extensions/hayagriva/src/browser/preview-manager.ts`

- [ ] **Step 3.1: Support Tab Deep-Linking in `preview-manager.ts`**
  Update `openCockpitPanel(caseName, tab, action)` to append `?tab=${tab}` or `#tab=${tab}` to the iframe source URL.
- [ ] **Step 3.2: Implement `set-workspace-preference` message handler in `extension.ts`**
  In the webview `window.addEventListener('message')` listener in `extension.ts`, add handling for `set-workspace-preference`:
  - `editor.fontSize` ➔ `this.preferenceService.set('editor.fontSize', value)`
  - `editor.fontFamily` ➔ `this.preferenceService.set('editor.fontFamily', value)`
  - `editor.lineHeight` ➔ `this.preferenceService.set('editor.lineHeight', value)`
  - `editor.wordWrap` ➔ `this.preferenceService.set('editor.wordWrap', value)`
  - `workbench.colorTheme` ➔ `this.preferenceService.set('workbench.colorTheme', value)`
- [ ] **Step 3.3: Commit**
  `git add frontend/theia-extensions/hayagriva/src/browser/extension.ts frontend/theia-extensions/hayagriva/src/browser/preview-manager.ts && git commit -m "feat(bridge): implement live preference synchronization between cockpit and theia"`

---

### Task 4: Universal Interception of Theia Preferences & Menu Restructuring

**Files:**
- Modify: `frontend/theia-extensions/hayagriva/src/browser/commands.ts`
- Modify: `frontend/theia-extensions/hayagriva/src/browser/menus.ts`

- [ ] **Step 4.1: Intercept Built-In Preference Commands in `commands.ts`**
  Register command handlers for `preferences:open`, `preferences:openUserPreferences`, `preferences:openWorkspacePreferences`, `workbench.action.openSettings` that execute `this.contribution.openCockpitPanel(undefined, 'display')`.
- [ ] **Step 4.2: Restructure Top `Settings` Menu in `menus.ts`**
  Update `SETTINGS_MAIN_MENU` entries to provide direct 4-pillar navigation:
  1. `📊 Chamber Governance & AI Engines…` (`tab=settings`)
  2. `🏛️ Statutory Vaults & Suites…` (`tab=vaults`)
  3. `👤 Practitioner Identity & Stamp…` (`tab=identity`)
  4. `🖥️ Display & Legal Typography…` (`tab=display`)
- [ ] **Step 4.3: Commit**
  `git add frontend/theia-extensions/hayagriva/src/browser/commands.ts frontend/theia-extensions/hayagriva/src/browser/menus.ts && git commit -m "feat(menus): intercept theia preferences and restructure top settings menu"`

---

### Task 5: User Profile Avatar Rerouting & Popover Polish

**Files:**
- Modify: `frontend/theia-extensions/hayagriva/src/browser/profile-widget.ts`

- [ ] **Step 5.1: Add "Manage Identity & Chamber Settings" CTA to Profile Popover**
  Add a primary action button in `profile-widget.ts` popover template that executes `hayagriva:openSettingsPanel` with `identity` tab.
- [ ] **Step 5.2: Update Profile Popover Styling**
  Ensure cohesive styling with glassmorphism matching the chamber visual language.
- [ ] **Step 5.3: Commit**
  `git add frontend/theia-extensions/hayagriva/src/browser/profile-widget.ts && git commit -m "feat(profile): connect profile widget cta directly to identity settings"`

---

### Task 6: End-to-End Test Suite & Verification

**Files:**
- Create: `backend/tests/test_unified_settings_e2e.test.js`

- [ ] **Step 6.1: Write complete End-to-End validation test**
  Assert that:
  - Backend returns correct initial display and profile settings.
  - Updating display preferences persists and returns correct updated values.
  - Settings dashboard HTML includes all 3 sovereign pillars and script bridges.
  - Deep-link URLs resolve with proper tabs.
- [ ] **Step 6.2: Run the complete test suite**
  Run `node backend/tests/test_unified_settings_e2e.test.js` and `node backend/tests/run_all_tests.js`.
- [ ] **Step 6.3: Commit**
  `git add backend/tests/test_unified_settings_e2e.test.js && git commit -m "test: add comprehensive e2e test suite for unified settings cockpit"`
