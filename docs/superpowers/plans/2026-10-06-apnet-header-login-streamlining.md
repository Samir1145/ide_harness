# APNET Header Action Streamlining (Single Login Button) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Streamline the right action cluster on `apnet_website` header by removing the `Download Hayagriva` button and replacing `Chamber Login` with a clean, compact `Login` button. Clients download binaries from inside the portal; this eliminates horizontal right-edge clipping and expands space for the 4 sovereign pillars.

**Architecture:** 
- In `/Users/atulgrover/Desktop/HAYAGRIVA/apnet_website/header.html`, remove `#btn-download-hayagriva` and update the login button text to `Login` with `id="btn-login"`, triggering `openAccountModal()`.
- In `apnet_website/css/components.css`, refine the `.nav-btn-login` styling and container layout.
- In `apnet_website/js/header.js`, synchronize `fallbackHTML`.
- In `backend/tests/test_apnet_header.js`, update test assertions to ensure `Login` is present and `Download Hayagriva` is strictly absent from the header bar.
- Re-run visual regression captures with Playwright across viewports (including 1280px and 1440px) to verify zero clipping.

**Tech Stack:** HTML5, CSS3, JavaScript, Playwright/Chrome headless.

---

### Task 1: Update Test Suite for Streamlined Action Cluster

**Files:**
- Modify: `backend/tests/test_apnet_header.js`
- Modify: `scratch/test_apnet_header.js`

**Interfaces:**
- Updates:
  - Assert that action cluster contains `Login` (with `openAccountModal`).
  - Assert that header nav menu DOES NOT contain `Download Hayagriva` button.

- [ ] **Step 1: Update test assertions in `backend/tests/test_apnet_header.js` and `scratch/test_apnet_header.js`**
- [ ] **Step 2: Run test to observe expected failure against current header**
- [ ] **Step 3: Commit test changes (`git commit -m "test(apnet): update navigation test suite for Login button and no download CTA"`)**

---

### Task 2: Update Header HTML & Fallback Template

**Files:**
- Modify: `/Users/atulgrover/Desktop/HAYAGRIVA/apnet_website/header.html`
- Modify: `/Users/atulgrover/Desktop/HAYAGRIVA/apnet_website/js/header.js`

**Interfaces:**
- Produces:
  - Right action container with single button:
    ```html
    <li class="nav-item nav-item-cta" id="nav-action-cluster-wrapper">
      <div class="nav-action-cluster">
        <button type="button" class="nav-btn-login" id="btn-login" onclick="openAccountModal();" aria-label="Login">
          <i class="fa-solid fa-circle-user"></i>
          <span>Login</span>
        </button>
      </div>
    </li>
    ```
  - Synchronized `fallbackHTML` in `js/header.js`.

- [ ] **Step 1: Update action cluster in `header.html`**
- [ ] **Step 2: Synchronize `fallbackHTML` in `js/header.js`**
- [ ] **Step 3: Run `backend/tests/test_apnet_header.js` to verify test passes**

---

### Task 3: CSS Refinement for Single Login Button & Spacing

**Files:**
- Modify: `/Users/atulgrover/Desktop/HAYAGRIVA/apnet_website/css/components.css`

**Interfaces:**
- Produces:
  - Clean styling for `.nav-btn-login` (high-contrast, subtle border, hover lift).
  - Proper flex spacing ensuring ample breathing room for the 4 sovereign pillars.

- [ ] **Step 1: Add `.nav-btn-login` rules and clean up obsolete `.nav-btn-download-ide` in header action scope**
- [ ] **Step 2: Verify responsive nav layout on 1280px, 1366px, and 1440px widths**
- [ ] **Step 3: Commit changes in `apnet_website` (`git commit -m "feat(navigation): streamline action cluster to single Login button and eliminate header download CTA"`)**

---

### Task 4: Visual Regression Verification & Screenshots

**Files:**
- Modify & Run: `scratch/capture_apnet_header.js`
- Generate:
  - `apnet_1_header_streamlined.png`
  - `apnet_2_workbench_streamlined.png`
  - `apnet_3_login_modal_streamlined.png`

- [ ] **Step 1: Update `scratch/capture_apnet_header.js` to target `#btn-login` and capture revised header**
- [ ] **Step 2: Execute screenshot capture using headless Google Chrome**
- [ ] **Step 3: Inspect visual artifacts to verify zero right-edge clipping and balanced tabs**
