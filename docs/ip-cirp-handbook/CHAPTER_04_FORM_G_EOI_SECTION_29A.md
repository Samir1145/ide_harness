# THE INSOLVENCY PROFESSIONAL’S OPERATIONAL CODEX
## Chapter 4: Form G, Expression of Interest & Section 29A Inquest ($T_{75} \to T_{115}$)
### Under the Insolvency and Bankruptcy Code, 2016 & IBBI Regulations

---

## 1. Statutory Mandate & Framework
By **$T_{75}$** (75th day from the Insolvency Commencement Date), the Resolution Professional must publish **Form G** to formally invite Expressions of Interest (EOI) from the global marketplace to rescue the Corporate Debtor.

Key statutory provisions:
* **Section 25(2)(h):** Duty of the RP to invite prospective resolution applicants who fulfill such criteria as may be laid down by him with the approval of the CoC.
* **Regulation 36A:** Detailed statutory procedure and calendar for invitation of Expression of Interest:
  * **$T_{75}$:** Publication of **Form G** (in one English and one regional newspaper, on CD website, and IBBI portal).
  * **$T_{90}$:** Minimum 15-day window for prospective bidders to submit EOIs.
  * **$T_{100}$:** Issue of **Provisional List** of Prospective Resolution Applicants (PRAs).
  * **$T_{105}$:** 5-day objection window for any creditor or applicant to contest the provisional list.
  * **$T_{115}$:** Issue of the **Final List** of Eligible Prospective Resolution Applicants.
* **Section 29A:** The statutory disqualification firewall prohibiting tainted promoters, wilful defaulters, and chronic defaulters from bidding.
* **Regulation 36A(8):** Mandatory Section 29A statutory affidavit and undertaking from every applicant.

---

## 2. Form G Architecture & Minimum Eligibility Criteria

### Form G Publication Requirements (Regulation 36A(1))
* Published in **one English and one regional language newspaper** with wide circulation at the Registered Office and principal operational sites.
* Uploaded to the **IBBI Website Portal** under NCLT/Form G records.
* Uploaded to the **Corporate Debtor’s corporate website**.

### Formulation of Minimum Eligibility Criteria by CoC
The CoC approves criteria tailored to the size and sector of the Corporate Debtor:
1. **For Strategic Corporate Bidders:** Minimum consolidated Tangible Net Worth (TNW) of e.g. ₹50 Crores to ₹200 Crores and minimum annual group turnover.
2. **For Financial Investors (PE Funds / AIFs / ARCs):** Minimum Assets Under Management (AUM) or committed investible funds of e.g. ₹250 Crores to ₹500 Crores.
3. **Refundable Process Participation Deposit (EMD):** Pre-bid earnest money deposit (₹5 Lakhs to ₹25 Lakhs) accompanying the EOI to deter non-serious, speculative bidders.

---

## 3. The Section 29A Inquest: The Absolute Disqualification Firewall

Section 29A was introduced by Parliament to ensure that unscrupulous promoters and persons who caused the bankruptcy cannot re-acquire the enterprise at a steep discount (the "haircut") through back-door entries.

```
                     ┌───────────────────────────────────────────┐
                     │    THE SECTION 29A DISQUALIFICATION GRID   │
                     └─────────────────────┬─────────────────────┘
                                           │
     ┌──────────────────┬──────────────────┼──────────────────┬──────────────────┐
     ▼                  ▼                  ▼                  ▼                  ▼
 [Sub-section (a)]  [Sub-section (b)]  [Sub-section (c)]  [Sub-section (d)]  [Sub-section (e)-(j)]
 Undischarged       RBI Wilful         NPA for > 1 Year   Convicted for      SEBI Debarment,
 Insolvent          Defaulter          (Without Clearing) Scheduled Offence  Connected Persons
```

