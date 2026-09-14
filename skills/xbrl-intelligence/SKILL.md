---
name: xbrl-intelligence
description: Automated Extraction of AS-18 Related Parties, Bank Loan Facilities, and CARO Disclosures from MCA AOC-4 XBRL Filings
compatibility: hayagriva>=1.0.0, antigravity, crewai, deepagents
---

# XBRL Intelligence Skill

## 🏛️ Purpose & Scope
This skill provides programmatic parsing of Ministry of Corporate Affairs (MCA) `AOC-4 XBRL` XML filings. It replaces manual inspection of audited financial statements by extracting structured compliance data:
1. **AS-18 / Ind AS 24 Related Party Disclosures**:
   - Master list of related companies, subsidiaries, joint ventures, KMPs, and relatives.
   - Volume of historical transactions and outstanding balances.
2. **Schedule of Borrowings & Registered Bank Facilities**:
   - List of all lending banks, sanctioned credit limits, and hypothecations.
   - Used for **Shadow / Undisclosed Bank Account Detection**.
3. **CARO (Companies Auditor's Report Order) Disclosures**:
   - Direct reporting on defaults in repayment of bank loans (Clause 3(ix)).
   - Direct reporting on corporate fraud or siphoning (Clause 3(xi)).
   - Non-cash transactions with directors (Clause 3(xv)).

---

## 📂 Expected Output
Returns a structured profile object:
```json
{
  "relatedParties": [
    { "name": "Pearl Ceramic Tiles Pvt Ltd", "canonicalName": "PEARL CERAMIC TILES", "relationship": "Associate Company" }
  ],
  "disclosedLenders": ["State Bank of India", "HDFC Bank"],
  "caroRemarks": [
    { "clause": "CARO Clause 3(ix)", "remark": "Default of Rs 42.15 Cr", "defaultReported": true }
  ]
}
```
