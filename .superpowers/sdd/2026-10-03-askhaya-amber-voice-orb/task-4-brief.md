# Task 4 Brief: Monaco 1-Click Dossier Insertion & Global `Alt+Space` Hotkey

**Goal:** Implement Monaco Editor insertion bridge (`insertDossierIntoEditor()`) via `executeEdits()`, and register the global `hayagriva:toggleVoiceOrb` command with the `Alt+Space` keybinding.

**Files:**
- Modify: `frontend/theia-extensions/hayagriva/src/browser/askhaya-orb.ts`
- Modify: `frontend/theia-extensions/hayagriva/src/browser/commands.ts`
- Test: `backend/tests/test_askhaya_monaco_bridge.test.js`

**Interfaces:**
- Consumes: `EditorManager.currentEditor`, `CommandRegistry`, `KeybindingRegistry`
- Produces: `hayagriva:toggleVoiceOrb` command, `AskHayaVoiceOrb.insertDossierIntoEditor()`

**Requirements:**
1. Monaco Insertion:
   - When the user clicks `[📋 Insert into Editor]` on the speaking/result card, check `this.editorManager?.currentEditor`.
   - If an active editor is open, append the full Markdown citation dossier at the current selection/cursor position using standard Theia `editor.executeEdits([{ range, newText }])`.
   - If no editor is open, open a new scratch markdown tab or show an informative notification.
2. Global Keyboard Shortcut (`Alt+Space`):
   - Register command `hayagriva:toggleVoiceOrb` in `commands.ts`.
   - Bind `Alt+Space` (Mac & PC) to `hayagriva:toggleVoiceOrb`.
   - When invoked, if state is `idle` -> start listening in-place; if `listening` -> submit; if `speaking` -> barge-in / stop.
3. Automated test suite in `backend/tests/test_askhaya_monaco_bridge.test.js`.
