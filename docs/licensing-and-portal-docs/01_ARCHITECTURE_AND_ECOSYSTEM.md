# 01. Architecture & Ecosystem Overview

This document outlines the high-level architecture of the **Hayagriva Legal Tech Operating System** and the role of each component in the ecosystem.

---

## 1. High-Level Architectural Topology

```mermaid
flowchart TB
    subgraph ClientLayer [Practitioner Workstations & Browsers]
        A[Advocate Web Browser] -->|HTTPS :3300| WebPortal[Next.js 15 Web Portal]
        B[Theia Desktop IDE Harness] -->|REST Activation| LicenseServer[Licensing Server Endpoint]
        B -->|Encrypted Offline Mode| LocalRuntime[Local Air-Gapped Engine]
        B -->|Cloud MCP Requests| CloudAgents[Hayagriva Cloud Agent Cluster]
    end

    subgraph WebPortalApp [Admin & Client Portal App (/admin-panel)]
        WebPortal --> Middleware[Next.js Edge Middleware]
        Middleware -->|SUPER_ADMIN| AdminRoutes[/admin/* Views]
        Middleware -->|ADVOCATE / CLIENT| ClientRoutes[/dashboard/* Views]
        Middleware -->|Auth Handshake| AuthAPI[/api/v1/auth/*]
        LicenseServer --> ActivateAPI[/api/v1/activate]
        LicenseServer --> DeactivateAPI[/api/v1/deactivate]
    end

    subgraph PersistenceLayer [Database & Storage]
        ActivateAPI --> Drizzle[Drizzle ORM]
        AdminRoutes --> Drizzle
        ClientRoutes --> Drizzle
        Drizzle --> NeonDB[(Neon Serverless PostgreSQL)]
    end
```

---

## 2. Core Pillars of the Platform

### A. The Sovereign Desktop IDE Harness (`harness/`)
- **Nature:** An offline-first, local-first legal workstation built on Eclipse Theia, Monaco Editor, SQLite FTS5, ONNX local embeddings, and native PDF/Pandoc extraction.
- **Air-Gapped Guarantee:** The Desktop IDE requires zero internet connectivity for drafting, concept card extraction, and bare act navigation once activated.
- **Licensing Contract:** At initial startup (or during periodic sync), the IDE contacts the Licensing Server with its hardware fingerprint to obtain a cryptographically signed **Offline Activation Token** and an optional **MCP Bearer Token**.

### B. The Cloud Web Portal (`admin-panel/`)
- **Technology Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Table, Drizzle ORM, `@neondatabase/serverless`.
- **Dual-Surface Interface:**
  1. **Super Admin Command Center (`/admin/*`):** Global user management, subscription overrides, billing reconciliations, software releases, and system-wide audit telemetry.
  2. **Client Portal (`/dashboard/*`):** Self-service dashboard for practitioners to view active licenses, inspect hardware activations, deactivate device slots, generate MCP keys, view invoices, and raise support tickets.

### C. The Licensing & Security Subsystem
- **Centralized Authority:** The cloud web portal is the single source of truth for license validity and device limits.
- **Non-Repudiation & Cryptography:** Offline tokens are signed using HMAC-SHA256 (`PAYLOAD.SIGNATURE`).
- **Zero Client-Side Token Fabrication:** The Desktop IDE **never** self-generates or self-signs tokens. All tokens originate from the server.

---

## 3. Communication & Port Allocation

| Component | Working Directory | Port / Host | Role |
|---|---|---|---|
| **Next.js Web Portal** | `/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel` | `http://localhost:3300` | Super Admin & Client Portal, Licensing API |
| **Theia Desktop IDE** | `/Users/atulgrover/Desktop/HAYAGRIVA/harness/frontend` | `http://127.0.0.1:3000` | Practitioner Legal Desktop Workspace |
| **Hayagriva Local Daemon** | `/Users/atulgrover/Desktop/HAYAGRIVA/harness/backend` | `http://127.0.0.1:3210` | Local Case Context Engine, FTS5 & Seams |
| **Local LLM Engine (Llamafile)** | Bundled binary | `http://127.0.0.1:8090` | Local Air-Gapped Model Inference |
| **Local Embedding Engine** | Bundled ONNX / Llamafile | `http://127.0.0.1:8091` | Dense Vector Semantic Search |
| **Neon PostgreSQL** | Cloud Serverless | Port 5432 / HTTPS pooler | Persistent multi-tenant storage |
