# Unified Settings Cockpit Specification

**Date:** 2026-10-03  
**Status:** Approved for Implementation  
**Topic:** Reconciling Fragmented Settings Surfaces into a Unified Single-Pane Cockpit

---

## 1. Problem Statement & Background

Previously, user configuration and settings were scattered across three disconnected surfaces in the Hayagriva chamber workbench:
1. **Theia Native Preferences (`Cmd+,` / Bottom Gear icon):** Exposed raw developer-oriented preferences (`settings.json`, Monaco editor properties, VS Code internals) that cluttered the legal workspace.
2. **Hayagriva Header Menu & Cockpit (`settings-dashboard.html` / Top Menu `Settings`):** Housed legal AI engines, statutory bare act vaults, template packs, avoidance billing, and human-in-the-loop approvals.
3. **User Profile Popover (`profile-widget.ts`):** Handled master practitioner credentials (name, IBBI registration number, chamber stamp, cloud sync, license tier).

This fragmentation forced legal practitioners to navigate multiple unrelated interfaces to configure basic environment behaviors, created overlapping licensing/identity sections, and surfaced unnecessary IDE developer clutter.

---

## 2. High-Level Architectural Topology

All configuration entry points are unified into a single-pane glassmorphic **Hayagriva Command Center Cockpit** structured into three sovereign pillars:

```
                               ┌──────────────────────────────────────────────┐
                               │       UNIFIED ENTRY POINTS & TRIGGERS        │
                               └──────────────────────┬───────────────────────┘
                                                      │
         ┌────────────────────────────────────────────┼───────────────────────────────────────────┐
         │                                            │                                           │
         ▼                                            ▼                                           ▼
[Top Header Menu "Settings"]                [Bottom-Left User Avatar]                     [Cmd+, / Preferences]
  ➜ default tab: "engines"                    ➜ default tab: "identity"                    ➜ default tab: "display"
         │                                            │                                           │
         └────────────────────────────────────────────┼───────────────────────────────────────────┘
                                                      │
                                                      ▼
                       ┌──────────────────────────────────────────────────────────────┐
                       │           HAYAGRIVA COMMAND CENTER & SETTINGS                │
                       │             (settings-dashboard.html Webview)                │
                       ├──────────────────────────────────────────────────────────────┤
                       │  [ 🔍 Universal Settings Search...                         ] │
                       ├──────────────────────────────────────────────────────────────┤
                       │  🏛️ CHAMBER GOVERNANCE  │  👤 PRACTITIONER  │  🖥️ DISPLAY   │
                       └──────────────────────────────┬───────────────────────────────┘
                                                      │
         ┌────────────────────────────────────────────┼───────────────────────────────────────────┐
         │                                            │                                           │
         ▼                                            ▼                                           ▼
┌───────────────────────────────┐     ┌───────────────────────────────┐     ┌───────────────────────────┐
│ 🏛️ CHAMBER & AI ENGINES      │     │ 👤 PRACTITIONER & AUTH        │     │ 🖥️ WORKSPACE & DISPLAY    │
├───────────────────────────────┤     ├───────────────────────────────┤     ├───────────────────────────┤
│ • AI Engines (Llama/Ollama)   │     │ • Full Name & Chamber Title   │     │ • Typography (Serif/Sans) │
│ • Statutory Vaults & Suites   │     │ • IBBI Reg / Bar Enrollment   │     │ • Font Size & Line Height │
│ • Template & Form Packs       │     │ • Digital Seal & Stamp Image  │     │ • Dark / Light / Sepia    │
│ • Chamber Coworkers (Agents)  │     │ • Machine Fingerprint & Lock  │     │ • Monaco Wrap & Minimap   │
│ • Diligence & Ledger Billing  │     │ • Offline License Activation  │     │ • Keyboard Shortcuts      │
│ • HITL Approval Queue         │     │ • Cloud Auth / Peer Sync      │     │                           │
└──────────────┬────────────────┘     └──────────────┬────────────────┘     └─────────────┬─────────────┘
               │                                     │                                    │
               ▼                                     ▼                                    ▼
       backend/lib/routes.js                profile-manager.js                     Theia PreferenceService
    (~/.hayagriva/settings.json)       (~/.hayagriva/user_profile.json)         (.theia/settings.json)
```

---

## 3. The Three Sovereign Pillars

### Pillar A: 🏛️ Chamber Governance & AI
Houses all statutory knowledge, AI engine routing, subagents, and matter diligence tools:
- **AI Engines & Routing (`tab=settings`):** Local llamafile (port 8090), Ollama (port 11434), ONNX embeddings, port selectors, token context compaction policies.
- **Statutory Vaults & Suites (`tab=vaults`):** Sovereign India Code Bare Acts catalog, practice suite cartridges (`commercial_recovery_suite`, `insolvency_restructuring_suite`, `arbitration_adr_suite`), live sync and chamber toggle switches.
- **Form & Template Packs (`tab=templates`):** MCA AOC-4, Form B/C/CA/D packs, NCLT insolvency skeletons, custom chamber templates.
- **Chamber Coworkers (`tab=agents`):** Subagent roster (@Advisor, @Forms, @Document, @Auditor), permission gates, auto-approval thresholds.
- **Human-in-the-Loop Approvals (`tab=hil`):** Attention queue for agent suspensions, document overwrite requests, and external tool execution approvals.
- **CIRP Diligence & Estate Ledger (`tab=billing`):** Avoidance investigation time-tracking, statutory look-back expense allocation, claim verification metrics.
- **Local Telemetry (`tab=telemetry`):** macOS `vm_stat` real-time RAM footprint, model load times, token consumption statistics.

