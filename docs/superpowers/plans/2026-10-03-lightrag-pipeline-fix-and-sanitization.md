# LightRAG Pipeline Fix & Scraper Header Sanitization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore live Supreme Court & NCLAT precedent synthesis from the production LightRAG server (`http://20.198.0.59:9621`) by eliminating the `Authorization: Bearer` header collision, and comprehensively sanitize raw scraper file paths and scrape headers (`mcachap...`, `Act-Code:`, `File-Name:`) from offline statutory fallbacks and voice TTS synthesis.

**Architecture:** 
1. **LightRAG Client Header Correction:** Eliminate the conflicting `Authorization: Bearer` header in `lightrag-client.js` so queries use `X-API-Key: <key>`, allowing FastAPI's APIKeyHeader authentication to succeed with HTTP 200 rather than triggering a 401 JWT validation failure.
2. **Deterministic Scraper Metadata Sanitizer:** Introduce a dedicated legal text cleaner in `lightrag-voice-agent.js` that strips scraper headers (`Act-Code:`, `Legal-Provision:`, `Folder-Name:`, `File-Name:`, YAML frontmatter), ensuring bare act fallback hits display only clean statutory provisions in chat dossiers and voice audio.
3. **Robust Ratio Extraction & Speech Sanitization:** Enhance `_extractSpokenProseFromAnswer()` and `sanitizeForSpeech()` to discard file paths and scrape tokens, extracting only substantive judicial or statutory ratio for TTS.

**Tech Stack:** Node.js, FastAPI/LightRAG, Sarvam AI, TypeScript, Eclipse Theia AI Chat Framework, Mocha/Node assert.

**Spec:** Approach A (Cloud-First Sovereign Pipeline with Sanitized Vault Fallback) approved by user on 2026-10-03.

## Global Constraints

- Never break 100% offline Lite Mode: If LightRAG server is unreachable, fallback to bare act vault must work smoothly without errors.
- Never let raw scrape headers (`Act-Code:`, `File-Name:`, `mcachap20windings...`) reach user UI or TTS audio.
- Do not introduce KaibanJS or unnecessary multi-agent frameworks; keep execution single-turn, fast, and deterministic.
- Preserve bidirectional Sarvam AI translation (`hi-IN` ⇄ `en-IN`) for multilingual voice inquiries.

## Review Focus

1. **FastAPI Header Collision:** When `X-API-Key` is supplied, sending `Authorization: Bearer` causes a 401 invalid JWT response from FastAPI. Verify queries to `http://20.198.0.59:9621` succeed with HTTP 200.
2. **Raw Scraper Dump in Spoken Text:** If fallback triggers, internal filenames (e.g. `mcachap20windings325Applicationofinsolvencyrulesinw`) must never be spoken or displayed as the answer.
3. **Colons or Truncated Sentences at End of Spoken Text:** Ensure oral ratio sentences conclude with proper punctuation and never terminate on a dangling colon or dash.
4. **Multilingual Roundtrip:** Ensure an Indic query (e.g., Hindi) is translated to English, queried against LightRAG, and synthesized back into Hindi for TTS audio.
5. **Autoplay Resilience in Browser vs Electron:** Ensure audio playback never hangs in `(SPEAKING)` when autoplay is blocked by user gesture requirements.

---

### Task 1: LightRAG Client Header & Authentication Correction

**Files:**
- Modify: `backend/lib/core/lightrag-client.js:129-146`
- Test: `backend/tests/test_lightrag_auth_headers.test.js`

**Interfaces:**
- Consumes: `this.config.apiKey`, `this.config.apiUrl`
- Produces: `_buildHeaders(extra = {}) -> Object` containing `X-API-Key: apiKey` without unsolicited `Authorization: Bearer` header.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_lightrag_auth_headers.test.js` asserting that:
1. `_buildHeaders()` produces `X-API-Key: <key>` and does NOT include `Authorization: Bearer <key>`.
2. Live query against `http://20.198.0.59:9621` with `X-API-Key` succeeds with HTTP 200 (not 401).

