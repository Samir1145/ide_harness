# Ambient Amber Voice Orb (AskHaya) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the ambient, draggable Amber Voice Orb (`AskHaya`) that floats across the workbench, expanding in-place into interactive listening, processing, and speaking states for real-time LightRAG precedent counsel, while preserving the left activity bar Stallion tab for written multi-agent drafting.

**Architecture:** A standalone floating DOM component (`#hayagriva-askhaya-orb-root`) rendered via `AskHayaVoiceOrb` service, featuring mouse draggability with viewport constraints, `localStorage` persistence, 4 in-place fluid CSS states (`idle`, `listening`, `processing`, `speaking`), real-time audio waveform visualizer, Sarvam AI / Web Speech voice inquest bridge to LightRAG (`POST /api/hayagriva/voice/inquest`), and 1-click dossier injection into active Monaco editors.

**Tech Stack:** TypeScript, Eclipse Theia Framework (`@theia/core`, `@theia/editor`), HTML5 Canvas / CSS3 Glassmorphism, Web Speech API / Sarvam Voice Seam, Node.js REST API.

**Spec:** [`docs/superpowers/specs/2026-10-03-askhaya-amber-voice-orb-design.md`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/superpowers/specs/2026-10-03-askhaya-amber-voice-orb-design.md)

## Global Constraints

- **Never break offline Lite Mode:** When port 8090/9621 is offline, gracefully cascade to Web Speech + local bare act search with 0 compute bloat.
- **Left Activity Bar Independence:** Retain the Left Activity Bar Stallion tab (`chat-view-widget`) for written agents (`@Hayagriva`, `@document`, `@form`, `@advisor`).
- **Zero Status Bar Collisions:** Restrict Orb dragging boundaries to stay strictly above the 24px bottom status bar and below the top menubar.
- **Instant Barge-In:** Tapping the Orb while AskHaya is speaking must immediately halt audio playback and enter listening mode.

## Review Focus

- Clicking the Orb or pressing `Alt+Space` smoothly expands the 44px circle into the listening capsule in-place without shifting location.
- Dragging the Orb across Monaco editors or sidebars moves smoothly and persists `(x, y)` coordinates to `localStorage`.
- Speaking a precedent query triggers LightRAG retrieval, streams spoken advice, and presents a working `[📋 Insert into Editor]` action.
- Quiet Chamber mode: Typing a query into the fallback text input executes the exact same LightRAG inquest pipeline without microphone input.

---

### Task 1: AskHayaVoiceOrb Service Architecture & State Machine

**Files:**
- Modify: `frontend/theia-extensions/hayagriva/src/browser/askhaya-orb.ts`
- Test: `backend/tests/test_askhaya_voice_orb_state.test.js`

**Interfaces:**
- Consumes: `WorkspaceService`, `PreferenceService`, `ApplicationShell`, `EditorManager`
- Produces: `AskHayaVoiceOrb.getState()`, `AskHayaVoiceOrb.setState(state: OrbState)`, `AskHayaVoiceOrb.onStateChanged(cb)`

- [ ] **Step 1.1: Write failing test for state machine transitions**
  Create `backend/tests/test_askhaya_voice_orb_state.test.js` verifying transitions: `idle` $\rightarrow$ `listening` $\rightarrow$ `processing` $\rightarrow$ `speaking` $\rightarrow$ `idle`, and barge-in `speaking` $\rightarrow$ `listening`.
- [ ] **Step 1.2: Run test and verify it fails**
  Run: `node backend/tests/test_askhaya_voice_orb_state.test.js`
- [ ] **Step 1.3: Update `AskHayaVoiceOrb` state machine in `askhaya-orb.ts`**
  Implement typed transitions, event emitters, and state telemetry hooks.
- [ ] **Step 1.4: Run test and verify it passes**
  Run: `node backend/tests/test_askhaya_voice_orb_state.test.js`
- [ ] **Step 1.5: Commit**
  `git add frontend/theia-extensions/hayagriva/src/browser/askhaya-orb.ts backend/tests/test_askhaya_voice_orb_state.test.js && git commit -m "feat(orb): implement AskHaya state machine and transition hooks"`

---

### Task 2: Draggable Glassmorphic DOM Mount & In-Place Fluid Expansion UI

**Files:**
- Modify: `frontend/theia-extensions/hayagriva/src/browser/askhaya-orb.ts`
- Modify: `frontend/theia-extensions/hayagriva/src/browser/extension.ts`
- Test: `backend/tests/test_askhaya_orb_dom.test.js`

**Interfaces:**
- Consumes: `AskHayaVoiceOrb.initialize()`
- Produces: `#hayagriva-askhaya-orb-root` DOM element with 4 state classes (`.orb-idle`, `.orb-listening`, `.orb-processing`, `.orb-speaking`)

- [ ] **Step 2.1: Write failing test for DOM generation and CSS classes**
  Create `backend/tests/test_askhaya_orb_dom.test.js` asserting root container `#hayagriva-askhaya-orb-root`, drag handles, waveform bars, and action chips.
- [ ] **Step 2.2: Run test and verify it fails**
  Run: `node backend/tests/test_askhaya_orb_dom.test.js`
- [ ] **Step 2.3: Implement DOM mounting, drag physics, and glassmorphic CSS in `askhaya-orb.ts`**
  Add mouse drag event handlers with viewport boundary clamping (`bottom: calc(100vh - y - 32px)`), `localStorage` position caching, and smooth CSS transitions.
