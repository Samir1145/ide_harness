# Sovereign Agent Foundry, Builder & Cartridge Compiler
## Architectural Specification & Design Document

**Date:** 2026-10-05  
**Status:** In Review / Ready for Plan  
**Target Repositories:**  
- `admin-panel` (`/Users/atulgrover/Desktop/HAYAGRIVA/admin-panel`)
- `harness` (`/Users/atulgrover/Desktop/HAYAGRIVA/harness`)  
**Design Reference Syntheses:**  
- OpenAI Agents Platform & Playground (`api.openai.com/v1/agents`)
- Mistral Studio ("Reuse work with Skills")
- Dyad (`dyad-sh/dyad`) — Local-first, private-by-default, zero lock-in desktop app builder
- Mastra (`mastra.ai`) — TypeScript-native agent workflows, typed Zod schemas & local Studio

---

## 1. Executive Summary & Sovereign Mission

Hayagriva is an **in-chamber legal document factory** and air-gapped sovereign IDE for legal practitioners, Insolvency Professionals, and commercial litigators. 

To expand beyond fixed built-in agents (Advisor, Forms, Document, Claims), we are establishing the **Sovereign Agent Foundry & Cartridge Compiler** within the Hayagriva Web Portal (`admin-panel`). 

This system allows practitioners to:
1. Browse proven, Court-ready **Agent Archetypes** (or start from a blank canvas).
2. Configure prompt behavior, statutory bare act bindings, reasoning depth, and subagent delegation via an intuitive **split-pane Studio** inspired by OpenAI and Mistral Studio.
3. Test-drive their agent live against sample filings (PDF/Word/Excel) in a browser sandbox.
4. **Compile and download a self-contained `.haya` agent cartridge** that docks directly into the `harness` desktop IDE, mounting a dedicated 32px gold circular medallion in Theia's sovereign activity bar and registering in-editor Monaco slash triggers.
5. Access segregated download hubs for the Desktop Harness runtime, hydrated Bare Act Vaults, and quantized GGUF reasoning models.

---

## 2. Information Architecture & Navigation Segregation

To eliminate dashboard clutter and separate commercial accounting from technical assets, `admin-panel/src/components/client/sidebar.tsx` is restructured into distinct sovereign zones:

```
┌────────────────────────────────────────────────────────┐
│ HAYAGRIVA PORTAL (Sidebar)                             │
├────────────────────────────────────────────────────────┤
│ OVERVIEW                                               │
│ • Executive Chamber Overview (/dashboard)              │
│                                                        │
│ SOVEREIGN ASSETS & RUNTIME (Segregated Downloads)      │
│ • Desktop Harness (/dashboard/harness)                 │
│   (macOS Apple Silicon/Intel, Windows, Linux binaries) │
│ • Statutory Bare Act Vaults (/dashboard/vaults)        │
│   (IBC, CPC, Commercial Courts, Companies Act .vault) │
│ • AI Models Hub (/dashboard/models)                    │
│   (GGUF Q4_K_M reasoning engines & ONNX embeddings)   │
│                                                        │
│ AGENT FOUNDRY & REGISTRY                               │
│ • Agent Studio & Registry (/dashboard/agents)          │
│   (Templates grid, split-pane builder, sandbox)        │
│ • My Sovereign Inventory (/dashboard/my-assets)        │
│   (Active device seats, owned cartridges, .haya files) │
│                                                        │
│ GOVERNANCE & ACCOUNTING (Segregated Commercial)        │
│ • Licenses & Device Seats (/dashboard/licenses)        │
│ • Billing & Tax Invoices (/dashboard/billing)          │
│ • Profile & Security (/dashboard/profile)              │
│ • Support Desk (/dashboard/support)                    │
└────────────────────────────────────────────────────────┘
```

---

## 3. The 5 Sovereign Court Archetypes

Inspired by Dyad's `TemplateCard.tsx` and OpenAI's template selector, the Agent Foundry provides 5 pre-configured starter archetypes:

| Archetype Key | Title | Domain | Default Statutory Vaults | Subagent Delegation | Monaco Slash Trigger |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `avoidance_auditor` | **Insolvency Avoidance Auditor** | IBC §§ 43, 45, 50, 66 | IBC 2016, CIRP Regs | FormsAgent (Forensic Audit) | `/avoidance-inquest` |
| `commercial_pleading` | **Commercial Injunction Drafter** | CPC & Commercial Courts | Commercial Courts 2015, CPC 1908 | AuditorAgent (Statement of Truth) | `/cpc-order39` |
| `claim_adjudicator` | **Creditor Claim Verifier** | IBC Claims (Forms B/C/CA) | IBC 2016, CIRP Regs | FormsAgent (Waterfall Ledger) | `/claim-verify` |
| `sec29a_inquest` | **Section 29A Due Diligence** | Resolution Applicant Audit | IBC § 29A, Companies Act | DocumentAgent (Certificate) | `/sec29a-cert` |
| `custom_chamber` | **Custom Sovereign Coworker** | Chamber Specific | User Selected | Configurable | Custom (`/custom-...`) |