### Pillar B: 👤 Practitioner Identity & Auth
Reconciles the User Profile popover and Onboarding into a persistent identity center:
- **Master Practitioner Profile (`tab=identity`):** Full Name, Chamber / Law Firm designation, IBBI Registration No, Bar Council Enrollment No.
- **Digital Stamp & Signature:** Practitioner official seal upload, cryptographic Section 65B/63 evidence signing key.
- **Machine Identity & Lock:** Hardware SHA-256 fingerprint, device pairing status.
- **Software Licensing (`tab=license`):** 100% offline Ed25519 signature license validation, 7-day trial status, enterprise activation key.
- **Cloud Auth & Sync:** Supabase / local bridge credentials for peer matter sharing.

### Pillar C: 🖥️ Workspace & Reading Display
Replaces raw Theia/VS Code preferences with a curated legal reading and editor cockpit:
- **Legal Typography & Layout (`tab=display`):**
  - Font Families: *Merriweather (Default Legal Serif)*, *Times New Roman*, *Georgia*, *Inter (Modern Sans)*.
  - Editor Font Size: 12px to 22px slider with live preview.
  - Line Height: 1.4, 1.6 (recommended), 1.8 spacing.
- **Workbench Theme:**
  - *Chamber Dark* (High contrast slate/gold)
  - *Clean Light* (Court filing white)
  - *Sepia Legal Paper* (Warm parchment reading tone)
- **Monaco Editor Discipline:**
  - Word wrap toggle (default `on`)
  - Minimap toggle (default `off` for distraction-free reading)
  - Smooth scrolling and cursor animations
- **Chamber Keyboard Shortcuts Reference (`tab=shortcuts`):** Searchable cheatsheet of all chamber hotkeys (`Alt+Space` for AskHaya Orb, `Cmd+K` for Citation search, `/` triggers in Monaco).

---

## 4. Entry Point Routing & Theia Interception

### 4.1. Command Interception
The following built-in Theia / VS Code preference commands are intercepted in `commands.ts` and redirected to `openCockpitPanel`:
- `preferences:open` ➔ `openCockpitPanel(undefined, 'display')`
- `preferences:openUserPreferences` ➔ `openCockpitPanel(undefined, 'display')`
- `preferences:openWorkspacePreferences` ➔ `openCockpitPanel(undefined, 'settings')`
- `workbench.action.openSettings` ➔ `openCockpitPanel(undefined, 'display')`

### 4.2. Top Menu Structure (`menus.ts`)
The top-level `Settings` menu is simplified into 4 clear direct routes:
1. `📊 Chamber Governance & AI Engines…` (`tab=settings`)
2. `🏛️ Statutory Vaults & Suites…` (`tab=vaults`)
3. `👤 Practitioner Identity & Stamp…` (`tab=identity`)
4. `🖥️ Display & Legal Typography…` (`tab=display`)

### 4.3. User Profile Popover (`profile-widget.ts`)
The bottom-left avatar card provides:
- Header: Practitioner initials, Name, IBBI Reg / Email badge.
- Status pip: Online / Local Air-gapped.
- Action: Single prominent button `⚙️ Manage Identity & Chamber Settings` that fires `hayagriva:openSettingsPanel('identity')`.

---

## 5. Bidirectional Synchronization & Persistence

1. **Practitioner Profile:** Managed by `backend/lib/core/profile-manager.js` writing to `~/.hayagriva/user_profile.json`.
2. **Chamber & AI Engines:** Managed by `backend/lib/routes.js` writing to `~/.hayagriva/config.json`.
3. **Workspace Display Preferences (Theia Bridge):**
   - When the user alters font, theme, or editor options in `settings-dashboard.html`, the iframe dispatches:
     ```javascript
     window.parent.postMessage({
       type: 'set-workspace-preference',
       key: 'editor.fontSize',
       value: 16
     }, '*');
     ```
   - In `extension.ts`, the message listener executes:
     ```typescript
     await this.preferenceService.set(key, value);
     ```
   - This ensures immediate real-time propagation to all active Monaco editors and Theia workbench elements without requiring a reload.

---

## 6. Verification & Acceptance Criteria

1. **Interception Test:** Pressing `Cmd+,` opens the Hayagriva Command Center on the `Display & Typography` tab. The raw developer Theia preferences tree is completely bypassed.
2. **Profile Anchor Test:** Clicking the bottom-left avatar popover and selecting "Manage Identity" opens the Command Center on the `Practitioner Identity` tab.
3. **Header Menu Test:** All 4 items in the top `Settings` menu open the respective tab in the Command Center.
4. **Live Preference Sync Test:** Changing the editor font size or theme in the Display tab immediately updates Monaco editor instances via `PreferenceService`.
5. **Zero Breaking Changes:** Existing functionality (Statutory Vaults, AI Engines, License Activation, Voice Studio) continues to function seamlessly in their respective tabs.
