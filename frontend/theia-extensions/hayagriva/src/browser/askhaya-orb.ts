import { injectable, inject, optional } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { PreferenceService } from '@theia/core/lib/common';
import { ILogger } from '@theia/core/lib/common/logger';
import { ApplicationShell } from '@theia/core/lib/browser';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { EditorManager } from '@theia/editor/lib/browser';
import URI from '@theia/core/lib/common/uri';

export type OrbState = 'idle' | 'listening' | 'processing' | 'speaking' | 'answered';

export interface StateChangeListener {
  (state: OrbState): void;
}

@injectable()
export class AskHayaVoiceOrb {
  protected state: OrbState = 'idle';
  protected recognition: any = null;
  protected currentSpeechUtterance: SpeechSynthesisUtterance | null = null;
  protected currentAudio: HTMLAudioElement | null = null;
  protected audioContext: AudioContext | null = null;
  protected currentAudioSource: AudioBufferSourceNode | null = null;
  protected lastAudioBase64: string | null = null;
  protected unlockedAudioElement: HTMLAudioElement | null = null;
  protected stateListeners: StateChangeListener[] = [];
  protected lastResult: { spokenText: string; fullDossier: string; query: string } | null = null;
  protected silenceTimer: any = null;
  protected accumulatedTranscript: string = '';

  // DOM Mount & Drag Physics State
  protected domRoot: HTMLElement | null = null;
  protected styleElement: HTMLStyleElement | null = null;
  protected isDragging: boolean = false;
  protected dragStartX: number = 0;
  protected dragStartY: number = 0;
  protected orbStartX: number = 0;
  protected orbStartY: number = 0;
  protected hasDragged: boolean = false;
  protected posX: number = 0;
  protected posY: number = 0;

