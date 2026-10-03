# AskHaya Sovereign Multilingual Precedent Counsel (Sarvam + LightRAG) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the clean, zero-local-model multilingual pipeline `AskHaya -> Sarvam -> LightRAG -> Sarvam -> AskHaya`, allowing legal practitioners to query in any Indian language, receive synthesized Supreme Court/NCLAT precedent counsel in their mother tongue, and register `@AskHaya` as a 1st-class Theia AI ChatAgent.

**Architecture:** An inbound query in any Indian language (spoken or typed) is transcribed and translated by Sarvam AI into legal English. LightRAG on `http://20.198.0.59:9621` searches the 17,500+ Indian judgment knowledge graph and synthesizes an authoritative ratio and written citations. Sarvam AI translates the spoken ratio back into the practitioner's Indian language and synthesizes advocate speech via Bulbul v3, while the Theia panel displays the bilingual dossier (vernacular holding + court-ready English citations). The local LLM (port 8090) is completely removed from the precedent loop.

**Tech Stack:** Node.js (Backend), Sarvam AI API (Saaras v2 STT, Bulbul v3 TTS, Sarvam Translate), LightRAG (v1.5.8 on Azure VM), Theia AI Chat Framework (Inversify, TypeScript, Monaco).

## Global Constraints

- **Zero-Local-Model Dependency:** `@AskHaya` precedent queries must never require local LLM engine (port 8090) or llamafile; they must run 100% smoothly without it.
- **Sovereign Offline Floor:** If external network is disconnected, cleanly degrade to local bare acts vault without throwing unhandled exceptions or dumping random case file fragments.
- **Data Residency & Compliance:** No case files or client documents are transmitted to LightRAG or Sarvam; only abstract legal inquiries. Section 65B/63 BSA evidence compatibility preserved.
- **1st-Class Theia AI Chat Agent:** `@AskHaya` must be an explicitly registered ChatAgent in Theia, preventing accidental fallback to `@Advisor` or case file chunk dumps.

## Review Focus

1. **English Query Pass-through:** When a query is already in English, avoid redundant calls to Sarvam `/translate` to save latency and API cost.
2. **Script / Language Detection:** When non-Latin script (Devanagari, Tamil, Bengali, Telugu, etc.) is detected, automatically trigger translation even if the language selector is set to default.
3. **Translation Error Resilience:** If Sarvam `/translate` returns an error, the pipeline must still query LightRAG with original text rather than crashing.
4. **LightRAG Ratio Extraction:** Spoken ratio must be cleanly extracted from LightRAG's server-side answer without dangling colons or markdown noise, even without local LegalParam.
5. **Bilingual Dossier Integrity:** The dossier returned to the practitioner must clearly separate the vernacular holding from the English court-filing text so advocates can directly cite Supreme Court / NCLAT benches in court filings.

---

### Task 1: Sarvam Translation & Language Intelligence Seam

**Files:**
- Modify: `backend/lib/seams/sarvam/sarvam-client.js`
- Test: `backend/tests/test_sarvam_translation_seam.test.js`

**Interfaces:**
- Consumes: `https://api.sarvam.ai/translate`, `process.env.SARVAM_API_KEY`
- Produces: `sarvamClient.translateText({ text, sourceLanguage, targetLanguage, caseSettings }) -> Promise<{ success, translatedText, detectedSourceLanguage }>`
- Produces: `sarvamClient.detectScript(text) -> string` ('en-IN', 'hi-IN', 'ta-IN', etc.)

- [ ] **Step 1: Write unit tests in `backend/tests/test_sarvam_translation_seam.test.js`**
  - Test script detection: English vs Devanagari (Hindi) vs Tamil vs Bengali.
  - Test `translateText`: Mock API response validation, pass-through when source and target match.
  - Test error handling and graceful fallback.

- [ ] **Step 2: Run test to verify it fails**
  Run: `node backend/tests/test_sarvam_translation_seam.test.js`
  Expected: FAIL (`translateText is not a function`).

