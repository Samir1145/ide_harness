# Client Portal, Licensing Server & User Dashboard Specification

**Date:** 2026-10-02  
**Target Application:** `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel`  
**Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Lucide Icons, TanStack Table, Drizzle ORM, Neon Serverless PostgreSQL (`@neondatabase/serverless`), Recharts, `next-themes`, Playwright.

---

## 1. Executive Summary & Architectural Flow

The **Hayagriva Client Portal & Licensing Subsystem** provides registered legal practitioners (advocates, insolvency professionals, corporate clients) with a unified, high-density SaaS dashboard to manage their subscriptions, retrieve and manage Desktop IDE licenses, monitor hardware device activations, configure programmatic/MCP API keys, inspect their API consumption logs, download GST invoice receipts, and file support tickets.

```
┌────────────────────────────────────────┐
│     Hayagriva Web Portal & DB          │
│  (Next.js 15 + Neon Serverless PG)     │
│                                        │
│  • Users, Subscriptions & Invoices     │
│  • Licenses, Activations & Devices     │
│  • MCP API Keys & Rate-Limiting        │
└──────────────────┬─────────────────────┘
                   │
                   │ 1. POST /api/v1/activate
                   │    { license_key, hardware_fingerprint, os_info }
                   ▼
┌────────────────────────────────────────┐
│      Server Validation & Signer        │
│                                        │
│  • Checks device limits & plan status  │
│  • Generates Server-Signed JWT/Ed25519 │
│    Offline Token (w/ expiry & hw_hash) │
│  • Generates Scoped MCP Bearer Token   │
└──────────────────┬─────────────────────┘
                   │
                   │ 2. Returns: { offline_token, mcp_token, expires_at }
                   ▼
┌────────────────────────────────────────┐
│       Hayagriva Desktop IDE /          │
│          AI Agent Harness              │
│                                        │
│  • Caches Offline Token in OS Keychain │
│  • Attaches `Authorization: Bearer     │
│    <mcp_token>` for Cloud Agents & MCP │
└────────────────────────────────────────┘
```

---

## 2. Database Schema Extensions (`src/lib/db/schema.ts`)

The existing Drizzle schema (`users`, `system_logs`, `invoices`, `download_telemetry`, `support_tickets`, `admin_audit_logs`) is extended with 3 dedicated tables:

### 2.1 `licenses` Table
- `id` (text, PK): e.g., `lic_pro_8f91a`
- `userId` (text, FK -> `users.id`): Reference to user
- `licenseKey` (varchar(64), unique): Secret license key (e.g., `HAYA-PRO-7X9K-4M2P-9Q8A`)
- `planTier` (varchar(50)): `STARTER`, `PROFESSIONAL`, `ENTERPRISE`
- `maxDevices` (integer): Maximum active hardware devices allowed (Starter: 1, Pro: 3, Enterprise: 10)
- `status` (varchar(50)): `ACTIVE`, `SUSPENDED`, `EXPIRED`
- `expiresAt` (timestamp): Subscription renewal boundary
- `createdAt` (timestamp): Creation timestamp

### 2.2 `activations` (Hardware Fingerprints) Table
- `id` (text, PK): e.g., `act_98fa2`
- `licenseId` (text, FK -> `licenses.id`)
- `userId` (text, FK -> `users.id`)
- `hardwareFingerprint` (varchar(64)): SHA-256 hash of machine hardware
- `deviceName` (varchar(100)): e.g., "Atul's MacBook Pro (Apple M3 Max)"
- `osInfo` (varchar(100)): e.g., "macOS Darwin 24.1.0 (arm64)"
- `ipAddress` (varchar(45)): Last seen IP
- `lastPingAt` (timestamp): Last verification timestamp from Desktop IDE
- `isActive` (boolean): `true` if occupying an active device slot
- `activatedAt` (timestamp): Initial activation timestamp
- `deactivatedAt` (timestamp, nullable): Timestamp when revoked

### 2.3 `api_keys` Table (Programmatic & MCP Cloud Tokens)
- `id` (text, PK): e.g., `key_mcp_01`
- `userId` (text, FK -> `users.id`)
- `activationId` (text, nullable, FK -> `activations.id`)
- `name` (varchar(100)): e.g., "Desktop IDE MCP Cloud Key"
- `keyPrefix` (varchar(20)): Display prefix, e.g. `mcp_live_9f2a`
- `keyHash` (text): SHA-256 hashed secret
- `scopes` (text[]): e.g., `['mcp:agent:read', 'mcp:agent:exec']`
- `isActive` (boolean): `true` if active
- `createdAt` (timestamp): Creation date
- `lastUsedAt` (timestamp, nullable): Last API request timestamp

---

## 3. Cryptographic Token Signing Engine (`src/lib/security/tokens.ts`)

1. **Offline Activation Token (Server-Signed):**
   - Encodes `{ licenseKey, userId, hardwareFingerprint, planTier, expiresAt, issuedAt }`.
   - Signed using server HMAC-SHA256 / Ed25519 signature format: `base64(payload).base64(signature)`.
   - Desktop IDE verifies the signature locally for offline operations.
