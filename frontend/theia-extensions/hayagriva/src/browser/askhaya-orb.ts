import { injectable, inject, optional } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { PreferenceService } from '@theia/core/lib/common';
import { ILogger } from '@theia/core/lib/common/logger';
import { ApplicationShell } from '@theia/core/lib/browser';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { EditorManager } from '@theia/editor/lib/browser';
import URI from '@theia/core/lib/common/uri';

export type OrbState = 'idle' | 'listening' | 'processing' | 'speaking';

export interface StateChangeListener {
  (state: OrbState): void;
}

@injectable()
export class AskHayaVoiceOrb {
  protected state: OrbState = 'idle';
  protected recognition: any = null;
  protected currentSpeechUtterance: SpeechSynthesisUtterance | null = null;
  protected currentAudio: HTMLAudioElement | null = null;
  protected stateListeners: StateChangeListener[] = [];
  protected lastResult: { spokenText: string; fullDossier: string; query: string } | null = null;

  constructor(
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService,
    @inject(ILogger) protected readonly logger: ILogger,
    @inject(ApplicationShell) protected readonly shell: ApplicationShell,
    @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry,
    @inject(EditorManager) @optional() protected readonly editorManager?: EditorManager
  ) {}

  getApiPort(): number {
    return this.preferenceService.get<number>('hayagriva.apiPort', 3210);
  }

  getBackendUrl(): string {
    return `http://127.0.0.1:${this.getApiPort()}`;
  }

  protected getActiveCaseDir(): string {
    const ws = this.workspaceService.getWorkspaceRootUri(undefined);
    if (ws) {
      return decodeURIComponent(new URI(ws.toString()).path.toString());
    }
    return '';
  }

  getState(): OrbState {
    return this.state;
  }

  getLastResult(): { spokenText: string; fullDossier: string; query: string } | null {
    return this.lastResult;
  }

  setLastResult(result: { spokenText: string; fullDossier: string; query: string } | null): void {
    this.lastResult = result;
  }

  onStateChanged(listener: StateChangeListener): { dispose: () => void } {
    this.stateListeners.push(listener);
    return {
      dispose: () => {
        const idx = this.stateListeners.indexOf(listener);
        if (idx !== -1) {
          this.stateListeners.splice(idx, 1);
        }
      }
    };
  }

  initialize(): void {
    // Ensure any legacy floating orb DOM elements are removed
    const legacyRoot = document.getElementById('hayagriva-askhaya-orb-root');
    if (legacyRoot && legacyRoot.parentNode) {
      legacyRoot.parentNode.removeChild(legacyRoot);
    }
    const legacyStyles = document.getElementById('hayagriva-askhaya-orb-styles');
    if (legacyStyles && legacyStyles.parentNode) {
      legacyStyles.parentNode.removeChild(legacyStyles);
    }

    this.initSpeechRecognition();
    this.bindKeyboardShortcuts();
    this.initLightRagStatusWatcher();
    this.logger.info('[AskHayaVoiceService] In-panel voice counsel service initialized.');
  }

  protected isLightRagOnline: boolean = false;
  protected latestTelemetry: any = null;
  protected statusPollTimer: any = null;

  isLightRagConnected(): boolean {
    return this.isLightRagOnline;
  }

  getTelemetry(): any {
    return this.latestTelemetry;
  }

  isSarvamConfigured(): boolean {
    return Boolean(this.latestTelemetry?.sarvam?.configured);
  }

  async checkLightRagStatus(): Promise<boolean> {
    try {
      const res = await fetch(`${this.getBackendUrl()}/api/hayagriva/voice/telemetry`);
      if (res.ok) {
        const data = await res.json();
        this.latestTelemetry = data?.telemetry || null;
        const wasOnline = this.isLightRagOnline;
        this.isLightRagOnline = Boolean(data && data.success && data.telemetry && data.telemetry.onlineLightRag);
        if (wasOnline !== this.isLightRagOnline && this.state === 'idle') {
          this.setState('idle');
        }
      } else {
        this.isLightRagOnline = false;
        if (this.state === 'idle') {
          this.setState('idle');
        }
      }
    } catch (_) {
      this.isLightRagOnline = false;
      if (this.state === 'idle') {
        this.setState('idle');
      }
    }
    return this.isLightRagOnline;
  }