- [ ] **Step 3: Implement `detectScript` and `translateText` in `backend/lib/seams/sarvam/sarvam-client.js`**
  - Implement regex unicode block detector for Devanagari (`\u0900-\u097F`), Bengali (`\u0980-\u09FF`), Tamil (`\u0B80-\u0BFF`), Telugu (`\u0C00-\u0C7F`), Kannada (`\u0C80-\u0CFF`), Malayalam (`\u0D00-\u0D7F`), Gujarati (`\u0A80-\u0AFF`), Gurmukhi (`\u0A00-\u0A7F`).
  - Implement `translateText({ text, sourceLanguage, targetLanguage, caseSettings })` calling `POST /translate` with payload `{ input: text, source_language_code, target_language_code, mode: 'formal' }`.
  - Short-circuit: If text has only Latin characters and target is `en-IN`, return immediately without HTTP overhead.

- [ ] **Step 4: Run test to verify it passes**
  Run: `node backend/tests/test_sarvam_translation_seam.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit changes**
  Run: `git add backend/lib/seams/sarvam/sarvam-client.js backend/tests/test_sarvam_translation_seam.test.js`
  Run: `git commit -m "feat(sarvam): add translation seam and indic script detection"`

---

### Task 2: Decoupled Multilingual Precedent Pipeline in `LightRagVoiceAgent`

**Files:**
- Modify: `backend/lib/agents/lightrag-voice-agent.js`
- Test: `backend/tests/test_multilingual_voice_inquest.test.js`

**Interfaces:**
- Consumes: `sarvamClient.translateText`, `sarvamClient.synthesizeSpeech`, `lightRagClient.queryPrecedents`
- Produces: `lightRagVoiceAgent.inquire(query, options) -> Promise<{ success, spokenText, fullDossier, citations, languageCode, originalQuery, englishQuery }>`

- [ ] **Step 1: Write unit tests in `backend/tests/test_multilingual_voice_inquest.test.js`**
  - Assert that an Indic query (e.g. Hindi query) is translated to English for LightRAG.
  - Assert that local LLM (port 8090) is NOT called when LightRAG provides the answer.
  - Assert that spoken ratio is translated back into the user's language for speech synthesis.
  - Assert that `fullDossier` contains both the Vernacular Holding and Court-Ready English Citations.

- [ ] **Step 2: Run test to verify it fails**
  Run: `node backend/tests/test_multilingual_voice_inquest.test.js`
  Expected: FAIL.

- [ ] **Step 3: Refactor `inquire()` in `backend/lib/agents/lightrag-voice-agent.js`**
  - Inbound Translation: Detect if query is non-English; if so, call `sarvamClient.translateText` to obtain `englishQuery`.
  - Query LightRAG on `http://20.198.0.59:9621` using `englishQuery`.
  - Direct Ratio Extraction: Extract the first 3-4 clean sentences directly from LightRAG's server-synthesized response (removing dependency on port 8090).
  - Outbound Translation: If user's language was Indic, translate the spoken ratio to the target language via `sarvamClient.translateText`.
  - Speech Synthesis: Call `sarvamClient.synthesizeSpeech` with the target language and appropriate voice persona.
  - Format Bilingual Markdown Dossier:
    - `### 🎙️ Spoken Legal Holding ([Language])`
    - `### 🏛️ Supreme Court & Appellate Precedents (Official Court Filing Text)`
    - `#### Authoritative Citations`

