# THE INSOLVENCY PROFESSIONAL’S OPERATIONAL CODEX
## Chapter 3: Information Memorandum, Valuations & Avoidance Inquest ($T_{30} \to T_{75}$)
### Under the Insolvency and Bankruptcy Code, 2016 & IBBI Regulations

---

## 1. Statutory Mandate & Framework
Between Day 30 and Day 75, the Resolution Professional must undertake two core pillars of estate diligence:
1. **Information Memorandum (IM) & Asset Valuation:** Establishing the baseline economic worth of the Corporate Debtor to guide prospective resolution applicants.
2. **Avoidance & Forensic Inquest (PUFE):** Identifying fraudulent, preferential, or undervalued asset siphoning executed by erstwhile management prior to CIRP.

Statutory provisions:
* **Section 29 read with Regulation 36:** Submission of Information Memorandum in electronic form to members of the CoC on or before **$T_{95}$** (or within 2 weeks of inviting EOI).
* **Regulation 27:** Appointment of two Registered Valuers for each class of assets (Land & Building, Plant & Machinery, Securities/Financial Assets).
* **Regulation 35:** Fair Value and Liquidation Value determination.
* **Sections 43, 45, 50, and 66 (PUFE Transactions):**
  * **Section 43:** Preferential Transactions.
  * **Section 45:** Undervalued Transactions.
  * **Section 50:** Extortionate Credit Transactions.
  * **Section 66:** Fraudulent Trading and Wrongful Trading.
* **Regulation 35A:** Mandatory statutory timelines for avoidance actions:
  * **$T_{75}$:** Form an opinion whether the CD has been subjected to any transaction under §§ 43, 45, 50, or 66.
  * **$T_{115}$:** Make a determination that the CD was subjected to such transactions.
  * **$T_{130}$ / $T_{135}$:** File an application before the NCLT seeking clawback orders against promoters/beneficiaries.

---

## 2. Information Memorandum (IM) Architecture (Regulation 36)

The Information Memorandum is a strictly confidential statutory dossier shared with CoC members and Prospective Resolution Applicants (PRAs) who sign a **Confidentiality Undertaking (Regulation 36(4))**.

```
                           ┌───────────────────────────────┐
                           │    INFORMATION MEMORANDUM     │
                           │        (Regulation 36)        │
                           └───────────────┬───────────────┘
                                           │
     ┌──────────────────┬──────────────────┼──────────────────┬──────────────────┐
     ▼                  ▼                  ▼                  ▼                  ▼
[Corporate &       [Asset &            [Financial &       [Litigation &      [Material
Capital History]    Plant Census]       Debt Records]      Tax Liabilities]   Contracts]
Audited Books,      Fixed Assets,       Secured Creditors, Ongoing Court      Vendor Agreements,
MoA/AoA, Master     Intangibles,        Claims Ledger,     Cases, Tax Suits,  Licenses, Leases,
Data & Charges      Title Deeds         Contingent Liab.   Arbitrations       Key Personnel
```

### Statutory Elements Required by Regulation 36(2)
1. **Financial Statements:** Audited financial statements for the last 2 financial years and provisional financials up to the Insolvency Commencement Date ($T_0$).
2. **List of Creditors:** Comprehensive claims schedule with admitted amounts, security interests, and voting shares.
3. **Asset Inventory:** Complete schedule of tangible and intangible assets (land parcels, plant and machinery, patents, trademarks, inventory, and book debts) with physical location.
4. **Litigation Schedule:** Details of all pending material litigation, arbitration, environmental liabilities, and statutory tax disputes.
5. **Members & Guarantees:** Names of shareholders holding > 1% equity, list of personal/corporate guarantees issued by promoters for CD facilities.

---

## 3. Valuations: Fair Value vs. Liquidation Value (Regulation 35)

### Appointment Requirements
* The RP must appoint **two independent Registered Valuers** registered with IBBI for each class of assets within **47 days ($T_{47}$)** of appointment.
* The valuers must conduct independent physical site inspections and inspect original title deeds.

### The Two Statutory Values
* **Fair Value (FV):** The estimated realizable value of the assets of the Corporate Debtor if exchanged between a willing buyer and willing seller in an arm’s length transaction.
* **Liquidation Value (LV):** The estimated realizable value of the assets of the Corporate Debtor if liquidated under Chapter III of the Code on $T_0$.

> [!IMPORTANT]
> **The Confidentiality Protocol:**  
> Under Regulation 35(2), the Fair Value and Liquidation Value can **NEVER be disclosed in the Information Memorandum or to bidders**. They can only be shared with CoC members *after* all resolution plans have been submitted and unsealed. Sharing liquidation value with prospective resolution applicants is grounds for immediate criminal prosecution and disqualification.

