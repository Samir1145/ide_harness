# CONSOLIDATED MULTI-BANK FORENSIC CASH FLOW & COUNTERPARTY DOSSIER
**Matter:** New Pearl Vitrified Private Limited | **CIN:** `U26914GJ2017PTC098234`
**Bench / Forum:** CP(IB) No. 412/AHM/2023 | **Dossier Generated:** 13 Sept 2026
**Audit Engine:** HAYAGRIVA Forensic Banking Sub-Agent (`@bank_analyzer`)

---

## 1. Executive Summary & Statutory Cash Movement Scorecard

This forensic dossier synthesizes **23 day-to-day banking transactions** across **5 bank account(s)** and reconciles them against corporate regulatory filings (MCA AOC-4 XBRL) to establish genuine commercial turnover vs internal liquidity sweeps and uncover statutory avoidance triggers (§§ 43, 45, 66 of IBC, 2016).

| Key Audit Dimension | Metric Value | Forensic Note |
| :--- | :---: | :--- |
| **Total Bank Accounts Ingested** | **5 Accounts** | Ingested from 5 source ledger file(s) |
| **Gross Banking Outflows (Debits)** | **₹ 1.96 Cr** | Aggregate debit movements across all accounts |
| **Gross Banking Inflows (Credits)** | **₹ 81.73 L** | Aggregate credit movements across all accounts |
| **Inter-Account Contra Sweeps** | **₹ 30.00 L** | **Neutralized:** 2 internal transfer entries |
| **Net External Outflows (True Expenses)** | **₹ 1.66 Cr** | Payouts to external third parties / lenders / KMPs |
| **Net External Inflows (True Realizations)**| **₹ 51.73 L**| Actual operational collections & external advances |
| **High-Velocity Cash Drain** | **₹ 20.00 L** | 2 cash / bearer instrument withdrawals |
| **Forensic Red-Flag Findings** | **6 Anomalies Flagged** | Triggers under IBC §§ 43, 45, 66 and PMLA |

### 1.1 Mathematical Balance Proof & Statement Integrity
$$\text{Opening Balance} + \sum \text{Credits} - \sum \text{Debits} = \text{Closing Balance}$$

| Audit Step | Amount | Verification Ratio |
| :--- | :---: | :--- |
| **First Recorded Opening Balance** | ₹ 1.62 Cr | Earliest ledger balance across accounts |
| **(+) Total Inflows (Gross Credits)** | ₹ 81.73 L | Total funds deposited across accounts |
| **(-) Total Outflows (Gross Debits)** | ₹ 1.96 Cr | Total funds withdrawn across accounts |
| **(=) Calculated Theoretical Closing**| ₹ 47.83 L | Math identity benchmark |
| **Actual Closing Balance in Statements**| ₹ 47.83 L | Final ledger balance across accounts |
| **Reconciliation Audit Verdict** | — | 🟢 **100% Mathematically Balanced** (Variance < ₹100) |


### 1.2 Document Authenticity & Anti-Tampering Forensics (Sebastien Rousseau Architecture)

The forensic engine audited raw byte streams, software provenance, metadata timestamps, and revision trees for all submitted statement files:

| S.No | Statement Document | Software / Producer | Revisions (`%%EOF`) | Fonts | Risk Score | Forensic Verdict |
| :---: | :--- | :--- | :---: | :---: | :---: | :--- |
| 1 | `sbi_genuine_statement.pdf` | `Oracle BI Publisher 12c` | 1 | 1 | `0` | 🟢 **GENUINE** |
| 2 | `sbi_tampered_statement.pdf` | `Canva Online PDF Editor` | 3 | 1 | `1` | 🔴 **HIGH RISK (TAMPERED)** |

> [!CAUTION]
> **Forensic Document Tampering Warning**: One or more bank statements exhibit clear markers of post-issuance modification (consumer graphic editor signatures or revision trailer overlays). Under Section 66 of the IBC, 2016, submitting falsified banking records to the Resolution Professional constitutes fraudulent conduct and concealment.

---

## 2. Ingested Bank Account Footprint & Contra Sweep Reconciliation

