# Option 3B Lord Hayagriva Bust Emblem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the top-left titlebar flowing stallion emblem with **Option 3B (Full Bust Lord Hayagriva with normal ears, sacred forehead tilak, flowing mane, pearls necklace, and zero crown)**.

**Architecture:** Convert the generated Option 3B artwork (`hayagriva_no_crown_1791209970957.jpg`) into a high-contrast, transparent-background PNG vector mask (`branding/resources/hayagriva_bust_no_crown.png`). Encode the optimized mask into a base64 data URI and inject it into the titlebar emblem CSS rules in `frontend/theia-extensions/hayagriva/src/browser/extension.ts`. Maintain crisp solid black `#18181b` rendering, update regression tests in `backend/tests/test_top_emblem_and_cockpit.test.js`, compile production bundles, and verify in the live browser.

**Tech Stack:** Node.js, Python (PIL/OpenCV for crisp alpha mask conversion), TypeScript, CSS3 `-webkit-mask`, Eclipse Theia, Webpack.

**Spec:** [User Request 2026-10-05: Replace flowing stallion with Option 3B Full Bust Lord Hayagriva without crown](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/superpowers/plans/2026-10-05-sovereign-agent-chamber-ui.md)

## Global Constraints
- Preserve zero-box, flush window-corner aesthetic (no floating pills or stickers).
- Render emblem in crisp solid black `#18181b` (zero amber drop-shadow blur).
- Emblem must maintain aspect ratio and crisp line fidelity at 22×22px window titlebar dimensions.
- Preserve Chamber Cockpit click interceptor (`hayagriva.openCockpitMenu`) on the emblem.
- Zero regressions in existing E2E integration suite (`backend/tests/test_sovereign_chamber_e2e.test.js`).

## Review Focus
1. **White background bleed:** Ensure the converted PNG mask has an alpha channel where pure white becomes 100% transparent and black strokes become 100% opaque black, avoiding any fuzzy white box artifacts.
2. **Mask scaling at 22px:** The pearls necklace and fine lines must remain legible at 22×22px without pixel clipping or aliasing distortion.
3. **Base64 string integrity:** The data URI in `extension.ts` must be a valid `data:image/png;base64,...` string accepted by both Webkit and standard CSS mask properties.
4. **Browser Tab Favicon alignment:** Verify the browser tab favicon matches the new Lord Hayagriva emblem.
5. **E2E suite consistency:** `test_top_emblem_and_cockpit.test.js` and `test_sovereign_chamber_e2e.test.js` must pass 100%.

---

### Task 1: Generate & Optimize Transparent PNG Asset & Base64 Data URI from Option 3B Artwork

**Files:**
- Create: `backend/scripts/convert_logo_to_mask.py`
- Create: `branding/resources/hayagriva_bust_no_crown.png`
- Create: `branding/resources/hayagriva_bust_no_crown_base64.txt`
- Test: `backend/tests/test_emblem_asset.test.js`

**Interfaces:**
- Consumes: `/Users/atulgrover/.gemini/antigravity-ide/brain/f115d693-8975-4e5c-8ccc-587bed9dba38/hayagriva_no_crown_1791209970957.jpg`
- Produces: `branding/resources/hayagriva_bust_no_crown.png` (transparent RGBA PNG) and `branding/resources/hayagriva_bust_no_crown_base64.txt` (base64 string for CSS mask)

- [x] **Step 1: Write the failing test**

```javascript
// backend/tests/test_emblem_asset.test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const pngPath = path.resolve(__dirname, '../../branding/resources/hayagriva_bust_no_crown.png');
const b64Path = path.resolve(__dirname, '../../branding/resources/hayagriva_bust_no_crown_base64.txt');

assert.strictEqual(fs.existsSync(pngPath), true, 'hayagriva_bust_no_crown.png must exist');
assert.strictEqual(fs.existsSync(b64Path), true, 'hayagriva_bust_no_crown_base64.txt must exist');

const b64Content = fs.readFileSync(b64Path, 'utf8').trim();
assert.strictEqual(b64Content.length > 500, true, 'Base64 string must be non-empty');
console.log('✅ Emblem asset test PASSED');
```

- [x] **Step 2: Run test to verify it fails**

Run: `node backend/tests/test_emblem_asset.test.js`
Expected: FAIL with "hayagriva_bust_no_crown.png must exist"