### The Ten Statutory Disqualification Clauses:
* **§ 29A(a):** Person is an **undischarged insolvent**.
* **§ 29A(b):** Person is identified as a **wilful defaulter** under RBI guidelines.
* **§ 29A(c):** Person has an account classified as **Non-Performing Asset (NPA)** for at least **1 year** prior to $T_0$ under RBI guidelines, and has failed to pay all overdue amounts with interest before submitting the bid.
* **§ 29A(d):** Person has been **convicted for an offence** punishable with imprisonment for 2+ years (under scheduled acts) or 7+ years (under other acts).
* **§ 29A(e):** Person is **disqualified to act as a director** under Section 164 of the Companies Act, 2013.
* **§ 29A(f):** Person is **prohibited by SEBI** from trading in securities or accessing securities markets.
* **§ 29A(g):** Person has been a promoter or in management of a CD in which a **preferential, undervalued, or fraudulent transaction** order has been made by NCLT.
* **§ 29A(h):** Person has executed a **guarantee in favour of a creditor** in respect of a CD against which an application has been admitted, and such guarantee has been invoked and remains unpaid.
* **§ 29A(i):** Person is subject to any disability corresponding to clauses (a) to (h) in **any jurisdiction outside India**.
* **§ 29A(j): Connected Persons Test:** Any person who is a promoter, in management/control, or holding company, subsidiary company, or associate company of the person under clauses (a) to (i).

---

## 4. Landmark Supreme Court Jurisprudence on Section 29A

> [!IMPORTANT]
> **1. *ArcelorMittal India Pvt. Ltd. v. Satish Kumar Gupta (Supreme Court 2019)***  
> The Supreme Court established that Section 29A is a **purposive provision** requiring the RP and NCLT to **pierce the corporate veil**. The test is not formal shareholding, but **"effective control"** (direct or indirect). Bidders cannot escape 29A disqualification by parking shares in trust entities or offshore SPVs.

> [!IMPORTANT]
> **2. *Arun Kumar Jagatramka v. Jindal Steel and Power Ltd. (Supreme Court 2021)***  
> The Supreme Court held that the disqualification under Section 29A applies across the entire spectrum of the IBC, including schemes of arrangement under Section 230 of the Companies Act during liquidation. A disqualified promoter cannot return through any backdoor.

---

## 5. Local Autonomous Agent Automation (Hayagriva Core)

| Agent | Module | Automated Deliverable |
| :--- | :--- | :--- |
| **`@forms`** | `pipeline/forms/` | Generates standardized **Form G** conforming to IBBI Regulation 36A publication guidelines. |
| **`@plan_evaluator`** | `subagents/plan_evaluator.js` | Parses submitted EOIs, verifies net-worth certificates, and compiles the **Provisional List of PRAs**. |
| **`@advisor`** | `subagents/advisor.js` | Audits the Section 29A statutory affidavit submitted by each bidder against case facts. |
| **`@document`** | `agents/document-agent` | Generates the **Final List of PRAs** along with formal disqualification letters specifying reasons for any excluded bidders. |

---

## 6. Global Compliance Requisitions via `@compliance` (ResolutionBazaar Gatekeeper)

```
[PRAs Submit EOIs & 29A Affidavits]
                 │
                 ▼
         [@compliance Agent]
                 │
                 ├──► 1. RBZ-SEC29A-SCREEN-13 (Connected Persons Deep Screen)
                 │    - MCA-21 director cross-holding check
                 │    - Beneficial ownership & ultimate holding trace
                 │    - Deliverable: Section 29A Negative Clearance Certificate
                 │
                 ├──► 2. RBZ-WILFUL-DEFAULT-03 (RBI / CIBIL Defaulter Sweep)
                 │    - CRILC / CIBIL Suit-filed negative registry check
                 │    - RBI Wilful Defaulter list verification
                 │    - Deliverable: Wilful Defaulter Negative Dossier
                 │
                 └──► 3. RBZ-SEBI-BAN-14 (Securities Market Enforcement Audit)
                      - SEBI Debarred Entities & Directors List
                      - Stock Exchange surveillance database check
                      - Deliverable: Securities Market Eligibility Record
```

---

## 7. Regulatory Penalties & Common Pitfalls

> [!CAUTION]
> **IBBI Warning Trap 1: Accepting a Self-Declaration Affidavit Blindly**  
> Simply accepting a bidder's sworn affidavit stating "I am not disqualified under Section 29A" without conducting independent due diligence, MCA verification, and CIBIL checks constitutes gross negligence on the part of the RP.

> [!WARNING]
> **IBBI Warning Trap 2: Modifying Eligibility Criteria Without CoC 66% Approval**  
> An RP cannot alter the net worth criteria, EOI cutoff date, or turnover thresholds unilaterally. Any change to the Form G parameters requires a formal CoC resolution passed by a **66% majority**.

---
*(Proceed to Chapter 5 for RFRP, Evaluation Matrix & Resolution Plan Compliance Audit)*