- [ ] **Step 2.4: Call `this.voiceOrb.initialize()` on frontend startup in `extension.ts`**
  Ensure the floating orb mounts on app ready without interfering with left activity bar widgets.
- [ ] **Step 2.5: Run test and verify it passes**
  Run: `node backend/tests/test_askhaya_orb_dom.test.js`
- [ ] **Step 2.6: Commit**
  `git add frontend/theia-extensions/hayagriva/src/browser/askhaya-orb.ts frontend/theia-extensions/hayagriva/src/browser/extension.ts backend/tests/test_askhaya_orb_dom.test.js && git commit -m "feat(ui): add draggable amber glass orb and in-place expansion styling"`

---

### Task 3: Real-Time Audio Waveform, Web Speech/Sarvam Inquest & Barge-in Integration

**Files:**
- Modify: `frontend/theia-extensions/hayagriva/src/browser/askhaya-orb.ts`
- Test: `backend/tests/test_askhaya_voice_inquest.test.js`

**Interfaces:**
- Consumes: `POST /api/hayagriva/voice/inquest`, `POST /api/hayagriva/voice/tts`
- Produces: `AskHayaVoiceOrb.submitVoiceQuery(query: string): Promise<void>`

- [ ] **Step 3.1: Write failing test for Voice Inquest endpoint integration**
  Create `backend/tests/test_askhaya_voice_inquest.test.js` simulating voice query submission, receiving spoken response and full citation markdown.
- [ ] **Step 3.2: Run test and verify it fails**
  Run: `node backend/tests/test_askhaya_voice_inquest.test.js`
- [ ] **Step 3.3: Implement Speech Recognition, Waveform Visualizer, and Audio Player in `askhaya-orb.ts`**
  Add Web Speech / Saaras v2 STT listeners, multi-bar CSS waveform animation, silence detection timer (~1.5s), and Sarvam Bulbul v1 / Web SpeechSynthesis audio player with instant barge-in interrupt.
- [ ] **Step 3.4: Run test and verify it passes**
  Run: `node backend/tests/test_askhaya_voice_inquest.test.js`
- [ ] **Step 3.5: Commit**
  `git add frontend/theia-extensions/hayagriva/src/browser/askhaya-orb.ts backend/tests/test_askhaya_voice_inquest.test.js && git commit -m "feat(voice): implement speech recognition, audio playback, and barge-in"`

---

### Task 4: Monaco 1-Click Dossier Insertion & Global `Alt+Space` Hotkey

**Files:**
- Modify: `frontend/theia-extensions/hayagriva/src/browser/askhaya-orb.ts`
- Modify: `frontend/theia-extensions/hayagriva/src/browser/commands.ts`
- Test: `backend/tests/test_askhaya_monaco_bridge.test.js`

**Interfaces:**
- Consumes: `EditorManager.currentEditor`, `CommandRegistry`
- Produces: `hayagriva:toggleVoiceOrb` command (`Alt+Space`), `AskHayaVoiceOrb.insertDossierIntoEditor()`

- [ ] **Step 4.1: Write failing test for Monaco Editor dossier injection and command registration**
  Create `backend/tests/test_askhaya_monaco_bridge.test.js`.
- [ ] **Step 4.2: Run test and verify it fails**
  Run: `node backend/tests/test_askhaya_monaco_bridge.test.js`
- [ ] **Step 4.3: Implement `insertDossierIntoEditor()` and register `hayagriva:toggleVoiceOrb` command**
  Append full precedent citation markdown directly to the active editor cursor position using standard Theia `executeEdits()` API, and bind `Alt+Space` in keybindings.
- [ ] **Step 4.4: Run test and verify it passes**
  Run: `node backend/tests/test_askhaya_monaco_bridge.test.js`
- [ ] **Step 4.5: Commit**
  `git add frontend/theia-extensions/hayagriva/src/browser/askhaya-orb.ts frontend/theia-extensions/hayagriva/src/browser/commands.ts backend/tests/test_askhaya_monaco_bridge.test.js && git commit -m "feat(monaco): add 1-click dossier insertion and Alt+Space hotkey"`

---

### Task 5: End-to-End Test Suite, Build Verification & Visual Playwright Recording

**Files:**
- Create: `backend/tests/test_askhaya_orb_e2e.test.js`

- [ ] **Step 5.1: Write comprehensive End-to-End test**
  Verify state transitions, drag physics, API contracts, Monaco injection, and fallback typing.
- [ ] **Step 5.2: Build frontend and compile TypeScript**
  Run: `yarn --cwd frontend/theia-extensions/hayagriva build && yarn --cwd frontend/applications/browser build`
- [ ] **Step 5.3: Run full backend and E2E test suites**
  Run: `node backend/tests/test_askhaya_orb_e2e.test.js` and `node backend/tests/run_all_tests.js`
- [ ] **Step 5.4: Visual Puppeteer Verification**
  Capture browser screenshot demonstrating idle state, listening state, and spoken dossier card.
- [ ] **Step 5.5: Final Commit**
  `git add backend/tests/test_askhaya_orb_e2e.test.js && git commit -m "test(e2e): complete end-to-end verification for AskHaya ambient amber voice orb"`