---

## 4. The Avoidance Inquest: Forensic Investigation of PUFE Transactions

Under Regulation 35A, the RP must scrutinize books of accounts and bank statements for the relevant statutory look-back periods:

```
[Insolvency Commencement Date: $T_0$]
                │
                ├─────────────────────────────────────────┐
                ▼                                         ▼
      [Regular Look-back: 1 Year]               [Related Party Look-back: 2 Years]
      Transactions between $T_0$ & $T_{-365}$   Transactions between $T_0$ & $T_{-730}$
      Unrelated Creditors / Third Parties       Promoters, Directors, Sister Concerns
```

### 1. Section 43: Preferential Transactions
* **Criteria:** Transfer of property/interest to an existing creditor, putting that creditor in a better position than they would have been under the Section 53 liquidation waterfall.
* **Look-back Period:** **1 year** for regular creditors; **2 years** for related parties.
* **Exceptions:** Transfers in the ordinary course of business, or new value transactions.
* **Supreme Court Benchmark (*Anuj Jain v. Axis Bank*):** Encumbering CD's unencumbered land to secure loans of parent entity Jaypee Infratech without direct benefit was held to be a preferential transaction under § 43.

### 2. Section 45: Undervalued Transactions
* **Criteria:** Gift or transfer of assets for consideration significantly less than the market value of the assets.
* **Look-back Period:** **1 year** for regular parties; **2 years** for related parties.

### 3. Section 50: Extortionate Credit Transactions
* **Criteria:** Credit facilities received on terms requiring exorbitant payments or grossly unconscionable interest rates.
* **Look-back Period:** **2 years** preceding $T_0$.

### 4. Section 66: Fraudulent Trading / Wrongful Trading
* **Criteria:** Any business carried on with intent to defraud creditors or for any fraudulent purpose.
* **Look-back Period:** **NO STATUTORY TIME LIMIT**. Covers transactions extending back 3, 5, or 7 years.
* **Remedy:** Personal contribution order against directors to make good all siphoned amounts.

---

## 5. Local Autonomous Agent Automation (Hayagriva Core)

| Agent | Module | Automated Deliverable |
| :--- | :--- | :--- |
| **`@im`** | `subagents/im.js` | Assembles the standardized **Information Memorandum** compiling assets, financials, claims, and litigations into a structured document. |
| **`@forensic`** | `skills/bank-forensic-audit/` | Analyzes multi-bank statement Excel files, detects circular round-tripping, contra-sweeps, and cash withdrawals. |
| **`@avoidance`** | `subagents/avoidance.js` | Cross-references look-back dates ($T_{-365}$ and $T_{-730}$), flags potential PUFE transactions, and builds the **Avoidance Ledger (`avoidance_ledger.md`)**. |
| **`@document`** | `agents/document-agent` | Drafts the **Section 43/45/66 Applications** with forensic annexures ready for filing before the NCLT Bench. |

---

## 6. Global Compliance Requisitions via `@compliance` (ResolutionBazaar Gatekeeper)

```
[Avoidance Review Underway]
            │
            ▼
    [@compliance Agent]
            │
            ├──► 1. RBZ-FORENSIC-PUFE-11 (Contra-Party Banking Inquest)
            │    - Multi-bank contra-party verification
            │    - Detection of common directors in recipient vendors
            │    - Deliverable: Forensic PUFE Litigation Dossier
            │
            └──► 2. RBZ-ASSET-REGISTRY-12 (National Property Cross-Check)
                 - CERSAI asset-search & State Land Revenue registry sweep
                 - Unearthing unrecorded real estate parcels
                 - Deliverable: Asset Tracing & Encumbrance Report
```

---

## 7. Regulatory Penalties & Common Pitfalls

> [!CAUTION]
> **IBBI Warning Trap 1: Missing the $T_{135}$ PUFE Application Deadline**  
> Under IBBI Circulars and Regulation 35A, if an RP suspects avoidance transactions but fails to file an application before the NCLT prior to the approval of the resolution plan by the CoC, the RP can be held personally liable for dereliction of statutory duty.

> [!WARNING]
> **IBBI Warning Trap 2: Leaking Liquidation Value to Bidders**  
> Under Regulation 35(2), sharing the Liquidation Value or Fair Value with any potential resolution applicant prior to submission of plans constitutes criminal breach of trust and results in immediate disqualification of the plan process.

---
*(Proceed to Chapter 4 for Form G, EOI & Section 29A Eligibility Inquest)*
