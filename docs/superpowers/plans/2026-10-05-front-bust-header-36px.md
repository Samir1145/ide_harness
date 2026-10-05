# Front Profile Lord Hayagriva Bust & 36px Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the window header bar height to **36px** and deploy the **Option 3B Front Profile Lord Hayagriva Bust with Pearls** at a bold, readable **30×30px** dimension.

**Architecture:** Update `backend/scripts/convert_logo_to_mask.py` to ingest the Option 3B artwork (`hayagriva_no_crown_1791209970957.jpg`), crop tight to the bust bounding box, and dilate the linework so that at 30×30px every stroke is 1.5–2px thick with individually distinct pearls, clear alert ears, and a prominent forehead tilak. Update `frontend/theia-extensions/hayagriva/src/browser/extension.ts` to expand `#theia-top-panel` to 36px with vertically centered menubar items (`line-height: 36px`) and render the front bust emblem at 30×30px using direct transparent PNG masking. Verify via unit tests, the 11-phase Sovereign Legal Chamber E2E suite, production compilation, and live browser verification.

**Tech Stack:** Node.js, Python (OpenCV/PIL for stroke-weighted vector mask processing), TypeScript, CSS3 flexbox/masks, Eclipse Theia, Webpack.

**Spec:** [User Request 2026-10-05: Option 3B Front Profile Lord Hayagriva Bust with Pearls & 36px Header Expansion](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/superpowers/plans/2026-10-05-hayagriva-bust-emblem.md)

## Global Constraints
- **Front Profile Exclusivity:** Only the authentic front profile Lord Hayagriva bust (`hayagriva_no_crown_1791209970957.jpg`) with natural alert ears, zero crown, sacred forehead tilak, and pearl necklace will be used.
- **Header Geometry:** `#theia-top-panel` height expanded cleanly to `36px` (`min-height: 36px; height: 36px;`).
- **Emblem Dimension:** Emblem width and height sized to `30px × 30px` (`margin: 3px 8px 3px 12px;`).
- **Menu Alignment:** Menubar items vertically centered with `line-height: 36px` and font size preserved.
- **Right Notification Alignment:** Top-right notification bell centered within 36px header.
- **Zero Startup Popup:** Ensure `initializeBillingExplorerWidget()` remains passive with no auto-opening modals on boot.
- **Zero Regressions:** 100% green pass on all 11 phases in `test_sovereign_chamber_e2e.test.js`.

## Review Focus
1. **Linework Legibility at 30px:** Ensure the sacred forehead tilak, eye openings, alert upright ears, and pearl beads remain individually discernible without washing out or bleeding together into a black blob.
2. **Menubar Vertical Centering:** Menubar labels (`File`, `Edit`, `Hayagriva`, `Agents`, etc.) must be vertically centered in the 36px bar without vertical jitter on hover or click.
3. **Right Controls Alignment:** The top-right notification bell (`#hayagriva-header-notif-chip`) must remain vertically centered with clean margins.
4. **Window Border Flushness:** Top panel must retain its 1px bottom border and clean separation from the explorer and editor areas.
5. **E2E Suite Integrity:** All 11 phases of `test_sovereign_chamber_e2e.test.js` must pass with zero errors.

---

### Task 1: Generate & Optimize Stroke-Weighted Front Bust Asset with Pearls

**Files:**
- Modify: `backend/scripts/convert_logo_to_mask.py`
- Modify: `branding/resources/hayagriva_bust_no_crown.png`
- Modify: `branding/resources/hayagriva_bust_no_crown_base64.txt`
- Test: `backend/tests/test_emblem_asset.test.js`

**Interfaces:**
- Consumes: `/Users/atulgrover/.gemini/antigravity-ide/brain/f115d693-8975-4e5c-8ccc-587bed9dba38/hayagriva_no_crown_1791209970957.jpg`
- Produces: `branding/resources/hayagriva_bust_no_crown.png` (transparent RGBA PNG with 1.5–2px strokes at 30px) and `branding/resources/hayagriva_bust_no_crown_base64.txt`

- [x] **Step 1: Update `convert_logo_to_mask.py` to ingest front bust artwork with morphological stroke dilation**

Configure script to read `hayagriva_no_crown_1791209970957.jpg`, crop bounding box, dilate lines with an elliptical structuring element (kernel 15) so downscaling retains bold lines, resize to 128×128, save `hayagriva_bust_no_crown.png` as transparent RGBA, and write its base64 string to `hayagriva_bust_no_crown_base64.txt`.

- [x] **Step 2: Run script to generate new assets**

Run: `python3 backend/scripts/convert_logo_to_mask.py`
Expected: Output confirms `Saved PNG mask` and `Saved base64 string`.

- [x] **Step 3: Run unit test to verify asset integrity**

Run: `node backend/tests/test_emblem_asset.test.js`
Expected: PASS with "✅ Emblem asset test PASSED."

- [x] **Step 4: Commit**

