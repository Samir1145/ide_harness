# HAYAGRIVA — Agent User Handbook
### *How to talk to your AI legal team*

---

## 1. The Simple Mental Model

Think of HAYAGRIVA as an **office of specialist colleagues**. Each colleague (agent) is an expert in one area. You call on them by name.

There are **two ways** to call an agent:

| Method | When to use | Example |
|---|---|---|
| **`@agent`** — type in the chat panel | For questions and analysis | `@advisor What was the date of default?` |
| **`/command`** — type in the editor | For creating documents and reports | `/draft sec7-petition` |

That's it. Two patterns. Everything else follows from these.

---

## 2. The `@agent` System — Talking to Agents in Chat

Type `@` followed by the agent name, then your question or instruction.

```
@advisor  your question here
@forms    your instruction here
@timeline  your instruction here
```

### Which `@agent` do I call?

| You want to... | Call this agent |
|---|---|
| Ask a legal question about your case | `@advisor` |
| Find an IBC/Companies Act section | `@advisor` |
| Fill an IBBI form (Form A, B, F, H) | `@forms` |
| Draft a petition or legal document | `@document` |
| Build a Section 7/9/10 NCLT petition | `@nclt` |
| Reconstruct the case timeline | `@timeline` |
| Score the strength of your arguments | `@strength` |
| Scan for avoidance transactions | `@avoidance` |
| Verify creditor claim amounts | `@claims` |
| Map all entities in the case | `@entity-graph` |
| Decode a tribunal order | `@order` |

---

## 3. The `/command` System — Creating Work Product from the Editor

Type `/` at the start of a line in the **Theia text editor** (not the chat panel). A command palette appears. Select the command or keep typing to filter.

```
/draft [template]
/fill [form-name]
/timeline
/strength
/brief
/avoidance-scan
/claims-check
/analyse-order
/entity-graph
/export-sc
```

### `/draft` — Draft a legal document

Type `/draft` followed by the document type:

| What you type | What it drafts |
|---|---|
| `/draft sec7-petition` | Section 7 petition (Financial Creditor) |
| `/draft sec9-petition` | Section 9 petition (Operational Creditor) |
| `/draft sec10-petition` | Section 10 petition (Corporate Debtor) |
| `/draft reply-revision-petition` | Reply to revision petition |
| `/draft slp-sc` | Special Leave Petition (Supreme Court) |
| `/draft ibc-sec61-appeal` | NCLAT appeal under Sec 61 |
| `/draft extension-application` | CIRP time extension application |
| `/draft liquidation-report` | Liquidation report |
| `/draft directors-report` | Directors' / Board report |

### `/fill` — Fill an IBBI/MCA form

| What you type | What it fills |
|---|---|
| `/fill ibbi-form-a` | Form A — Financial Creditor claim |
| `/fill ibbi-form-b` | Form B — Operational Creditor claim |
| `/fill ibbi-form-f` | Form F — Employee/Workman claim |
| `/fill ibbi-h` | Form H — Resolution Plan compliance |
| `/fill aoc-4` | AOC-4 Annual Return |

### Other `/` commands

| Command | What it does |
|---|---|
| `/timeline` | Reconstruct the full case chronology |
| `/brief` | Draft an NCLT petition synopsis |
| `/strength` | Score each ground in your latest draft |
| `/avoidance-scan` | Scan all documents for avoidance transactions |
| `/claims-check` | Verify all claim amounts in the case |
| `/analyse-order` | Decode the latest tribunal order |
| `/entity-graph` | Build the entity relationship map |
| `/export-sc` | Export current document to Supreme Court DOCX format |

---

## 4. Agent-by-Agent Playbook

### 🧑‍⚖️ `@advisor` — Your Legal Research Partner

**What it does:** Answers legal questions using your case documents + the local law vault (IBC, Companies Act, IBBI Regulations).

**Example prompts to try:**

```
@advisor What is the date of default in this case?

@advisor Explain Section 7 of IBC and how it applies here

@advisor What was the petitioner's argument about the nature of the claim?

@advisor Is the claim barred by limitation?

@advisor What does Section 43 of IBC say about preferential transactions?

@advisor What are the grounds mentioned in the creditor's petition?
```

**What happens behind the scenes:**
- Searches your case documents for relevant chunks
- Looks up the relevant IBC/Companies Act section from the law vault
- Saves key facts it finds to `case_facts.md` automatically
- Returns a cited answer with `[source:N]` references