| S.No | Bank Name | Account No | Source File | Total Transactions | Status |
| :---: | :--- | :--- | :--- | :---: | :---: |
| 1 | **Bank of Baroda** | `01920200001029` | `bob_ca_1029.csv` | 4 | 🟢 Reconciled |
| 2 | **HDFC Bank** | `50200091028371` | `hdfc_od_9102.csv` | 6 | 🟢 Reconciled |
| 3 | **State Bank of India** | `39120481999` | `sbi_ca_split_year_999.csv` | 4 | 🟢 Reconciled |
| 4 | **State Bank of India** | `39120481920` | `sbi_current_4819.xlsx` | 7 | 🟢 Reconciled |
| 5 | **Unknown Bank** | `SCBL0099881122` | `scb_mt940_statement.sta` | 2 | 🟢 Reconciled |

> [!NOTE]
> **Contra Neutralization Doctrine**: Inter-account contra entries and internal liquidity sweeps have been mathematically netted out. Adding gross credits without contra neutralization inflates company turnover by **₹ 60.00 L** (double-counting).

---

## 3. Categorical Spending & Commercial Distribution Breakdown

Classification of all net external debit disbursements mapped against IBC statutory waterfall priorities and avoidance thresholds:

| S.No | Expense & Outflow Category | Total Amount | Volume | % of Net Outflow | Statutory Classification |
| :---: | :--- | :---: | :---: | :---: | :--- |
| 1 | **Statutory & Tax Remittances** | ₹ 25,000 | 1 txns | 0.2% | `§53(1)(e)` |
| 2 | **Industrial Utilities & Power/Gas** | ₹ 6.50 L | 1 txns | 3.9% | `Essential Operational Costs` |
| 3 | **Speculative Outflows & Capital Markets** | ₹ 27.01 L | 3 txns | 16.3% | `§66 (Diversion of Loan Funds)` |
| 4 | **Promoter Perks & Luxury Expenses** | ₹ 4.50 L | 1 txns | 2.7% | `§45 (Undervalued) / §66` |
| 5 | **Physical Cash & Bearer Withdrawals** | ₹ 8.00 L | 1 txns | 4.8% | `§66 / PMLA Inquest` |
| 6 | **Dishonored Instruments & Penalties** | ₹ 1,250 | 2 txns | 0.0% | `§43(4) (Twilight Insolvency Anchor) & NI Act §138` |
| 7 | **AS-18 Related Entities & KMPs** | ₹ 55.00 L | 1 txns | 33.2% | `§43 (Preference) / §45 (Undervalued)` |
| 8 | **Trade Operational Suppliers & Vendors** | ₹ 64.63 L | 7 txns | 39.0% | `General Operational Dues` |

---

## 4. Counterparty Profiling: Top External Inflows & Outflows

### 4.1 Top Inflows (Major Credit Sources)
| S.No | Master Counterparty / Remitter | Total Inflow | Txn Count | Status / Relationship |
| :---: | :--- | :---: | :---: | :--- |
| 1 | **RTGS HDFC001 PEARL CERAMIC TILES PVT LTD** | ₹ 48.00 L | 1 | 🔴 **AS-18 Related Entity** |
| 2 | **EREF SCBLUTR9922 ORDP OVERSEAS BUYER CORP REMI ADVANCE PAYMENT TRF 001** | ₹ 3.00 L | 1 | External Trade / Lender |
| 3 | **INFLOW CUSTOMER** | ₹ 50,000 | 1 | External Trade / Lender |
| 4 | **CUSTOMER ADVANCE** | ₹ 23,000 | 1 | External Trade / Lender |
| 5 | **CHALLAN GST PAYMENT** | ₹ 0.00 | 0 | External Trade / Lender |
| 6 | **RTGS PUNB012 SHREE GANESH RAW MAT** | ₹ 0.00 | 0 | External Trade / Lender |
| 7 | **IDENTICAL VENDOR PAYMENT** | ₹ 0.00 | 0 | External Trade / Lender |
| 8 | **EREF SCBLUTR9911 BENM GLOBAL LOGISTICS SERVICES REMI EXPORT FREIGHT CHARGES TRF 001** | ₹ 0.00 | 0 | External Trade / Lender |
| 9 | **NEFT INDB001 CERAMIC CLAY SUPPLIERS** | ₹ 0.00 | 0 | External Trade / Lender |
| 10 | **TAJ HOTEL MUMBAI V** | ₹ 0.00 | 0 | External Trade / Lender |

