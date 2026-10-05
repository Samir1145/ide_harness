# Sovereign Agent Chamber UI Architecture Specification

**Design Document:** `docs/superpowers/specs/2026-10-05-sovereign-agent-chamber-ui-design.md`  
**Status:** 🟢 Approved by Practitioner for Implementation  
**Target:** Eclipse Theia 1.75.0 • Hayagriva Sovereign Legal IDE  

---

## 1. Executive Summary & Core Philosophy

Hayagriva is an **in-chamber legal document factory and cognitive command center** for Insolvency Professionals, Commercial Advocates, and Arbitrators.

This specification dismantles the generic software developer IDE paradigm (raw files, uncontextualized sidebars, floating widgets) and replaces it with a **Sovereign Coworker Chamber**:
1. **Flowing Stallion Emblem:** Replaces the cluttered 22px deity mask with an aerodynamic amber silhouette.
2. **Top-Level `Agents` Menu & Cockpit:** Adds a 1st-class top menubar item with **Manage Agents** (categorized catalog, versioning, sync, activation toggles) and **Task Queue** (delegation audit & statutory billing ledger).
3. **Left Activity Bar as a Coworker Desk:**
   * **Rank 100:** `@DocumentManagerAgent` (`@Registry`) as the master case intake and companion docket.
   * **Middle Zone:** Dynamically pinned active Coworker Agents (`@Advisor`, `@DocumentDrafter`, `@ComplianceAuditor`, `@ClaimsForensic`, `@BankForensic`).
   * **Base Zone:** Permanently stuck `⚡ LightRAG` (Slide-Over Inquest Drawer) and `👤 Profile`.
4. **Agent Multi-Drawer Workstation (Collapsible Accordion):** Every agent panel contains 3 synchronized sections: `📂 Dossier`, `💬 Talk`, and `🕸️ Topology`.
5. **Word View First:** Generated pleadings and drafts open automatically in the formatted **Milkdown Legal Word View**, with a 1-click toggle to Monaco markdown.

---

## 2. Spatial Architecture Blueprint

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🐴 Hayagriva  File  Edit  View  Go  [ Agents ]  Terminal  Help       [ 🔔 (3) ] [ ⚙️ Vault ]│
├────┬─────────────────────────────┬─────────────────────────────────────────────────────────┤
│    │ @Claims Agent Desk          │                                                         │
│ 📁 │ ▾ 📂 Dossier (In Scope: 3)  │                                                         │
│    │   • Form_C_SBI.pdf          │                                                         │
│ ⚖️ │   • SBI_Ledger.xlsx         │                 PRIMARY WORKSPACE CANVAS                │
│    │   • Sanction_Letter.pdf     │                                                         │
│ 📝 │ ▾ 💬 Talk / Inquest         │             Sovereign Legal Word View                   │
│    │   > "Disallow ₹3.1Cr penal  │                  (Blank Milksheet)                      │
│ 🔍 │      interest per RBI rule" │                                                         │
│    │   [  Ask Claims Agent...  ] │    • Clean, formatted typography                        │
│ 💰 │ ▾ 🕸️ Topology (Debt Web)    │    • Zero floating glass orb distractions              │
│    │   [ D3 Creditor Exposure ]  │    • 1-Click toggle to Monaco Markdown                  │
│    │                             │                                                         │
├────┤ (Clean negative space)      │                                                         │
│ ⚡ │ ⚡ LightRAG Inquest Drawer  │                                                         │
│ 👤 │ 👤 Chamber Profile & Vault  │                                                         │
└────┴─────────────────────────────┴─────────────────────────────────────────────────────────┘
```

---

## 3. Subsystem Breakdown

### 3.1 Top Header & Menubar Architecture

#### A. Top Flowing Stallion (`.theia-icon`, `#theia-top-panel .theia-icon`)
* **Visual:** Bold amber gold (`#fbbf24`) Flowing Stallion Silhouette vector mask.
* **Click Action:** Opens the **Chamber Cockpit Dropdown**:
  * Matter Switcher (e.g. `demo_case`, `test_matter`).
  * Case telemetry: Admission date, CIRP Day ($T_{\text{day}} / 330$).
  * `💳 Estate Accounts & Reg 34B Fee Ledger` (Relocated from left bar).
  * `🏛️ Statutory Vaults & Bare Act Cartridges`.
  * `🔒 Lock & Air-Gap Encrypt Vault`.