---

### 📋 `@forms` — Your IBBI Form Filling Assistant

**What it does:** Fills IBBI and MCA forms using data already in your case documents. Validates the math and dates. Exports a JSON file ready for iPIE submission.

**Example prompts to try:**

```
@forms Fill Form A for the financial creditor claim

@forms Fill Form B for the operational creditor's outstanding invoices

@forms Audit the AOC-4 for this case and check if the numbers are correct

@forms What fields are missing from Form H?

@forms Fill Form F for employee dues
```

**Or use the slash command:**
```
/fill ibbi-form-a
```

**What happens:**
- Reads `case_kv_dictionary.json` for known values (party names, dates, amounts)
- RAG-searches your documents for any gaps
- Flags fields it couldn't fill with ⚠️ — those need manual input
- Saves a JSON export to the `exports/` folder (ready for iPIE)
- Validates math rules (e.g. principal + interest = total claim)

---

### 📝 `@document` — Your Legal Drafting Assistant

**What it does:** Drafts complete legal documents using skeleton templates, auto-filling party names, dates, amounts, and grounds from your case data.

**Example prompts to try:**

```
@document Draft a Section 7 petition for this case

@document Draft a reply to the revision petition

@document Prepare an NCLAT appeal brief

@document Draft an application for extension of CIRP timeline

@document I need a Committee of Creditors resolution
```

**Or use the slash command:**
```
/draft sec7-petition
/draft reply-revision-petition
```

**What happens:**
- Matches your request to the closest skeleton template
- Auto-fills every `{{ PARTY_NAME }}`, `{{ DATE_OF_DEFAULT }}`, `{{ AMOUNT_CLAIMED }}` from case data
- Saves the draft to `drafts/` folder and opens it in the editor
- Shows you which placeholders it couldn't fill (⚠️ gaps = need your input)
- Run `/export-sc` on the draft to get a Supreme Court DOCX

---

### ⚖️ `@nclt` — Your NCLT Petition Specialist

**What it does:** Generates NCLT petition synopses and brief structures, pre-loaded with the case chronology.

**Example prompts to try:**

```
@nclt Draft a Section 7 petition synopsis for this case

@nclt Prepare the facts of the case section for the petition

@nclt What should the grounds section of our Section 9 petition say?

@nclt Generate the prayer clause for our insolvency application
```

**Or use the slash command:**
```
/brief
```

**What happens:**
- Reconstructs the case timeline first (so the facts-of-the-case section is chronologically accurate)
- Loads the correct petition skeleton (Sec 7/9/10 based on your creditor type)
- Fills using case data + IBC vault provisions
- Saves draft to `drafts/` folder

---

### 📅 `@timeline` — Your Case Chronologist

**What it does:** Scans ALL your case documents for dated events and reconstructs a complete chronological timeline of the case.

**Example prompts to try:**

```
@timeline Reconstruct the full case timeline

@timeline When did the corporate debtor first default?

@timeline Build the chronology of this insolvency case

@timeline What are the key dates in this matter?
```

**Or use the slash command:**
```
/timeline
```

**What happens:**
- Runs 13 targeted searches across all your indexed documents
- Extracts every date + event + source document
- Sorts them chronologically
- Writes `timeline.md` to your case folder (open it in the editor)
- Saves 8 key legal dates to `case_kv_dictionary.json` automatically:
  - Date of default
  - Date of CIRP commencement
  - Date of IRP/RP appointment
  - Date of CoC constitution
  - etc.

---

### 💪 `@strength` — Your Argument Auditor

**What it does:** Reads your latest draft and scores each ground as `STRONG`, `MODERATE`, `WEAK`, or `CONTESTED`. Tells you what evidence or statute would strengthen weak grounds.

**Example prompts to try:**

```
@strength Evaluate the arguments in my latest draft

@strength Which grounds in the petition are weakest?

@strength What additional evidence do I need to strengthen ground 3?

@strength Is our limitation argument strong enough?
```

**Or use the slash command:**
```
/strength
```

**What happens (reads the most recent file in your `drafts/` folder):**
- Extracts each numbered ground from the draft
- Checks if each ground has: a statute reference, supporting case document evidence, and no contradicting evidence
- Scores: 🟢 STRONG | 🟡 MODERATE | 🔴 WEAK | 🟠 CONTESTED
- Returns specific, actionable advice for weak grounds