### 4.2 Top Outflows (Major Debit Beneficiaries)
| S.No | Master Counterparty / Transferee | Total Outflow | Txn Count | Status / Relationship |
| :---: | :--- | :---: | :---: | :--- |
| 1 | **NEFT HDFC001 PEARL CERAMIC TILES PVT LTD** | ₹ 55.00 L | 1 | 🔴 **AS-18 Related Entity** |
| 2 | **RTGS PUNB012 SHREE GANESH RAW MAT** | ₹ 45.00 L | 1 | External Vendor / Service |
| 3 | **NEFT INDB001 CERAMIC CLAY SUPPLIERS** | ₹ 18.00 L | 1 | External Vendor / Service |
| 4 | **NEFT HDFC001 ZERODHA BROKING LTD** | ₹ 15.00 L | 1 | External Vendor / Service |
| 5 | **SELF CASH WITHDRAWAL FOR EXPENSES** | ₹ 12.00 L | 1 | External Vendor / Service |
| 6 | **TO CASH WITHDRAWAL SELF** | ₹ 8.00 L | 1 | External Vendor / Service |
| 7 | **GUJARAT GAS LTD** | ₹ 6.50 L | 1 | External Vendor / Service |
| 8 | **TAJ HOTEL MUMBAI V** | ₹ 4.50 L | 1 | External Vendor / Service |
| 9 | **EREF SCBLUTR9911 BENM GLOBAL LOGISTICS SERVICES REMI EXPORT FREIGHT CHARGES TRF 001** | ₹ 1.20 L | 1 | External Vendor / Service |
| 10 | **CHALLAN GST PAYMENT** | ₹ 25,000 | 1 | External Vendor / Service |

---

## 5. Forensic Red-Flag Findings & Statutory Avoidance Inquest


### 5.1 [CRITICAL] High Outflow to Related Entity: [Pearl Ceramic Tiles Private Limited]
* **Statutory Ground:** `§43 (Preference) / §45 (Undervalued) / §66 (Fraud)`
* **Target Entity / Instrument:** `Pearl Ceramic Tiles Private Limited`
* **Total Exposure Volume:** **₹ 55.00 L**
* **Forensic Evidence Ratio:** Company transferred ₹55.00L to verified AS-18 related entity (Associate Company / Common Director Holding) across 1 debit transactions without verified operational consideration.


### 5.2 [CRITICAL] Unsanctioned Capital Market & Speculative Outflows
* **Statutory Ground:** `§66 (Fraudulent Trading / Diversion of Loan Funds)`
* **Target Entity / Instrument:** `Capital Market / Speculative Brokers`
* **Total Exposure Volume:** **₹ 27.01 L**
* **Forensic Evidence Ratio:** Identified ₹27.01 Lakhs routed to brokers, mutual funds, crypto, or bullion jewellers from company accounts, constituting prima facie diversion of corporate debtor liquidity.


### 5.3 [HIGH] Promoter Luxury & Personal Expense Discharges
* **Statutory Ground:** `§45 (Undervalued Transactions) / §66`
* **Target Entity / Instrument:** `Hospitality / Luxury Merchants`
* **Total Exposure Volume:** **₹ 4.50 L**
* **Forensic Evidence Ratio:** Company funds totaling ₹4.50 Lakhs discharged towards luxury hotels, airlines, golf clubs, or promoter life insurance policies not justified by business operations.


### 5.4 [HIGH] Extensive Cash Withdrawals (Self/ATM/Bearer)
* **Statutory Ground:** `§66 (Fraudulent Trading) / PMLA Inquest`
* **Target Entity / Instrument:** `Self / Bearer Instruments`
* **Total Exposure Volume:** **₹ 20.00 L**
* **Forensic Evidence Ratio:** Total cash withdrawals of ₹20.00 Lakhs across 2 transactions. Physical cash drainage prior to default is a primary indicator of asset diversion.


