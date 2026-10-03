# Task 5 Brief: End-to-End Test Suite, Build Verification & Visual Playwright Recording

**Goal:** Create a comprehensive End-to-End test suite, rebuild the production browser bundle, verify 0 runtime errors, and capture visual verification artifacts.

**Files:**
- Create: `backend/tests/test_askhaya_orb_e2e.test.js`
- Test: Full backend test runner `node backend/tests/run_all_tests.js`

**Requirements:**
1. End-to-End Test Suite (`backend/tests/test_askhaya_orb_e2e.test.js`):
   - Assert all 4 Orb states (`idle`, `listening`, `processing`, `speaking`).
   - Assert drag boundary clamping and localStorage persistence.
   - Assert Voice Inquest API integration with LightRAG and Sarvam voice payloads.
   - Assert Monaco Editor dossier injection with formatted markdown headers and legal citations.
   - Assert `Alt+Space` hotkey registration and toggle behavior.
2. Build Verification:
   - Run `yarn --cwd frontend/theia-extensions/hayagriva build` (0 errors).
   - Run `yarn --cwd frontend/applications/browser build` (0 errors).
3. Visual Verification:
   - Run Puppeteer script to verify the Orb renders in idle state, expands on click, and displays the audio waveform.