2. **MCP Bearer Token:**
   - Format: `mcp_live_<random32bytes>`.
   - SHA-256 hash stored in database `api_keys`.
   - Scoped for cloud AI agent execution.

---

## 4. API Endpoints Specification

### 4.1 Licensing Handshake Endpoints
* **`POST /api/v1/activate`**:
  - Validates `license_key`, active status, and expiration.
  - Re-activation from same hardware updates `lastPingAt` and returns updated tokens without consuming an extra device slot.
  - If new hardware and active devices count >= `maxDevices`, rejects with `403 DEVICE_LIMIT_EXCEEDED`.
  - Otherwise records new activation, generates server-signed Offline Token + MCP Bearer Token, and returns full activation payload.
* **`POST /api/v1/deactivate`**:
  - Marks `activations.isActive = false`, sets `deactivatedAt = now()`.
  - Revokes associated MCP key in `api_keys`, freeing up 1 device slot.

### 4.2 Client Data Endpoints
* **`GET /api/user/overview`**: Returns metrics for logged-in user (License status, active devices count/max, API requests this cycle vs plan quota, recent activity).
* **`GET /api/user/licenses`**: Returns user's license details and list of active/revoked hardware devices.
* **`GET /api/user/keys` & `POST /api/user/keys` & `DELETE /api/user/keys`**: Manages programmatic & MCP API keys.
* **`GET /api/user/invoices`**: Returns user-scoped invoice history with download triggers.
* **`GET /api/user/logs`**: Returns user-scoped API and MCP request logs.
* **`GET /api/user/support` & `POST /api/user/support`**: Lists and submits support tickets.

---

## 5. Client Portal UI Layout & 6 Dedicated Views

### 5.1 Global Shell (`src/app/dashboard/layout.tsx`)
- **Top Header:** Brand logo (`🐎 HAYAGRIVA`), search bar, live status badge (`🟢 Cloud Online`), theme switcher (Dark/Light), Support shortcut, and User Avatar dropdown.
- **Sidebar Navigation:**
  1. **Overview** (`/dashboard`)
  2. **Licenses & Devices** (`/dashboard/licenses`)
  3. **Profile & Security** (`/dashboard/profile`)
  4. **Billing & Invoices** (`/dashboard/billing`)
  5. **API & MCP Logs** (`/dashboard/logs`)
  6. **Support Tickets** (`/dashboard/support`)

### 5.2 View Details
1. **Overview (`/dashboard`)**: License capacity card (e.g. `2/3 Active Devices`), API requests progress bar (`18,420 / 100,000`), subscription renewal card, quick MCP connection status, and recent activity feed.
2. **Licenses & Devices (`/dashboard/licenses`)**: Master license key reveal & copy card, registered hardware activations table with device specs and IP, 1-Click "Deactivate Device" modal, and direct installer download links (macOS, Windows, Linux).
3. **Profile & Security (`/dashboard/profile`)**: Practitioner and firm details, locked/read-only email badge (`🔒 IMMUTABLE`), change password form, 2FA toggle wizard, and MCP API Key management table with "Generate New Key" modal.
4. **Billing & Invoices (`/dashboard/billing`)**: Plan pricing card, renewal dates, and invoice ledger table with 1-Click "Download GST PDF Receipt".
5. **API & MCP Logs (`/dashboard/logs`)**: Real-time request log table strictly scoped to `userId` with status code badges, latency meters, and endpoint filters.
6. **Support Tickets (`/dashboard/support`)**: Support inbox displaying submitted tickets with priority and status badges, plus "Create New Ticket" modal.

---

## 6. Non-Functional & Security Requirements

- **User & Tenant Scoping:** Every query and action is strictly scoped to the authenticated `user.id`.
- **Email Immutability:** Email addresses cannot be modified via profile forms.
- **Zero Connection Exhaustion:** Uses `@neondatabase/serverless` with Drizzle ORM HTTP driver.
- **Dual Theme Support:** Full support for Slate Dark theme and Crisp SaaS Light theme via `next-themes`.
- **Offline Integrity:** The Desktop IDE can operate offline using the cryptographically verified Offline Token.

---

## 7. Verification & Testing Matrix

- **Unit & Service Tests:**
  - `src/tests/licensing_db.test.ts` (schema, mock store, seed licenses and activations)
  - `src/tests/token_engine.test.ts` (cryptographic token signing, tamper detection, MCP key hashing)
  - `src/tests/activation_handshake.test.ts` (normal activation, re-activation, device limit 403, and deactivation)
  - `src/tests/client_portal_rbac.test.ts` (data isolation by `userId`)
- **End-to-End Playwright Automation (`src/tests/e2e_client_portal_playwright.js`):**
  - Verifies all 6 client portal views, license key reveal/copy, device deactivation modal, new MCP key modal, ticket filing, and dark/light theme toggle with visual screenshot artifacts.
- **Production Build:**
  - `npm run build` with 0 TypeScript/ESLint errors.