- [ ] **Step 4: Run test to verify it passes**
  Run: `node backend/tests/test_multilingual_voice_inquest.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit changes**
  Run: `git add backend/lib/agents/lightrag-voice-agent.js backend/tests/test_multilingual_voice_inquest.test.js`
  Run: `git commit -m "feat(voice-agent): wire multilingual AskHaya pipeline with zero local LLM dependency"`

---

### Task 3: 1st-Class Theia ChatAgent Registration (`@AskHaya`) & Coordinator Routing

**Files:**
- Modify: `frontend/theia-extensions/hayagriva/src/browser/chat-agents.ts`
- Modify: `frontend/theia-extensions/hayagriva/src/browser/hayagriva-frontend-module.ts`
- Modify: `backend/lib/agents/agent-coordinator.js`
- Test: `backend/tests/test_askhaya_agent_routing.test.js`

**Interfaces:**
- Consumes: Theia `ChatAgent` registry, `/api/agents/chat`
- Produces: `@AskHaya` ChatAgent in left panel dropdown and autocomplete

- [ ] **Step 1: Write routing test in `backend/tests/test_askhaya_agent_routing.test.js`**
  - Verify that `coordinator.run(cDir, msg, hist, 'askhaya')` and queries prefixed with `@AskHaya` execute the multilingual precedent counsel directly and NEVER fall back to `Advisor` or raw case file chunk search.

- [ ] **Step 2: Run test to verify it fails**
  Run: `node backend/tests/test_askhaya_agent_routing.test.js`
  Expected: FAIL.

- [ ] **Step 3: Register `AskHayaChatAgent` in `chat-agents.ts` and `hayagriva-frontend-module.ts`**
  - Define `AskHayaChatAgent` in `chat-agents.ts`:
    - `id: 'AskHaya'`
    - `name: 'AskHaya'`
    - `description: 'Senior Precedent Counsel & Knowledge Graph. Ask in English or any Indian language.'`
    - `iconClass: 'codicon codicon-organization'`
  - Bind `AskHayaChatAgent` in `hayagriva-frontend-module.ts`.
  - In `agent-coordinator.js`: Update the `'askhaya'` route in `agentMap` to invoke `lightrag-voice-agent.js` directly, returning the formatted bilingual dossier without delegating to `advisor`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `node backend/tests/test_askhaya_agent_routing.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit changes**
  Run: `git add frontend/theia-extensions/hayagriva/src/browser/chat-agents.ts frontend/theia-extensions/hayagriva/src/browser/hayagriva-frontend-module.ts backend/lib/agents/agent-coordinator.js backend/tests/test_askhaya_agent_routing.test.js`
  Run: `git commit -m "feat(chat): register 1st-class @AskHaya ChatAgent and isolate coordinator routing"`

---

### Task 4: Voice Studio & Settings UI Language Controls + Verification

**Files:**
- Modify: `backend/lib/assets/settings-dashboard.html`
- Modify: `frontend/theia-extensions/hayagriva/src/browser/askhaya-orb.ts`
- Test: `backend/tests/verify_voice_orb_visual.js`

**Interfaces:**
- Consumes: `/api/hayagriva/voice/telemetry`, `/api/hayagriva/voice/config`
- Produces: Language selector dropdown (`selectVoiceLanguage`), bilingual transcript chips in AskHaya Fluid Glass Orb

- [ ] **Step 1: Add Indian Language selector in `settings-dashboard.html`**
  - Add language picker under Voice Studio endpoint settings:
    `Auto-Detect (Indic All)`, `English (en-IN)`, `Hindi (hi-IN)`, `Tamil (ta-IN)`, `Telugu (te-IN)`, `Bengali (bn-IN)`, `Marathi (mr-IN)`, `Gujarati (gu-IN)`, `Kannada (kn-IN)`, `Malayalam (ml-IN)`, `Punjabi (pa-IN)`.
  - Persist selected language in `/api/hayagriva/voice/config`.

- [ ] **Step 2: Update AskHaya Fluid Glass Orb (`askhaya-orb.ts`)**
  - Display subtle language badge when query is detected in another language (e.g. `[Hindi ➔ English]`).
  - Render bilingual response cleanly in the expanded drawer.

- [ ] **Step 3: Run full voice test suite**
  Run: `node backend/tests/test_voice_routes_phase3.test.js && node backend/tests/test_askhaya_voice_inquest.test.js && node backend/tests/test_voice_chamber_resilience.test.js`
  Expected: 100% PASS.

- [ ] **Step 4: Commit changes**
  Run: `git add backend/lib/assets/settings-dashboard.html frontend/theia-extensions/hayagriva/src/browser/askhaya-orb.ts`
  Run: `git commit -m "feat(ui): add Indian language selector and bilingual transcript rendering"`

---
