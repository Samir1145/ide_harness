# Patent Agent Vault & Universal IDE Architecture Memory

## Summary & Architectural Decisions

This document serves as persistent memory for **HAYAGRIVA**'s Universal IDE Architecture, dynamic Domain Vault routing, and the **Patent Agent Vault** (`patent_agents_v1.0.zip`).

---

## 🏛️ 1. Universal IDE Model (3-Panel Architecture)

HAYAGRIVA is designed as a single, universal professional IDE that dynamically adapts to legal & technical domains based on the active project's locked domain configuration (`.hayagriva/project.json`):

1. **Left Panel (Universal Ingestion & Wiki Engine):**
   * Parses PDFs, DOCX, Scans, Audio, and Images into clean **Markdown + JSON Fact Cards**.
   * Folder context routes extracted cards to domain-specific linter and analysis engines.

2. **Center Panel (Monaco Canvas & D3 Visualizers):**
   * Renders drafting canvas (`.md`).
   * D3 Graph dynamically switches visualizers (Insolvency CIRP Timeline vs. 35 U.S.C. Patent Claim Tree vs. Litigation Precedent Graph).

3. **Right Panel (Agent OODA HUD & Slash Commands):**
   * Hot-swaps active subagents and Monaco slash commands based on the active Domain Vault.

---

## 🔒 2. Project Domain Initialization & Immutable Lock-In

* **Location:** `<WORKSPACE_ROOT>/.hayagriva/project.json`
* **First Load Wizard:** Displays an **Interactive Domain Selection Modal** showing bound agents, linters, slash commands, and statutory databases.
* **Immutable Commitment:** Once confirmed, `"locked": true` is written to `project.json`. In-app dropdown switching is permanently disabled to prevent schema corruption.
* **Reset Procedure:** To change domains, users must either **Start a New Case** in a different folder or **Delete the workspace folder / `.hayagriva/` config**.

---

## 📦 3. Patent Agent Vault Specification (`patent_agents_v1.0.zip`)

### **Build Location:**
`/Users/atulgrover/Desktop/haya_vaults/`
* **Raw Source:** `haya_vaults/raw_data/patent_agents/`
* **Compiler Script:** `haya_vaults/scripts/compile-patent-agent-vault.cjs`
* **Output Package:** `haya_vaults/output/patent_agents_v1.0.zip`

### **7 Specialist Agent Suite:**
1. **`interrogator.md` (`/interrogate`):** Invention Disclosure Interrogator.
2. **`alice_examiner.md` (`/alice-check`):** 35 U.S.C. § 101 Eligibility Analyst.
3. **`claim_drafter.md` (`/draft-claims`):** Claim Drafter & Antecedent Checker.
4. **`prior_art_analyst.md` (`/prior-art`):** § 102/103 Novelty & Obviousness Analyst.
5. **`mock_examiner.md` (`/mock-examine`):** Adversarial USPTO Mock Examiner.
6. **`prosecution_counsel.md` (`/prosecute`):** Office Action Response Agent.
7. **`figure_illustrator.md` (`/illustrate`):** Technical Drawing Description Agent.

---

## ⚡ 4. Runtime Installation Path

* **macOS:** `~/Library/Application Support/Hayagriva/vaults/patent_agents/`
* Hot-swaps slash commands directly into Monaco without restarting the application.
