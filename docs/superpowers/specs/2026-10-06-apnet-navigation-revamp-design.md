# Design Specification: APNET Website Navigation Restructuring & Sovereign 4-Pillar Mega-Menus

**Date:** 2026-10-06  
**Status:** Approved by User  
**Target Repository:** `apnet_website` (`/Users/atulgrover/Desktop/HAYAGRIVA/apnet_website`)  
**Core File Affected:** `header.html` (and CSS styling in `css/components.css`)  

---

## 1. Overview & Intent

The **AgenticProfessionals.Net** (`apnet_website`) marketing and institutional portal currently has an outdated navigation structure where "HARNESS" bundles Vaults, Agents, and Models together, while "BACK-OFFICE" and "NETWORK" contain overlapping workflows.

This redesign restructures the primary navigation into **Four Sovereign Pillars** that mirror the mental model of the Hayagriva ecosystem across the desktop IDE (`harness`) and the web portal (`admin-panel`):

1. **`WORKBENCH`** (`Sovereign Harness`)
2. **`INTELLIGENCE`** (`Knowledge Vaults`)
3. **`AGENTS`** (`Enterprise Co-Counsel`)
4. **`COMMUNITY`** (`Hayagriva Resources`)

### Explicit Boundaries & Constraints
- **Zero Page Content Rewrites:** All 30+ existing HTML showcase pages remain completely intact. Only navigation headers, dropdown routing, and linking are modified.
- **Omission of Pricing:** "Pricing & Practice Suites" is intentionally omitted from the top navigation.
- **Zero Portal Bleed:** External redirects to `localhost:3300` are avoided; all actions operate within `apnet_website` internal pages and modals.
- **Brand Balance:** Header displays `AGENTIC PROFESSIONALS NETWORK` with sub-branding `Powered by Hayagriva OS`.
- **Right Action Pair:** Header displays `Chamber Login` (subtle action opening `#account-modal`) and `Download Hayagriva` (primary gold CTA opening `openIdeDownloadModal()`).

---

## 2. Header Layout & Top Bar Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Brand Logo]                            [Primary Navigation Tabs]                          [Actions]             │
│ AGENTIC PROFESSIONALS NETWORK          🏠 Home                                            Chamber Login          │
│ Powered by Hayagriva OS • apnet.co.in  1. WORKBENCH ▾ (Sovereign Harness)                 [📥 Download Hayagriva]│
│                                        2. INTELLIGENCE ▾ (Knowledge Vaults)                                      │
│                                        3. AGENTS ▾ (Enterprise Co-Counsel)                                       │
│                                        4. COMMUNITY ▾ (Hayagriva Resources)                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed 4-Pillar Mega-Menu Specifications

Each of the 4 sovereign pillars features a **3-column Mega Menu Dropdown** with category icons, descriptive titles, concise subtitles, and direct internal HTML links.

### Pillar 1: `WORKBENCH` (Subtitle: `Sovereign Harness`)

* **Column 1 — Desktop Harness Core:**
  - **Sovereign IDE Overview** (`harness_haya_workbench.html`): Air-gapped Theia architecture, 5 sovereign pillars, zero-telemetry guarantee.
  - **Deterministic Core Engine** (`harness_haya_engine.html`): SQLite FTS5, ONNX dense vector memory, PageIndex document slicing.
  - **Multi-Modal Document Ingest** (`harness_haya_ingest.html`): Native PDF, Mammoth Word, XLSX parsing, pandoc fallback.

* **Column 2 — In-Chamber Workspaces:**
  - **Monaco Legal Drafting Studio** (`harness_haya_studio.html`): Pleadings editor with slash commands (`/cpc-order39`, `/avoidance-audit`).
  - **Case Wiki & Compounding Artifacts** (`harness_haya_wiki.html`): Machine-maintained `wiki/INDEX.md`, insights filing.
  - **Case Action Inbox & HITL** (`chatroom.html`): Ambient counsel (AskHaya Stallion), non-blocking review cards.

* **Column 3 — Local AI Engines:**
  - **Local Reasoning SLMs** (`harness_haya_models.html`): `DeepSeek-R1-7B (Q4_K_M)` & `Llama-3.2-3B`.
  - **Dense Vector Embeddings** (`models_embeddings.html`): `BGE-Small-EN-v1.5 (ONNX)`.
  - **Domain Specialized Weights** (`models_domain_slms.html`): Legal & Financial forensic model fine-tunes.

---

### Pillar 2: `INTELLIGENCE` (Subtitle: `Knowledge Vaults`)

* **Column 1 — Statutory Vaults (India Code Mirrored):**
  - **Master Bare Acts** (`vaults_law.html`): IBC 2016, Commercial Courts Act 2015, CPC 1908, Companies Act 2013, NI Act 1881.
  - **Legislative REST API Sync**: Authoritative Ministry of Law & Justice India Code DSpace REST mirror.
  - **Zero-RAM Runtime**: AES-256 encrypted vector packages (`.vault`) with instant 48ms RAM hydration (~81 KB).

