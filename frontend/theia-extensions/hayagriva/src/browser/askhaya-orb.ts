import { injectable, inject, optional } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { PreferenceService } from '@theia/core/lib/common';
import { ILogger } from '@theia/core/lib/common/logger';
import { ApplicationShell } from '@theia/core/lib/browser';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { EditorManager } from '@theia/editor/lib/browser';
import URI from '@theia/core/lib/common/uri';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

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
    this.logger.info('[AskHayaVoiceService] In-panel voice counsel service initialized.');
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

  startListening(): void {
    this.stopSpeaking();
    this.openInAskHayaPanel();

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
    // 1. Try Monaco editor inside ChatViewWidget
    const chatWidget = this.shell.getWidgets('left').find(w => w.id.includes('chat-view-widget') || w.id.includes('chat')) as any;
    if (chatWidget?.inputWidget?.editor?.document?.textEditorModel) {
      try {
        chatWidget.inputWidget.editor.document.textEditorModel.setValue(text);
        return;
      } catch (_) {}
    }

    // 2. Fallback to DOM textarea if present
    const textarea = document.querySelector('.theia-ChatInput textarea') as HTMLTextAreaElement;
    if (textarea) {
      try {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(textarea, text);
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

  async dispatchToChat(queryText: string): Promise<void> {
    this.setState('thinking');

    const chatWidget = this.shell.getWidgets('left').find(w => w.id.includes('chat-view-widget') || w.id.includes('chat')) as any;
    if (chatWidget && typeof chatWidget.onQuery === 'function') {
      try {
        // Clear input editor text before sending
        if (chatWidget.inputWidget?.editor?.document?.textEditorModel) {
          chatWidget.inputWidget.editor.document.textEditorModel.setValue('');
        }
        await chatWidget.onQuery(queryText, 'mix');
        return;
      } catch (err: any) {
        this.logger.warn(`[AskHayaVoiceService] onQuery dispatch failed, routing via direct API: ${err.message}`);
      }
    }

    // Direct fallback if chat widget is not attached
    const currentCase = this.getActiveCaseDir();
    try {
      const res = await fetch(`${this.getBackendUrl()}/api/agents/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case: currentCase,
          agent: 'askhaya',
          message: queryText,
          mode: 'mix',
          history: []
        })
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      const responseText = data.response || 'No response returned from AskHaya.';
      const spokenText = data.spokenText ? this.cleanForSpeech(data.spokenText) : this.cleanForSpeech(responseText);
      this.lastResult = { query: queryText, spokenText, fullDossier: responseText };

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
      this.setState('idle');
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
    // 6. Expand legal abbreviations for natural speech
    clean = clean.replace(/\bv\.\s*/gi, 'versus ')
      .replace(/\bvs\.\s*/gi, 'versus ')
      .replace(/\bSec\.\s*(\d+)/gi, 'Section $1')
      .replace(/\bCoC\b/g, 'Committee of Creditors')
      .replace(/\bCIRP\b/g, 'Corporate Insolvency Resolution Process')
      .replace(/\bIBC\b/g, 'Insolvency and Bankruptcy Code')
      .replace(/\bNCLAT\b/g, 'N C L A T')
      .replace(/\bNCLT\b/g, 'N C L T')
      .replace(/\s+/g, ' ')
      .trim();

    // 7. Limit to first 2-3 sentences max (~350 chars) for an operative oral ratio response
    const sentences = clean.match(/[^.!?]+[.!?]+/g);
    if (sentences && sentences.length > 0) {
      clean = sentences.slice(0, 3).join(' ').trim();
    }
    if (clean.length > 350) {
      clean = clean.slice(0, 350).replace(/\s+\S*$/, '') + '.';
    }
    return clean;
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
    const micBtn = document.querySelector('.askhaya-composer-mic');
    if (micBtn) {
      if (newState === 'listening') {
        micBtn.innerHTML = '<i class="fa fa-circle" style="color: #ef4444; font-size: 11px; animation: pulse 1s infinite;"></i><span style="color: #ef4444; font-size: 11px; font-weight: 600; margin-left: 5px;">Listening…</span>';
        micBtn.setAttribute('title', 'Listening to your legal inquiry... (Click to send or stop)');
      } else if (newState === 'thinking') {
        micBtn.innerHTML = '<i class="fa fa-spinner fa-spin" style="color: #38bdf8; font-size: 12px;"></i><span style="color: #38bdf8; font-size: 11px; font-weight: 600; margin-left: 5px;">Researching…</span>';
        micBtn.setAttribute('title', 'Consulting LightRAG graph & bare acts...');
      } else if (newState === 'speaking') {
        micBtn.innerHTML = '<i class="fa fa-volume-up" style="color: #10b981; font-size: 13px;"></i><span style="color: #10b981; font-size: 11px; font-weight: 600; margin-left: 5px;">Advising…</span>';
        micBtn.setAttribute('title', 'Playing Sarvam AI oral ratio (Click to mute)');
      } else {
        micBtn.innerHTML = '<i class="fa fa-microphone" style="color: #f59e0b; font-size: 13px;"></i><span style="color: #fbbf24; font-size: 11px; font-weight: 600; margin-left: 5px;">AskHaya</span>';
        micBtn.setAttribute('title', 'Speak to AskHaya Senior Counsel (Voice Inquest / Alt+Space)');
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
