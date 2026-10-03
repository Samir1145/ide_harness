# Task 1 Brief: AskHayaVoiceOrb Service Architecture & State Machine

**Goal:** Implement typed state transitions, event listeners, and query execution hooks in `AskHayaVoiceOrb` service.

**Files:**
- Modify: `frontend/theia-extensions/hayagriva/src/browser/askhaya-orb.ts`
- Test: `backend/tests/test_askhaya_voice_orb_state.test.js`

**Interfaces:**
- Consumes: `WorkspaceService`, `PreferenceService`, `ApplicationShell`, `EditorManager`
- Produces: `AskHayaVoiceOrb.getState()`, `AskHayaVoiceOrb.setState(state: OrbState)`, `AskHayaVoiceOrb.onStateChanged(cb)`, `AskHayaVoiceOrb.setLastResult(res)`, `AskHayaVoiceOrb.getLastResult()`

**Requirements:**
1. State machine supports 4 discrete states: `'idle' | 'listening' | 'processing' | 'speaking'`.
2. `onStateChanged(cb)` triggers all registered listeners whenever `setState()` is invoked.
3. State transitions follow:
   - `idle` $\rightarrow$ `listening` (mic starts)
   - `listening` $\rightarrow$ `processing` (audio captured, query submitted)
   - `processing` $\rightarrow$ `speaking` (spoken brief playback)
   - `speaking` $\rightarrow$ `idle` (playback completed)
   - `speaking` $\rightarrow$ `listening` (instant barge-in interrupt)
4. Store `lastResult: { spokenText: string; fullDossier: string; query: string }`.
5. Write and pass automated test suite `backend/tests/test_askhaya_voice_orb_state.test.js`.
