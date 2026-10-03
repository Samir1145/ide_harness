# HAYAGRIVA Licensing & Web Portal Documentation Hub (`licensing-and-portal-docs`)

Welcome to the centralized architectural, operational, and development manual for the **Hayagriva Sovereign Legal OS Web Portal, Client Dashboard, and Desktop IDE Licensing Infrastructure**.

This documentation suite details the end-to-end system design, cryptographic token handshake, role-based access control (RBAC), database schemas, client/admin interfaces, and the exact protocol used by the **Desktop IDE Harness** (`harness/`) to authenticate, obtain offline tokens, and make authorized MCP agent calls.

---

## 📚 Documentation Index

| Doc | Topic | Description |
|---|---|---|
| **[01. Architecture & Ecosystem Overview](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/licensing-and-portal-docs/01_ARCHITECTURE_AND_ECOSYSTEM.md)** | Ecosystem Big Picture | Coexistence of Super Admin (`/admin/*`), Client Portal (`/dashboard/*`), Desktop IDE Harness, and Cloud MCP Agent Services. |
| **[02. Database Schema & Data Models](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/licensing-and-portal-docs/02_DATABASE_SCHEMA_AND_MODELS.md)** | Drizzle ORM & PostgreSQL | Complete schema specifications for `users`, `subscriptions`, `invoices`, `system_logs`, `support_tickets`, `download_releases`, `licenses`, `activations`, and `api_keys`. |
| **[03. Licensing Handshake & Crypto Protocol](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/licensing-and-portal-docs/03_LICENSING_HANDSHAKE_AND_CRYPTO_PROTOCOL.md)** | Activation & Security | `POST /api/v1/activate` & `POST /api/v1/deactivate` handshake, HMAC-SHA256 Offline Token generation, MCP Bearer Token hashing, and device slot limit enforcement. |
| **[04. Client Portal & User Dashboard](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/licensing-and-portal-docs/04_CLIENT_PORTAL_AND_DASHBOARDS.md)** | Advocate Self-Service | 6 high-density client modules: Overview, Licenses & Devices, Profile & Security, Billing & Invoices, API & Agent Logs, Support Tickets. |
| **[05. Super Admin Control Panel](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/licensing-and-portal-docs/05_SUPER_ADMIN_CONTROL_PANEL.md)** | Executive Control Center | Super Admin overview, user drawer management, subscription plan overrides, system telemetry, and audit trail. |
| **[06. Harness Desktop Integration Guide](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/licensing-and-portal-docs/06_HARNESS_DESKTOP_INTEGRATION_GUIDE.md)** | Harness Wiring & Client Hooks | How the Theia IDE Desktop Harness (`harness/backend/lib/core/auth-service.js`) interacts with the licensing server, stores offline tokens, and passes MCP headers. |
| **[07. Deployment, Testing & Operations](file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/docs/licensing-and-portal-docs/07_DEPLOYMENT_TESTING_AND_OPERATIONS.md)** | Vercel, Neon & Playwright | Production build instructions, Neon serverless configuration, test runner scripts, and Playwright E2E browser automation. |

---

## 🚀 Quick Reference

- **Admin & Client Portal App Directory:** `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel`
- **Desktop IDE Harness Directory:** `/Users/atulgrover/Desktop/HAYAGRIVA/harness`
- **Local Dev Server:** `http://localhost:3300` (Next.js 15 App Router)
- **Local Desktop IDE:** `http://127.0.0.1:3000` (Eclipse Theia Browser App)
- **Default Seed Accounts:**
  - **Super Admin:** `superadmin@hayagriva.app` / `hayagriva_secure_password` $\rightarrow$ `/admin/dashboard`
  - **Adv. Rajeshwar Rao:** `r.rao@insolvencylaw.in` / `hayagriva_secure_password` $\rightarrow$ `/dashboard`
  - **Pooja Singhania (IP):** `pooja@singhanialex.com` / `hayagriva_secure_password` $\rightarrow$ `/dashboard`
