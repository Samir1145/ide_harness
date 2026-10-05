# Hayagriva UI Upgrade & Architectural Reimagination

**Document Status:** 🟢 Specification Finalized & Approved  
**Formal Design Spec:** [`docs/superpowers/specs/2026-10-05-sovereign-agent-chamber-ui-design.md`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/superpowers/specs/2026-10-05-sovereign-agent-chamber-ui-design.md)  
**Author:** Chamber Engineering & Legal Architecture  
**Target:** Eclipse Theia 1.75.0 Shell • Hayagriva Sovereign Legal IDE  

---

## 1. Executive Vision

Hayagriva is designed fundamentally as an **in-chamber legal document factory and cognitive command center** for Insolvency Professionals, Commercial Litigators, and Arbitrators—not a generic software development environment.

This upgrade document tracks the comprehensive reimagination of Hayagriva's user interface, addressing:
1. **Perimeter Ergonomics:** Restructuring the Left Activity Bar, top window headers, and bottom status strips into purposeful, distraction-free zones.
2. **Context Separation:** Establishing a strict visual and functional distinction between **Matter-Specific Artifacts** (case documents, entity graphs, claims) and **Chamber Intelligence** (RAG, Precedents, Ambient Voice Counsel, Practitioner Identity).
3. **Editor Workspace Modernization:** Elevating the Sovereign Legal Word View (Blank Milksheet / Milkdown) and Monaco legal drafting canvas.
4. **Permanent Docking of Ambient Intelligence:** Transitioning from floating/draggable overlays to permanent, rock-solid architectural anchors that never obstruct case filings.

---

## 2. Spatial Architecture (The Reimagined Chamber Desk)

```text
┌───┬─────────────────────────────────────────────────────────────┐
│ 🐴│ TOP EMBLEM: Amber Flowing Stallion (Chamber Seal / Cockpit) │
├───┼───────────────────────┬─────────────────────────────────────┤
│   │ ACTIVE COWORKER DESK  │                                     │
│ 📁│ • Case Documents Tray │                                     │
│ ⚖️│ • @Advisor Agent      │                                     │
│ 📝│ • @Document Drafter   │ Active Work Canvas                  │
│ 🔍│ • @Compliance Auditor │ (Monaco Pleading / Milkdown         │
│ 💰│ • @Claims & Forensic  │  Legal Word View Pleading)          │
│ ➕│ • Agent Cockpit Switch│                                     │
│   │                       │                                     │
│   │ (Dynamic negative     │ Zero floating overlays              │
│   │  vertical space)      │                                     │
├───┼───────────────────────┼─────────────────────────────────────┤
│ ⚡│ LightRAG Precedents   │ Precedent Graph & Bare Act Substrate│
│ 👤│ Chamber Profile & Auth│ Practitioner Identity & Vault Seal  │
└───┴───────────────────────┴─────────────────────────────────────┘
```

---

## 3. The 3-Tier Multi-Drawer Agent Workstation Architecture

Each active Agent in the middle activity bar is not just a chat box—it is a **Contextual Workstation** equipped with 3 synchronized sub-drawers accessible via segmented header tabs:

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

### The 3 Sub-Drawers per Coworker (Option 2 - Plain Chamber Lingo):
1. **Drawer 1: `📁 Case Documents`:**
   * Live clickable chips of the exact 3–5 documents this agent is referencing.
   * Clicking a document opens it in the adjacent editor for instant side-by-side verification.
   * Strict adherence to Section 63/65B BSA antecedent basis rules (zero hallucination).
2. **Drawer 2: `💬 Instructions`:**
   * Multi-turn conversational instruction, critique loops, and structured drafting prompts.
3. **Drawer 3: `🕸️ Relationship Chart`:**
   * Contextual D3 charts tailored specifically to this agent's specialty:
     * **@Claims:** Debt distribution chart, secured vs. unsecured exposure, CoC voting share pie.
     * **@Forms (Sec 29A):** Connected person network, disqualification edges, common directors.
     * **@ForensicBank:** Contra-sweep transaction flow, round-tripping money trail, look-back timeline.
     * **@Document:** Pleading precedent flow and cited statutory sections.

---

## 4. Relocation Strategy for Legacy Toolbar Icons

| Legacy Icon | Current Issue | Reimagined Location & Form Factor |
| :--- | :--- | :--- |
| **`🕸️` Entity Map** | Standalone tool cluttered with entire estate spiderweb | **Sub-Drawer 3 (Topology)** inside each agent (scoped), plus full-estate macro-view button in `@Registry`. |
| **`🔔` Compliances / Inbox** | Hidden in vertical strip; competes with documents | **Top Header Cockpit (Right):** `[ 🔔 (3) Alerts ]` badge next to the statutory timeline clock. Drops down non-blocking Case Action Inbox cards. |
| **`💳` Estate Accounts / Billing** | Rarely clicked during drafting; wastes sidebar slot | **Top Stallion Cockpit Menu:** Accessible via the top Flowing Stallion dropdown under `💳 Estate Accounts & Reg 34B Fee Ledger`. |

---

## 5. Master Spatial Layout Summary