---

### 🔍 `@avoidance` — Your Transaction Scanner

**What it does:** Scans all financial documents for transactions that may be challengeable under IBC Sections 43 (preferential), 45 (undervalue), 49 (extortionate), or 66 (fraudulent).

**Example prompts to try:**

```
@avoidance Scan for preferential transactions in this case

@avoidance Are there any related party transfers in the lookback period?

@avoidance Identify transactions that could be challenged under Section 43

@avoidance Check if any payments were made to promoters in the 2 years before CIRP
```

**Or use the slash command:**
```
/avoidance-scan
```

**What happens:**
- Runs 8 financial-keyword RAG queries across all documents
- Calculates months before CIRP commencement for each transaction
- Applies IBC lookback windows automatically (2 yrs related party / 1 yr others)
- Flags each transaction with severity: 🔴 HIGH or 🟡 REVIEW
- Writes flagged transactions to `avoidance_ledger.md`
- Saves count to `case_kv_dictionary.json`

---

### ✅ `@claims` — Your Claims Verifier

**What it does:** Reads all creditor documents and verifies claim amounts, cross-checking for discrepancies.

**Example prompts to try:**

```
@claims Verify all creditor claims in this case

@claims Is the financial creditor's claim amount consistent across documents?

@claims Check if the principal + interest adds up correctly

@claims Are there any discrepancies in the operational creditor claims?
```

**Or use the slash command:**
```
/claims-check
```

**What happens:**
- Runs 5 RAG queries across all documents for claim-related content
- Extracts amounts, parties, and dates per document chunk
- Cross-references amounts against `case_kv_dictionary.json`
- Flags mismatches with ⚠️ MISMATCH
- Writes all verified/flagged claims to `claims_registry.md`

---

### 🗺️ `@entity-graph` — Your Case Map Builder

**What it does:** Identifies all entities (companies, persons, creditors, guarantors) across your case documents and builds a relationship map, visualised in the D3.js Case Graph Viewer.

**Example prompts to try:**

```
@entity-graph Map all entities in this case

@entity-graph Who are the related parties in this insolvency?

@entity-graph Build the ownership structure of the corporate debtor group

@entity-graph Show me all creditors and their relationships
```

**Or use the slash command:**
```
/entity-graph
```

**What happens:**
- Runs 8 entity-specific RAG queries (directors, subsidiaries, creditors, guarantors, etc.)
- Builds a nodes + edges graph
- Saves `entity_graph.json` to `concepts/` folder
- Opens in the D3.js Case Graph Viewer (3D visualisation)
- Writes an entity table to `entity_graph.md`

---

### 📋 `@order` — Your Tribunal Order Decoder

**What it does:** Reads the latest tribunal order in your case documents and extracts every direction, compliance item, and deadline.

**Example prompts to try:**

```
@order Analyse the latest NCLT order in this case

@order What directions were given in the last hearing order?

@order Are there any compliance deadlines I'm missing?

@order What did the tribunal say about the resolution plan?
```

**Or use the slash command:**
```
/analyse-order
```

**What happens:**
- Finds tribunal order documents via RAG
- Extracts: Findings, Directions, Liberty clauses, Compliance deadlines, Next date
- Writes all compliance items to `litigation_tracker.md`
- Saves next hearing date and last order date to `case_kv_dictionary.json`
- Returns a clear narrative summary of what the order means

---

## 5. The Typical Day — End-to-End Workflow

Here is how a typical case workday looks in HAYAGRIVA:

```
MORNING: Load Case & Get Oriented
─────────────────────────────────
1. Open your case folder in HAYAGRIVA
   → Stage 1 auto-indexes all documents (happens in background)

2. Type in chat:
   @timeline Reconstruct the full case timeline
   → timeline.md created, key dates saved to dictionary

3. Type in chat:
   @advisor Give me a summary of the key facts of this case
   → Findings saved to case_facts.md automatically


RESEARCH: Answer Legal Questions
─────────────────────────────────
4. @advisor Is the claim barred by limitation under IBC?

5. @advisor What does Section 7 require to be proved?

6. @advisor What was the petitioner's argument on the nature of the debt?


DRAFT: Produce Work Product
─────────────────────────────
7. In the editor, type:
   /draft sec7-petition
   → Draft saved to drafts/ folder, auto-filled from case data
   → Unfilled gaps shown with ⚠️

8. Fill the gaps manually in the Monaco editor

9. Run argument audit:
   @strength Evaluate the petition draft
   → Each ground scored, weak grounds flagged with advice


FORMS: Prepare IBBI Filing
─────────────────────────────
10. /fill ibbi-form-a
    → Form A filled from case documents
    → Validation run on math/dates
    → JSON exported to exports/ for iPIE submission


COMPLIANCE: Pre-Flight Checks
─────────────────────────────
11. @avoidance Scan for avoidance transactions
    → Flagged to avoidance_ledger.md

12. @claims Verify all creditor claim amounts
    → Verified/flagged to claims_registry.md


EXPORT: Court-Ready Documents
─────────────────────────────
13. Open the draft in the editor
14. Type: /export-sc
    → Supreme Court format DOCX generated
    → Ready to sign and file
```

---

## 6. Key Files Agents Read & Write

When agents work, they automatically read from and write to these files in your case folder:

| File | What's in it | Who writes to it |
|---|---|---|
| `case_kv_dictionary.json` | All key-value facts (dates, names, amounts) | All agents (auto-discovered facts) |
| `case_facts.md` | Key findings and Q&A history | `@advisor` |
| `timeline.md` | Full chronological case timeline | `@timeline` |
| `claims_registry.md` | All creditor claims, verified/flagged | `@claims` |
| `avoidance_ledger.md` | Flagged avoidance transactions | `@avoidance` |
| `litigation_tracker.md` | Directions, deadlines from orders | `@order` |
| `entity_graph.md` + `.json` | Entity relationship map | `@entity-graph` |
| `skeletons/ibc_forms/` | IBBI 2026 official forms (.md) | Form fill engine |
| `skeletons/mca_forms/` | MCA statutory form templates (.md) | Form fill engine |
| `skeletons/ibc_precedents/` | NCLT applications & RP report templates (.md) | `@document`, `@nclt` |
| `drafts/` folder | All generated document drafts | `@document`, `@nclt` |
| `exports/` folder | JSON schemas ready for iPIE | `@forms` |


> **The key insight**: Every time an agent runs, it makes the next agent's turn smarter. `@timeline` saves key dates → `@document` uses those dates to fill your petition draft automatically. `@claims` saves amounts → `@forms` uses those amounts to fill Form A without asking.

---

## 7. Quick Reference Card

```
CHAT PANEL (@agent syntax)          EDITOR (/ command syntax)
──────────────────────────          ──────────────────────────
@advisor  → Legal Q&A               /draft sec7-petition
@forms    → Fill IBBI forms         /draft sec9-petition
@document → Draft any document      /draft reply-revision-petition
@nclt     → NCLT petition           /draft slp-sc
@timeline → Build timeline          /fill ibbi-form-a
@strength → Score arguments         /fill ibbi-form-b
@avoidance→ Scan transactions       /fill ibbi-form-f
@claims   → Verify claims           /fill ibbi-h
@entity-graph → Map entities        /timeline
@order    → Decode tribunal order   /brief
                                    /strength
                                    /avoidance-scan
                                    /claims-check
                                    /analyse-order
                                    /entity-graph
                                    /export-sc
```

---

## 8. Tips for Getting Better Results

1. **Load your documents first.** Agents work from indexed documents. The more documents in your case folder, the better the answers.

2. **Run `@timeline` first on a new case.** It populates `case_kv_dictionary.json` with key dates — every other agent becomes more accurate after this.

3. **The `@advisor` write-back is cumulative.** Each time you ask `@advisor` a question, the facts it finds are saved. By the end of a research session, your `case_facts.md` is a ready-made briefing note.

4. **Unfilled placeholders (⚠️) are your review list.** When `/draft` produces a document with `⚠️ gaps`, open the draft in the editor — Monaco will show squiggles on every unfilled field. These are the fields that need your direct input.

5. **Use `/export-sc` only on final drafts.** The Supreme Court DOCX compiler applies strict formatting (Times New Roman, 14pt, specific margins). Use it only when the draft is ready.

6. **`@forms` + iPIE:** After running `/fill ibbi-form-a`, check the `exports/` folder for the JSON file. This can be submitted directly to the iPIE portal without re-typing.
