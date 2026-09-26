# THE INSOLVENCY PROFESSIONAL’S OPERATIONAL CODEX
## Chapter 2: Verification of Claims, CoC Constitution & 1st Meeting ($T_{14} \to T_{30}$)
### Under the Insolvency and Bankruptcy Code, 2016 & IBBI Regulations

---

## 1. Statutory Mandate & Framework
Within 7 days of the claim intake cutoff (by **$T_{21}$**), the IRP must verify all claims and constitute the **Committee of Creditors (CoC)**. Within 30 days of appointment (by **$T_{30}$**), the IRP must convene the **1st CoC Meeting**.

Key statutory provisions:
* **Section 21(1):** Duty of IRP to collate claims and constitute the Committee of Creditors.
* **Section 21(2):** The CoC shall comprise all Financial Creditors of the Corporate Debtor.
* **Section 21(2) First Proviso:** A Financial Creditor who is a **Related Party** of the Corporate Debtor has NO right of representation, participation, or voting in CoC meetings.
* **Section 21(6A) & Regulation 16A:** Class of Creditors (e.g. Homebuyers) voting through an Authorized Representative (AR).
* **Section 22:** Appointment of Resolution Professional (confirming IRP as RP or replacing with a new RP).
* **Section 24:** Meeting of the Committee of Creditors.
* **Regulation 13:** Filing of list of creditors with NCLT and uploading on website.
* **Regulation 17:** Filing of **Report Certifying Constitution of the CoC** with the Adjudicating Authority within **2 days of verification ($T_{23}$)**.
* **Regulation 18 & 19:** Convening CoC meetings and issuing 5 days notice (or minimum 24 hours if shortened by CoC).

---

## 2. Determination of Voting Share & CoC Architecture

### A. Mathematical Voting Share Formula
Voting share of each financial creditor is calculated strictly on the proportion of their admitted financial debt to the total admitted financial debt:

$$\text{Voting Share (\%)} = \left( \frac{\text{Admitted Financial Debt of Creditor } i}{\sum_{k=1}^n \text{Admitted Financial Debt of all Unrelated FCs}} \right) \times 100$$

> [!CAUTION]
> **Operational Debts Excluded from Denominator:**  
> The denominator includes ONLY admitted debt of **unrelated Financial Creditors**. Operational Creditor dues, workmen dues, and statutory tax dues do NOT factor into the voting percentage calculation (unless the CD has zero financial creditors under Regulation 16).

---

### B. The Section 21(2) Related Party Exclusion Filter
> [!IMPORTANT]
> **Judicial Precedent: *Phoenix ARC Pvt. Ltd. v. Spade Financial Services Ltd. (Supreme Court 2021)***  
> The Supreme Court held that the exclusion under Section 21(2) extends not only to entities that are formally related parties on $T_0$, but also to entities that were related parties in the past and entered into transactions to manipulate voting share in the CoC. Sham assignments to unrelated third parties to evade Section 21(2) are invalid.

Any Financial Creditor qualifying under Section 5(24) (e.g. director’s relatives, holding company, entities with common directorship, cross-shareholding > 20%) must be **strictly excluded from the CoC voting list**.

---

## 3. Class of Creditors & Authorized Representative (AR) Protocol

When claims in a class exceed 10 (e.g., Homebuyers in a real estate project or Debenture Holders):
1. **Nomination:** In Form A, the IRP offers three Insolvency Professionals as choices for the Authorized Representative.
2. **Voting Choice:** In Form CA, each creditor votes for their preferred AR.
3. **Application to NCLT:** The IRP files an application with the NCLT to appoint the highest-voted IP as the statutory AR.
4. **Interim Representation:** The AR circulates agendas to class creditors, conducts preliminary electronic polling, and votes in the CoC as per the majority view of the class (§ 25A).

---

## 4. Statutory Deliverables & The 1st CoC Meeting ($T_{30}$)

### Step 1: Filing Report Certifying Constitution of CoC (Regulation 17)
* **Deadline:** Within 2 days of verification ($T_{23}$).
* **Filing:** Filed electronically and physically before the NCLT Bench.
* **Contents:** List of admitted financial creditors, admitted claim amounts, security interest held, and calculated voting share table.

### Step 2: Notice & Agenda for 1st CoC Meeting
* **Notice Period:** Minimum 5 days notice in writing (accompanied by agenda, notes on agenda, and draft resolutions).
* **Mandatory Agenda Items:**
  1. Take note of the NCLT Admission Order and Constitution of CoC.
  2. Resolution under **Section 22(2)**: Either to resolve that the IRP be appointed as the Resolution Professional (RP) or to replace the IRP by another IP (requires **66% voting share**).
  3. Resolution under **Section 27 read with Regulation 34**: Approval of Insolvency Resolution Process Costs (IRPC) incurred by the IRP, including legal counsel, security guards, publication costs, and valuer retainers.
  4. Ratification of appointment of two IBBI Registered Valuers for each class of assets (Regulation 27).
  5. Authorization to open a new CIRP Current Bank Account with authorized signatory powers.
  6. Fixing the electronic voting window (minimum 24 hours up to 48 hours).

---

## 5. Local Autonomous Agent Automation (Hayagriva Core)

| Agent | Module | Automated Deliverable |
| :--- | :--- | :--- |
| **`@coc_coordinator`** | `subagents/coc_coordinator.js` | Computes mathematical voting shares, checks quorum, and generates the **Report Certifying Constitution of CoC**. |
| **`@forms`** | `pipeline/forms/` | Pre-fills statutory **Notice, Agenda, and Resolutions for the 1st CoC Meeting**. |
| **`@claims`** | `skills/claim-verification/` | Generates the formal **List of Creditors (Regulation 13)** ready for website publishing and NCLT submission. |
| **`@document`** | `agents/document-agent` | Drafts the Section 22 appointment petition / compliance affidavit for NCLT docketing. |

---

## 6. Global Compliance Requisitions via `@compliance` (ResolutionBazaar Gatekeeper)

```
[CoC Verification Completed]
             │
             ▼
     [@compliance Agent]
             │
             ├──► 1. RBZ-RELATED-PARTY-09 (Section 21(2) Cross-Screening)
             │    - Corporate Debtor Director DIN network cross-check vs claimed FCs
             │    - Common shareholder and beneficial ownership audit
             │    - Deliverable: Section 21(2) Disqualification Docket
             │
             └──► 2. RBZ-VALUER-CLEARANCE-10 (Registered Valuer Verification)
                  - Verifies IBBI Registered Valuer registration numbers
                  - Negative screening against conflict with Corporate Debtor
                  - Deliverable: Valuer Independence Compliance Certificate
```

---

## 7. Regulatory Penalties & Common Pitfalls

> [!CAUTION]
> **IBBI Warning Trap 1: Allowing Related Party to Vote in CoC**  
> Allowing a related-party financial creditor to participate or cast votes in CoC meetings is one of the most severe statutory offenses under the IBC. It invalidates all CoC resolutions (including RP appointment and Form G approvals) and attracts immediate suspension of the IP's Authorisation for Assignment (AFA).

> [!WARNING]
> **IBBI Warning Trap 2: Failure to Provide Evoting Facility**  
> Under Regulation 25 and 26, every CoC meeting where resolutions are put to vote MUST be followed by an electronic voting platform window (e.g. Right2Vote, Link Intime) accessible to all voting members. Conducting hand-raising votes without an electronic voting audit trail violates IBBI regulations.

---
*(Proceed to Chapter 3 for Information Memorandum & Avoidance Transactions Inquest)*
