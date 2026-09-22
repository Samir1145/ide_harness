# Walkthrough: Unified Practice Governance, Identity Onboarding & Case Wizard

Comprehensive guide and verification results for the **Practice Governance Cockpit**, **Practitioner Onboarding Ceremony (Google Workspace Email OTP & Hardware Lock)**, **3-Tier Identity Triad**, and **New Case Creation Wizard**.

---

## 1. Summary of Delivered Features

### A. Practice Governance & Cockpit Menu Unification
* Shifted HIL and Local Telemetry from the left sidebar into the top menu: `Hayagriva > 🏛️ Practice Governance & Cockpit`.
* Left Activity Bar completely freed for case document trees, pleadings, and CIRP folders.
* 5-Pill Cockpit Dashboard in the main editor area with deep-linking (`?tab=...`) and live counters:
  1. `🛡️ HIL Approvals` (`Cmd+Shift+H`)
  2. `💳 CIRP Diligence Ledger` (`Cmd+Shift+B`)
  3. `📈 Local Telemetry`
  4. `⚙️ AI Engines & Routing` (`Cmd+,`)
  5. `🔑 Identity & Licensing`

### B. First-Run Practitioner Onboarding Ceremony (`#onboardingModal`)
* Triggers automatically on first boot if identity is unverified, or via `Hayagriva > 🏛️ Practice Governance & Cockpit > 👤 Verify Practitioner Identity & Stamp…`.
* Locks to physical hardware fingerprint (`MAC-3F9BCD5E811C5B7B`).
* Validates Bar Enrolment (`P/2418/2006`), IBBI Registration (`IBBI/IPA-001/IP-P01234/2018-2019/11987`), and AFA validity.
* Google Workspace SMTP Email OTP verification:
  * Dispatches 6-digit cryptographic verification code to Master Email.
  * In Dev Sandbox mode: logs code to terminal console for seamless offline testing.
  * Stamps profile with HMAC SHA-256 signature combining `user_id + email + fullName + machine_id`.
* Live Dynamic Stamp Preview: Real-time letterhead & digital closing stamp preview embedded into legal pleadings.

### C. New Case Creation Wizard (`#newCaseModal`)
* Triggered via header button `➕ New Matter / CIRP Estate` or menu shortcut `Cmd+Shift+N`.
* Matter classifications: CIRP, Liquidation, PPIRP (MSME), Personal Guarantor (PGCD), and Commercial Litigation.
* Captures dedicated **Estate Process Email** (mandated under IBBI Reg 6(2) for creditor claims and estate handover).
* MCA CIN/LLPIN validation regex with real-time format indicator.
* NCLT Bench selection and Company Petition (CP) number.
* Auto-derives canonical statutory ID (e.g. `CIRP_U45201HR2015PLC054321_dHry2024`).
* 1-Click Bootstrap: Creates 12 statutory IBC folders in `~/Desktop/HAYA_MATTERS/<Matter>`, generates `conversions/case_manifest.json`, initializes `ledgers/case_billing.db`, and switches active workspace.

---

## 2. Verification Log

1. **Practitioner Profile API**:
   * `GET /api/hayagriva/practitioner/profile`: Returns verified identity, hardware UUID, and attestation stamp.
   * `POST /api/hayagriva/practitioner/send-otp`: Dispatched code `702631`.
   * `POST /api/hayagriva/practitioner/verify-otp`: Validated code and cryptographically locked profile.
2. **Case Creation API**:
   * `POST /api/hayagriva/cases/create`: Bootstrapped matter `Gurugram Infratech Limited` with CIN `U45201HR2015PLC054321`, 12 statutory folders, and `case_manifest.json`.
3. **Frontend Builds**:
   * `yarn build` in `theia-extensions/hayagriva`: 0 errors (5.31s).
   * `yarn build` in `applications/electron`: 0 errors (23.14s).