#### B. Top `Agents` Menu (New Menu Contribution)
Registered into `MainMenuFactory` alongside `File`, `Edit`, `View`:
* **1. `Manage Agents…`**
  * Opens the **Chamber Coworker Directory Modal**:
    * **Categorized Groups:**
      * *Core Associates:* `@Advisor` (Strategy), `@Document` (Drafting), `@Registry` (Intake).
      * *Statutory Auditors:* `@Forms` (Sec 29A / Form H), `@Compliance` (Sec 30(2)).
      * *Forensic Specialists:* `@Claims` (Creditors), `@BankForensic` (PUFE §§ 43–66).
    * **Table Columns:**
      * `Coworker Name` (e.g. `@ClaimsForensic`)
      * `Version` (e.g. `v3.2.0-sovereign`)
      * `Sync Status` (Checks `.agents/skills/` updates with a 1-click **Sync** button)
      * `Activity Bar Toggle` (Switch: `[● Active in Sidebar]` / `[○ Parked in Chamber]`)
    * **Persistence:** Selections saved in `${caseDir}/case_manifest.json` under `active_coworkers`.
* **2. `Task Queue…`**
  * Opens the **Delegated Jobs & Billing Ledger**:
    * Table tracking asynchronous associate tasks:
      * `Task Name` (e.g., "SBI Form C Interest Verification")
      * `Assigned Coworker` (`@Claims`)
      * `Status` (Queued / In Progress / Completed / Review Needed)
      * `Delegated At` (Timestamp)
      * `Completed At` (Timestamp)
      * `Reg 34B Fee / Cost` (Calculated tariff based on complexity)
      * `Payment Status` (Escrow Reserved / Billed / Paid)

#### C. Top Right Notifications Chip (`[ 🔔 (N) Alerts ]`)
* Relocated from left activity bar into `#theia-top-panel` on the right side.
* Displays live unread badge count for Case Action Inbox (CIRP statutory deadlines, HITL approval requests, post-ingest briefs).
* Clicking triggers the non-blocking slide-down **Case Action Inbox Drawer**.

---

### 3.2 The Sovereign Left Activity Bar

#### Structure:
1. **Rank 100 — `@Registry` (`@DocumentManagerAgent`):**
   * Pinned permanently at the top of the middle zone.
   * Master Case Intake, Companion Markdown synchronizer, and 3-dot readiness meter (`● ● ●`).
   * Drag-and-drop target for incoming PDF/Word/Excel case perimeter files.
2. **Rank 200–400 — Active Coworker Agents:**
   * Only the agents toggled `Active` in `Agents -> Manage Agents` appear here (max 4–5 visible).
   * Each icon uses a dedicated high-contrast monochrome vector icon with amber hover states.
3. **Bottom Zone — Foundational Anchors (Permanently Stuck):**
   * **`⚡ LightRAG`:**
     * Positioned immediately above the Profile icon.
     * Connection telemetry pip: 🟢 Connected / 🟡 Local Lite Mode / 🔴 Disconnected.
     * **Interaction:** Clicking opens the **Slide-Over Inquest Drawer** from the left perimeter, overlaid over the agent panel without unmounting or resetting the active agent.
   * **`👤 Profile`:**
     * Fixed at the base (`bottom: 30px, left: 6px`).
     * Chamber authentication, practitioner bar identity, Section 65B/63 evidence hash verification.

---

### 3.3 The Agent Multi-Drawer Workstation (Collapsible Accordion)

When an agent's icon is clicked in the left activity bar, its view renders a unified **3-Section Collapsible Accordion** using natural, chamber-friendly terminology:

```text
┌────────────────────────────────────────────────────────┐
│  🐴 @Claims Agent • Creditor Audit Desk                │
├────────────────────────────────────────────────────────┤
│  ▾ 📁 Case Documents (3 in scope)                      │
│     [ Form_C_SBI.pdf ✕ ] [ SBI_Ledger.xlsx ✕ ]         │
│     [ + Add Document from Registry ]                   │
│                                                        │
│  ▾ 💬 Instructions                                     │
│     [ Chat, ask questions, or run automated audits... ]│
│                                                        │
│  ▾ 🕸️ Relationship Chart                               │
│     [ Creditor & Company Connection Diagram          ] │
└────────────────────────────────────────────────────────┘
```

