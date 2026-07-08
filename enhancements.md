# Future Enhancements: Law Completion, Document Drafting & Monetisation

This document outlines the conceptual architecture and workflow design for the next phase of the TWILLM application: **Law Completion (Inline Autocomplete)**, **Automated Document Drafting**, and **Freemium Monetisation**.

---

## 1. Law Completion (Inline Autocomplete)

### User Experience
* As the user drafts a petition, contract, or appeal in the editor, they type a trigger keyword starting with `@@` (e.g. `@@sec 7` or `@@moratorium`).
* The editor instantly displays a grayed-out preview (ghost text) containing the official statutory text of the provision or precedent.
* Pressing `Tab` accepts the completion and inserts the text.

### Technical Architecture
```
[User Types "@@sec 7"]
   └──> Monaco Editor (InlineCompletionItemProvider)
         └──> BM25 search over manifest tokens in RAM (< 1ms)
               └──> Decrypt just that section from vault Buffer (< 5ms)
                     └──> Return Ghost Text Preview to Editor
```

* **Monaco Editor API**: Leverage Monaco's built-in `InlineCompletionItemProvider` to monitor active keystrokes and capture the trigger string `/@@([\w\s./,-]*)$/`.
* **Zero-Lag Retrieval**: BM25 search runs over pre-tokenised manifest in RAM. Full section text is decrypted on-demand (lazy) — startup RAM stays under 2 MB regardless of library size.
* **Trigger**: `@@` — chosen because it never appears in legal prose, is 2 keystrokes, and carries "@mention" semantics (fetch from library).

---

## 2. Automated Document Drafting Pipeline

### User Experience
* The user triggers a request in the chat panel: *"Draft a Section 7 Petition for this case."*
* The app automatically fetches the blank template format, extracts matching facts from the evidence folder, merges them via the LLM, and opens the populated draft in the editor.

### Ingestion & Processing Pipeline
1. **Template Library**: Keep standard legal templates (IBC Petitions, Appeals, Notices) in a secure, encrypted folder in the app bundle.
2. **Fact Extraction**: Run RAG (BM25 search + LLM extraction) on the case files to grab specific case metadata (Corporate Debtor Name, Default Date, Debt Amount, Exhibits).
3. **LLM Synthesis**: Pass the `Template` + `Extracted Facts` to the LLM to write the first draft.
4. **Interactive Editor**: The user refines the draft in the editor, using **Law Completion** inline to add citations and precedents.

---

## 3. Data Protection & Distribution

* **Asset Encryption (IP Protection)**: Encrypt pre-loaded templates and law libraries on disk using `AES-256-GCM` via Node.js's native `crypto` module. Decrypt them in-memory (RAM) only during startup, preventing users from copying your databases.
* **Lazy Section Loading**: Vault stores per-section individually encrypted blobs. Only the BM25 manifest (pre-tokenised titles) is loaded at startup. Full section text decrypted on-demand with LRU(50) cache.
* **Vault-Level Encryption (Privacy)**: Provide a Master Password option for cases, encrypting the `concepts/` directory files so data remains secure on client hardware.

---

## 4. Freemium Monetisation

### The Core Insight

Three natural subscription enforcers are already built into the architecture:

| Asset | Why it enforces renewals |
|---|---|
| **Encrypted law vault** (`laws.vlt.data`) | Weekly amendments → old vault goes stale. New key delivered only to active subscribers. |
| **RAG pipeline + concept extraction** | LLM token costs are real. Free tier caps protect margin. |
| **Document drafting templates** | Templates are IP. Gated behind Pro. |

The vault is the most elegant enforcer: every week the IBC/Companies Act gets amended, court rules change, new NCLT orders come in. A stale vault = wrong law text = malpractice risk for an advocate.

---

### Tier Structure

#### Free (Hook) — Rs. 0
**Target:** Solo advocates starting out, law students, evaluators

| Feature | Free limit |
|---|---|
| Active cases | 3 |
| Documents per case | 5 |
| `@@` law completions/day | 25 |
| Law libraries | IBC Core only (Sections 6-32) |
| Law library updates | No — Frozen at install time |
| AI chat (Architect) | 10 queries/day |
| Concept extraction | Unlimited |
| Document drafting | No |
| Support | Community only |

> Free tier vault freezes after 30 days. User must upgrade for weekly amendments.

---

#### Pro — Rs. 2,999/month  or  Rs. 24,999/year
**Target:** Individual advocates, IPs, legal consultants

- Unlimited cases, documents, `@@` completions
- All law libraries (IBC + Companies Act + CrPC + NI Act + CPC + IEA + more)
- Weekly law library updates (new vault key delivered automatically)
- Document drafting — standard templates
- Export to DOCX / PDF
- Email support, 48hr response

---

#### Firm — Rs. 9,999/month (up to 5 seats)  +  Rs. 1,800/seat beyond 5
**Target:** Law firms, IP firms, NCLT practitioners, resolution professionals

- Everything in Pro
- Shared case library across seats
- Custom law libraries (firm's own precedents)
- Template customisation (firm letterhead / formats)
- Audit log (who accessed which case)
- Phone + dedicated account manager
- API access (integration with their DMS)

---

#### Enterprise — Custom (Rs. 5L-Rs. 20L/year)
**Target:** Large law firms, IBBI, NCLT registries, DRT

- Fully air-gapped deployment
- Encrypted vault updates on signed USB quarterly
- SLA support

---

### How the Vault Enforces Subscription

```
Every week (your machine):
  1. Build new laws.vlt.data with this week's amendments
  2. Rotate VAULT_KEY → sign → upload to update CDN
  3. Deliver new VAULT_KEY encrypted with subscriber's machine fingerprint

App startup:
  1. Check license server: is this seat active?
  2. Yes → download new vault + new VAULT_KEY (valid 7 days)
  3. No / offline > 7 days → VAULT_KEY expires → @@ stops working
  4. Free tier → no new key delivered → library frozen
```

---

### Revenue Projections (Conservative — Year 1)

| Tier | Price/month | Target seats | MRR |
|---|---|---|---|
| Pro | Rs. 2,999 | 100 | Rs. 2,99,900 |
| Firm | Rs. 9,999 avg | 10 firms | Rs. 99,990 |
| Enterprise | Rs. 41,667 avg | 2 | Rs. 83,334 |
| **Total MRR** | | | **~Rs. 4.8L/month** |
| **ARR** | | | **~Rs. 57L/year** |

Break-even at ~35 Pro seats (assuming Rs. 80K/month infra + LLM costs).

---

### Go-to-Market Phases

| Phase | Target | Channel | Timeline |
|---|---|---|---|
| 1 | NCLT IPs (4,000 registered on IBBI) | WhatsApp groups, IBBI training | 0-90 days |
| 2 | Top 100 NCLT-focused law firms | LinkedIn + INSOL India conference | 3-6 months |
| 3 | IBBI, NCLT registries, DRT | Tender + direct relationship | 12-18 months |

---

### Technical Prerequisites Before Launch

| Priority | Feature | Purpose |
|---|---|---|
| P0 | License key server — validate seat, deliver vault key | Gates all paid features |
| P0 | Machine fingerprinting — bind vault key to hardware ID | Prevents key sharing |
| P1 | Usage counters — cases, queries, docs (persisted locally) | Enforces Free limits |
| P1 | In-app upgrade prompts — triggered at Free limit hits | Drives conversion |
| P2 | Document drafting templates — IBC S7, S9, S10 petitions | Pro feature showcase |
| P2 | Weekly vault auto-update — download on startup if new version | Subscription stickiness |
