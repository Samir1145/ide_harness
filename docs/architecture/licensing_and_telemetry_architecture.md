# Hayagriva Licensing, Telemetry & Zero-Cost CRM Architecture

## 1. Zero-Web-Portal Philosophy

Traditional SaaS legal products force advocates to:
1. Visit a marketing website
2. Fill out lead generation forms and wait for sales calls
3. Create account credentials and passwords
4. Manage software updates through browser downloads

**Hayagriva completely eliminates the web portal.**
- The desktop IDE is downloaded directly as a standalone executable / ZIP.
- All onboarding, device authentication, licensing, and renewals execute **100% inside the IDE shell**.
- Razorpay UPI / QR checkout is embedded directly into the Command Center (`settings-dashboard.html`).

---

## 2. ₹1 Token Identity Verification & 6-Month Renewal

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. FRESH INSTALL (UNVERIFIED CORE LITE)                                │
│ • Advocate downloads Hayagriva directly.                               │
│ • Statutory bare acts and basic drafting are immediately available.    │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼ Onboarding Prompt
┌────────────────────────────────────────────────────────────────────────┐
│ 2. NOMINAL ₹1 UPI VERIFICATION (IN-IDE RAZORPAY MODAL)                 │
│ • Captures verified Indian identity: Real Name, Phone, Email, UPI VPA. │
│ • Automatically detects hardware serial: machineId.                    │
│ • Advocate scans QR code on phone (PhonePe, GPay, Paytm) and pays ₹1.  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼ POST /api/hayagriva/payments/verify
┌────────────────────────────────────────────────────────────────────────┐
│ 3. CRYPTOGRAPHIC DEVICE LOCK (180 DAYS)                                │
│ • Generates Ed25519/HMAC signed license envelope locked to machineId.  │
│ • Writes to SQLite vault (license_vault.db) and hayagriva_settings.    │
│ • Live record appears in Razorpay CRM with 15 telemetry fields.        │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼ Every 180 Days (6 Months)
┌────────────────────────────────────────────────────────────────────────┐
│ 4. NON-DESTRUCTIVE ₹1 RENEWAL CADENCE                                  │
│ • In-IDE notification: "Renew Free Core License for ₹1".              │
│ • Never locks lawyers out of personal case documents or bare acts.     │
│ • Reverts AI engine until renewed.                                     │
│ • Provides true active user (MAU) and cohort retention telemetry.      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Anti-Piracy Hardware Fingerprinting (`machine-fingerprint.js`)

To prevent unauthorized sharing and copying of paid license configurations across law firm offices without per-seat licensing, Hayagriva binds licenses to physical machine hardware:

* **macOS:** Queries `ioreg -rd1 -c IOPlatformExpertDevice` to extract immutable `IOPlatformUUID`.
* **Windows:** Queries `Win32_ComputerSystemProduct` via CIM / PowerShell or `wmic csproduct get uuid` to extract the hardware `MachineGuid`.
* **Cryptographic Lock:** The license payload encapsulates `deviceId`. If a user copies `hayagriva_settings.json` or `license_vault.db` to a different computer, `verifyMachineLock()` evaluates to `false`, immediately reverting the software to offline unverified status.

---

## 4. Decoupled Micro-Pricing Engine (`pricing-plans.js`)

To ensure the payment engine is not hardcoded to fixed sums, pricing definitions are decoupled into a dynamic schema:

```javascript
const PRICING_PLANS = {
  free_core_6m: {
    id: 'free_core_6m',
    name: 'Free Core Lite (6-Month Verification)',
    amountPaise: 100, // ₹1.00
    validityDays: 180,
    tier: 'lite'
  },
  pro_pilot: {
    id: 'pro_pilot',
    name: 'Professional Pilot (1-Year License)',
    amountPaise: 499900, // ₹4,999.00
    validityDays: 365,
    tier: 'standard'
  },
  enterprise_pilot: {
    id: 'enterprise_pilot',
    name: 'Enterprise Pilot (1-Year License)',
    amountPaise: 1499900, // ₹14,999.00
    validityDays: 365,
    tier: 'enterprise'
  }
};
```