```text
┌───┬──────────────────────────────────────────────────────────────────────────────┐
│ 🐴│ TOP BAR: [ABC Infra Ltd • CIRP Day 42/180]        [ 🔔 3 Alerts ] [ ⚙️ Vault ]│
├───┼───────────────────────┬──────────────────────────────────────────────────────┤
│ 📁│ @Registry (Rank 100)  │                                                      │
│   ├───────────────────────┤                                                      │
│ ⚖️│ @Advisor Agent        │                                                      │
│   │ [💬Talk][📂Docs][🕸️Web]│                                                      │
│ 📝│ @Document Drafter     │            PRIMARY WORKSPACE CANVAS                  │
│ 🔍│ @Compliance Auditor   │                                                      │
│ 💰│ @Claims & Forensic    │  (Monaco Statutory Editor / Blank Milksheet Word     │
│ ➕│ [Agent Cockpit Switch]│   View • Zero floating overlays or blocked text)     │
│   │                       │                                                      │
│   │ (Dynamic negative     │                                                      │
│   │  vertical space)      │                                                      │
├───┼───────────────────────┤                                                      │
│ ⚡│ LightRAG Precedents   │                                                      │
│ 👤│ Chamber Profile & Auth│                                                      │
└───┴───────────────────────┴──────────────────────────────────────────────────────┘
```

---

## 6. Phased Implementation Roadmap

* [ ] **Phase 1 (Emblem & Header Cockpit):**
  * Replace the top-left deity icon with the amber Flowing Stallion Silhouette.
  * Relocate `🔔 Notifications` to the top header strip with badge count and drop-down drawer.
  * Relocate `💳 Estate Accounts & Billing` into the Flowing Stallion dropdown menu.
* [ ] **Phase 2 (The Coworker Roster & Cockpit Switchboard):**
  * Register `@Registry` at Rank 100 with file intake and 3-dot readiness indicators.
  * Implement the Agent Cockpit `➕` switchboard for toggling active agents in the activity bar.
* [ ] **Phase 3 (Agent Multi-Drawer Component):**
  * Build the universal `[ 💬 Talk | 📂 Dossier | 🕸️ Topology ]` segmented controller.
  * Wire active dossier chips to open documents directly in Monaco / Word View.
  * Connect contextual D3 sub-graphs to Drawer 3.
* [ ] **Phase 4 (Foundational LightRAG & Profile Docking):**
  * Permanently dock the LightRAG precedent inquest button above the Profile anchor.
  * Add live precedent graph connectivity telemetry pip (🟢 / 🟡 / 🔴).
  * Retire the floating AskHaya Fluid Glass Orb from the drafting canvas.


---

## 4. Pros & Cons Analysis

### Pros:
1. **True Legal Identity:** Eliminates generic software IDE clutter; mirrors the actual delegation workflow of senior insolvency professionals and advocates.
2. **Sharp Visual Recognition:** Replacing the cluttered deity with the Flowing Stallion ensures crisp, executive branding at any resolution.
3. **Adaptive Cognitive Ergonomics:** The Agent Cockpit allows the practitioner to tailor their workbench to the active phase of the case.
4. **Zero Canvas Intrusion:** Relocating RAG and voice features to permanent activity bar anchors permanently eliminates floating orb obstruction.

### Cons & Mitigations:
1. **Document Visibility:** 
   * *Challenge:* Where does the practitioner browse raw companion markdown and case files?
   * *Mitigation:* A dedicated, clean `📁 Case Documents` anchor stays pinned at Rank 100 at the top of the agent list, or integrated directly into the Document Drafter panel.
2. **Screen Real Estate:**
   * *Challenge:* Potential overflow on small 768px laptop screens.
   * *Mitigation:* Hard cap of 4 visible agents + compact 36px icon cells with 6px gaps.


---

## 4. The AskHaya Ambient Counsel Integration

### Floating Orb vs. Docked Architecture:
| Dimension | Floating Glass Orb (Current) | Permanently Docked Activity Bar Anchor |
| :--- | :--- | :--- |
| **Canvas Intrusion** | Can occasionally cover editor text, scrollbars, or margin line numbers | **0% intrusion**; lives entirely within the left activity bar perimeter |
| **Muscle Memory** | Moves around as practitioner drags it across the screen | **Fixed Fitts' Law target**; bottom-left corner is always instant to reach |
| **Oral Counsel Feedback** | Pulsing waveform inside floating circle | Integrated breathing halo on the docked RAG icon + slide-out audio transcript drawer |
| **Keyboard Accessibility** | `Alt+Space` toggles anywhere | `Alt+Space` opens slide-out inquest drawer seamlessly |

---

## 5. Major Reimagination Ideas & Notes

*(Practitioner to insert specific visual ideas, wireframe sketches, layout directions, and behavioral shifts below)*

### Ideas under consideration:
- [ ] **Permanent RAG Docking:** Place the RAG/Inquest feature permanently stuck above the Profile icon.
- [ ] **Dual-Tier AI:** Differentiate between *In-Matter Coworker Drafting* (top) and *Cross-Matter Statutory/Precedent Retrieval* (bottom).
- [ ] **Top-Left Deity Interaction:** Turn the golden Hayagriva deity icon into the Chamber Switcher / Executive HUD.
- [ ] **Header Telemetry:** Clean up window header to display active statutory day ($T_{\text{day}}$), estate valuation, and admitted claims total.

---

## 6. Implementation Action Plan (To Be Populated)

1. **Step 1:** Align on spatial wireframe and component placement.
2. **Step 2:** Refactor DOM anchors and CSS styling in `extension.ts` and `profile-widget.ts`.
3. **Step 3:** Recompile Theia extensions and browser/Electron application bundles.
4. **Step 4:** Validate against E2E browser subagent tests and responsive viewports.
