---
name: pii-redaction
description: Privacy-Preserving Redaction & Masking for Virtual Data Rooms (VDR), Public NCLT Docketing, and DPDP Act Compliance
compatibility: hayagriva>=1.0.0, antigravity, crewai, deepagents
---

# PII Redaction & VDR Sanitization Skill

## 🏛️ Purpose & Scope
This skill provides downstream, post-analysis sanitization of sensitive Personally Identifiable Information (PII) for documents being shared externally:
1. **Virtual Data Rooms (VDRs)**: Sharing Information Memorandums and financial ledgers with Prospective Resolution Applicants (PRAs) under IBBI CIRP Regulation 36 and the Digital Personal Data Protection Act (DPDP Act, 2023).
2. **Public NCLT Docketing**: Masking personal direct contact information before filing public annexures on judicial web portals.

---

## 🔒 Masking Rules & Standards

### 1. Bank Account Numbers (Partial Masking)
- Do **not** completely erase account numbers to `[REDACTED]`, because bidders and creditors need to distinguish between different accounts.
- **Standard**: Mask all but the last 4 digits:
  - `39120481920` $\rightarrow$ `XXXXXX1920`
  - `50200091028371` $\rightarrow$ `XXXXXXXXXX8371`

### 2. Contact Information (Full Redaction)
- **Email Addresses**: `\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b` $\rightarrow$ `[REDACTED_EMAIL]`
- **Personal Phone Numbers**: Indian 10-digit mobile numbers or `+91-...` $\rightarrow$ `[REDACTED_PHONE]`

### 3. Preservation of Legal & Financial Ground-Truth (NEVER Redact)
- **Corporate Identifiers**: CIN, LLPIN, Company Names, and Registered Addresses must remain intact.
- **Tax Identifiers**: Corporate PAN, GSTIN must remain intact.
- **Financial Numbers**: Transaction amounts, balances, totals, and percentages must remain untouched.
- **Judicial References**: Case numbers, Court Benches, and Statutory Section citations (§§ 43, 45, 50, 66) must remain untouched.

---

## 📂 Expected Output
Takes unredacted Markdown or JSON and outputs a sanitized version preserving full commercial and legal structure while masking sensitive personal markers.