Clicking an archetype card instantly populates the configuration accordion without losing focus.

---

## 4. Split-Pane Agent Studio UX Layout

Located at `/dashboard/agents/builder`:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Back to Registry   Agent: "Section 43 Avoidance Auditor" [v1.0.0]   [Compile & Export]     │
├──────────────────────────────────────────────┬──────────────────────────────────────────────┤
│ LEFT PANE: Configuration Accordion (50%)     │ RIGHT PANE: Dual-Tab Sandbox Canvas (50%)    │
│                                              │                                              │
│ [▼] 1. Sovereign Identity & Emblem           │  [ Live Sandbox / Test Run ] [ Cartridge JSON ]
│     • Agent Name: Avoidance Inquest Auditor  │  ┌─────────────────────────────────────────┐ │
│     • Handle: @avoidance                     │  │ Drag & Drop Sample Notice (PDF / Word)  │ │
│     • Circular Medallion: [ Amber Gold Coin ]│  │ or select "demo_nclt_admission.pdf"    │ │
│     • Tone: Strict, Judicial, Forensic       │  ├─────────────────────────────────────────┤ │
│                                              │  │ Practitioner: "Audit bank transactions  │ │
│ [▼] 2. Model & Reasoning Profile             │  │ during the 1-year look-back period."    │ │
│     • Execution Engine: Offline Local Llama  │  ├─────────────────────────────────────────┤ │
│     • Reasoning Effort: High (CoT Forensic)  │  │ @avoidance: "Analyzing ledger entries...│ │
│     • Verbosity: Court-Ready Structured Memo │  │ Identified ₹4.2Cr contra-sweep under    │ │
│                                              │  │ Section 43(2)(a). Preferential intent   │ │
│ [▼] 3. Subagents & Delegation Loop           │  │ established. Drafting avoidance plea..."│ │
│     • [x] Allow Subagent Delegation          │  ├─────────────────────────────────────────┤ │
│     • Delegate to: FormsAgent (Audit Pass)   │  │ [ Draft Preview (Monaco) ]              │ │
│                                              │  │ [ 1-Click Send to Desktop Harness ]     │ │
│ [▼] 4. Statutory Bare Act Vault Bindings     │  └─────────────────────────────────────────┘ │
│     • [x] IBC 2016 (bare_ibc.vault)          │                                              │
│     • [x] CIRP Regulations (cirp_regs.vault) │  (Cartridge JSON tab displays real-time      │
│     • [ ] Commercial Courts Act 2015         │   cURL and manifest.json schema preview)     │
│                                              │                                              │
│ [▼] 5. Practice Templates & Monaco Triggers  │                                              │
│     • Format: `avoidance_application_sec43`  │                                              │
│     • Slash Trigger: `/avoidance-inquest`    │                                              │
└──────────────────────────────────────────────┴──────────────────────────────────────────────┘
```

---

## 5. The `.haya` Sovereign Agent Cartridge Specification

When the practitioner clicks **"Compile & Download `.haya`"**, the portal backend generates a zip archive named `<agent_slug>-v<version>.haya`.

### Archive Directory Structure
```
├── manifest.json              # Typed cartridge metadata, permissions & triggers
├── system_prompt.md           # Sovereign instructions and behavioral bounds
├── rules.json                 # Self-critique and validation rules (e.g. Rule AV_01)
├── medallion.svg              # 32px circular gold coin icon for Theia activity bar
└── templates/                 # Legal document skeletons
    └── primary_skeleton.md    # Court template with {{placeholders}}
