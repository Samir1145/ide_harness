# SDD ledger — plan: docs/superpowers/plans/2026-10-05-sovereign-agent-chamber-ui.md

## Pre-flight Interface Consistency Scan
- Task 1 (Top Emblem & Cockpit): Produces `hayagriva.openCockpitMenu`
- Task 2 (Header Notifications): Consumes `/api/hayagriva/inbox`
- Task 3 (Billing Relocation): Produces clean left bar without Pillar 5
- Task 4 (Top Agents Menu): Produces `AGENTS_MAIN_MENU` with commands `hayagriva.manageAgents` and `hayagriva.openTaskQueue`
- Task 5 (Agent Cockpit Manager & Directory Modal): Produces `AgentCockpitManager` and `onActiveCoworkersChanged`
- Task 6 (Task Queue Modal): Consumes `/api/hayagriva/billing` & delegation records
- Task 7 (Pinned Registry): Produces Rank 100 `@Registry`
- Task 8 (Dynamic Coworkers): Consumes `AgentCockpitManager.onActiveCoworkersChanged`
- Task 9 (Docked LightRAG & Retired Orb): Produces `#hayagriva-lightrag-anchor` and `#hayagriva-inquest-drawer`
- Task 10 (Agent Workstation Accordion): Consumes Option 2 titles (`📁 Case Documents`, `💬 Instructions`, `🕸️ Relationship Chart`)
- Task 11 (Word View Delivery): Consumes Milkdown Word View preview manager
- Task 12 (E2E Verification): Verifies full build and live browser experience

Pre-flight: all interfaces verified and aligned with spec.

## Execution Progress
- [x] Task 1: Top-Left Flowing Stallion Emblem & Chamber Cockpit Dropdown (Test: `backend/tests/test_top_emblem_and_cockpit.test.js`, Commit: `0ea6d52`)
- [x] Task 2: Relocate Notifications (`🔔`) to Top Header Strip & Slide-Down Inbox (Test: `backend/tests/test_header_notifications.test.js`, Commit: `f168ab5`)
- [x] Task 3: Relocate Billing / Diligence Ledger to Chamber Cockpit & Task Queue (Test: `backend/tests/test_billing_relocation.test.js`, Commit: `6ae1a50`)
- [x] Task 4: Top-Level `Agents` Menubar Menu Registration (Test: `backend/tests/test_agents_menu_contribution.test.js`, Commit: `0e33858`)
- [x] Task 5: Agent Cockpit Manager & Directory Modal (Test: `backend/tests/test_agent_directory_modal.test.js`, Commit: `6b14a10`)
- [x] Task 6: Task Queue & Reg 34B Fee Ledger Modal (Test: `backend/tests/test_task_queue_modal.test.js`, Commit: `cc60fda`)
- [x] Task 7: Master Case Intake (`@Registry`) Pinned at Rank 100 (Test: `backend/tests/test_registry_docking.test.js`, Commit: `da549f4`)
- [x] Task 8: Dynamic Coworker Activity Bar Roster & Custom Icons Ranks 200–400 (Test: `backend/tests/test_dynamic_coworker_roster.test.js`, Commit: `08cf563`)
- [x] Task 9: Permanently Dock `⚡ LightRAG` Above Profile & Retire Floating Orb (Test: `backend/tests/test_lightrag_dock_and_orb_retirement.test.js`, Commit: `48b8c78`)
- [x] Task 10: 3-Tier Collapsible Accordion Workstation Component - Option 2 Titles (Test: `backend/tests/test_agent_workstation_accordion.test.js`, Commit: `e9d6ebf`)
- [x] Task 11: Sovereign Legal Word View First & Monaco Fallback Toggle (Test: `backend/tests/test_word_view_draft_delivery.test.js`, Commit: `1a8cfbd`)
- [x] Task 12: E2E Integration Suite & Compilation Verification (Test: `backend/tests/test_sovereign_chamber_e2e.test.js`, Recording: `sovereign_chamber_demo_1791195661220.webp`)