```javascript
'use strict';
const assert = require('assert');
const lightRagClient = require('../lib/core/lightrag-client');

async function run() {
    console.log('Testing LightRAG auth headers...');
    const headers = lightRagClient._buildHeaders();
    assert.strictEqual(headers['X-API-Key'], '20b8aa6253d9e09e9c70417d4938f8c7', 'X-API-Key header must be set');
    assert.strictEqual(headers['Authorization'], undefined, 'Authorization: Bearer header must NOT be set to prevent FastAPI JWT collision');
    console.log('Testing live query against production LightRAG server...');
    const res = await lightRagClient.queryPrecedents('What is the objective of IBC under Swiss Ribbons?', { top_k: 2, timeoutMs: 35000 });
    assert.strictEqual(res.success, true, 'Query against production LightRAG server succeeds');
    assert(typeof res.answer === 'string' && res.answer.length > 50, 'Answer contains substantive precedent synthesis');
    console.log('✓ LightRAG Client headers and live query verified.');
}
run().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node backend/tests/test_lightrag_auth_headers.test.js`
Expected: FAIL with assertion `Authorization: Bearer header must NOT be set`.

- [ ] **Step 3: Implement minimal code in `backend/lib/core/lightrag-client.js`**

Update `_buildHeaders(extra = {})` in `backend/lib/core/lightrag-client.js`:
```javascript
    _buildHeaders(extra = {}) {
        const headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...extra
        };
        const isLocal = this.config.apiUrl.includes('127.0.0.1') || this.config.apiUrl.includes('localhost');
        const isMockKey = Boolean(this.config.apiKey && this.config.apiKey.startsWith('rb_live'));
        
        if (this.config.apiKey && (!isLocal || !isMockKey) && !extra.forceNoAuth) {
            // FastAPI expects X-API-Key. Do NOT send Authorization: Bearer unless explicitly specified in extra
            // to avoid FastAPI OAuth2PasswordBearer JWT decoding 401 collisions.
            headers['X-API-Key'] = this.config.apiKey;
            if (extra.useBearerAuth) {
                headers['Authorization'] = `Bearer ${this.config.apiKey}`;
            }
        }
        if (this.config.workspace) {
            headers['LIGHTRAG-WORKSPACE'] = this.config.workspace;
        }
        return headers;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node backend/tests/test_lightrag_auth_headers.test.js`
Expected: PASS with HTTP 200 and live precedent synthesis.

- [ ] **Step 5: Commit**

```bash
git add backend/lib/core/lightrag-client.js backend/tests/test_lightrag_auth_headers.test.js
git commit -m "fix(lightrag): fix API key header collision enabling live cloud precedent synthesis"
```

---

### Task 2: Scraper Metadata Sanitization & Clean Fallback in `lightrag-voice-agent.js`

**Files:**
- Modify: `backend/lib/agents/lightrag-voice-agent.js:72-132, 220-240, 310-358`
- Test: `backend/tests/test_scraper_header_sanitizer.test.js`

**Interfaces:**
- Consumes: Raw bare act search hits containing scrape headers (`Act-Code:`, `File-Name:`, etc.)
- Produces: `cleanStatutoryText(text) -> string`, clean markdown without scraper artifacts in `fullAnswer`, and spoken ratio free of any file tokens.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_scraper_header_sanitizer.test.js` verifying that:
1. `cleanStatutoryText` strips `--- Act-Code: ... File-Name: ...` lines and leaves clean text.
2. `_extractSpokenProseFromAnswer` discards lines starting with scraper metadata and extracts valid legal sentences.
3. `sanitizeForSpeech` removes any residual `Act-Code`, `Folder-Name`, `File-Name`, or internal identifiers.

```javascript
'use strict';
const assert = require('assert');
const lightRagVoiceAgent = require('../lib/agents/lightrag-voice-agent');