* **Column 2 — Practice Suites & Playbooks:**
  - **Insolvency & Restructuring Suite** (`vaults_suites.html#insolvency`): CIRP, Liquidation, Personal Guarantors.
  - **Commercial Recovery Suite** (`vaults_suites.html#commercial`): Pre-Institution Mediation (S. 12A), Order 38/39 relief.
  - **Arbitration & ADR Suite** (`vaults_suites.html#adr`): S. 9 Interim Relief, S. 34 Setting Aside petitions.

* **Column 3 — Drafting Precedents & Formats:**
  - **220+ Court Verified Formats** (`vaults_formats.html`): Primary skeletons, affidavits, statements of truth (S. 63 BSA / 65B EA).
  - **Judicial Precedents Library** (`vaults_precedence.html`): Supreme Court, NCLAT, High Court authoritative rulings.
  - **Commercial Contracts & Conveyancing** (`vaults_contracts.html`): Debt restructuring, slump sale, asset sale agreements.

---

### Pillar 3: `AGENTS` (Subtitle: `Enterprise Co-Counsel`)

* **Column 1 — Court & Forensic Archetypes (The Big 5):**
  - **Avoidance & Forensic Auditor** (`agents_insolvency.html`): §§ 43, 45, 50, 66 cash-flow reconciler & contra-sweep inquest.
  - **Commercial Injunction Drafter** (`agents_legal.html`): Order 39 Rules 1 & 2 interim stay motions with 3-prong test.
  - **Creditor Claim Auditor** (`agents_claims.html`): Form B, C, CA verification, penal compounding stripping.
  - **Section 29A Eligibility Screener** (`marketplace_reporting_resolution_compliance.html`): 10-gate statutory disqualification audit.
  - **NCLAT Appeal Drafter** (`agents_governance.html`): Form NCLAT-1 memo, limitation calculations & delay condonations.

* **Column 2 — In-Chamber Specialist Team:**
  - **Advisor Agent** (`agents_process_agents.html`): Strategic advisory and AskHaya ambient orchestrator.
  - **Forms Agent** (`agents_financial.html`): Statutory compliance auditing and error checks.
  - **Document Agent** (`agents_reporting_agents.html`): Court-ready petition synthesis and DOCX/PDF export.

* **Column 3 — Forensic Dossiers & Reports:**
  - **Section 65 Collusion Inquest** (`marketplace_reporting_assignment_forensics.html`): Malicious petition detection.
  - **Section 36 Liquidation Estate Shield** (`marketplace_reporting_liability_shields.html`): Third-party asset exclusion.
  - **Avoidance Audit Worksheets** (`resolution_plan_verification_telephone_cables.html`): Bank ledger forensics.

---

### Pillar 4: `COMMUNITY` (Subtitle: `Hayagriva Resources`)

* **Column 1 — Accredited Directories:**
  - **Insolvency Professionals Directory** (`directories_ip.html`): Accredited IPs across all 15 NCLT benches with Leaflet geo-mapping.
  - **Registered Valuers Directory** (`directories_rv.html`): Land & Building, Plant & Machinery, Securities & Financial Assets.
  - **Corporate Lawyers Directory** (`directories_cl.html`): Senior advocates and commercial bar litigators.
  - **Master Directory Index** (`directory_listing.html`): Unified search and filtering.

* **Column 2 — Distressed Asset Exchange:**
  - **ResolutionBazaar** (`resolutionbazaar.html`): Resolution applicant matching, EoI distribution, distressed asset catalog.
  - **PiPIE Data Rooms** (`pipie_assets.html`): Virtual Data Room (VDR) integration with PII redaction and DPDP Act compliance.

* **Column 3 — Knowledge Base & Training:**
  - **Section 29A Benchmark Dossier** (`docs/FINAL_29A_COMPLIANCE_REPORT_APOGEE_ENTERPRISES.html`): Case study and model compliance report.
  - **Statutory Sample Reports** (`docs/`): Comprehensive CIRP dossiers.
  - **Enterprise Training & Certification**: Practitioner workshops and chamber on-boarding.

---

## 4. Header Actions & Modal Interactivity

1. **`Chamber Login`**:
   - Triggers `openAccountModal();` (or navigates to `#login` on `index.html`), opening the existing in-site account login dialog.
2. **`Download Hayagriva`**:
   - Styled as the primary CTA with gold amber accent (`#f59e0b`).
   - Triggers `openIdeDownloadModal();` to launch the multi-platform installer popup (Mac Apple Silicon, Mac Intel, Windows, Linux).

---

## 5. Verification Plan

1. **HTML Validation:** Ensure `header.html` syntax is well-formed with matching tags and clean ARIA attributes (`aria-haspopup`, `aria-expanded`).
2. **Link Integrity:** Verify every `href` references a valid relative HTML file in `apnet_website`.
3. **Modal Hooks:** Confirm clicking `Chamber Login` and `Download Hayagriva` correctly invokes their respective JavaScript handlers without console errors.
4. **Visual Testing:** Launch the static site server (`python3 serve.py` or similar) and capture browser CDP screenshots verifying:
   - Header top bar appearance
   - Hover state and dropdown rendering for all 4 mega-menus
   - Modal trigger functionality
