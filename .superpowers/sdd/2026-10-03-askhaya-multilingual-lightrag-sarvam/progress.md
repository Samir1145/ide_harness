# SDD ledger — plan: docs/superpowers/plans/2026-10-03-askhaya-multilingual-lightrag-sarvam.md

## Pre-flight Interface Scan
- Task 1 Produces: `sarvamClient.detectScript(text)`, `sarvamClient.translateText({ text, sourceLanguage, targetLanguage, caseSettings })`
- Task 2 Consumes: `sarvamClient.detectScript`, `sarvamClient.translateText`, `sarvamClient.synthesizeSpeech`, `lightRagClient.queryPrecedents`
- Task 2 Produces: `lightRagVoiceAgent.inquire(query, options)` (bilingual payload, zero local model)
- Task 3 Consumes: `lightRagVoiceAgent.inquire` in `agentMap['askhaya']` and Theia ChatAgent registry
- Task 3 Produces: `@AskHaya` ChatAgent in Theia
- Task 4 Consumes: `selectVoiceLanguage`, `/api/hayagriva/voice/config`, `/api/hayagriva/voice/telemetry`
Pre-flight check: All interfaces align cleanly.

Task 1: complete (commits 134f89a..e136384, tests: node backend/tests/test_sarvam_translation_seam.test.js → 100% pass)
Task 2: complete (commits e136384..758c915, tests: node backend/tests/test_multilingual_voice_inquest.test.js → 100% pass)
Task 3: complete (AskHayaChatAgent registered in chat-agents.ts & bound in hayagriva-frontend-module.ts, tests: node backend/tests/test_askhaya_agent_routing.test.js → 100% pass)
Task 4: complete (Voice Studio Indic language selector added in settings-dashboard.html, routes updated, end-to-end Hindi & English inquest tests → 100% pass)