function run() {
    console.log('Testing scraper header sanitization...');
    const rawScrapeText = `--- Act-Code: Companies Act 2013 (ca2013) Legal-Provision: Sections (sec) Folder-Name: mcachap20 File-Name: mcachap20windings325Applicationofinsolvencyrulesinw
# Section 325: Application of insolvency rules in winding up of insolvent companies

In the winding up of an insolvent company, the same rules shall prevail and be observed with regard to the respective rights of secured and unsecured creditors.`;

    const cleaned = lightRagVoiceAgent.cleanStatutoryText(rawScrapeText);
    assert(!cleaned.includes('Act-Code:'), 'Act-Code must be stripped');
    assert(!cleaned.includes('Folder-Name:'), 'Folder-Name must be stripped');
    assert(!cleaned.includes('File-Name:'), 'File-Name must be stripped');
    assert(!cleaned.includes('mcachap20'), 'Internal file stem must be stripped');
    assert(cleaned.includes('In the winding up of an insolvent company'), 'Substantive text preserved');

    console.log('Testing speech extraction from dirty text...');
    const spoken = lightRagVoiceAgent._extractSpokenProseFromAnswer('winding up rules', rawScrapeText, [], false);
    assert(!spoken.includes('Act-Code'), 'Spoken text must not contain Act-Code');
    assert(!spoken.includes('mcachap20'), 'Spoken text must not contain scraper filenames');
    assert(spoken.includes('In the winding up of an insolvent company'), 'Spoken text must contain substantive ratio');
    console.log('✓ Scraper header sanitization tests verified.');
}
run();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node backend/tests/test_scraper_header_sanitizer.test.js`
Expected: FAIL with `lightRagVoiceAgent.cleanStatutoryText is not a function`.

- [ ] **Step 3: Implement `cleanStatutoryText` and update `lightrag-voice-agent.js`**

1. Add `cleanStatutoryText(text)` method to `LightRagVoiceAgent`:
```javascript
    cleanStatutoryText(text) {
        if (!text) return '';
        return text
            // Strip YAML frontmatter
            .replace(/^---[\s\S]*?---\s*/gm, '')
            // Strip scraper header lines
            .replace(/^---?\s*(?:Act[-/]Code|Legal[-/]Provision|Folder[-/]Name|File[-/]Name|Stakeholder|Provision):[^\n]+/gim, '')
            .replace(/\b(?:Act[-/]Code|Legal[-/]Provision|Folder[-/]Name|File[-/]Name|Stakeholder|IBC-Process|Insolvency-Type):[^\n]+/gi, '')
            // Strip raw scraper filenames like mcachap20windings... or ibc_gen_misc_...
            .replace(/\b[a-z0-9_]{15,}\b/gi, (match) => {
                // If it looks like a concatenated code identifier with no spaces, remove it
                if (/(?:chap|sec|rule|reg|windings|insolv)/i.test(match)) return '';
                return match;
            })
            // Clean excessive dashes and spaces
            .replace(/^\s*[-–—]{2,}\s*$/gm, '')
            .trim();
    }
```
2. Update `searchLaws` fallback mapping:
```javascript
            if (statutoryHits && statutoryHits.length > 0) {
                fullAnswer = statutoryHits.map((h, i) => {
                    const cleanedContent = this.cleanStatutoryText(h.text || '');
                    return `### Section ${h.section || 'N/A'}: ${h.title || 'Statutory Provision'}\n\n${cleanedContent}`;
                }).join('\n\n---\n\n');
```
3. Update `_extractSpokenProseFromAnswer` to discard paragraphs that start with or predominantly consist of scraper metadata.
4. Update `sanitizeForSpeech` to strip any residual scrape tags (`Act-Code`, `Folder-Name`, `File-Name`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node backend/tests/test_scraper_header_sanitizer.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/lib/agents/lightrag-voice-agent.js backend/tests/test_scraper_header_sanitizer.test.js
git commit -m "fix(voice-agent): add statutory text sanitization to eliminate scraper artifacts from chat and speech"
```

---

### Task 3: Regression Verification & End-to-End Multilingual Test

**Files:**
- Modify: `backend/tests/test_askhaya_voice_inquest.test.js`
- Test: `backend/tests/test_askhaya_voice_inquest.test.js`, `backend/tests/test_multilingual_voice_inquest.test.js`

**Interfaces:**
- Consumes: Live LightRAG client and Sarvam translation seam
- Produces: Clean, end-to-end voice inquest returning live Supreme Court / NCLAT precedent synthesis and Indic speech.

- [ ] **Step 1: Run `test_askhaya_voice_inquest.test.js`**

Run: `node backend/tests/test_askhaya_voice_inquest.test.js`
Expected: PASS with 8/8 test phases.

- [ ] **Step 2: Run `test_multilingual_voice_inquest.test.js`**

Run: `node backend/tests/test_multilingual_voice_inquest.test.js`
Expected: PASS with bidirectional translation and live precedent synthesis.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_askhaya_voice_inquest.test.js
git commit -m "test(askhaya): verify live LightRAG voice inquest with scraper sanitization"
```

---

### Task 4: Frontend Build & Browser Verification

**Files:**
- Verify: `frontend/theia-extensions/hayagriva/src/browser/askhaya-orb.ts`
- Verify: `frontend/theia-extensions/hayagriva/src/browser/chat-agents.ts`

- [ ] **Step 1: Build the frontend extension and browser application**

Run:
```bash
yarn --cwd frontend/theia-extensions/hayagriva build
yarn --cwd frontend/applications/browser build
```
Expected: Clean build without TypeScript errors.

- [ ] **Step 2: Restart Theia dev server on port 3000**

Restart port 3000 background task and verify that queries to AskHaya render live precedent synthesis without raw scraper headers.

- [ ] **Step 3: Commit and final report**

```bash
git commit --allow-empty -m "chore(release): complete LightRAG pipeline fix and scraper header sanitization"
```