### 5.5 [HIGH] Banking Liquidity Distress: 2 Dishonored Instrument(s) / Return Penalties
* **Statutory Ground:** `§43(4) (Twilight Insolvency Default Anchor) & NI Act §138`
* **Target Entity / Instrument:** `Banking Clearing Systems`
* **Total Exposure Volume:** **₹ 1,250**
* **Forensic Evidence Ratio:** Earliest recorded cheque bounce or NACH/ECS return occurred on 2023-11-20. Cumulative return penalties and bounced instruments total ₹0.01 Lakhs across 2 instances. This prima facie establishes commercial insolvency and default prior to formal CIRP admission, legally anchoring the lookback period for Section 43 Preferential avoidance petitions.


### 5.6 [CRITICAL] PDF Statement Manipulation Risk: sbi_tampered_statement.pdf (HIGH_RISK_TAMPERED)
* **Statutory Ground:** `§66 (Fraudulent Statements / Concealment) & IPC §463/§465 (Document Forgery)`
* **Target Entity / Instrument:** `Canva Online PDF Editor`
* **Total Exposure Volume:** **₹ 0.00**
* **Forensic Evidence Ratio:** Automated byte-level forensics on 'sbi_tampered_statement.pdf' identified document alteration risk (Risk Score: 1). Indicators: Statement was produced or modified using consumer graphic editing software 'photoshop'.; PDF contains 3 incremental revision trailers (%%EOF markers), indicating post-generation alteration.; PDF modification timestamp differs from original creation timestamp.



### 5.2 Chronology of Commercial Insolvency & Dishonored Instruments (Akshat / IBC §43 Inquest)

The forensic engine audited dishonored cheques, ECS bounces, NACH returns, and penal bank charges to anchor the temporal threshold of commercial default:

| S.No | Date | Bank | Account No | Amount / Fee | Narration / Dishonor Reason | Chq / Ref No |
| :---: | :--- | :--- | :--- | :---: | :--- | :--- |
| 1 | 2023-11-20 | HDFC Bank | `50200091028371` | ₹ 500 | `NACH RET INSUFFICIENT FUNDS LOAN EMI` | UTR991122 |
| 2 | 2023-11-22 | HDFC Bank | `50200091028371` | ₹ 750 | `CHQ RTN CHARGES UNPAID CHQ 1029` | CHQ1029 |

> [!WARNING]
> **Statutory Twilight Inquest Finding**: The earliest dishonored banking transaction was recorded on **2023-11-20**. Under Section 43(4) of the IBC, 2016, this objectively substantiates the onset of commercial insolvency, providing critical evidentiary backing for the Resolution Professional to challenge subsequent preferential payments made during the statutory lookback window.


---

## 6. MCA AOC-4 XBRL Regulatory Cross-Check

* **Extracted Related Entities (AS-18):** `Pearl Ceramic Tiles Private Limited` (Associate Company / Common Director Holding), `Pravinbhai Patel` (Associate Company / Common Director Holding)
* **Declared Bank Borrowings in Financials:** `State Bank of India`, `HDFC Bank`, `Bank of Baroda`
* **Auditor CARO Notes:** CARO Clause 3(ix) — Loan Defaults: Yes, default of Rs. 42.15 Crores to Consortium; CARO Clause 3(xi) — Fraud Inquest: Nil

---

## 7. Standard Forensic Disclaimer & Signing Block

1. **Evidentiary Basis**: This report is generated strictly from electronic bank statement ledgers and regulatory filings furnished in the case repository.
2. **Document Totality**: Intended for submission by the Resolution Professional / Forensic Auditor to the Committee of Creditors (CoC) and the Adjudicating Authority (NCLT) under Sections 43, 45, and 66 of IBC, 2016.
3. **Temporal Boundary**: All figures reflect transactions recorded up to the cut-off date.

**Executed By:**
**HAYAGRIVA Autonomous Multi-Bank Forensic Agent (`@bank_analyzer`)**
*M/s RESOLUTION BAZAAR — Forensic Restructuring & Insolvency Practice*