- [x] **Step 3: Implement `backend/scripts/convert_logo_to_mask.py` to produce transparent PNG and base64 text**

Script reads `hayagriva_no_crown_1791209970957.jpg`, thresholds white background to alpha 0 and black linework to alpha 255 with smooth edge antialiasing, resizes to a clean 128×128 square, writes `hayagriva_bust_no_crown.png`, and writes its base64 string to `hayagriva_bust_no_crown_base64.txt`.

- [x] **Step 4: Run script and test to verify it passes**

Run: `python3 backend/scripts/convert_logo_to_mask.py && node backend/tests/test_emblem_asset.test.js`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add branding/resources/hayagriva_bust_no_crown.png branding/resources/hayagriva_bust_no_crown_base64.txt backend/scripts/convert_logo_to_mask.py backend/tests/test_emblem_asset.test.js
git commit -m "feat(branding): generate transparent PNG mask and base64 asset for Option 3B Lord Hayagriva bust"
```

---

### Task 2: Update Header Emblem CSS Mask in `extension.ts` & Favicon

**Files:**
- Modify: `frontend/theia-extensions/hayagriva/src/browser/extension.ts:1900-1930`
- Test: `backend/tests/test_top_emblem_and_cockpit.test.js`

**Interfaces:**
- Consumes: Base64 string from `branding/resources/hayagriva_bust_no_crown_base64.txt`
- Produces: Updated `.theia-icon` CSS mask rules with Option 3B Lord Hayagriva bust silhouette

- [x] **Step 1: Write the failing test update in `backend/tests/test_top_emblem_and_cockpit.test.js`**

Update assertion in `test_top_emblem_and_cockpit.test.js` to verify that the old flowing stallion base64 is replaced with the new Option 3B Lord Hayagriva bust mask snippet, while ensuring `#18181b` solid black color remains.

- [x] **Step 2: Run test to verify it fails**

Run: `node backend/tests/test_top_emblem_and_cockpit.test.js`
Expected: FAIL with "Option 3B Lord Hayagriva bust mask missing from extension.ts"

- [x] **Step 3: Update `frontend/theia-extensions/hayagriva/src/browser/extension.ts`**

Replace `-webkit-mask` and `mask` data URIs under `.theia-icon, #theia-top-panel .theia-icon, .theia-app-icon` with the new Option 3B Lord Hayagriva bust base64 string. Ensure browser tab favicon also uses the new bust asset.

- [x] **Step 4: Run test to verify it passes**

Run: `node backend/tests/test_top_emblem_and_cockpit.test.js`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add frontend/theia-extensions/hayagriva/src/browser/extension.ts backend/tests/test_top_emblem_and_cockpit.test.js
git commit -m "feat(ui): update top-left window header emblem to Option 3B Lord Hayagriva bust silhouette"
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
git commit --allow-empty -m "test(e2e): verify all 11 phases pass with Option 3B Lord Hayagriva bust emblem"
```

---

### Task 4: Rebuild Frontend Bundles and Capture Live Browser Verification

**Files:**
- Compile: `frontend/theia-extensions/hayagriva` (TypeScript)
- Compile: `frontend/applications/browser` (Webpack bundle)
- Output: Browser screenshot recording `hayagriva_bust_titlebar_verify.png`

**Interfaces:**
- Consumes: Compiled assets and restarted Theia daemon
- Produces: Visual proof of Option 3B Lord Hayagriva bust emblem in the running browser app

- [x] **Step 1: Build the TypeScript extension**

Run: `yarn --cwd frontend/theia-extensions/hayagriva build`
Expected: Done with 0 errors.

- [x] **Step 2: Build the browser application bundle**

Run: `yarn --cwd frontend/applications/browser build`
Expected: Finished with 0 errors.

- [x] **Step 3: Restart Theia browser server**

Restart task-898 and launch fresh instance on port 3000.

- [x] **Step 4: Capture browser screenshot via subagent or browser verification**

Navigate to `http://127.0.0.1:3000/#/Users/atulgrover/Desktop/HAYAGRIVA/harness`, capture header screenshot, and save to artifact directory.

- [x] **Step 5: Commit and update progress ledger**

```bash
git add .superpowers/sdd/2026-10-05-sovereign-agent-chamber-ui/progress.md
git commit -m "docs: record Option 3B emblem completion in SDD progress ledger"
```