  // Telemetry & Status
  protected isLightRagOnline: boolean = false;
  protected latestTelemetry: any = null;
  protected statusPollTimer: any = null;

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
    this.mountDom();
    this.initSpeechRecognition();
    this.bindKeyboardShortcuts();
    this.initLightRagStatusWatcher();
    this.logger.info('[AskHayaVoiceService] Ambient Amber Voice Orb initialized & mounted.');
  }

  ensureAudioUnlocked(): void {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        if (!this.audioContext || this.audioContext.state === 'closed') {
          this.audioContext = new AudioCtx();
        }
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume().catch(() => {});
        }
      }
      if (!this.unlockedAudioElement && typeof Audio !== 'undefined') {
        this.unlockedAudioElement = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
        this.unlockedAudioElement.volume = 0.01;
      }
      if (this.unlockedAudioElement) {
        const p = this.unlockedAudioElement.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            if (this.unlockedAudioElement) {
              this.unlockedAudioElement.pause();
              this.unlockedAudioElement.currentTime = 0;
            }
          }).catch(() => {});
        }
      }
    } catch (_) {}
  }

  // ── DOM Mount & Glassmorphic UI ─────────────────────────────────────────────

  mountDom(): void {
    if (typeof document === 'undefined') {
      return;
    }

    // Clean up any existing instances first
    const existingRoot = document.getElementById('hayagriva-askhaya-orb-root');
    if (existingRoot && existingRoot.parentNode) {
      existingRoot.parentNode.removeChild(existingRoot);
    }
    const existingStyles = document.getElementById('hayagriva-askhaya-orb-styles');
    if (existingStyles && existingStyles.parentNode) {
      existingStyles.parentNode.removeChild(existingStyles);
    }

    // 1. Inject Styles
    this.styleElement = document.createElement('style');
    this.styleElement.id = 'hayagriva-askhaya-orb-styles';
    this.styleElement.textContent = this.getOrbCss();
    if (document.head) {
      document.head.appendChild(this.styleElement);
    } else if (document.body) {
      document.body.appendChild(this.styleElement);
    }

    // 2. Create Root Element
    const root = document.createElement('div');
    root.id = 'hayagriva-askhaya-orb-root';
    root.className = 'hayagriva-askhaya-orb orb-idle';
    root.setAttribute('title', 'AskHaya Ambient Voice Counsel (Alt+Space)');

    root.innerHTML = `
      <div class="orb-glass-surface">
        <div class="orb-glyph-container" id="askhaya-glyph-btn" title="AskHaya Voice Counsel (Alt+Space)">
          <div class="orb-glyph hayagriva-horse-icon"></div>
          <div class="orb-status-ring"></div>
        </div>
        <div class="orb-content-container">
          <div class="orb-header-row">
            <div class="orb-indicator-dot"></div>
            <div class="orb-state-label" id="askhaya-state-label">AskHaya Counsel</div>
            <div class="orb-waveform" id="askhaya-waveform-container">
              <span class="wave-bar bar-1"></span>
              <span class="wave-bar bar-2"></span>
              <span class="wave-bar bar-3"></span>
              <span class="wave-bar bar-4"></span>
              <span class="wave-bar bar-5"></span>
            </div>
            <div class="orb-header-actions">
              <button class="orb-btn orb-btn-panel" id="askhaya-btn-panel" title="Open AskHaya Panel (Alt+Space)">
                <i class="fa fa-columns"></i>
              </button>
              <button class="orb-btn orb-btn-close" id="askhaya-btn-close" title="Close / Cancel">
                <i class="fa fa-times"></i>
              </button>
            </div>
          </div>
          <div class="orb-body-row">
            <div class="orb-transcript" id="askhaya-transcript-text">Listening to your inquiry...</div>
            <div class="orb-spoken-text" id="askhaya-spoken-text"></div>
          </div>
          <div class="orb-footer-row">
            <div class="orb-footer-actions">
              <button class="orb-action-btn orb-btn-mic" id="askhaya-action-mic" title="Speak or Stop">
                <i class="fa fa-microphone"></i> <span>Speak</span>
              </button>
              <button class="orb-action-btn orb-btn-play" id="askhaya-action-play" title="Play or Replay Spoken Audio">
                <i class="fa fa-volume-up"></i> <span>Play</span>
              </button>
              <button class="orb-action-btn orb-btn-dossier" id="askhaya-action-dossier" title="View Full Legal Dossier">
                <i class="fa fa-file-text-o"></i> <span>Dossier</span>
              </button>
              <button class="orb-action-btn orb-btn-insert" id="askhaya-action-insert" title="Insert into Editor">
                <i class="fa fa-clipboard"></i> <span>Insert</span>
              </button>
              <button class="orb-action-btn orb-btn-cancel" id="askhaya-action-cancel" title="Cancel">
                <i class="fa fa-stop"></i> <span>Stop</span>
              </button>
            </div>
            <input type="text" class="orb-fallback-input" id="askhaya-text-fallback-input" placeholder="Type inquiry or press Enter..." />
          </div>
        </div>
      </div>
    `;

    if (document.body) {
      document.body.appendChild(root);
    }
    this.domRoot = root;

    this.restorePosition();
    this.setupDraggability();
    this.setupEventListeners();
  }

  // ── Drag & Viewport Bounds Physics ──────────────────────────────────────────

  clampPosition(x: number, y: number, width?: number, height?: number): { x: number; y: number } {
    let w = width;
    let h = height;

    if (!w || !h) {
      if (this.domRoot && typeof this.domRoot.getBoundingClientRect === 'function') {
        const rect = this.domRoot.getBoundingClientRect();
        w = w || rect.width || 44;
        h = h || rect.height || 44;
      } else {
        if (this.state === 'listening') {
          w = w || 280;
          h = h || 80;
        } else if (this.state === 'processing') {
          w = w || 280;
          h = h || 74;
        } else if (this.state === 'speaking' || this.state === 'answered') {
          w = w || 375;
          h = h || 125;
        } else {
          w = w || 44;
          h = h || 44;
        }
      }
    }

    const winW = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 1080;
    const minX = 8;
    const minY = 8;
    const maxX = Math.max(minX, winW - w - 8);
    const maxY = Math.max(minY, winH - h - 32); // preserves bottom 32px clearance for status bar

    return {
      x: Math.min(Math.max(minX, x), maxX),
      y: Math.min(Math.max(minY, y), maxY)
    };
  }

  setPosition(x: number, y: number): void {
    const clamped = this.clampPosition(x, y);
    this.posX = clamped.x;
    this.posY = clamped.y;
    if (this.domRoot) {
      this.domRoot.style.left = `${this.posX}px`;
      this.domRoot.style.top = `${this.posY}px`;
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('haya_voice_orb_pos', JSON.stringify({ x: this.posX, y: this.posY }));
      }
    } catch (_) {}
  }

  protected restorePosition(): void {
    let restored = false;
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('haya_voice_orb_pos');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
            this.setPosition(parsed.x, parsed.y);
            restored = true;
          }
        }
      }
    } catch (_) {}

    if (!restored) {
      const winW = typeof window !== 'undefined' ? window.innerWidth : 1920;
      const winH = typeof window !== 'undefined' ? window.innerHeight : 1080;
      this.setPosition(winW - 70, winH - 90);
    }
  }

  protected setupDraggability(): void {
    if (!this.domRoot) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;

      const target = e.target as HTMLElement;
      if (target && (target.closest('button') || target.closest('input') || target.closest('.orb-btn') || target.closest('.orb-action-btn'))) {
        return;
      }

      this.isDragging = true;
      this.hasDragged = false;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.orbStartX = this.posX;
      this.orbStartY = this.posY;

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!this.isDragging) return;
        const dx = moveEvent.clientX - this.dragStartX;
        const dy = moveEvent.clientY - this.dragStartY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          this.hasDragged = true;
        }
        const rawX = this.orbStartX + dx;
        const rawY = this.orbStartY + dy;
        const clamped = this.clampPosition(rawX, rawY);
        this.posX = clamped.x;
        this.posY = clamped.y;
        if (this.domRoot) {
          this.domRoot.style.left = `${this.posX}px`;
          this.domRoot.style.top = `${this.posY}px`;
        }
      };

      const onMouseUp = () => {
        if (this.isDragging) {
          this.isDragging = false;
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('haya_voice_orb_pos', JSON.stringify({ x: this.posX, y: this.posY }));
            }
          } catch (_) {}
        }
        if (typeof window !== 'undefined') {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        }
      };

      if (typeof window !== 'undefined') {
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      }
    };

    this.domRoot.addEventListener('mousedown', (e: MouseEvent) => {
      this.ensureAudioUnlocked();
      onMouseDown(e);
    });
  }

  protected setupEventListeners(): void {
    if (!this.domRoot) return;

    // Click on orb root
    this.domRoot.addEventListener('click', (e: MouseEvent) => {
      this.ensureAudioUnlocked();
      if (this.hasDragged) {
        this.hasDragged = false;
        return;
      }
      const target = e.target as HTMLElement;
      if (target && (target.closest('button') || target.closest('input') || target.closest('.orb-btn') || target.closest('.orb-action-btn'))) {
        return;
      }

      if (this.state === 'idle') {
        this.startListening();
      } else if (this.state === 'speaking') {
        // Instant barge-in interrupt: stop speaking and restart listening
        this.stopSpeaking();
        this.startListening();
      } else if (this.state === 'answered') {
        this.startListening();
      }
    });

    // Panel open button
    const panelBtn = this.domRoot.querySelector('#askhaya-btn-panel');
    if (panelBtn) {
      panelBtn.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        this.ensureAudioUnlocked();
        this.openInAskHayaPanel();
      });
    }

    // Close / Cancel button
    const closeBtn = this.domRoot.querySelector('#askhaya-btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        this.cancel();
      });
    }

    // Mic action button
    const actionMic = this.domRoot.querySelector('#askhaya-action-mic');
    if (actionMic) {
      actionMic.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        this.ensureAudioUnlocked();
        if (this.state === 'listening') {
          this.stopListening();
        } else {
          this.startListening();
        }
      });
    }

    // Play / Replay action button
    const actionPlay = this.domRoot.querySelector('#askhaya-action-play');
    if (actionPlay) {
      actionPlay.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        this.ensureAudioUnlocked();
        if (this.state === 'speaking') {
          this.stopSpeaking();
        } else if (this.lastAudioBase64) {
          this.playAudioPayload(this.lastAudioBase64).catch(err => {
            this.logger.warn(`[AskHayaVoiceService] Replay error: ${err}`);
          });
        } else if (this.lastResult?.spokenText) {
          this.speak(this.lastResult.spokenText);
        }
      });
    }

    // Dossier action button
    const actionDossier = this.domRoot.querySelector('#askhaya-action-dossier');
    if (actionDossier) {
      actionDossier.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        this.openInAskHayaPanel();
      });
    }

    // Insert action button
    const actionInsert = this.domRoot.querySelector('#askhaya-action-insert');
    if (actionInsert) {
      actionInsert.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        this.insertDossierIntoEditor();
      });
    }

    // Cancel action button
    const actionCancel = this.domRoot.querySelector('#askhaya-action-cancel');
    if (actionCancel) {
      actionCancel.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        if (this.state === 'speaking') {
          this.stopSpeaking();
        } else {
          this.cancel();
        }
      });
    }

    // Fallback text input
    const fallbackInput = this.domRoot.querySelector('#askhaya-text-fallback-input') as HTMLInputElement;
    if (fallbackInput) {
      fallbackInput.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          const val = fallbackInput.value ? fallbackInput.value.trim() : '';
          if (val) {
            fallbackInput.value = '';
            this.submitVoiceQuery(val);
          }
        }
      });
    }

    // Window resize listener
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        if (this.domRoot) {
          const clamped = this.clampPosition(this.posX, this.posY);
          this.posX = clamped.x;
          this.posY = clamped.y;
          this.domRoot.style.left = `${this.posX}px`;
          this.domRoot.style.top = `${this.posY}px`;
        }
      });
    }
  }

  protected updateTranscriptDisplay(text: string): void {
    if (this.domRoot) {
      const transcriptEl = this.domRoot.querySelector('#askhaya-transcript-text') as HTMLElement;
      if (transcriptEl) {
        transcriptEl.textContent = text || 'Listening to your inquiry...';
      }
    }
  }

  protected updateSpokenDisplay(text: string): void {
    if (this.domRoot) {
      const spokenEl = this.domRoot.querySelector('#askhaya-spoken-text') as HTMLElement;
      if (spokenEl) {
        spokenEl.textContent = text || '';
      }
    }
  }

  protected getOrbCss(): string {
    return `
      #hayagriva-askhaya-orb-root {
        position: fixed;
        z-index: 99999;
        width: 44px;
        height: 44px;
        border-radius: 22px;
        background: rgba(22, 17, 13, 0.88);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(245, 158, 11, 0.35);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45), 0 0 16px rgba(245, 158, 11, 0.2);
        color: #f3f4f6;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        box-sizing: border-box;
        overflow: hidden;
        cursor: grab;
        user-select: none;
        transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                    height 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                    border-radius 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                    box-shadow 0.3s ease,
                    border-color 0.3s ease,
                    background 0.3s ease;
      }

      #hayagriva-askhaya-orb-root:active {
        cursor: grabbing;
      }

      /* 4-State Dimensions & Aesthetics */
      #hayagriva-askhaya-orb-root.orb-idle {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border-color: rgba(245, 158, 11, 0.35);
      }

      #hayagriva-askhaya-orb-root.orb-listening {
        width: 280px;
        height: 80px;
        border-radius: 20px;
        border-color: rgba(239, 68, 68, 0.6);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(239, 68, 68, 0.3);
      }

      #hayagriva-askhaya-orb-root.orb-processing {
        width: 280px;
        height: 74px;
        border-radius: 20px;
        border-color: rgba(56, 189, 248, 0.6);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(56, 189, 248, 0.3);
      }

      #hayagriva-askhaya-orb-root.orb-speaking {
        width: 375px;
        height: 115px;
        border-radius: 20px;
        border-color: rgba(16, 185, 129, 0.6);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 24px rgba(16, 185, 129, 0.3);
      }

      #hayagriva-askhaya-orb-root.orb-answered {
        width: 375px;
        height: auto;
        min-height: 125px;
        max-height: 260px;
        border-radius: 20px;
        border-color: rgba(16, 185, 129, 0.6);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55), 0 0 20px rgba(16, 185, 129, 0.25);
      }

      /* Inner Surface & Layout */
      #hayagriva-askhaya-orb-root .orb-glass-surface {
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        padding: 0;
        box-sizing: border-box;
      }

      #hayagriva-askhaya-orb-root .orb-glyph-container {
        position: absolute;
        left: 0;
        top: 0;
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        z-index: 2;
        cursor: pointer;
      }

      #hayagriva-askhaya-orb-root .orb-glyph {
        width: 24px;
        height: 24px;
        color: #f59e0b;
        filter: drop-shadow(0 0 6px rgba(245, 158, 11, 0.8));
        animation: orb-amber-pulse 3s infinite ease-in-out;
      }

      #hayagriva-askhaya-orb-root .orb-content-container {
        display: none;
        flex-direction: column;
        width: 100%;
        height: 100%;
        padding: 8px 12px 8px 48px;
        box-sizing: border-box;
        justify-content: space-between;
      }

      #hayagriva-askhaya-orb-root:not(.orb-idle) .orb-content-container {
        display: flex;
      }

      /* Header Row */
      .orb-header-row {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
      }

      .orb-indicator-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #f59e0b;
      }

      .orb-listening .orb-indicator-dot {
        background: #ef4444;
        animation: orb-dot-pulse 1s infinite;
      }

      .orb-processing .orb-indicator-dot {
        background: #38bdf8;
        animation: orb-dot-pulse 1s infinite;
      }

      .orb-speaking .orb-indicator-dot {
        background: #10b981;
        animation: orb-dot-pulse 1.5s infinite;
      }

      .orb-state-label {
        font-size: 11px;
        font-weight: 600;
        color: #f59e0b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        flex-grow: 1;
      }

      .orb-listening .orb-state-label { color: #ef4444; }
      .orb-processing .orb-state-label { color: #38bdf8; }
      .orb-speaking .orb-state-label { color: #10b981; }
      .orb-answered .orb-state-label { color: #10b981; }

      /* Waveform */
      .orb-waveform {
        display: none;
        align-items: center;
        gap: 2px;
        height: 14px;
      }

      .orb-listening .orb-waveform,
      .orb-speaking .orb-waveform {
        display: flex;
      }

      .wave-bar {
        width: 3px;
        height: 4px;
        background: #f59e0b;
        border-radius: 2px;
        animation: orb-wave-bar 1.2s infinite ease-in-out;
      }

      .orb-listening .wave-bar { background: #ef4444; }
      .orb-speaking .wave-bar { background: #10b981; }

      .wave-bar.bar-1 { animation-delay: 0.0s; height: 6px; }
      .wave-bar.bar-2 { animation-delay: 0.2s; height: 12px; }
      .wave-bar.bar-3 { animation-delay: 0.4s; height: 16px; }
      .wave-bar.bar-4 { animation-delay: 0.1s; height: 10px; }
      .wave-bar.bar-5 { animation-delay: 0.3s; height: 8px; }

      .orb-header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .orb-btn {
        background: transparent;
        border: none;
        color: rgba(243, 244, 246, 0.7);
        cursor: pointer;
        padding: 2px 4px;
        font-size: 11px;
        border-radius: 4px;
        transition: all 0.2s;
      }

      .orb-btn:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.15);
      }

      /* Body & Transcript */
      .orb-body-row {
        width: 100%;
        overflow: hidden;
        max-height: 48px;
      }

      .orb-transcript, .orb-spoken-text {
        font-size: 11.5px;
        color: #e5e7eb;
        line-height: 1.35;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      .orb-spoken-text {
        display: none;
        color: #d1fae5;
      }

      .orb-speaking .orb-transcript,
      .orb-answered .orb-transcript { display: none; }
      .orb-speaking .orb-spoken-text,
      .orb-answered .orb-spoken-text {
        display: -webkit-box;
        -webkit-line-clamp: 5;
        max-height: 95px;
        overflow-y: auto;
        user-select: text;
        cursor: text;
      }

      /* Footer / Actions */
      .orb-footer-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        gap: 6px;
      }

      .orb-footer-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .orb-action-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #e5e7eb;
        border-radius: 4px;
        font-size: 10.5px;
        padding: 2px 8px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: all 0.2s;
      }

      .orb-action-btn:hover {
        background: rgba(255, 255, 255, 0.18);
        border-color: rgba(245, 158, 11, 0.5);
      }

      .orb-btn-play {
        display: none;
      }

      .orb-speaking .orb-btn-play,
      .orb-answered .orb-btn-play {
        display: inline-flex;
        border-color: rgba(56, 189, 248, 0.4);
        color: #7dd3fc;
      }

      .orb-btn-dossier {
        display: none;
      }

      .orb-speaking .orb-btn-dossier,
      .orb-answered .orb-btn-dossier {
        display: inline-flex;
        border-color: rgba(16, 185, 129, 0.4);
        color: #6ee7b7;
      }

      .orb-btn-insert {
        display: none;
      }

      .orb-speaking .orb-btn-insert,
      .orb-answered .orb-btn-insert {
        display: inline-flex;
        border-color: rgba(245, 158, 11, 0.4);
        color: #fbbf24;
      }

      .orb-fallback-input {
        display: none;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        color: #fff;
        font-size: 10.5px;
        padding: 2px 6px;
        width: 100%;
        box-sizing: border-box;
        outline: none;
      }

      .orb-fallback-input:focus {
        border-color: #f59e0b;
      }

      /* Keyframe Animations */
      @keyframes orb-amber-pulse {
        0%, 100% { filter: drop-shadow(0 0 4px rgba(245, 158, 11, 0.6)); transform: scale(1); }
        50% { filter: drop-shadow(0 0 10px rgba(245, 158, 11, 0.9)); transform: scale(1.05); }
      }

      @keyframes orb-dot-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(0.85); }
      }

      @keyframes orb-wave-bar {
        0%, 100% { height: 4px; }
        50% { height: 14px; }
      }
    `;
  }

  // ── Telemetry & Connection Status ──────────────────────────────────────────

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
    this.checkLightRagStatus();
    if (!this.statusPollTimer) {
      this.statusPollTimer = setInterval(() => {
        this.checkLightRagStatus();
      }, 15000);
    }
  }

  protected bindKeyboardShortcuts(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        this.toggleVoiceOrb();
      }
    });
  }

  // ── Speech Recognition & Audio Pipeline ─────────────────────────────────────

  protected clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  protected resetSilenceTimer(): void {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      if (this.state === 'listening') {
        const text = (this.accumulatedTranscript || this.getChatInputText() || '').replace(/^@AskHaya\s*/i, '').trim();
        if (text) {
          this.stopListening();
        }
      }
    }, 1500);
  }

  protected initSpeechRecognition(): void {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.logger.warn('[AskHayaVoiceService] Web Speech API not supported in this Chromium context.');
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-IN';

      this.recognition.onstart = () => {
        this.setState('listening');
        this.clearSilenceTimer();
      };

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const current = (finalTranscript || interimTranscript || '').trim();
        if (current) {
          this.accumulatedTranscript = current;
          this.updateChatInputText(current);
          this.updateTranscriptDisplay(current);
          this.resetSilenceTimer();
        }
      };

      this.recognition.onerror = (event: any) => {
        this.logger.warn(`[AskHayaVoiceService] Speech error: ${event.error}`);
        this.clearSilenceTimer();
        if (event.error === 'network') {
          this.showAirGappedNotice('Speech recognition requires an internet connection in Chromium. You are in Air-Gapped / Offline Mode: please type your query.');
        } else if (event.error === 'not-allowed') {
          this.showAirGappedNotice('Microphone access was denied. Please grant microphone permission or type your query.');
        }
        this.setState('idle');
      };

      this.recognition.onend = () => {
        this.clearSilenceTimer();
        if (this.state === 'listening') {
          const recognized = this.accumulatedTranscript ? this.accumulatedTranscript.trim() : '';
          const currentText = recognized || this.getChatInputText().replace(/^@AskHaya\s*/i, '').trim();
          if (currentText) {
            this.submitVoiceQuery(currentText);
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
    this.clearSilenceTimer();
    this.accumulatedTranscript = '';
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch (_) {}
    }
    this.stopSpeaking();
    this.setState('idle');
  }

  startListening(): void {
    this.ensureAudioUnlocked();
    // Instant barge-in interrupt: stop active audio immediately
    this.stopSpeaking();
    this.clearSilenceTimer();
    this.accumulatedTranscript = '';
    this.openInAskHayaPanel();

    const current = this.getChatInputText().trim();
    if (!current.startsWith('@')) {
      this.updateChatInputText('');
    }

    this.updateTranscriptDisplay('Listening to your legal inquiry...');

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
    this.clearSilenceTimer();
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (_) {}
    }
    const recognized = this.accumulatedTranscript ? this.accumulatedTranscript.trim() : '';
    const chatInput = this.getChatInputText();
    const cleanChat = chatInput ? chatInput.replace(/^@AskHaya\s*/i, '').trim() : '';
    const query = recognized || cleanChat;

    if (query) {
      this.submitVoiceQuery(query);
    } else {
      this.setState('idle');
    }
  }

  async submitVoiceQuery(query: string): Promise<void> {
    const clean = (query || '').replace(/^@AskHaya\s*/i, '').trim();
    if (!clean) {
      this.setState('idle');
      return;
    }

    this.clearSilenceTimer();
    this.stopSpeaking();
    this.setState('processing');
    this.updateTranscriptDisplay(clean);

    try {
      const currentCase = this.getActiveCaseDir();
      const res = await fetch(`${this.getBackendUrl()}/api/hayagriva/voice/inquest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: clean,
          case: currentCase,
          top_k: 4,
          mode: 'mix'
        })
      });

      if (!res.ok) {
        throw new Error(`Inquest endpoint returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const spokenText = data.spokenText ? this.cleanForSpeech(data.spokenText) : (data.response ? this.cleanForSpeech(data.response) : 'No response returned from Voice Inquest.');
      const fullDossier = data.fullDossier || data.response || spokenText;

      this.setLastResult({
        query: clean,
        spokenText,
        fullDossier
      });

      await this.speak(spokenText);

      // Sync with active editor if draft was cited
      const draftMatch = fullDossier.match(/(?:drafts|claims)[\/\\][a-zA-Z0-9_.\-]+\.md/i);
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
      this.logger.error(`[AskHayaVoiceService] Voice inquest failed: ${err.message}`);
      // Fallback to chat if inquest failed
      try {
        await this.dispatchToChat(clean);
      } catch (_) {
        if (this.state === 'processing') {
          this.setState('idle');
        }
      }
    }
  }

  protected updateChatInputText(text: string): void {
    const raw = (text || '').trim();
    const formatted = raw ? (raw.startsWith('@') ? raw : `@AskHaya ${raw}`) : '@AskHaya ';

    const chatWidget = this.shell.getWidgets('left').find(w => w.id.includes('chat-view-widget') || w.id.includes('chat')) as any;
    if (chatWidget?.inputWidget?.editor?.document?.textEditorModel) {
      try {
        chatWidget.inputWidget.editor.document.textEditorModel.setValue(formatted);
        return;
      } catch (_) {}
    }

    if (typeof document !== 'undefined') {
      const textarea = document.querySelector('.theia-ChatInput textarea') as HTMLTextAreaElement;
      if (textarea) {
        try {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
          setter?.call(textarea, formatted);
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (_) {}
      }
    }
  }

  protected getChatInputText(): string {
    const chatWidget = this.shell.getWidgets('left').find(w => w.id.includes('chat-view-widget') || w.id.includes('chat')) as any;
    if (chatWidget?.inputWidget?.editor?.document?.textEditorModel) {
      try {
        return chatWidget.inputWidget.editor.document.textEditorModel.getValue();
      } catch (_) {}
    }

    if (typeof document !== 'undefined') {
      const textarea = document.querySelector('.theia-ChatInput textarea') as HTMLTextAreaElement;
      return textarea ? textarea.value : '';
    }
    return '';
  }

  protected focusChatInput(): void {
    const chatWidget = this.shell.getWidgets('left').find(w => w.id.includes('chat-view-widget') || w.id.includes('chat')) as any;
    if (chatWidget?.inputWidget?.editor) {
      try {
        chatWidget.inputWidget.editor.focus();
        return;
      } catch (_) {}
    }
    if (typeof document !== 'undefined') {
      const textarea = document.querySelector('.theia-ChatInput textarea') as HTMLTextAreaElement;
      textarea?.focus();
    }
  }

  protected showAirGappedNotice(message: string): void {
    this.openInAskHayaPanel();
    this.updateChatInputText('');
    this.focusChatInput();

    if (typeof document !== 'undefined') {
      const textarea = document.querySelector('.theia-ChatInput textarea') as HTMLTextAreaElement;
      if (textarea) {
        textarea.setAttribute('placeholder', message);
      }
      const micBtn = document.querySelector('.askhaya-composer-mic') as HTMLElement;
      if (micBtn) {
        micBtn.setAttribute('title', message);
      }
    }
  }

  async dispatchToChat(queryText: string): Promise<void> {
    const clean = (queryText || '').trim();
    if (!clean || clean === '@AskHaya') {
      this.setState('idle');
      return;
    }

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
      if (this.state === 'processing') {
        this.setState('idle');
      }
    }
  }

  cleanForSpeech(text: string): string {
    if (!text) return '';
    let clean = text.replace(/<details[\s\S]*?<\/details>/gi, '');
    clean = clean.replace(/<[^>]*>/g, '');
    clean = clean.replace(/```[\s\S]*?```/g, '');
    clean = clean.replace(/`([^`]+)`/g, '$1');
    clean = clean.replace(/^---[\s\S]*?---\s*/gm, '');
    clean = clean.replace(/(?:documentid|sections_referenced|datedecided|court|parties|category):[^\n]+/gi, '');
    clean = clean.replace(/^#{1,6}\s+.*$/gm, '');
    clean = clean.replace(/\*\*([^*]+)\*\*/g, '$1');
    clean = clean.replace(/\*([^*]+)\*/g, '$1');
    clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    clean = clean.replace(/\[(?:\d+|Source\s*#?\d+|Citation\s*#?\d+|source:[^\]]+)\]/gi, '');
    clean = clean.replace(/^\s*[-*•]\s+/gm, '');
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

  protected async playAudioPayload(audioBase64: string): Promise<void> {
    this.lastAudioBase64 = audioBase64;
    this.stopSpeaking();
    this.ensureAudioUnlocked();

    // Convert base64 to Blob URL for clean streaming and zero data-URI overhead
    const binaryString = window.atob(audioBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes.buffer], { type: 'audio/wav' });
    const audioUrl = URL.createObjectURL(blob);

    // 1. Primary: Web Audio API ONLY IF AudioContext is truly RUNNING
    // (Starting a buffer source on a suspended AudioContext produces silence and hangs indefinitely)
    if (this.audioContext && this.audioContext.state === 'running') {
      try {
        const audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer.slice(0));
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);
        this.currentAudioSource = source;

        this.setState('speaking');

        return new Promise<void>((resolve) => {
          source.onended = () => {
            if (this.currentAudioSource === source) {
              this.currentAudioSource = null;
            }
            try { URL.revokeObjectURL(audioUrl); } catch (_) {}
            this.setState('answered');
            resolve();
          };
          source.start(0);
        });
      } catch (webAudioErr: any) {
        this.logger.warn(`[AskHayaVoiceService] Running AudioContext playback error, falling back to HTML5 Audio: ${webAudioErr.message}`);
      }
    }

    // 2. Secondary: HTML5 Audio Element via Blob URL with timeout watchdog & autoplay recovery
    return new Promise<void>((resolve) => {
      try {
        const audio = new Audio(audioUrl);
        audio.volume = 1.0;
        this.currentAudio = audio;

        let finished = false;
        const cleanup = (newState: OrbState = 'answered') => {
          if (finished) return;
          finished = true;
          this.currentAudio = null;
          try { URL.revokeObjectURL(audioUrl); } catch (_) {}
          this.setState(newState);
          resolve();
        };

        audio.onended = () => cleanup('answered');
        audio.onerror = (e) => {
          this.logger.warn(`[AskHayaVoiceService] HTML5 Audio error: ${e}`);
          cleanup('answered');
        };

        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise
            .then(() => {
              this.setState('speaking');
            })
            .catch((err: any) => {
              this.logger.warn(`[AskHayaVoiceService] Audio playback blocked by browser policy: ${err.message}`);
              cleanup('answered');
              this.showClickToListenNotice();
            });
        } else {
          this.setState('speaking');
        }
      } catch (e: any) {
        this.logger.warn(`[AskHayaVoiceService] HTML5 Audio instantiation error: ${e.message}`);
        this.currentAudio = null;
        try { URL.revokeObjectURL(audioUrl); } catch (_) {}
        this.setState('answered');
        this.showClickToListenNotice();
        resolve();
      }
    });
  }

  protected showClickToListenNotice(): void {
    if (this.domRoot) {
      const stateLabel = this.domRoot.querySelector('#askhaya-state-label');
      if (stateLabel) {
        stateLabel.textContent = 'Audio Ready (Click ▶ to Listen)';
      }
      const playBtn = this.domRoot.querySelector('#askhaya-action-play') as HTMLElement;
      if (playBtn) {
        playBtn.innerHTML = '<i class="fa fa-play-circle" style="color: #fbbf24;"></i> <span style="font-weight: 600; color: #fbbf24;">Listen</span>';
        playBtn.style.borderColor = 'rgba(245, 158, 11, 0.8)';
        playBtn.style.boxShadow = '0 0 12px rgba(245, 158, 11, 0.4)';
      }
    }
  }

  async speak(text: string): Promise<void> {
    this.stopSpeaking();
    this.ensureAudioUnlocked();
    const cleanSpoken = this.cleanForSpeech(text);
    if (!cleanSpoken) {
      this.setState('idle');
      return;
    }

    this.updateSpokenDisplay(cleanSpoken);
    this.setState('speaking');

    try {
      const currentCase = this.getActiveCaseDir();
      const ttsRes = await fetch(`${this.getBackendUrl()}/api/hayagriva/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanSpoken,
          speaker: 'aditya',
          case: currentCase
        })
      });

      if (ttsRes.ok) {
        const ttsData = await ttsRes.json();
        if (ttsData.audioBase64) {
          await this.playAudioPayload(ttsData.audioBase64);
          return;
        }
      }
    } catch (e: any) {
      this.logger.warn(`[AskHayaVoiceService] Sarvam TTS playback failed: ${e.message}`);
    }

    // Fallback: Browser SpeechSynthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();

        const utterance = new SpeechSynthesisUtterance(cleanSpoken);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.lang = 'en-IN';

        utterance.onend = () => {
          this.currentSpeechUtterance = null;
          try { delete (window as any).__askHayaUtterance; } catch (_) {}
          this.setState('answered');
        };

        utterance.onerror = () => {
          this.currentSpeechUtterance = null;
          try { delete (window as any).__askHayaUtterance; } catch (_) {}
          this.setState('answered');
        };

        this.currentSpeechUtterance = utterance;
        (window as any).__askHayaUtterance = utterance;
        window.speechSynthesis.speak(utterance);
      } catch (synthErr: any) {
        this.logger.warn(`[AskHayaVoiceService] SpeechSynthesis failed: ${synthErr.message}`);
        this.setState('answered');
      }
    } else {
      this.setState('answered');
    }
  }

  stopSpeaking(): void {
    if (this.currentAudioSource) {
      try {
        this.currentAudioSource.stop();
        this.currentAudioSource.disconnect();
      } catch (_) {}
      this.currentAudioSource = null;
    }
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (_) {}
      this.currentAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
    this.currentSpeechUtterance = null;
    try {
      if (typeof window !== 'undefined') {
        delete (window as any).__askHayaUtterance;
      }
    } catch (_) {}

    if (this.state === 'speaking') {
      this.setState('answered');
    }
  }

  setState(newState: OrbState): void {
    this.state = newState;
    this.stateListeners.forEach(listener => {
      try {
        listener(newState);
      } catch (_) {}
    });

    // Update Floating Orb DOM Element
    if (this.domRoot) {
      this.domRoot.classList.remove('orb-idle', 'orb-listening', 'orb-processing', 'orb-speaking', 'orb-answered');
      this.domRoot.classList.add(`orb-${newState}`);

      const stateLabel = this.domRoot.querySelector('#askhaya-state-label');
      const transcriptEl = this.domRoot.querySelector('#askhaya-transcript-text');
      const spokenEl = this.domRoot.querySelector('#askhaya-spoken-text');
      const cancelBtn = this.domRoot.querySelector('#askhaya-action-cancel') as HTMLElement;
      const micBtn = this.domRoot.querySelector('#askhaya-action-mic') as HTMLElement;

      if (newState === 'listening') {
        if (stateLabel) stateLabel.textContent = 'Listening';
        if (transcriptEl) transcriptEl.textContent = 'Listening to your legal inquiry...';
        if (cancelBtn) cancelBtn.innerHTML = '<i class="fa fa-times"></i> <span>Cancel</span>';
        if (micBtn) micBtn.innerHTML = '<i class="fa fa-check"></i> <span>Done</span>';
      } else if (newState === 'processing') {
        if (stateLabel) stateLabel.textContent = 'Researching';
        if (transcriptEl) transcriptEl.textContent = 'Consulting LightRAG graph & bare acts...';
        if (cancelBtn) cancelBtn.innerHTML = '<i class="fa fa-times"></i> <span>Cancel</span>';
      } else if (newState === 'speaking') {
        if (stateLabel) stateLabel.textContent = 'Oral Ratio (Speaking)';
        if (spokenEl) spokenEl.textContent = this.lastResult?.spokenText || 'Advising on case precedents...';
        if (cancelBtn) cancelBtn.innerHTML = '<i class="fa fa-stop"></i> <span>Stop</span>';
        if (micBtn) micBtn.innerHTML = '<i class="fa fa-microphone"></i> <span>Speak</span>';
      } else if (newState === 'answered') {
        if (stateLabel) stateLabel.textContent = 'Precedent Counsel Ready';
        if (spokenEl) spokenEl.textContent = this.lastResult?.spokenText || '';
        if (cancelBtn) cancelBtn.innerHTML = '<i class="fa fa-times"></i> <span>Close</span>';
        if (micBtn) micBtn.innerHTML = '<i class="fa fa-microphone"></i> <span>Follow-up</span>';
      } else {
        if (stateLabel) stateLabel.textContent = 'AskHaya Counsel';
        if (transcriptEl) transcriptEl.textContent = 'Ready for inquiry (Alt+Space)';
        if (cancelBtn) cancelBtn.innerHTML = '<i class="fa fa-times"></i> <span>Close</span>';
        if (micBtn) micBtn.innerHTML = '<i class="fa fa-microphone"></i> <span>Speak</span>';
      }

      const playBtn = this.domRoot.querySelector('#askhaya-action-play') as HTMLElement;
      if (playBtn) {
        if (newState === 'speaking') {
          playBtn.innerHTML = '<i class="fa fa-volume-off"></i> <span>Mute</span>';
          playBtn.setAttribute('title', 'Mute audio playback');
        } else if (newState === 'answered') {
          playBtn.innerHTML = '<i class="fa fa-volume-up"></i> <span>Replay</span>';
          playBtn.setAttribute('title', 'Replay spoken legal ratio');
        } else {
          playBtn.innerHTML = '<i class="fa fa-volume-up"></i> <span>Play</span>';
          playBtn.setAttribute('title', 'Play spoken audio');
        }
      }

      // Re-clamp position in case dimension expansion overflows right/bottom edges
      const clamped = this.clampPosition(this.posX, this.posY);
      this.posX = clamped.x;
      this.posY = clamped.y;
      this.domRoot.style.left = `${this.posX}px`;
      this.domRoot.style.top = `${this.posY}px`;
    }

    // Update in-panel button visual state directly if present in DOM
    if (typeof document !== 'undefined') {
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

  toggleVoiceOrb(): void {
    this.ensureAudioUnlocked();
    if (this.state === 'listening') {
      this.stopListening();
    } else if (this.state === 'speaking') {
      this.cancel();
    } else if (this.state === 'answered') {
      this.cancel();
    } else if (this.state === 'processing') {
      this.cancel();
    } else {
      this.startListening();
    }
  }

  async insertDossierIntoEditor(): Promise<boolean> {
    const lastRes = this.lastResult;
    const dossier = lastRes?.fullDossier || lastRes?.spokenText || '';
    if (!dossier) {
      this.logger.warn('[AskHayaVoiceService] No precedent dossier available to insert.');
      return false;
    }

    const activeEditor = this.editorManager?.currentEditor || this.editorManager?.activeEditor;
    if (activeEditor && activeEditor.editor) {
      try {
        const editor = activeEditor.editor;
        const selection = editor.selection || (typeof (editor as any).getSelection === 'function' ? (editor as any).getSelection() : {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 }
        });

        const newText = `\n\n${dossier.trim()}\n`;

        if (typeof editor.executeEdits === 'function') {
          editor.executeEdits([{
            range: selection,
            newText
          }]);
          this.logger.info('[AskHayaVoiceService] Successfully injected precedent dossier into active Monaco editor.');
          return true;
        } else if (editor.document && typeof (editor.document as any).applyEdits === 'function') {
          (editor.document as any).applyEdits([{
            range: selection,
            text: newText
          }]);
          return true;
        }
      } catch (err: any) {
        this.logger.error(`[AskHayaVoiceService] Monaco executeEdits failed: ${err.message}`);
      }
    }

    // Fallback: If no active editor is open, open a scratch markdown note
    if (this.editorManager) {
      try {
        const currentCase = this.getActiveCaseDir();
        const casePath = currentCase ? currentCase.replace(/\/+$/, '') : '';
        const scratchPath = casePath ? `${casePath}/drafts/scratch_voice_dossier.md` : '/tmp/scratch_voice_dossier.md';
        const scratchUri = new URI(scratchPath.startsWith('file://') ? scratchPath : `file://${scratchPath}`);

        const openedWidget = await this.editorManager.open(scratchUri, { mode: 'open' });
        if (openedWidget && openedWidget.editor) {
          setTimeout(() => {
            try {
              if (typeof openedWidget.editor.executeEdits === 'function') {
                openedWidget.editor.executeEdits([{
                  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
                  newText: `${dossier.trim()}\n`
                }]);
              }
            } catch (_) {}
          }, 300);
        }
        this.logger.info(`[AskHayaVoiceService] Opened scratch markdown note at ${scratchPath}`);
        return true;
      } catch (err: any) {
        this.logger.warn(`[AskHayaVoiceService] Could not open scratch markdown tab: ${err.message}`);
      }
    }

    return false;
  }
}