```

### `manifest.json` Schema
```json
{
  "$schema": "https://hayagriva.legal/schemas/cartridge-v1.json",
  "id": "agent-avoidance-inquest-v1",
  "slug": "avoidance-inquest",
  "name": "Avoidance & Forensic Audit Inquest Agent",
  "version": "1.0.0",
  "archetype": "avoidance_auditor",
  "author": {
    "name": "Chamber of Atul Grover",
    "chamberId": "usr_9981a"
  },
  "icon": {
    "type": "svg",
    "path": "medallion.svg",
    "color": "#f59e0b",
    "background": "#18181b"
  },
  "runtime": {
    "engine": "local_first",
    "recommendedModel": "DeepSeek-R1-7B-Q4_K_M.gguf",
    "reasoningEffort": "high",
    "contextBudgetTokens": 8192
  },
  "statutoryVaults": [
    "ibc_2016",
    "ibbi_cirp_regulations_2016"
  ],
  "delegation": {
    "allowSubagents": true,
    "criticSubagent": "forms_agent",
    "maxCritiqueTurns": 2
  },
  "editorTriggers": [
    {
      "trigger": "/avoidance-inquest",
      "label": "Section 43/45/50/66 Avoidance Inquest Application",
      "template": "templates/primary_skeleton.md"
    }
  ],
  "hash": "sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "compiledAt": "2026-10-05T23:30:00.000Z"
}
```

---

## 6. Desktop Harness Docking & Ingestion Flow

When the downloaded `.haya` cartridge is saved to `~/.hayagriva/agents/` (or dropped into the `harness` window):

1. **Cartridge Detection:** The Harness `AgentRegistryService` detects the new file via chokidar file watcher.
2. **Signature Verification:** Harness verifies the SHA-256 integrity hash against the user's license public key.
3. **Theia Activity Bar Registration:** Dynamically mounts a 32px circular medallion widget in Eclipse Theia's left sidebar (`rank: 350`, between AskHaya and Compliances).
4. **Monaco Completion Registration:** Registers slash triggers (`/avoidance-inquest`) into Monaco editor autocomplete.
5. **Local Vault Mounting:** Links the agent's context retriever to decrypted in-RAM Bare Act Vaults (`bare_ibc.vault`).

---

## 7. Database Schema Extensions (`admin-panel/src/lib/db/schema.ts`)

Two new tables are added to Neon PostgreSQL via Drizzle ORM:

```typescript
// 10. Custom Sovereign Agents Table
export const customAgents = pgTable("custom_agents", {
  id: text("id").primaryKey(), // agt_xxxx
  userId: text("user_id").notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  archetype: varchar("archetype", { length: 50 }).notNull(), // avoidance_auditor, commercial_pleading, etc.
  version: varchar("version", { length: 20 }).default("1.0.0").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  reasoningEffort: varchar("reasoning_effort", { length: 20 }).default("medium").notNull(),
  allowSubagents: boolean("allow_subagents").default(true).notNull(),
  criticAgent: varchar("critic_agent", { length: 50 }),
  statutoryVaults: jsonb("statutory_vaults").notNull(), // ["ibc_2016", "cpc_1908"]
  slashTriggers: jsonb("slash_triggers").notNull(), // [{"trigger": "/avoidance", ...}]
  medallionColor: varchar("medallion_color", { length: 20 }).default("#f59e0b").notNull(),
  cartridgeUrl: text("cartridge_url"),
  cartridgeHash: varchar("cartridge_hash", { length: 64 }),
  downloadsCount: integer("downloads_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 11. Asset Downloads Telemetry Table
export const assetDownloads = pgTable("asset_downloads", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  assetType: varchar("asset_type", { length: 50 }).notNull(), // HARNESS_BINARY, BARE_ACT_VAULT, AI_MODEL, AGENT_CARTRIDGE
  assetKey: varchar("asset_key", { length: 100 }).notNull(), // e.g. "harness-mac-arm64", "bare_ibc.vault", "agent-avoidance"
  fileSizeBytes: numeric("file_size_bytes"),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),
  downloadedAt: timestamp("downloaded_at").defaultNow().notNull(),
});
```

---

## 8. Implementation Phases & Verification Gates

- **Phase 1: Sidebar & Information Architecture:** Add segregated navigation groups in `sidebar.tsx` (`Harness`, `Vaults`, `Models`, `Agents`, `My Assets`, `Billing`).
- **Phase 2: Database Schema & Migration:** Update `schema.ts`, export TypeScript types, and verify type checking.
- **Phase 3: Downloads & Asset Pages:**
  - `/dashboard/harness`: Multi-platform binary download cards with SHA-256 pills and step-by-step install instructions.
  - `/dashboard/vaults`: Bare Act Cartridge catalog with hydration status, AES-256 metadata, and 1-click downloads.
  - `/dashboard/models`: Local GGUF reasoning engines and dense ONNX embeddings with RAM requirement badges.
  - `/dashboard/my-assets`: Unified inventory of active device seats, downloaded cartridges, and custom agents.
- **Phase 4: Agent Studio & Foundry:**
  - `/dashboard/agents`: Landing table + 5 Court Archetype starter cards.
  - `/dashboard/agents/builder`: Full split-pane studio with configuration accordion, subagent delegation toggle, live test sandbox, and live JSON manifest inspection.
  - `/api/v1/agents/build` & `/api/v1/agents/download/[id]`: Zip compiler producing standard `.haya` archives.
- **Phase 5: Verification & E2E Validation:**
  - Automated Jest / TypeScript build check.
  - Full browser CDP validation with video recording and screenshots demonstrating navigation, template selection, and package download.