Future micro-pricing tiers (e.g. ₹99 per CIRP Forensic Audit, ₹10 per Precedent Dossier, or monthly micro-subscriptions) can be added to the schema without modifying any backend checkout or verification logic.

---

## 5. 15-Field Telemetry Blueprint in Razorpay `notes`

Razorpay allows up to 15 key-value pairs in the `notes` dictionary of every Order and Payment. All 15 slots are utilized for deep user profiling:

| # | Note Key | Telemetry Purpose | Example Value |
|---|---|---|---|
| **1** | `device_id` | Hardware anti-piracy serial | `MAC-3F9BCD5E811C5B7B` |
| **2** | `practitioner_role` | Professional classification | `Insolvency Professional`, `Advocate`, `CA` |
| **3** | `primary_nclt_bench` | Geographic legal jurisdiction | `Principal Bench (New Delhi)`, `Mumbai` |
| **4** | `firm_or_chamber` | B2B account identification | `Grover & Associates Chambers` |
| **5** | `city_state` | Regional market penetration | `New Delhi, DL` |
| **6** | `activation_type` | Acquisition vs Retention | `token_verification_1rs` / `6m_renewal_1rs` |
| **7** | `plan_id` | Monetization tier tracking | `free_core_6m`, `pro_pilot`, `enterprise` |
| **8** | `license_expires_at` | Cohort churn forecasting | `2027-03-17T16:51:29.450Z` |
| **9** | `os_platform` | Client OS distribution | `darwin_x64 (Darwin 24.6.0)` / `win32_x64` |
| **10**| `system_ram_gb` | Hardware readiness for local LLMs | `16`, `32`, `64` |
| **11**| `cpu_cores` | Local indexing compute capacity | `12` |
| **12**| `app_version` | Client release adoption | `v2.4.0` |
| **13**| `cases_active_count` | Product engagement depth | `10` |
| **14**| `preferred_llm_mode` | User compute preference | `lite_core` / `local_param_gpu` |
| **15**| `install_source` | Attribution channel | `direct_zip`, `bar_council_webinar` |

---

## 6. Zero-Cost Admin CRM Architecture (Appsmith + Google Sheets)

To monitor downloads, active installations, and advocate demographics, an external dashboard connects directly to Razorpay with zero database and zero cloud server hosting costs:

```
┌─────────────────────────────────────────────────────────────┐
│                 APPSMITH CLOUD (100% FREE)                  │
├──────────────────────────────┬──────────────────────────────┤
│ LEFT: Live Users Table       │ RIGHT: Call Logging CRM Form │
│ • Real-time GET /v1/payments │ • Populated on row click     │
│ • Shows 15 telemetry fields  │ • Notes, status, callback    │
└──────────────┬───────────────┴──────────────┬───────────────┘
               │                              │
               ▼ Basic Auth                   ▼ Writes to
┌──────────────────────────────┐ ┌────────────────────────────┐
│      RAZORPAY SERVERS        │ │     FREE GOOGLE SHEET      │
│ • Stores all transactions    │ │ • Hayagriva_CRM_Notes      │
│ • Strictly Read-Only (GET)   │ │ • No server or SQL costs   │
└──────────────────────────────┘ └────────────────────────────┘
```

### Security & Separation of Concerns:
1. **Read-Only Access:** The Appsmith query uses HTTP `GET /v1/payments`. It is technically impossible for the finance or sales person to trigger refunds, alter banking settlements, or touch Razorpay settings.
2. **Credential Isolation:** The finance team never receives the master Razorpay admin password or 2FA tokens.
3. **Audit Export:** 1-click CSV/Excel download from Appsmith allows instant data export for GST filings and accounting.