#### Section 1: `▾ 📁 Case Documents` (Formerly "Dossier")
* Displays clickable chips of the exact 3–5 documents currently in the agent's working context:
  `[ 📄 Form_C_SBI.pdf ✕ ] [ 📊 SBI_Ledger.xlsx ✕ ] [ ➕ Add Document from Registry ]`
* **Click to Inspect:** Clicking a chip immediately opens that document in the main editor area as a formatted Word View.
* **Evidentiary Traceability:** Explicitly informs the practitioner which source documents the agent is referencing.

#### Section 2: `▾ 💬 Instructions` (Formerly "Talk")
* Multi-turn dialogue interface tailored to this agent's prompts and instructions.
* Includes 1-click legal action chips (e.g. `@Claims`: *"Recalculate Interest"*, *"Draft Disallowance Memo"*; `@Forms`: *"Audit Connected Persons"*, *"Generate Form H Checklist"*).
* Direct integration with `ChatAgentService.delegateToAgent` critique loops.

#### Section 3: `▾ 🕸️ Relationship Chart` (Formerly "Topology")
* Embedded D3.js visual chart filtered strictly to this agent's purview:
  * In `@Claims`: Debt distribution web, creditor exposure chart, and CoC voting share pie.
  * In `@Forms`: Section 29A connected person network with disqualification red flags.
  * In `@BankForensic`: Round-tripping money trail and contra-sweep flowcharts.
* Button: `[ ↗ Expand Full Screen Diagram ]` to open the interactive diagram across the main canvas.

---

### 3.4 Editor & Draft Delivery Mechanics

* **Sovereign Legal Word View Default:**
  * When `@DocumentDrafter` or any coworker generates a legal draft (e.g. `Notice_1st_CoC.md`, `disallowance_memo.md`), the file is saved to `${caseDir}/drafts/` and immediately opened inside the **Milkdown Word View editor**.
  * Displays portrait document margins, page break indicators, and typography conforming to Court Pleading rules.
  * Top editor bar provides a 1-click `[ 👁️ Raw Monaco Markdown ]` toggle for advanced text manipulation.

---

## 4. Implementation Phasing & Work Breakdown

| Phase | Scope & Deliverables | Primary Files Touched |
| :--- | :--- | :--- |
| **Phase 1** | **Top Header & Emblem Modernization**<br>• Replace deity mask with Flowing Stallion silhouette (`#fbbf24`).<br>• Relocate `🔔 Notifications` to top header right.<br>• Relocate `💳 Billing` to Stallion dropdown menu. | `extension.ts`, `menus.ts`, `branding/` |
| **Phase 2** | **Top `Agents` Menu & Cockpit Switchboard**<br>• Add `Agents` menu in top menubar.<br>• Implement `Manage Agents` modal with activation toggles.<br>• Implement `Task Queue` delegation and billing ledger. | `menus.ts`, `commands.ts`, `agent-cockpit.ts` |
| **Phase 3** | **Left Activity Bar Coworker Roster & `@Registry`**<br>• Register `@Registry` at Rank 100.<br>• Dynamically render only active agents in middle zone.<br>• Permanently dock `⚡ LightRAG` above `👤 Profile`.<br>• Implement Slide-Over Inquest Drawer for LightRAG. | `extension.ts`, `profile-widget.ts`, `chat-agents.ts` |
| **Phase 4** | **3-Tier Collapsible Accordion Workstation Component**<br>• Build `📂 Dossier`, `💬 Talk`, `🕸️ Topology` accordion.<br>• Wire dossier chips to Milkdown Word View.<br>• Filter contextual D3 sub-graphs in Topology section. | `agent-workstation-widget.tsx`, `extension.ts` |

---

## 5. Verification & Acceptance Criteria

1. **Top Emblem:** Crisp, high-contrast Flowing Stallion renders at the top left without blur.
2. **`Agents` Menu:** Clicking `Agents` $\rightarrow$ `Manage Agents` allows checking/unchecking agents, immediately updating the left activity bar without workbench reload.
3. **Task Queue:** Displays queued and completed agent tasks with timestamps and statutory billing amounts.
4. **Agent Accordion:** Opening any agent displays `Dossier`, `Talk`, and `Topology` with smooth collapse/expand transitions.
5. **LightRAG Docking:** Clicking the permanently docked `⚡ LightRAG` icon smoothly opens the Slide-Over Precedent Drawer over the left perimeter without unmounting the active agent.
6. **Zero Floating Overlay:** The floating AskHaya Fluid Glass Orb is retired from the canvas.