```bash
git add backend/scripts/convert_logo_to_mask.py branding/resources/hayagriva_bust_no_crown.png branding/resources/hayagriva_bust_no_crown_base64.txt
git commit -m "feat(branding): generate stroke-weighted front profile Lord Hayagriva bust asset with pearls"
```

---

### Task 2: Expand Header to 36px & Deploy 30px Front Bust Emblem in `extension.ts`

**Files:**
- Modify: `frontend/theia-extensions/hayagriva/src/browser/extension.ts`
- Test: `backend/tests/test_top_emblem_and_cockpit.test.js`

**Interfaces:**
- Consumes: `branding/resources/hayagriva_bust_no_crown_base64.txt`
- Produces: 36px header panel styles, 30px emblem dimensions, centered menubar items, aligned notification button

- [x] **Step 1: Update `backend/tests/test_top_emblem_and_cockpit.test.js` to assert 36px header and 30px emblem**

Update test assertions to verify:
- `#theia-top-panel` has `height: 36px` or `min-height: 36px`.
- `.theia-icon` has `width: 30px` and `height: 30px`.
- Menubar items have `line-height: 36px`.
- Solid black color `#18181b` and new front bust base64 snippet are present.

- [x] **Step 2: Run test to verify it fails**

Run: `node backend/tests/test_top_emblem_and_cockpit.test.js`
Expected: FAIL on 36px header or 30px emblem assertions.

- [x] **Step 3: Update `extension.ts` with 36px header and 30px front bust styles**

In `extension.ts`:
1. Add rules for `#theia-top-panel`: `height: 36px !important; min-height: 36px !important;`
2. Add rules for `.lm-MenuBar-content`: `height: 36px !important; align-items: center !important;`
3. Add rules for `.lm-MenuBar-item, .p-MenuBar-item`: `line-height: 36px !important; height: 36px !important;`
4. Update `.theia-icon, #theia-top-panel .theia-icon, .theia-app-icon`:
   - `width: 30px !important; height: 30px !important;`
   - `margin: 3px 8px 3px 12px !important;`
   - Base64 data URI mask & background with Option 3B front bust.
5. Update `#hayagriva-header-notif-chip`: `margin: 4px 12px 4px 6px !important;` for clean vertical centering.

- [x] **Step 4: Run test to verify it passes**

Run: `node backend/tests/test_top_emblem_and_cockpit.test.js`
Expected: PASS with "✅ Top Emblem & Chamber Cockpit test PASSED."

- [x] **Step 5: Commit**

```bash
git add frontend/theia-extensions/hayagriva/src/browser/extension.ts backend/tests/test_top_emblem_and_cockpit.test.js
git commit -m "feat(ui): expand titlebar to 36px and deploy 30px front profile Lord Hayagriva bust emblem"
```

---

### Task 3: Full E2E Integration Suite Regression Verification

**Files:**
- Test: `backend/tests/test_sovereign_chamber_e2e.test.js`

**Interfaces:**
- Consumes: All 11 phase test suites
- Produces: 100% green test assertions across all tasks

- [x] **Step 1: Run the full E2E test runner**

Run: `node backend/tests/test_sovereign_chamber_e2e.test.js`
Expected: ALL 11 SOVEREIGN LEGAL CHAMBER PHASES PASSED WITH ZERO REGRESSIONS!

- [x] **Step 2: Commit any test adjustments**

```bash
git commit --allow-empty -m "test(e2e): verify all 11 phases pass with 36px header and 30px front bust emblem"
```

---

### Task 4: Production Bundles Rebuild & Live Browser Verification

**Files:**
- Compile: `frontend/theia-extensions/hayagriva` (TypeScript)
- Compile: `frontend/applications/browser` (Webpack bundle)
- Output: Browser screenshot recording `hayagriva_front_bust_36px_header.png`

**Interfaces:**
- Consumes: Compiled assets and restarted Theia daemon
- Produces: Visual proof of 36px header with 30px front profile bust emblem in the running browser app

- [x] **Step 1: Build the TypeScript extension**

Run: `yarn --cwd frontend/theia-extensions/hayagriva build`
Expected: Done with 0 errors.

- [x] **Step 2: Build the browser application bundle**

Run: `yarn --cwd frontend/applications/browser build`
Expected: Finished with 0 errors.

- [x] **Step 3: Restart Theia browser server**

Restart task-1180 on port 3000.

- [x] **Step 4: Capture browser screenshot via subagent**

Navigate to `http://127.0.0.1:3000/#/Users/atulgrover/Desktop/HAYAGRIVA/harness`, verify 36px header height and 30px front bust rendering, and save screenshot to artifact directory.

- [x] **Step 5: Commit and update progress ledger**

```bash
git add .superpowers/sdd/2026-10-05-sovereign-agent-chamber-ui/progress.md
git commit -m "docs: record 36px header and front bust emblem completion in SDD progress ledger"
```
