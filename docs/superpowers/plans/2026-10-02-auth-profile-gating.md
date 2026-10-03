# User Authentication, Profile Management & Feature Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a centralized authentication and token verification system for Hayagriva with a closeable login popup, activity bar profile icon, offline grace period support, and selective gating for Hayagriva Agents and Estate Accounts & Billing.

**Architecture:** Node.js backend auth service providing HMAC-SHA256 signed JWT tokens and verification routes; frontend TypeScript `AuthManager` managing session state in `localStorage` with a 7-day offline grace period; closeable glassmorphic login popup; activity bar profile widget; and dynamic permission guards on sidebar pillars and backend billing APIs.

**Tech Stack:** TypeScript, Node.js (Crypto, Express), Eclipse Theia Workbench Extensions, HTML5/CSS3 (Glassmorphism & Backdrop Filters).

**Spec:** [`docs/superpowers/specs/2026-10-02-auth-profile-gating-design.md`](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/superpowers/specs/2026-10-02-auth-profile-gating-design.md)

## Global Constraints

- Documents Navigator, Search, and Monaco Editor must remain 100% functional without login.
- Only Hayagriva Agents and Estate Accounts & Billing are disabled when logged out.
- Login popup must be dismissable/closeable (`✖` button and `Escape` key).
- Offline grace period must allow 7 days of offline usage if previously verified.
- The Profile Icon must reside at the bottom of the left activity bar.

## Review Focus

1. **Network Failure on Boot:** App must not crash or hang if `POST /api/auth/verify` times out; must gracefully fall back to offline 7-day lease evaluation.
2. **Closeable Modal Interaction:** Closing the modal must cleanly restore pointer events to the editor and file tree without leaving phantom backdrops.
3. **Reactive Feature Toggling:** Logging in or out must instantly update the sidebar pillars (Agents and Estate Accounts) without requiring a full app reload.
4. **Billing API Security:** Backend billing endpoints must return `401 Unauthorized` if no valid Bearer token is provided.
5. **Token Expiry Precision:** Expired tokens (> 7 days without server contact) must trigger a clear "Session Expired" alert on login popup rather than a silent failure.

---

### Task 1: Backend Auth Service, JWT Engine & Billing Route Guard

**Files:**
- Create: `backend/lib/core/auth-service.js`
- Modify: `backend/lib/routes.js`
- Test: `backend/tests/test_auth_routes.test.js`

**Interfaces:**
- Consumes: `crypto` native module, `express` request handlers
- Produces: `authenticateUser(email, password)`, `verifyToken(token)`, `authMiddleware(req, res, next)`

- [ ] **Step 1: Write the failing test**
  Write tests in `backend/tests/test_auth_routes.test.js` asserting `POST /api/auth/login`, `POST /api/auth/verify`, `POST /api/auth/logout`, and 401 protection on `/api/hayagriva/billing/summary`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `node backend/tests/test_auth_routes.test.js`
  Expected: FAIL with "Cannot find module auth-service" or 404 on `/api/auth/login`.

- [ ] **Step 3: Implement `auth-service.js` & route handlers in `routes.js`**
  Implement cryptographic token generation, verification, user authentication store, and billing endpoint protection.

- [ ] **Step 4: Run test to verify it passes**
  Run: `node backend/tests/test_auth_routes.test.js`
  Expected: PASS (All test assertions green).

- [ ] **Step 5: Commit**
  ```bash
  git add backend/lib/core/auth-service.js backend/lib/routes.js backend/tests/test_auth_routes.test.js
  git commit -m "feat(auth): add backend auth service, token verification and billing route guard"
  ```

---

### Task 2: Frontend Auth Manager & Session State Service

**Files:**
- Create: `frontend/theia-extensions/hayagriva/src/browser/auth-manager.ts`
- Modify: `frontend/theia-extensions/hayagriva/src/browser/hayagriva-frontend-module.ts`

**Interfaces:**
- Consumes: Backend `/api/auth/*` endpoints, `localStorage`
- Produces: `AuthManager` with `login()`, `logout()`, `verifySession()`, `isAuthenticated()`, `onAuthStateChanged` emitter

- [ ] **Step 1: Write the unit/integration test for AuthManager state transitions**
  Create test asserting session storage, 7-day offline grace period calculation, and event emission.

- [ ] **Step 2: Implement `AuthManager` in `auth-manager.ts`**
  Implement token storage (`haya_auth_session`), remote verification, grace period checks, and event listeners.

- [ ] **Step 3: Bind `AuthManager` in `hayagriva-frontend-module.ts`**
  Bind `AuthManager` as a singleton in Inversify container.

