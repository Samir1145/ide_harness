# Task 3 Brief: Real-Time Audio Waveform, Web Speech/Sarvam Inquest & Barge-in Integration

**Goal:** Implement microphone speech capture, dynamic real-time audio waveform visualizer, silence detection auto-submit (~1.5s), Sarvam AI / Web Speech voice inquest bridge (`POST /api/hayagriva/voice/inquest`), and instant barge-in interrupt handling.

**Files:**
- Modify: `frontend/theia-extensions/hayagriva/src/browser/askhaya-orb.ts`
- Test: `backend/tests/test_askhaya_voice_inquest.test.js`

**Interfaces:**
- Consumes: `POST /api/hayagriva/voice/inquest`, `POST /api/hayagriva/voice/tts`, `POST /api/hayagriva/voice/stt`
- Produces: `AskHayaVoiceOrb.startListening()`, `AskHayaVoiceOrb.stopListening()`, `AskHayaVoiceOrb.submitVoiceQuery(query: string)`, `AskHayaVoiceOrb.cancel()`

**Requirements:**
1. Microphone Audio Capture:
   - Use browser `webkitSpeechRecognition` / `SpeechRecognition` with live partial interim results displayed in `#askhaya-transcript-text`.
   - Dynamic 5-bar amber audio waveform pulsing with microphone input intensity.
   - Silence auto-detection: When speech pauses for 1.5s, auto-trigger `stopListening()` and advance to `processing`.
2. Voice Inquest Pipeline:
   - Send query to `http://127.0.0.1:${apiPort}/api/hayagriva/voice/inquest`.
   - Receive `{ success: true, spokenText: string, fullDossier: string }`.
   - Save via `setLastResult()`.
   - Transition to `speaking` state.
3. Audio Playback & Barge-In:
   - Stream audio via Sarvam TTS `/api/hayagriva/voice/tts` or browser `SpeechSynthesis` fallback in offline Lite Mode.
   - **Barge-in:** Clicking anywhere on the Orb during speech instantly halts audio (`speechSynthesis.cancel()` / `audio.pause()`) and restarts listening mode immediately.
4. Fallback Inline Typing:
   - In quiet environments, typing into `#askhaya-text-fallback-input` and pressing Enter dispatches the exact same inquest flow without mic.
5. Automated test suite in `backend/tests/test_askhaya_voice_inquest.test.js`.
