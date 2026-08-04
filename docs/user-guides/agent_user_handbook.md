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

### Which `@agent` do I call? (21 Specialized Legal Subagents)

| Specialized Agent | `@agent` Tag | Primary Responsibility | Example Chat Input / Command |
|---|---|---|---|
| **Document Agent** | `@document` | Drafts petitions, applications, appeals, & filings | `@document /draft sec7-petition`, `@document /draft slp-sc` |
| **Forms Agent** | `@forms` | Audits & hydrates IBBI/MCA statutory forms | `@forms /fill ibbi-h`, `@forms /fill aoc-4` |
| **Legal Advisor** | `@advisor` | Legal research, IBC statutes, & ground scoring | `@advisor What is the date of default?`, `@advisor /strength` |
| **Precedent Search** | `@precedent` | Finds SC / NCLAT / NCLT precedent rulings | `@precedent /precedent-find related party voting` |
| **NCLT Bench Agent** | `@nclt` | Drafts 2-page Bench synopses & hearing briefs | `@nclt /brief` |
| **Timeline Engine** | `@timeline` | Reconstructs CIRP chronology & Gantt chart | `@timeline /timeline` |
| **Avoidance Scanner** | `@avoidance` | Scans for Sec 43/45/49/50 avoidance transactions | `@avoidance /avoidance-scan` |
| **CoC Coordinator** | `@coc` | Computes debt voting shares & audits claims | `@coc /claims-check` |
| **Claims Verification** | `@claims` | Verifies creditor claim submissions & interest | `@claims Audit financial creditor claims` |
| **Plan Evaluator** | `@plan` | Audits Sec 30(2) & Reg 39(4) Resolution Plans | `@plan /plan-audit` |
| **IM Compiler** | `@im` | Compiles Reg 36 Information Memorandum | `@im /im-build` |
| **Argument Scorer** | `@strength` | Scores legal ground strength (1–10) | `@strength /strength` |
| **Order Decoder** | `@order` | Decodes orders & compliance deadlines | `@order /analyse-order` |
| **Counter-Argument** | `@counter` | Formulates rebuttals against opposing counsel | `@counter /counter` |
| **Litigation Tracker** | `@litigation` | Tracks active court disputes & tribunal dates | `@litigation Check upcoming hearing dates` |
| **Entity Graph** | `@entitygraph` | Maps directors & related parties in 3D D3.js web | `@entitygraph /entity-graph` |
| **Client Update** | `@clientupdate` | Drafts executive client updates & summaries | `@clientupdate /client-update` |
| **Compliance Agent** | `@compliance` | Audits mandatory CIRP statutory deadlines | `@compliance Audit CIRP timeline compliance` |
| **Deposition Agent** | `@deposition` | Prepares cross-examination questions & affidavits | `@deposition Draft cross-exam questions` |
| **Witness Statement** | `@witness` | Audits witness statements & testimony | `@witness Check witness affidavit consistency` |
| **Governance Agent** | `@governance` | Audits board minutes & secretarial standards | `@governance Audit board meeting compliance` |

---

## 3. Two Command Systems: Editor Canvas (`/`) vs. AI Chat Panel (`@`)

Hayagriva cleanly separates inline document drafting from AI agent delegation:

1. **Monaco Editor Canvas (`/` commands)**: Typed directly inside your document canvas for instant text insertion, law section lookups, clause drafting, and SC export.
2. **AI Chat Panel (`@agent /command` workflows)**: Typed in the AI Chat Panel or sidebar to delegate full legal analysis tasks to background subagents.

---

### A. Monaco Editor Canvas (`/` 5-Command Suite)

Type `/` anywhere in the Monaco editor canvas to open the inline autocomplete palette:

| Primary Command | Category | What it does | Examples |
|---|---|---|---|
| **`/law`** | **Statute Search** | Searches statutory Law Vault across all Acts, Sections, & Rules | `/law sec 30(2)`, `/law ibc 14`, `/law mca 185` |
| **`/precedent`** | **Court Rulings** | Searches 581 precedent rulings & tribunal orders | `/precedent related party voting` |
| **`/fact`** | **Workspace Knowledge** | Links defined terms, case facts, and Q&A cards | `/fact claim dispute` |
| **`/clause`** | **Drafting Boilerplate** | Inserts standard legal clauses (Indemnity, Termination, Arbitration) | `/clause arbitration`, `/clause indemnity` |
| **`/export`** | **Judicial Exporter** | Compiles active document into Supreme Court / NCLAT DOCX | `/export`, `/export-sc` |

---

### B. AI Chat Panel & Subagent Workflows (`@agent /command`)

Typed in the **AI Chat Sidebar** or triggered via Explorer right-click menus to invoke specialized subagents:

| Workflow Command | Target Subagent | Action Description | Example Chat Input |
|---|---|---|---|
| **`@document /draft`** | `@document` Subagent | Generates petition skeletons & court filings | `@document /draft sec7-petition`, `@document /draft slp-sc` |
| **`@forms /fill`** | `@forms` Subagent | Hydrates official IBBI/MCA form templates | `@forms /fill ibbi-h`, `@forms /fill aoc-4` |
| **`@timeline`** (or `/timeline`) | `@timeline` Subagent | Reconstructs full CIRP chronology & Frappe Gantt chart | `@timeline /timeline` |
| **`@avoidance /avoidance-scan`** | `@avoidance` Subagent | Audits case files for Sec 43/45/49/50 transactions | `@avoidance /avoidance-scan` |
| **`@coc /claims-check`** | `@coc-coordinator` Subagent | Computes debt voting shares & audits claims registry | `@coc /claims-check` |
| **`@nclt /brief`** | `@nclt` Subagent | Drafts NCLT petition synopsis & grounds summary | `@nclt /brief` |
| **`@advisor /strength`** | `@advisor` Subagent | Scores legal strength of arguments in active draft | `@advisor /strength` |
| **`@order /analyse-order`** | `@advisor` Subagent | Decodes latest tribunal order & compliance deadlines | `@order /analyse-order` |

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