  protected initLightRagStatusWatcher(): void {
    // Initial status check
    this.checkLightRagStatus();
    // Poll telemetry every 15s to keep state accurate
    if (!this.statusPollTimer) {
      this.statusPollTimer = setInterval(() => {
        this.checkLightRagStatus();
      }, 15000);
    }
  }

  protected bindKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Alt + Space hotkey to focus AskHaya chat panel and begin voice counsel
      if (e.altKey && e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        this.openInAskHayaPanel();
        if (this.state === 'listening') {
          this.stopListening();
        } else if (this.state === 'speaking') {
          this.stopSpeaking();
        } else {
          this.startListening();
        }
      }
    });
  }

  protected initSpeechRecognition(): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.logger.warn('[AskHayaVoiceService] Web Speech API not supported in this Chromium context.');
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-IN'; // Indian English legal terminology optimization

      this.recognition.onstart = () => {
        this.setState('listening');
      };

      this.recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }

        // Live populate into Theia Chat input
        this.updateChatInputText(transcript);
      };

      this.recognition.onerror = (event: any) => {
        this.logger.warn(`[AskHayaVoiceService] Speech error: ${event.error}`);
        if (event.error === 'network') {
          this.showAirGappedNotice('Speech recognition requires an internet connection in Chromium. You are in Air-Gapped / Offline Mode: please type your query.');
        } else if (event.error === 'not-allowed') {
          this.showAirGappedNotice('Microphone access was denied. Please grant microphone permission or type your query.');
        }
        this.setState('idle');
      };

      this.recognition.onend = () => {
        if (this.state === 'listening') {
          const currentText = this.getChatInputText();
          if (currentText && currentText.trim()) {
            this.dispatchToChat(currentText.trim());
          } else {
            this.setState('idle');
          }
        }
      };
    } catch (e: any) {
      this.logger.warn(`[AskHayaVoiceService] SpeechRecognition initialization failed: ${e.message}`);
    }
  }

  cancel(): void {
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch (_) {}
    }
    this.stopSpeaking();
    this.setState('idle');
  }

  startListening(): void {
    this.stopSpeaking();
    this.openInAskHayaPanel();

    // Ensure @AskHaya prefix is visible in the chat composer
    const current = this.getChatInputText().trim();
    if (!current.startsWith('@')) {
      this.updateChatInputText('');
    }

    if (this.recognition) {
      try {
        this.recognition.start();
        return;
      } catch (_) {}
    }
    this.setState('listening');
    this.focusChatInput();
  }

  stopListening(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (_) {}
    }
    const currentText = this.getChatInputText();
    if (currentText && currentText.trim()) {
      this.dispatchToChat(currentText.trim());
    } else {
      this.setState('idle');
    }
  }

  protected updateChatInputText(text: string): void {
    const raw = (text || '').trim();
    // Always preserve and ensure @AskHaya prefix for voice inquest
    const formatted = raw ? (raw.startsWith('@') ? raw : `@AskHaya ${raw}`) : '@AskHaya ';

    // 1. Try Monaco editor inside ChatViewWidget
    const chatWidget = this.shell.getWidgets('left').find(w => w.id.includes('chat-view-widget') || w.id.includes('chat')) as any;
    if (chatWidget?.inputWidget?.editor?.document?.textEditorModel) {
      try {
        chatWidget.inputWidget.editor.document.textEditorModel.setValue(formatted);
        return;
      } catch (_) {}
    }

    // 2. Fallback to DOM textarea if present
    const textarea = document.querySelector('.theia-ChatInput textarea') as HTMLTextAreaElement;
    if (textarea) {
      try {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(textarea, formatted);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (_) {}
    }
  }

  protected getChatInputText(): string {
    const chatWidget = this.shell.getWidgets('left').find(w => w.id.includes('chat-view-widget') || w.id.includes('chat')) as any;
    if (chatWidget?.inputWidget?.editor?.document?.textEditorModel) {
      try {
        return chatWidget.inputWidget.editor.document.textEditorModel.getValue();
      } catch (_) {}
    }

    const textarea = document.querySelector('.theia-ChatInput textarea') as HTMLTextAreaElement;
    return textarea ? textarea.value : '';
  }

  protected focusChatInput(): void {
    const chatWidget = this.shell.getWidgets('left').find(w => w.id.includes('chat-view-widget') || w.id.includes('chat')) as any;
    if (chatWidget?.inputWidget?.editor) {
      try {
        chatWidget.inputWidget.editor.focus();
        return;
      } catch (_) {}
    }
    const textarea = document.querySelector('.theia-ChatInput textarea') as HTMLTextAreaElement;
    textarea?.focus();
  }

  protected showAirGappedNotice(message: string): void {
    this.openInAskHayaPanel();
    this.updateChatInputText('');
    this.focusChatInput();

    const textarea = document.querySelector('.theia-ChatInput textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.setAttribute('placeholder', message);
    }
    const micBtn = document.querySelector('.askhaya-composer-mic') as HTMLElement;
    if (micBtn) {
      micBtn.setAttribute('title', message);
    }
  }

  async dispatchToChat(queryText: string): Promise<void> {
    const clean = (queryText || '').trim();
    if (!clean || clean === '@AskHaya') {
      this.setState('idle');
      return;
    }

    // Ensure @AskHaya is explicitly prefixed so Theia Chat routing passes it to AskHayaChatAgent
    const targetQuery = clean.startsWith('@') ? clean : `@AskHaya ${clean}`;
    this.setState('processing');

    try {
      const chatWidget = this.shell.getWidgets('left').find(w => w.id.includes('chat-view-widget') || w.id.includes('chat')) as any;
      if (chatWidget && typeof chatWidget.onQuery === 'function') {
        try {
          if (chatWidget.inputWidget?.editor?.document?.textEditorModel) {
            chatWidget.inputWidget.editor.document.textEditorModel.setValue('');
          }
          await chatWidget.onQuery(targetQuery, 'mix');
          return;
        } catch (err: any) {
          this.logger.warn(`[AskHayaVoiceService] onQuery dispatch failed, routing via direct API: ${err.message}`);
        }
      }

      // Direct fallback if chat widget is not attached
      const currentCase = this.getActiveCaseDir();
      const res = await fetch(`${this.getBackendUrl()}/api/agents/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case: currentCase,
          agent: 'askhaya',
          message: targetQuery,
          mode: 'mix',
          history: []
        })
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      const responseText = data.response || 'No response returned from AskHaya.';
      const spokenText = data.spokenText ? this.cleanForSpeech(data.spokenText) : this.cleanForSpeech(responseText);
      this.lastResult = { query: targetQuery, spokenText, fullDossier: responseText };

      this.speak(spokenText);

      // Auto-open draft in Monaco if referenced
      const draftMatch = responseText.match(/(?:drafts|claims)[\/\\][a-zA-Z0-9_.\-]+\.md/i);
      if (draftMatch && this.editorManager && currentCase) {
        try {
          const relPath = draftMatch[0].replace(/\\/g, '/');
          const cleanCase = currentCase.replace(/\/+$/, '');
          const targetUri = new URI(`file://${cleanCase}/${relPath}`);
          setTimeout(() => {
            this.editorManager?.open(targetUri);
          }, 200);
        } catch (_) {}
      }
    } catch (err: any) {
      this.logger.error(`[AskHayaVoiceService] Direct agent call failed: ${err.message}`);
    } finally {
      // Guaranteed recovery: reset state to idle when processing completes unless speech actively starts
      if (this.state === 'processing') {
        this.setState('idle');
      }
    }
  }

  cleanForSpeech(text: string): string {
    if (!text) return '';
    // 1. Strip accordion details and thought logs
    let clean = text.replace(/<details[\s\S]*?<\/details>/gi, '');
    clean = clean.replace(/<[^>]*>/g, '');
    // 2. Strip code blocks and inline code
    clean = clean.replace(/```[\s\S]*?```/g, '');
    clean = clean.replace(/`([^`]+)`/g, '$1');
    // 3. Strip YAML frontmatter blocks
    clean = clean.replace(/^---[\s\S]*?---\s*/gm, '');
    clean = clean.replace(/(?:documentid|sections_referenced|datedecided|court|parties|category):[^\n]+/gi, '');
    // 4. Strip markdown headings
    clean = clean.replace(/^#{1,6}\s+.*$/gm, '');
    // 5. Clean markdown bold / italics / links / list bullets
    clean = clean.replace(/\*\*([^*]+)\*\*/g, '$1');
    clean = clean.replace(/\*([^*]+)\*/g, '$1');
    clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    clean = clean.replace(/\[(?:\d+|Source\s*#?\d+|Citation\s*#?\d+|source:[^\]]+)\]/gi, '');
    clean = clean.replace(/^\s*[-*•]\s+/gm, '');
    // 6. Expand legal abbreviations for natural speech and prevent abbreviation period splits
    clean = clean
      .replace(/\bM\/s\.\s*/gi, 'M/s ')
      .replace(/\bMessrs\.\s*/gi, 'Messrs ')
      .replace(/\bv\.\s*/gi, 'versus ')
      .replace(/\bvs\.\s*/gi, 'versus ')
      .replace(/\bSec\.\s*(\d+)/gi, 'Section $1')
      .replace(/\bSec\s*(\d+)/gi, 'Section $1')
      .replace(/\bReg\.\s*(\d+)/gi, 'Regulation $1')
      .replace(/\bReg\s*(\d+)/gi, 'Regulation $1')
      .replace(/\bLtd\.\s*/gi, 'Limited ')
      .replace(/\bPvt\.\s*/gi, 'Private ')
      .replace(/\bCo\.\s*/gi, 'Company ')
      .replace(/\bu\/s\.\s*/gi, 'under Section ')
      .replace(/\bu\/s\s*/gi, 'under Section ')
      .replace(/\bNo\.\s*/gi, 'No ')
      .replace(/\bDr\.\s*/gi, 'Dr ')
      .replace(/\bMr\.\s*/gi, 'Mr ')
      .replace(/\bMrs\.\s*/gi, 'Mrs ')
      .replace(/\bMs\.\s*/gi, 'Ms ')
      .replace(/\bAnr\.\s*/gi, 'and Another ')
      .replace(/\bOrs\.\s*/gi, 'and Others ')
      .replace(/\bHon'ble\b/gi, 'Honourable')
      .replace(/\bCoC\b/g, 'Committee of Creditors')
      .replace(/\bCIRP\b/g, 'Corporate Insolvency Resolution Process')
      .replace(/\bIBC\b/g, 'Insolvency and Bankruptcy Code')
      .replace(/\bNCLAT\b/g, 'N C L A T')
      .replace(/\bNCLT\b/g, 'N C L T')
      .replace(/\s+/g, ' ')
      .trim();

    // 7. Extract complete substantive ratio (up to ~150 words / 5-6 sentences) without hanging on colons
    const sentences = clean.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map(s => s.trim()).filter(s => s.length > 0);
    if (sentences && sentences.length > 0) {
      let result: string[] = [];
      let currentWords = 0;
      for (let i = 0; i < sentences.length; i++) {
        const s = sentences[i];
        result.push(s);
        currentWords += s.split(/\s+/).length;
        if ((i >= 3 || currentWords >= 120) && !s.endsWith(':')) {
          break;
        }
        if (i >= 5) break;
      }
      let finalSpoken = result.join(' ').trim();
      finalSpoken = finalSpoken.replace(/[:\-–—\s]+$/, '.');
      return finalSpoken;
    }
    if (clean.length > 900) {
      clean = clean.slice(0, 900).replace(/\s+\S*$/, '') + '.';
    }
    return clean.replace(/[:\-–—\s]+$/, '.');
  }

  async speak(text: string): Promise<void> {
    this.stopSpeaking();
    const cleanSpoken = this.cleanForSpeech(text);
    if (!cleanSpoken) {
      this.setState('idle');
      return;
    }

    this.setState('speaking');

    // 1. Attempt Sarvam AI Sovereign Voice synthesis (bulbul:v3 with speaker aditya)
    try {
      const currentCase = this.getActiveCaseDir();
      const ttsRes = await fetch(`${this.getBackendUrl()}/api/hayagriva/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanSpoken,
          speaker: 'aditya', // Senior Partner Advocate persona on Sarvam bulbul:v3
          case: currentCase
        })
      });

      if (ttsRes.ok) {
        const ttsData = await ttsRes.json();
        if (ttsData.audioBase64) {
          const audioUrl = `data:audio/wav;base64,${ttsData.audioBase64}`;
          const audio = new Audio(audioUrl);
          this.currentAudio = audio;
          audio.onended = () => {
            this.currentAudio = null;
            this.setState('idle');
          };
          audio.onerror = () => {
            this.currentAudio = null;
            this.setState('idle');
          };
          await audio.play();
          return;
        }
      }
    } catch (e: any) {
      this.logger.warn(`[AskHayaVoiceService] Sarvam TTS offline or failed, falling back to browser speech: ${e.message}`);
    }

    // 2. Air-gapped fallback to browser SpeechSynthesisUtterance if Sarvam is unreachable
    if (!('speechSynthesis' in window)) {
      this.setState('idle');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanSpoken);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.lang = 'en-IN';

    utterance.onend = () => {
      this.currentSpeechUtterance = null;
      this.setState('idle');
    };

    utterance.onerror = () => {
      this.currentSpeechUtterance = null;
      this.setState('idle');
    };

    this.currentSpeechUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  stopSpeaking(): void {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (_) {}
      this.currentAudio = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.currentSpeechUtterance = null;
    if (this.state === 'speaking') {
      this.setState('idle');
    }
  }

  setState(newState: OrbState): void {
    this.state = newState;
    this.stateListeners.forEach(listener => {
      try {
        listener(newState);
      } catch (_) {}
    });

    // Update in-panel button visual state directly if present in DOM
    const micBtn = document.querySelector('.askhaya-composer-mic') as HTMLElement;
    if (micBtn) {
      micBtn.classList.remove('online', 'offline', 'listening', 'processing', 'thinking', 'speaking');
      if (newState === 'listening') {
        micBtn.classList.add('listening');
        micBtn.innerHTML = '<i class="fa fa-circle" style="color: #ef4444; font-size: 11px; animation: pulse 1s infinite;"></i><span style="color: #ef4444; font-size: 11px; font-weight: 600; margin-left: 5px;">Listening…</span>';
        micBtn.setAttribute('title', 'Listening to your legal inquiry... (Click to send or stop)');
      } else if (newState === 'processing') {
        micBtn.classList.add('processing');
        micBtn.innerHTML = '<i class="fa fa-spinner fa-spin" style="color: #38bdf8; font-size: 12px;"></i><span style="color: #38bdf8; font-size: 11px; font-weight: 600; margin-left: 5px;">Researching…</span>';
        micBtn.setAttribute('title', 'Consulting LightRAG graph & bare acts...');
      } else if (newState === 'speaking') {
        micBtn.classList.add('speaking');
        micBtn.innerHTML = '<i class="fa fa-volume-up" style="color: #10b981; font-size: 13px;"></i><span style="color: #10b981; font-size: 11px; font-weight: 600; margin-left: 5px;">Advising…</span>';
        micBtn.setAttribute('title', 'Playing Sarvam AI oral ratio (Click to mute)');
      } else {
        if (this.isLightRagOnline) {
          micBtn.classList.add('online');
          micBtn.innerHTML = '<i class="fa fa-microphone" style="color: #10b981; font-size: 12px;"></i><span style="color: #10b981; font-size: 11px; font-weight: 600; margin-left: 5px;">AskHaya</span>';
          micBtn.setAttribute('title', 'AskHaya Precedent Knowledge Graph Online (HTTP 200) • Click to speak (Alt+Space) • Right-click for Settings');
        } else {
          micBtn.classList.add('offline');
          micBtn.innerHTML = '<i class="fa fa-microphone" style="color: #f59e0b; font-size: 12px;"></i><span style="color: #f59e0b; font-size: 11px; font-weight: 600; margin-left: 5px;">AskHaya</span>';
          micBtn.setAttribute('title', 'LightRAG Precedent Graph Disconnected • Click to configure URL & API Key in Settings');
        }
      }
    }
  }

  openInAskHayaPanel(): void {
    const chatWidget = this.shell.getWidgets('left').find(w => w.id.includes('chat-view-widget') || w.id.includes('chat'));
    if (chatWidget) {
      this.shell.activateWidget(chatWidget.id);
      this.shell.expandPanel('left');
    } else {
      this.shell.activateWidget('chat-view-widget');
    }
  }
}
