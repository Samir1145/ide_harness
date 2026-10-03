# Task 2 Brief: Draggable Glassmorphic DOM Mount & In-Place Fluid Expansion UI

**Goal:** Implement `#hayagriva-askhaya-orb-root` DOM rendering, viewport-constrained mouse draggability, `localStorage` position caching, and the 4-state fluid glassmorphic CSS animations.

**Files:**
- Modify: `frontend/theia-extensions/hayagriva/src/browser/askhaya-orb.ts`
- Modify: `frontend/theia-extensions/hayagriva/src/browser/extension.ts`
- Test: `backend/tests/test_askhaya_orb_dom.test.js`

**Interfaces:**
- Consumes: `AskHayaVoiceOrb.initialize()`, `AskHayaVoiceOrb.onStateChanged()`
- Produces: `#hayagriva-askhaya-orb-root` with `.orb-idle`, `.orb-listening`, `.orb-processing`, `.orb-speaking` classes, `#askhaya-waveform-container`, `#askhaya-transcript-text`, and action buttons.

**Requirements:**
1. Render container `#hayagriva-askhaya-orb-root` into `document.body` with fixed positioning.
2. In-place expansion: Dimensions animate smoothly:
   - Idle: 44px × 44px frosted amber circle with glowing horse glyph.
   - Listening: 280px × 80px capsule with waveform and transcript container.
   - Processing: 280px × 74px capsule with shimmering radar glow.
   - Speaking: 320px × 110px capsule with spoken text and action buttons.
3. Mouse drag physics:
   - Clamped within `(8px, 8px)` to `(window.innerWidth - width - 8px, window.innerHeight - height - 32px)` so it never clips offscreen or collides with the status bar.
   - Saves position to `localStorage.setItem('haya_voice_orb_pos', JSON.stringify({ x, y }))`.
   - Restores coordinates on load.
4. Mount orb in `extension.ts` on startup without blocking or removing the left activity bar Stallion tab.
5. Automated test suite `backend/tests/test_askhaya_orb_dom.test.js` verifying DOM layout, CSS injection, and state classes.
