# 07. Deployment, Testing & Operations

This guide covers deployment pipelines, environment variables, test runner commands, and Playwright end-to-end browser automation for the Hayagriva Admin Panel and Licensing Server.

---

## 1. Environment Variables & Configuration

Create or configure `.env.local` inside `admin-panel/`:

```bash
# Neon Serverless PostgreSQL Database Connection String
DATABASE_URL="postgresql://hayagriva_owner:secret@ep-cool-fog-123456.us-east-2.aws.neon.tech/hayagriva?sslmode=require"

# Cryptographic Token Signing Secret (Keep strictly private in production)
OFFLINE_TOKEN_SECRET="hayagriva_offline_token_hmac_secret_key_2026"
SESSION_SECRET="hayagriva_session_jwt_secret_2026_super_secure"

# Next.js Server Port (Default: 3300)
PORT=3300
NEXT_PUBLIC_APP_URL="http://localhost:3300"
```

---

## 2. Running Automated Test Suites

The codebase includes comprehensive unit, integration, and E2E test suites in `admin-panel/src/tests/`.

### Run All Unit & Integration Tests:
```bash
cd /Users/atulgrover/Desktop/HAYAGRIVA/admin-panel

npx tsx src/tests/licensing_db.test.ts && \
npx tsx src/tests/token_engine.test.ts && \
npx tsx src/tests/activation_handshake.test.ts && \
npx tsx src/tests/client_portal_rbac.test.ts && \
npx tsx src/tests/client_overview.test.ts && \
npx tsx src/tests/client_licenses_ui.test.ts && \
npx tsx src/tests/client_profile_keys.test.ts && \
npx tsx src/tests/client_secondary_modules.test.ts
```

### Test Suite Coverage Breakdown:
1. `licensing_db.test.ts`: Verifies Drizzle ORM schema tables (`licenses`, `activations`, `apiKeys`) and mock seed store.
2. `token_engine.test.ts`: Asserts HMAC-SHA256 signature generation, tamper detection, and MCP token hashing.
3. `activation_handshake.test.ts`: Validates `POST /api/v1/activate` capacity checks, idempotent re-activations, device limit rejections (`403 DEVICE_LIMIT_EXCEEDED`), and deactivation slot recovery.
4. `client_portal_rbac.test.ts`: Asserts Edge Middleware permissions, ensuring advocates cannot reach `/admin/*` and unauthenticated users are redirected to `/login`.
5. `client_overview.test.ts`: Validates aggregation of license capacity percentages, API quota usage bars, and user-scoped activity feeds.
6. `client_licenses_ui.test.ts`: Tests license key masking/revealing and device deactivation.
7. `client_profile_keys.test.ts`: Validates immutable email guards, password update flows, and programmatic MCP API key generation/revocation.
8. `client_secondary_modules.test.ts`: Validates user-scoped invoice retrieval, system log filtering, and support ticket creation.

---

## 3. Playwright Browser End-to-End Automation

To run the full end-to-end browser test that navigates through all 6 client views, reveals license keys, deactivates a device, generates an MCP key, and captures screenshots:

```bash
cd /Users/atulgrover/Desktop/HAYAGRIVA/admin-panel
node src/tests/e2e_client_portal_playwright.js
```

### Captured Visual Artifacts:
- `client_01_login_page.png`
- `client_02_overview_dark.png`
- `client_03_overview_light.png`
- `client_04_licenses_page.png`
- `client_05_license_key_revealed.png`
- `client_06_deactivate_device_modal.png`
- `client_07_profile_security.png`
- `client_08_mcp_key_generated.png`
- `client_09_billing_invoices.png`
- `client_10_api_logs.png`
- `client_11_support_page.png`
- `client_12_create_ticket_modal.png`

---

## 4. Production Build & Deployment to Vercel

The application is fully compatible with Vercel's Edge and Serverless Functions without TCP connection pool limits.

### Local Production Build:
```bash
cd /Users/atulgrover/Desktop/HAYAGRIVA/admin-panel
npm run build
```

### Deploying to Vercel:
```bash
# 1. Install Vercel CLI (if not already installed)
npm install -g vercel

# 2. Deploy from admin-panel directory
cd /Users/atulgrover/Desktop/HAYAGRIVA/admin-panel
vercel --prod
```

Configure the environment variables (`DATABASE_URL`, `OFFLINE_TOKEN_SECRET`, `SESSION_SECRET`) in the Vercel Project Dashboard.