- [ ] **Step 4: Verify build & tests**
  Run: `yarn --cwd frontend build:extensions`
  Expected: Clean compilation with no TypeScript errors.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/theia-extensions/hayagriva/src/browser/auth-manager.ts frontend/theia-extensions/hayagriva/src/browser/hayagriva-frontend-module.ts
  git commit -m "feat(auth): add frontend AuthManager service and session state listener"
  ```

---

### Task 3: Closeable Login Popup & Glassmorphism UI

**Files:**
- Create: `frontend/theia-extensions/hayagriva/src/browser/auth-modal.ts`
- Modify: `frontend/theia-extensions/hayagriva/src/browser/templates.ts`

**Interfaces:**
- Consumes: `AuthManager`
- Produces: `AuthModal` with `show(options?)`, `hide()`, `isVisible()`

- [ ] **Step 1: Define modal template in `templates.ts`**
  Add `authModalHtml()` with glassmorphic styling, close button `✖`, inputs, submit spinner, error block, and footnote.

- [ ] **Step 2: Implement `AuthModal` controller in `auth-modal.ts`**
  Handle open/close transitions, `Escape` key listener, form submission, and error display.

- [ ] **Step 3: Verify modal mounting & dismissal**
  Compile and verify modal mounts to DOM, closes on `✖` or `Escape`, and triggers `AuthManager.login()`.

- [ ] **Step 4: Commit**
  ```bash
  git add frontend/theia-extensions/hayagriva/src/browser/auth-modal.ts frontend/theia-extensions/hayagriva/src/browser/templates.ts
  git commit -m "feat(auth): add closeable glassmorphism login modal and template"
  ```

---

### Task 4: Profile Icon & Account Popover in Activity Bar

**Files:**
- Create: `frontend/theia-extensions/hayagriva/src/browser/profile-widget.ts`
- Modify: `frontend/theia-extensions/hayagriva/src/browser/extension.ts`

**Interfaces:**
- Consumes: `AuthManager`, `AuthModal`, ApplicationShell
- Produces: `ProfileWidget` docked at bottom of left activity bar

- [ ] **Step 1: Implement `ProfileWidget` in `profile-widget.ts`**
  Create DOM element anchored at bottom of activity bar displaying avatar initials or `👤` icon.
  Build popover card showing User Name, Email, Tier, Lease status, and "Sign Out" button.

- [ ] **Step 2: Wire `ProfileWidget` lifecycle in `extension.ts` (`onStart`)**
  Instantiate `ProfileWidget` in `onStart`, register click handler to toggle popover or open login modal.

- [ ] **Step 3: Verify activity bar docking & responsive popover**
  Compile and test rendering at bottom of sidebar.

- [ ] **Step 4: Commit**
  ```bash
  git add frontend/theia-extensions/hayagriva/src/browser/profile-widget.ts frontend/theia-extensions/hayagriva/src/browser/extension.ts
  git commit -m "feat(auth): add profile icon and account popover in activity bar"
  ```

---

### Task 5: Feature Gating Integration (Hayagriva Agents & Estate Accounts)

**Files:**
- Modify: `frontend/theia-extensions/hayagriva/src/browser/extension.ts`
- Modify: `frontend/theia-extensions/hayagriva/src/browser/chat-agents.ts`
- Modify: `frontend/theia-extensions/hayagriva/src/browser/askhaya-orb.ts`

**Interfaces:**
- Consumes: `AuthManager.onAuthStateChanged`, `AuthManager.isAuthenticated()`
- Produces: Dynamic show/hide and execution blocking for Agents and Estate Accounts

- [ ] **Step 1: Implement feature gating guards in `extension.ts`**
  When logged out: hide/lock Estate Accounts widget (`#hayagriva-billing-explorer`) and Agents tab.
  When logged in: seamlessly show/activate both widgets.

- [ ] **Step 2: Guard AskHaya voice orb and Chat Agents in `chat-agents.ts` & `askhaya-orb.ts`**
  Block prompt executions and voice activation when unauthenticated with a prompt to log in.

- [ ] **Step 3: Verify feature toggling**
  Compile and verify state transitions on login and logout.

- [ ] **Step 4: Commit**
  ```bash
  git add frontend/theia-extensions/hayagriva/src/browser/extension.ts frontend/theia-extensions/hayagriva/src/browser/chat-agents.ts frontend/theia-extensions/hayagriva/src/browser/askhaya-orb.ts
  git commit -m "feat(auth): enforce selective feature gating for Hayagriva Agents and Estate Accounts"
  ```

---

### Task 6: End-to-End Verification Suite & Demo Script

**Files:**
- Create: `backend/tests/test_e2e_auth_gating.js`

- [ ] **Step 1: Create automated end-to-end test script**
  Test full flow: unauthenticated boot -> login modal shown -> documents navigable -> login -> agents unlocked -> sign out -> features re-locked.

- [ ] **Step 2: Run all test suites**
  Run: `node backend/tests/test_auth_routes.test.js && node backend/tests/test_e2e_auth_gating.js`
  Expected: All tests pass 100%.

- [ ] **Step 3: Commit**
  ```bash
  git add backend/tests/test_e2e_auth_gating.js
  git commit -m "test(auth): add comprehensive end-to-end auth gating verification suite"
  ```
