import { injectable, inject, optional } from '@theia/core/shared/inversify';
import {
  FrontendApplicationContribution,
  FrontendApplication,
  OpenHandler,
  OpenerOptions,
  ApplicationShell,
  Widget
} from '@theia/core/lib/browser';
import { CommandService, PreferenceService, PreferenceSchema, MessageService } from '@theia/core/lib/common';
import { ILogger } from '@theia/core/lib/common/logger';
import { TabBarToolbarRegistry, TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { EditorManager } from '@theia/editor/lib/browser';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import URI from '@theia/core/lib/common/uri';
import { MenuModelRegistry } from '@theia/core/lib/common/menu';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import { HayagrivaEditorDecorator } from './highlight-decorator';
import { HayagrivaLspClient } from './lsp-client';
import { HayagrivaMonacoProviders } from './monaco-providers';
import { HayagrivaPreviewManager } from './preview-manager';
import { pruneNavigatorContextMenu, pruneDeveloperMenus, installMenuGuard } from './menus';
import { AskHayaVoiceOrb } from './askhaya-orb';
import { AuthManager } from './auth-manager';
import { AuthModal } from './auth-modal';
import { ProfileWidget } from './profile-widget';
import { AgentCockpitManager } from './agent-cockpit-manager';
import { safeDecodeURI } from './tree-decorator';

const { inboxExplorerHtml, billingExplorerHtml, entityExplorerHtml, notificationCenterHtml, toolComingSoonHtml, TOOLS_CATALOG } = require('./templates');

export const hayagrivaPreferenceSchema: PreferenceSchema = {
  properties: {
    'hayagriva.apiPort': {
      type: 'number',
      default: 3210,
      description: 'The port number of the local Hayagriva backend proxy daemon.'
    },
    'hayagriva.hoverLimit': {
      type: 'number',
      default: 5,
      description: 'Maximum number of statutory sections / rules to display in hover popups.'
    }
  }
};

function getBasename(pathStr: string): string {
  const parts = pathStr.split(/[\\/]/);
  return parts[parts.length - 1] || pathStr;
}

@injectable()
export class HayagrivaFrontendContribution
  implements FrontendApplicationContribution, OpenHandler, TabBarToolbarContribution {
  readonly id = 'hayagriva-frontend-contribution';

  protected isBackendOnline = false;
  protected showOfflineWarning = true;
  protected offlineFailureCount = 0;
  protected hasSmartLaunchedSettings = false;

  protected wikiWidget?: Widget;
  protected conceptsWidget?: Widget;
  protected inboxWidget?: Widget;
  protected billingWidget?: Widget;
  protected entityMapWidget?: Widget;
  protected notificationWidget?: Widget;
  protected uploadModalElement?: HTMLElement;

  constructor(
    @inject(ApplicationShell) protected readonly shell: ApplicationShell,
    @inject(StatusBar) protected readonly statusBar: StatusBar,
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService,
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
    @inject(EditorManager) protected readonly editorManager: EditorManager,
    @inject(WidgetManager) protected readonly widgetManager: WidgetManager,
    @inject(ThemeService) protected readonly themeService: ThemeService,
    @inject(CommandService) protected readonly commandRegistry: CommandService,
    @inject(MessageService) protected readonly messageService: MessageService,
    @inject(HayagrivaEditorDecorator) protected readonly decorator: HayagrivaEditorDecorator,
    @inject(HayagrivaLspClient) protected readonly lspClient: HayagrivaLspClient,
    @inject(HayagrivaMonacoProviders) protected readonly monacoProviders: HayagrivaMonacoProviders,
    @inject(HayagrivaPreviewManager) protected readonly previewManager: HayagrivaPreviewManager,
    @inject(MenuModelRegistry) protected readonly menuRegistry: MenuModelRegistry,
    @inject(MonacoWorkspace) protected readonly monacoWorkspace: MonacoWorkspace,
    @inject(ILogger) protected readonly logger: ILogger,
    @inject(AskHayaVoiceOrb) protected readonly voiceOrb: AskHayaVoiceOrb,
    @inject(AuthManager) protected readonly authManager: AuthManager,
    @inject(AuthModal) protected readonly authModal: AuthModal,
    @inject(ProfileWidget) protected readonly profileWidget: ProfileWidget,
    @inject(AgentCockpitManager) @optional() protected readonly agentCockpitManager?: AgentCockpitManager
  ) {}

  getApiPort(): number {
    return this.preferenceService.get<number>('hayagriva.apiPort', 3210);
  }

  getBackendUrl(): string {
    return `http://127.0.0.1:${this.getApiPort()}`;
  }

  getShell(): ApplicationShell {
    return this.shell;
  }

  isCurrentThemeLight(): boolean {
    try {
      const theme = this.themeService.getCurrentTheme();
      if (theme && (theme.type === 'light' || theme.id.toLowerCase().includes('light'))) {
        return true;
      }
    } catch (_) {}
    return document.body.classList.contains('theia-light') || document.body.classList.contains('light-theia');
  }

  // ── OpenHandler ────────────────────────────────────────────────────────────
  canHandle(uri: URI): number {
    if (uri.scheme === 'hayagriva-citation') {
      return 600;
    }
    const p = uri.path.toString().toLowerCase();
    if (p.endsWith('.pdf') || p.endsWith('.docx') || p.endsWith('.doc') || p.endsWith('.xlsx') || p.endsWith('.xls') || p.endsWith('.wiki.html') || p.endsWith('.md') || p.endsWith('.markdown')) {
      return 500;
    }
    return 0;
  }

  async open(uri: URI, _options?: OpenerOptions): Promise<Widget> {
    if (uri.scheme === 'hayagriva-citation') {
      const docName = safeDecodeURI(uri.authority || uri.path.toString().replace(/^\/+/, ''));
      const query = new URLSearchParams(uri.query);
      const pageNum = parseInt(query.get('page') || '1', 10);
      return this.previewManager.openCitationPreview(docName, pageNum);
    }

    const filePath = safeDecodeURI(uri.path.toString());
    const caseName = this.getCaseName(filePath);

    if (/\.(pdf|docx|doc|xlsx|xls)$/i.test(filePath)) {
      const previewWidget = await this.previewManager.openOfficePreview(filePath, caseName);

      const caseDir = this.getCaseName(filePath);
      const caseNameOnly = caseDir.split('/').filter(Boolean).pop() || 'case';
      const rel = filePath.startsWith(caseDir) ? filePath.substring(caseDir.length).replace(/^[/\\]+/, '') : getBasename(filePath);
      const subfolder = rel.includes('/') || rel.includes('\\') ? rel.substring(0, Math.max(rel.lastIndexOf('/'), rel.lastIndexOf('\\'))) : '';
      const basename = getBasename(filePath).replace(/\.[a-zA-Z0-9]+$/, '');

      // Potential companion markdown paths in priority order
      const candidates = [
        subfolder ? `${caseDir}/${caseNameOnly}_conversions_haya/${subfolder}/${basename}.md` : `${caseDir}/${caseNameOnly}_conversions_haya/${basename}.md`,
        subfolder ? `${caseDir}/conversions/${subfolder}/${basename}.md` : `${caseDir}/conversions/${basename}.md`,
        `${caseDir}/${caseNameOnly}_conversions_haya/${basename}.md`,
        `${caseDir}/conversions/${basename}.md`,
        filePath.replace(/\.(pdf|docx|doc|xlsx|xls)$/i, '.md')
      ];

      let companionUri: URI | undefined;
      for (const cand of candidates) {
        const checkUrl = `${this.getBackendUrl()}/api/hayagriva/read-file?path=${encodeURIComponent(cand)}&case=${encodeURIComponent(caseDir)}`;
        try {
          const res = await fetch(checkUrl);
          if (res.ok) {
            companionUri = new URI(cand);
            break;
          }
        } catch (_) {}
      }

      if (companionUri) {
        const companionPath = safeDecodeURI(companionUri.path.toString());
        await this.previewManager.openMilkdownEditor(companionPath, caseName, 'split-right');
      }

      return previewWidget;
    }

    if (filePath.toLowerCase().endsWith('.wiki.html')) {
      return this.openWikiHtmlViewer(filePath, caseName);
    }

    if (filePath.toLowerCase().endsWith('.md') || filePath.toLowerCase().endsWith('.markdown')) {
      return this.previewManager.openMilkdownEditor(filePath, caseName);
    }

    const base = getBasename(filePath);
    const docName = base.replace(/\.wiki\.html$/i, '');
    await this.openWiki(docName, caseName);
    return new Widget();
  }

  // ── Lifecycle Contributions ────────────────────────────────────────────────
  onStart(_app: FrontendApplication): void {
    this.injectStyles();

    try {
      this.preferenceService.set('editor.inlineSuggest.enabled', true).catch(() => {});
      this.preferenceService.set('editor.suggestOnTriggerCharacters', true).catch(() => {});
      this.preferenceService.set('editor.quickSuggestions', { other: true, comments: true, strings: true }).catch(() => {});
      this.preferenceService.set('explorer.openEditors.visible', 0).catch(() => {});
      this.preferenceService.set('toolbar.showToolbar', false).catch(() => {});
      this.preferenceService.set('files.associations', { '*.tid': 'markdown' }).catch(() => {});
      this.preferenceService.set('window.title', '${dirty}${activeEditorShort}${separator}${rootName}${separator}${appName}').catch(() => {});
    } catch (_) {}

    // Ensure browser tab favicon is Hayagriva stallion
    try {
      let iconLink = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      if (!iconLink) {
        iconLink = document.createElement('link');
        iconLink.rel = 'icon';
        document.head.appendChild(iconLink);
      }
      iconLink.type = 'image/x-icon';
      iconLink.href = './favicon.ico?v=hayagriva';
    } catch (_) {}

    // Permanently purge Open Editors from Explorer ViewContainer
    const purgeOpenEditors = async () => {
      try {
        const explorer = await this.widgetManager.getWidget('explorer-view-container');
        if (explorer && typeof (explorer as any).removeWidget === 'function') {
          const openEditors = await this.widgetManager.getWidget('theia-open-editors-widget');
          if (openEditors) {
            (explorer as any).removeWidget(openEditors);
          }
        }
      } catch (_) {}
    };
    purgeOpenEditors();
    setTimeout(purgeOpenEditors, 300);
    setTimeout(purgeOpenEditors, 1200);

    // Prune generic developer clutter from Explorer context menu and top menu bar
    const FORBIDDEN_MENU_LABELS = new Set([
      'ai agent history',
      'ai chat',
      'ai sessions',
      'call hierarchy',
      'debug',
      'debug console',
      'explorer',
      'extensions',
      'outline',
      'output',
      'plugins',
      'problems',
      'properties',
      'search',
      'source control',
      'type hierarchy',
      'open view...',
      'toggle minimap',
      'toggle breadcrumbs',
      'toggle render whitespace',
      'new text file',
      'new file...',
      'new folder...',
      'new window',
      'open workspace from file...',
      'open recent workspace...',
      'add folder to workspace...',
      'save workspace as...',
      'upload files...',
      'close workspace'
    ]);

    let isCleaning = false;
    const cleanLuminoMenus = () => {
      if (isCleaning) return;
      isCleaning = true;
      try {
        // 1. Prune top menubar items (Selection, Go, Run, Terminal)
        const topItems = document.querySelectorAll('.lm-MenuBar-item, .p-MenuBar-item');
        const hideTop = ['selection', 'go', 'run', 'terminal'];
        topItems.forEach(el => {
          const text = (el.textContent || '').trim().toLowerCase();
          if (hideTop.includes(text)) {
            (el as HTMLElement).style.display = 'none';
          }
        });

        // 2. Dropdown popup menus (.lm-Menu, .p-Menu)
        const menus = document.querySelectorAll('.lm-Menu, .p-Menu');
        menus.forEach(menu => {
          const items = menu.querySelectorAll('.lm-Menu-item, .p-Menu-item');
          items.forEach(item => {
            const labelEl = item.querySelector('.lm-Menu-itemLabel, .p-Menu-itemLabel');
            if (labelEl) {
              const text = (labelEl.textContent || '').trim().toLowerCase();
              if (FORBIDDEN_MENU_LABELS.has(text) || text.includes('toggle minimap') || text.includes('render whitespace') || text.includes('breadcrumbs')) {
                (item as HTMLElement).style.display = 'none';
              }
            }
          });

          // 3. Clean up orphaned separators
          let lastWasVisibleSeparator = false;
          let hasVisibleItems = false;
          items.forEach(item => {
            const isSep = item.classList.contains('lm-type-separator') || item.classList.contains('p-type-separator');
            if ((item as HTMLElement).style.display === 'none') return;
            if (isSep) {
              if (!hasVisibleItems || lastWasVisibleSeparator) {
                (item as HTMLElement).style.display = 'none';
              } else {
                lastWasVisibleSeparator = true;
              }
            } else {
              hasVisibleItems = true;
              lastWasVisibleSeparator = false;
            }
          });

          // Trailing separator cleanup
          for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i] as HTMLElement;
            if (item.style.display === 'none') continue;
            if (item.classList.contains('lm-type-separator') || item.classList.contains('p-type-separator')) {
              item.style.display = 'none';
            }
            break;
          }
        });
      } catch (_) {
      } finally {
        isCleaning = false;
      }
    };

    try {
      installMenuGuard(this.menuRegistry);
      pruneNavigatorContextMenu(this.menuRegistry);
      pruneDeveloperMenus(this.menuRegistry);
      cleanLuminoMenus();

      // Debounce menu registry updates to re-prune without blocking main thread
      let debounceMenuTimer: any = null;
      this.menuRegistry.onDidChange(() => {
        if (debounceMenuTimer) clearTimeout(debounceMenuTimer);
        debounceMenuTimer = setTimeout(() => {
          pruneNavigatorContextMenu(this.menuRegistry);
          pruneDeveloperMenus(this.menuRegistry);
        }, 300);
      });

      // Multi-interval sweep for late-loading plugins
      [500, 1500, 3000, 6000, 9000, 12000].forEach(delay => {
        setTimeout(() => {
          pruneNavigatorContextMenu(this.menuRegistry);
          pruneDeveloperMenus(this.menuRegistry);
          cleanLuminoMenus();
        }, delay);
      });

      // Realtime DOM observer on menu dropdowns
      const menuObserver = new MutationObserver(() => cleanLuminoMenus());
      menuObserver.observe(document.body, { childList: true, subtree: true });
      document.addEventListener('pointerdown', () => requestAnimationFrame(cleanLuminoMenus), true);
      document.addEventListener('click', () => requestAnimationFrame(cleanLuminoMenus), true);
    } catch (_) {}

    // Relocate AI Chat widget to left vertical dock and collapse right panel
    try {
      this.widgetManager.getOrCreateWidget('chat-view-widget').then(widget => {
        if (widget) {
          widget.title.label = 'Hayagriva Agents';
          widget.title.caption = 'Hayagriva Agents';
          widget.title.iconClass = 'hayagriva-horse-icon';
          this.shell.addWidget(widget, { area: 'left', rank: 300 });
        }
      }).catch(() => {});
      this.shell.collapsePanel('right');
    } catch (_) {}

    // Theme-adaptive synchronization across custom iframe sidebars
    try {
      this.themeService.onDidColorThemeChange(() => {
        const isLight = this.isCurrentThemeLight();
        const currentCase = this.getActiveCaseName();
        if (this.inboxWidget) {
          const iframe = this.inboxWidget.node.querySelector('iframe');
          if (iframe) {
            iframe.srcdoc = inboxExplorerHtml(currentCase, this.getApiPort(), isLight);
          }
        }
        if (this.entityMapWidget) {
          const iframe = this.entityMapWidget.node.querySelector('iframe');
          if (iframe) {
            iframe.srcdoc = entityExplorerHtml(currentCase, this.getApiPort(), isLight);
          }
        }
      });
    } catch (_) {}

    // Live auto-refresh of Markdown previews when saving .md files
    try {
      this.monacoWorkspace.onDidSaveTextDocument(model => {
        try {
          const filePath = safeDecodeURI(new URI(model.uri).path.toString());
          if (filePath.endsWith('.md') || filePath.endsWith('.markdown')) {
            this.previewManager.refreshPreview(filePath);
          }
        } catch (err: any) {
          this.logger.warn(`[Hayagriva] Failed to refresh preview on save: ${err.message}`);
        }
      });
    } catch (_) {}

    this.registerGlobalEventListeners();
    // Retired floating AskHayaVoiceOrb in favor of docked LightRAG slide-over drawer
    this.profileWidget.initialize();
    this.monacoProviders.registerAllProviders(() => this.getActiveCaseName());
    this.startBackendMonitor();
    this.initializeRbzAdvisor();

    // Authenticate session on boot & evaluate local/cloud entitlements without blocking Free Core
    this.authManager.onAuthStateChanged(() => this.syncFeatureGating());
    this.authManager.verifySession().then(() => {
      this.syncFeatureGating();
    }).catch(() => {
      this.syncFeatureGating();
    });

    // Global click interceptor for hayagriva-citation:// links (e.g. inside AI Chat bubbles or rendered markdown)
    try {
      document.addEventListener('click', (e: MouseEvent) => {
        const target = (e.target as HTMLElement).closest('a');
        if (target && target.href && target.href.startsWith('hayagriva-citation://')) {
          e.preventDefault();
          e.stopPropagation();
          this.open(new URI(target.href));
        }
      }, true);
    } catch (_) {}

    // Click interceptor for Top-Left Flowing Stallion window header emblem -> triggers Chamber Cockpit
    try {
      document.addEventListener('click', (e: MouseEvent) => {
        const target = (e.target as HTMLElement).closest('.theia-icon, #theia-top-panel .theia-icon, .theia-app-icon');
        if (target) {
          e.preventDefault();
          e.stopPropagation();
          this.commandRegistry.executeCommand('hayagriva.openCockpitMenu');
        }
      }, true);
    } catch (_) {}

    // Dynamically sync theme changes
    this.themeService.onDidColorThemeChange(() => {
      try {
        const currentTheme = this.themeService.getCurrentTheme();
        const isLight = currentTheme && currentTheme.id && currentTheme.id.toLowerCase().includes('light');
        const theme = isLight ? 'light' : 'dark';

        const settingsWidget = this.shell.getWidgets('main').find(w => w.id === 'hayagriva-settings-panel');
        if (settingsWidget) {
          const iframe = settingsWidget.node.querySelector('iframe');
          if (iframe && iframe.src) {
            const url = new URL(iframe.src);
            url.searchParams.set('theme', theme);
            iframe.src = url.toString();
          }
        }

        const caseName = this.getActiveCaseName();
        if (this.notificationWidget) {
          const iframe = this.notificationWidget.node.querySelector('iframe');
          if (iframe) {
            iframe.srcdoc = notificationCenterHtml(caseName, this.getApiPort(), isLight);
          }
        }
        if (this.entityMapWidget) {
          const iframe = this.entityMapWidget.node.querySelector('iframe');
          if (iframe) {
            iframe.srcdoc = entityExplorerHtml(caseName, this.getApiPort(), isLight);
          }
        }
        if (this.billingWidget) {
          const iframe = this.billingWidget.node.querySelector('iframe');
          if (iframe) {
            iframe.srcdoc = billingExplorerHtml(caseName, this.getApiPort(), isLight);
          }
        }
        const toolWidgets = this.shell.getWidgets('main').filter(w => w.id && w.id.startsWith('hayagriva-tool-'));
        for (const tw of toolWidgets) {
          const toolKey = tw.id.replace('hayagriva-tool-', '');
          const iframe = tw.node.querySelector('iframe');
          if (iframe) {
            iframe.srcdoc = toolComingSoonHtml(toolKey, isLight);
          }
        }
      } catch (err: any) {
        this.logger.warn(`[Hayagriva] Failed to sync settings iframe theme: ${err.message}`);
      }
    });
  }

  async onDidInitializeLayout(_app: FrontendApplication): Promise<void> {
    const allowedLeftWidgets = new Set([
      'explorer-view-container',
      'chat-view-widget',
      'hayagriva-entity-map-explorer',
      'hayagriva-notification-center',
      'hayagriva-billing-explorer'
    ]);

    // Pillar 1: Documents (Files Explorer) - Rank 100
    let explorerWidget = this.shell.getWidgets('left').find(w => w.id.includes('explorer-view-container') || w.id === 'files');
    if (!explorerWidget) {
      try {
        explorerWidget = await this.widgetManager.getOrCreateWidget('explorer-view-container');
      } catch (_) {}
    }
    if (explorerWidget) {
      explorerWidget.title.label = '@Registry';
      explorerWidget.title.caption = 'Master Case Intake & Docket';
      explorerWidget.title.iconClass = 'hayagriva-registry-icon';
      await this.shell.addWidget(explorerWidget, { area: 'left', rank: 100 });
    }

    // Dynamic Coworker Middle Zone (Ranks 200–400)
    try {
      await this.syncCoworkerActivityBar();
      if (this.agentCockpitManager) {
        this.agentCockpitManager.onActiveCoworkersChanged(async (activeIds) => {
          await this.syncCoworkerActivityBar(activeIds);
        });
      }
    } catch (err: any) {
      this.logger.warn(`[Hayagriva] Failed to initialize coworker activity bar: ${err.message}`);
    }

    // Pillar 3: Forensic Entity Map (Master Entity Directory & Topology) - Rank 300
    try {
      this.initializeEntityMapWidget();
    } catch (err: any) {
      this.logger.warn(`[Hayagriva] Failed to dock entity map widget on left: ${err.message}`);
    }

    // Top Header Strip: Notification Center (Relocated from left bar)
    try {
      this.mountHeaderNotificationChip();
    } catch (err: any) {
      this.logger.warn(`[Hayagriva] Failed to mount header notification chip: ${err.message}`);
    }


    // Completely omit Outline & Search View Container: force close any instance
    try {
      const allWidgets = [...this.shell.getWidgets('left'), ...this.shell.getWidgets('right')];
      for (const w of allWidgets) {
        if (w.id.toLowerCase() === 'outline-view' || w.id.includes('search-view-container')) {
          w.close();
        }
      }
    } catch (_) {}

    // Prune unapproved widgets from left panel
    const leftWidgets = this.shell.getWidgets('left');
    for (const widget of leftWidgets) {
      const id = widget.id.toLowerCase();
      if (!allowedLeftWidgets.has(id)) {
        widget.close();
      }
    }

    // Ensure the left panel is expanded and Files & Folders is active by default
    try {
      this.shell.expandPanel('left');
      if (explorerWidget) {
        this.shell.activateWidget(explorerWidget.id);
      }
    } catch (_) {}

    // Keep right panel collapsed
    try {
      this.shell.collapsePanel('right');
    } catch (_) {}
  }

  async syncCoworkerActivityBar(activeIds?: string[]): Promise<void> {
    const activeCoworkers = this.agentCockpitManager 
      ? this.agentCockpitManager.getActiveCoworkers() 
      : [
          { id: '@Advisor', name: 'Strategy & CIRP Counsel', role: 'Master legal strategy', iconClass: 'hayagriva-advisor-icon' }
        ];

    for (let index = 0; index < activeCoworkers.length; index++) {
      const cw = activeCoworkers[index];
      const rank = 200 + index * 10;
      try {
        if (index === 0) {
          const chatWidget = await this.widgetManager.getOrCreateWidget('chat-view-widget');
          if (chatWidget) {
            chatWidget.title.label = cw.name;
            chatWidget.title.caption = `${cw.id}: ${cw.role}`;
            chatWidget.title.iconClass = cw.iconClass;
            chatWidget.title.closable = false;
            await this.shell.addWidget(chatWidget, { area: 'left', rank });
          }
        }
      } catch (err: any) {
        this.logger.warn(`[Hayagriva] Failed to sync coworker ${cw.id}: ${err.message}`);
      }
    }
  }


  registerToolbarItems(registry: TabBarToolbarRegistry): void {
    registry.registerItem({
      id: 'hayagriva-upload-toolbar-item',
      command: 'hayagriva:openUploadSplit',
      tooltip: 'Upload Court Documents',
      icon: 'fa fa-upload',
      priority: 0
    });
  }

  // ── Delegated Preview Operations ───────────────────────────────────────────
  async openMilkdownEditor(filePath: string, caseName: string, mode?: 'split-right' | 'split-bottom' | 'tab-after' | 'tab-before'): Promise<Widget> {
    return this.previewManager.openMilkdownEditor(filePath, caseName, mode);
  }

  async openOfficePreview(filePath: string, caseName: string): Promise<Widget> {
    return this.previewManager.openOfficePreview(filePath, caseName);
  }

  async openLiveMarkdownPreview(filePath: string, caseName: string): Promise<Widget> {
    return this.previewManager.openLiveMarkdownPreview(filePath, caseName);
  }

  refreshPreview(filePath: string): void {
    this.previewManager.refreshPreview(filePath);
  }

  closeOtherDocumentViewers(activeId?: string): void {
    this.previewManager.closeOtherDocumentViewers(activeId);
  }

  async openWikiHtmlViewer(filePath: string, caseName: string): Promise<Widget> {
    return this.previewManager.openWikiHtmlViewer(filePath, caseName);
  }

  async openKvEditor(caseName: string): Promise<Widget> {
    return this.previewManager.openKvEditor(caseName);
  }

  async openFormEditor(caseName: string, formId: string): Promise<Widget> {
    return this.previewManager.openFormEditor(caseName, formId);
  }

  async openDraftingPanel(caseName: string): Promise<Widget> {
    return this.previewManager.openDraftingPanel(caseName);
  }

  async openCockpitPanel(caseName?: string, tab: string = 'hil', action?: string): Promise<Widget> {
    const targetCase = caseName || this.getActiveCaseName();
    return this.previewManager.openCockpitPanel(targetCase, tab, action);
  }

  async openSettingsPanel(caseName?: string, tab: string = 'settings'): Promise<Widget> {
    const targetCase = caseName || this.getActiveCaseName();
    return this.previewManager.openCockpitPanel(targetCase, tab);
  }

  async openComplianceQueue(caseName?: string, tier: string = 'ALL'): Promise<Widget> {
    const targetCase = caseName || this.getActiveCaseName();
    return this.previewManager.openComplianceQueue(targetCase, tier);
  }

  async openChronologyPanel(caseName?: string): Promise<Widget> {
    const targetCase = caseName || this.getActiveCaseName();
    return this.previewManager.openChronologyPanel(targetCase);
  }

  async openEntityMapPanel(caseName?: string): Promise<Widget> {
    const targetCase = caseName || this.getActiveCaseName();
    return this.previewManager.openEntityMapPanel(targetCase);
  }

  async openKvPanel(caseName?: string): Promise<Widget> {
    const targetCase = caseName || this.getActiveCaseName();
    return this.previewManager.openKvEditor(targetCase);
  }

  async openTopicOverlapPanel(caseName?: string): Promise<Widget> {
    const targetCase = caseName || this.getActiveCaseName();
    return this.previewManager.openTopicOverlapPanel(targetCase);
  }

  async openCitationPreview(docName: string, pageNum: number): Promise<Widget> {
    return this.previewManager.openCitationPreview(docName, pageNum);
  }

  async openCitationSideBySide(docName: string, pageNum: number): Promise<void> {
    return this.previewManager.openCitationSideBySide(docName, pageNum);
  }

  async openIngestionHelpPanel(caseName?: string): Promise<Widget> {
    const targetCase = caseName || this.getActiveCaseName();
    return this.previewManager.openIngestionHelpPanel(targetCase);
  }

  async openMonacoVaultsHelpPanel(caseName?: string): Promise<Widget> {
    const targetCase = caseName || this.getActiveCaseName();
    return this.previewManager.openMonacoVaultsHelpPanel(targetCase);
  }

  async openCaseGraphPanel(caseName?: string): Promise<Widget> {
    const targetCase = caseName || this.getActiveCaseName();
    return this.previewManager.openCaseGraphPanel(targetCase);
  }

  async openCommercialReadinessPanel(caseName?: string): Promise<Widget> {
    const targetCase = caseName || this.getActiveCaseName();
    return this.previewManager.openCommercialReadinessPanel(targetCase);
  }

  toggleTheme(): void {
    const currentTheme = this.themeService.getCurrentTheme();
    const isLight = currentTheme && currentTheme.id && currentTheme.id.toLowerCase().includes('light');
    const targetThemeId = isLight ? 'dark' : 'light';
    this.themeService.setCurrentTheme(targetThemeId);
  }

  toggleWordIllusion(): void {
    const body = document.body;
    if (body.classList.contains('hayagriva-word-illusion')) {
      body.classList.remove('hayagriva-word-illusion');
    } else {
      body.classList.add('hayagriva-word-illusion');
    }
  }

  // ── Workspace & Case Helpers ───────────────────────────────────────────────
  getCaseName(_filePath?: string): string {
    try {
      const workspaceRoot = this.workspaceService.getWorkspaceRootUri(undefined);
      if (workspaceRoot) {
        return safeDecodeURI(new URI(workspaceRoot.toString()).path.toString());
      }
    } catch (e: any) {
      this.logger.error(`[HAYAGRIVA] Error resolving workspace root: ${e.message}`);
    }
    return this.getActiveCaseName();
  }

  getActiveCaseName(): string {
    try {
      const workspaceRoot = this.workspaceService.getWorkspaceRootUri(undefined);
      if (workspaceRoot) {
        return safeDecodeURI(new URI(workspaceRoot.toString()).path.toString());
      }
    } catch (_) {}
    const active = this.editorManager.activeEditor;
    if (active) {
      const uri = active.getResourceUri();
      if (uri) {
        return safeDecodeURI(uri.path.toString());
      }
    }
    return '';
  }

  async ingestDocument(filePath: string, caseName: string): Promise<void> {
    try {
      const res = await fetch(`${this.getBackendUrl()}/api/hayagriva/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case: caseName, file: filePath })
      });
      const result = await res.json();
      if (result.success) {
        this.logger.info(`[HAYAGRIVA] Ingested ${getBasename(filePath)}`);
      } else {
        throw new Error(result.error || 'Ingest failed');
      }
    } catch (e: any) {
      this.logger.error(`[HAYAGRIVA] Ingest failed: ${e.message}`);
      throw e;
    }
  }

  async openWiki(_docName: string, _caseName: string): Promise<Widget> {
    try {
      const wsUri = this.workspaceService.getWorkspaceRootUri(undefined);
      if (!wsUri) throw new Error('No active workspace root found');
      const workspaceUri = new URI(wsUri.toString());
      const targetUri = workspaceUri.resolve('index.md');
      await this.editorManager.open(targetUri);
    } catch (e: any) {
      this.logger.error(`[HAYAGRIVA] Failed to open native markdown wiki: ${e.message}`);
    }
    return new Widget();
  }

  async openUploadSplit(): Promise<Widget> {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.docx,.doc,.xlsx,.xls,.wiki.html';

    input.onchange = async () => {
      if (!input.files || input.files.length === 0) return;

      if (input.files.length > 5) {
        const confirmed = confirm(`⚠️ Warning: You are about to upload and process a batch of ${input.files.length} files.\n\nAre you sure you want to proceed?`);
        if (!confirmed) return;
      }

      let caseName = this.getActiveCaseName();
      const ws = this.workspaceService.getWorkspaceRootUri(undefined);
      if (ws) {
        caseName = new URI(ws.toString()).path.toString();
      }

      const apiPort = this.getApiPort();
      this.logger.info(`[HAYAGRIVA] Starting upload of ${input.files.length} file(s) to ${caseName}...`);

      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const res = e.target?.result as string;
              resolve(res.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const uploadRes = await fetch(`http://127.0.0.1:${apiPort}/api/hayagriva/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ case: caseName, filename: file.name, content: base64 })
          });
          const uploadData = await uploadRes.json();
          if (uploadData.success) {
            this.logger.info(`[HAYAGRIVA] Successfully uploaded ${file.name}`);
          } else {
            throw new Error(uploadData.error || 'Upload failed');
          }
        } catch (err: any) {
          this.logger.error(`[HAYAGRIVA] Failed to upload ${file.name}: ${err.message}`);
        }
      }
    };

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
    return new Widget();
  }

  async openRagChat(): Promise<Widget> {
    const widget = await this.widgetManager.getOrCreateWidget('chat-view-widget');
    widget.title.label = 'AskHaya';
    widget.title.caption = 'AskHaya Senior Legal Counsel & Coworker Orchestrator';
    widget.title.iconClass = 'hayagriva-horse-icon';
    widget.title.closable = false;
    this.shell.addWidget(widget, { area: 'left', rank: 300 });
    this.shell.activateWidget(widget.id);
    return widget;
  }


  prefillChat(text: string): void {
    this.widgetManager.getOrCreateWidget('chat-view-widget').then((chatWidget: any) => {
      if (chatWidget && chatWidget.inputWidget) {
        chatWidget.inputWidget.initialValue = text;
        const editor = chatWidget.inputWidget.editor;
        if (editor && editor.document && editor.document.textEditorModel) {
          editor.document.textEditorModel.setValue(text);
        }
      }
    }).catch(e => {
      this.logger.error(`[HAYAGRIVA] Failed to prefill chat input: ${e.message}`);
    });
  }

  // ── Global Event Listeners & Sidebar Widgets ───────────────────────────────
  registerGlobalEventListeners(): void {
    window.addEventListener('message', async (event: any) => {
      if (event.data) {
        if (event.data.type === 'open-wiki-card') {
          const { filename } = event.data;
          const workspaceRoot = this.workspaceService.getWorkspaceRootUri(undefined);
          if (workspaceRoot) {
            const uri = new URI(workspaceRoot.toString()).resolve(`wiki/${filename}`);
            await this.editorManager.open(uri);
          }
        } else if (event.data.type === 'refresh-wiki-explorer') {
          if (this.wikiWidget) {
            const wikiIframe = this.wikiWidget.node.querySelector('iframe');
            wikiIframe?.contentWindow?.postMessage({ type: 'select-case', caseName: event.data.caseName }, '*');
          }
          if (this.conceptsWidget) {
            const conceptsIframe = this.conceptsWidget.node.querySelector('iframe');
            conceptsIframe?.contentWindow?.postMessage({ type: 'refresh-wiki-explorer', caseName: event.data.caseName }, '*');
          }
        } else if (event.data.type === 'close-all-editors') {
          await this.commandRegistry.executeCommand('workbench.action.closeAllEditors');
        } else if (event.data.type === 'close-upload-modal') {
          if (this.uploadModalElement) {
            document.body.removeChild(this.uploadModalElement);
            this.uploadModalElement = undefined;
          }
        } else if (event.data.type === 'open-concept-chunk') {
          const pathParam = event.data.relativePath || event.data.absolutePath || event.data.filePath;
          if (pathParam && typeof pathParam === 'string' && pathParam.trim() !== '') {
            const workspaceRoot = this.workspaceService.getWorkspaceRootUri(undefined);
            if (workspaceRoot) {
              const uri = new URI(workspaceRoot.toString()).resolve(pathParam);
              if (uri.toString() !== workspaceRoot.toString()) {
                const filePathStr = safeDecodeURI(uri.path.toString());
                if (filePathStr.toLowerCase().endsWith('.wiki.html')) {
                  const caseName = this.getCaseName(filePathStr);
                  await this.openWikiHtmlViewer(filePathStr, caseName);
                } else {
                  await this.editorManager.open(uri);
                }
              }
            }
          }
        } else if (event.data.type === 'open-entity-map-main') {
          await this.openEntityMapPanel();
        } else if (event.data.type === 'focus-entity-in-graph') {
          const widget = await this.openEntityMapPanel();
          const iframe = widget.node.querySelector('iframe');
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage(event.data, '*');
          }
        } else if (event.data.type === 'open-citation') {
          const { filePath, anchor } = event.data;
          const workspaceRoot = this.workspaceService.getWorkspaceRootUri(undefined);
          if (workspaceRoot) {
            const relativePath = filePath.replace(/\.(pdf|docx|xlsx|doc|xls)$/i, '.md');
            const uri = new URI(workspaceRoot.toString()).resolve(relativePath);
            try {
              const res = await fetch(`${this.getBackendUrl()}/api/hayagriva/read-file?path=${encodeURIComponent(uri.path.toString())}`);
              if (!res.ok) throw new Error();
              const fileContent = await res.text();
              const lines = fileContent.split(/\r?\n/);
              const lineIndex = lines.findIndex(l => l.includes(`## ${anchor}`) || l.includes(`# ${anchor}`));
              if (lineIndex !== -1) {
                const editor = await this.editorManager.open(uri, {
                  selection: {
                    start: { line: lineIndex, character: 0 },
                    end: { line: lineIndex, character: 99 }
                  }
                });
                this.decorator.applyHighlight(editor, lineIndex);
              } else {
                await this.editorManager.open(uri);
              }
            } catch {
              await this.editorManager.open(uri);
            }
          }
        } else if (event.data.type === 'focus-editor-line') {
          const { relativePath, line } = event.data;
          const workspaceRoot = this.workspaceService.getWorkspaceRootUri(undefined);
          if (workspaceRoot) {
            const uri = new URI(workspaceRoot.toString()).resolve(relativePath);
            const lineIndex = Math.max(0, line - 1);
            try {
              const editor = await this.editorManager.open(uri, {
                selection: {
                  start: { line: lineIndex, character: 0 },
                  end: { line: lineIndex, character: 99 }
                }
              });
              this.decorator.applyHighlight(editor, lineIndex);
            } catch (_) {}
          }
        } else if (event.data.type === 'compare-draft-versions') {
          const { draftName, version } = event.data;
          const workspaceRoot = this.workspaceService.getWorkspaceRootUri(undefined);
          if (workspaceRoot) {
            const leftRelative = draftName.replace(/\.md$/, `.v${version - 1}.md`);
            const leftUri = new URI(workspaceRoot.toString()).resolve(leftRelative);
            const rightUri = new URI(workspaceRoot.toString()).resolve(draftName);
            this.commandRegistry.executeCommand('vscode.diff', leftUri, rightUri, `Draft Redlines: v${version - 1} vs v${version}`);
          }
        } else if (event.data.type === 'open-compliance-queue') {
          await this.openComplianceQueue(undefined, event.data.tier || 'ALL');
        } else if (event.data.type === 'open-kv-editor') {
          await this.openKvPanel();
        } else if (event.data.type === 'open-billing-ledger-main') {
          await this.openCockpitPanel(undefined, 'billing');
        } else if (event.data.type === 'set-workspace-preference') {
          const { key, value } = event.data;
          if (key && value !== undefined) {
            try {
              await this.preferenceService.set(key, value);
            } catch (err: any) {
              this.logger.warn(`[HAYAGRIVA] Failed to set preference ${key}: ${err?.message}`);
            }
          }
        } else if (event.data.type === 'open-file') {
          const pathParam = event.data.filePath || event.data.relativePath;
          if (pathParam && typeof pathParam === 'string' && pathParam.trim() !== '') {
            const workspaceRoot = this.workspaceService.getWorkspaceRootUri(undefined);
            if (workspaceRoot) {
              const uri = new URI(workspaceRoot.toString()).resolve(pathParam);
              await this.editorManager.open(uri);
            }
          }
        }
      }
    });

    this.editorManager.onActiveEditorChanged(() => {
      const current = this.editorManager.activeEditor;
      if (current) {
        const uri = current.getResourceUri();
        if (uri) {
          const caseName = this.getCaseName(uri.path.toString());
          this.updateSidebarCase(caseName);
        }
      }
    });

    this.workspaceService.onWorkspaceLocationChanged((wsStat) => {
      this.hasSmartLaunchedSettings = false;
      const ws = wsStat ? wsStat.resource : this.workspaceService.getWorkspaceRootUri(undefined);
      if (ws) {
        const caseName = this.getCaseName(ws.path.toString());
        this.updateSidebarCase(caseName);
      }
      this.checkBackendHealth();
    });
  }

  initializeWikiExplorerWidget(): void {
    // Suppressed in Left Activity Bar in favor of 4-Pillar Chamber Bar.
    // Legal Canvas remains accessible via right-click '📖 Open Legal Canvas'.
  }

  initializeConceptsExplorerWidget(): void {
    // Suppressed in Left Activity Bar in favor of 5-Pillar Chamber Bar.
  }

  initializeEntityMapWidget(): void {
    if (this.entityMapWidget) {
      this.entityMapWidget.title.label = 'Forensic Entity Map';
      this.entityMapWidget.title.caption = 'Forensic Entity Directory & Triage';
      this.entityMapWidget.title.iconClass = 'hayagriva-pillar4-icon';
      this.shell.addWidget(this.entityMapWidget, { area: 'left', rank: 300 });
      return;
    }

    const initialCase = this.getActiveCaseName();
    const entityExplorer = new Widget();
    entityExplorer.id = 'hayagriva-entity-map-explorer';
    entityExplorer.title.label = 'Forensic Entity Map';
    entityExplorer.title.caption = 'Forensic Entity Directory & Triage';
    entityExplorer.title.iconClass = 'hayagriva-pillar4-icon';
    entityExplorer.title.closable = false;

    const isLight = this.isCurrentThemeLight();
    const entityIframe = document.createElement('iframe');
    entityIframe.style.width = '100%';
    entityIframe.style.height = '100%';
    entityIframe.style.border = 'none';
    entityIframe.srcdoc = entityExplorerHtml(initialCase, this.getApiPort(), isLight);
    entityExplorer.node.appendChild(entityIframe);

    this.entityMapWidget = entityExplorer;
    this.shell.addWidget(entityExplorer, { area: 'left', rank: 300 });
  }

  initializeNotificationCenterWidget(): void {
    this.mountHeaderNotificationChip();
    this.toggleInboxSlideDownDrawer();
  }

  mountHeaderNotificationChip(): void {
    if (document.getElementById('hayagriva-header-notif-chip')) return;

    const topPanel = document.getElementById('theia-top-panel');
    if (!topPanel) {
      setTimeout(() => this.mountHeaderNotificationChip(), 500);
      return;
    }

    const notifChip = document.createElement('div');
    notifChip.id = 'hayagriva-header-notif-chip';
    notifChip.title = 'Case Action Inbox & Notifications';
    notifChip.style.cssText = `
      position: relative;
      margin-left: auto;
      margin-right: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: var(--theia-menubar-foreground, #374151);
      cursor: pointer;
      user-select: none;
      transition: background 0.15s ease, color 0.15s ease;
      z-index: 1000;
    `;
    notifChip.innerHTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
      </svg>
      <span class="haya-notif-count" style="display: none; position: absolute; top: 1px; right: 1px; min-width: 14px; height: 14px; padding: 0 3px; font-size: 9.5px; font-weight: 700; line-height: 14px; text-align: center; color: #ffffff; background: #ef4444; border-radius: 9999px; box-shadow: 0 1px 2px rgba(0,0,0,0.2);">0</span>
    `;

    notifChip.addEventListener('mouseenter', () => {
      notifChip.style.background = 'rgba(0, 0, 0, 0.06)';
      notifChip.style.color = '#111827';
    });
    notifChip.addEventListener('mouseleave', () => {
      notifChip.style.background = 'transparent';
      notifChip.style.color = 'var(--theia-menubar-foreground, #374151)';
    });

    const updateCount = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${this.getApiPort()}/api/hayagriva/inbox`);
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.items) ? data.items : [];
          const count = items.filter((it: any) => !it.resolved).length;
          const countEl = notifChip.querySelector('.haya-notif-count') as HTMLElement | null;
          if (countEl) {
            countEl.textContent = count > 99 ? '99+' : String(count);
            if (count > 0) {
              countEl.style.display = 'inline-block';
            } else {
              countEl.style.display = 'none';
            }
          }
        }
      } catch (_) {}
    };

    updateCount();
    setInterval(updateCount, 15000);

    notifChip.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      this.toggleInboxSlideDownDrawer();
    });

    topPanel.appendChild(notifChip);
  }

  toggleInboxSlideDownDrawer(): void {
    const existing = document.getElementById('hayagriva-inbox-drawer');
    if (existing) {
      existing.remove();
      return;
    }

    const drawer = document.createElement('div');
    drawer.id = 'hayagriva-inbox-drawer';
    drawer.style.cssText = `
      position: fixed;
      top: 34px;
      right: 12px;
      width: 360px;
      max-height: 460px;
      overflow-y: auto;
      background: rgba(15, 23, 42, 0.96);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(245, 158, 11, 0.45);
      border-radius: 8px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
      padding: 14px;
      z-index: 10005;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: hayagrivaFadeIn 0.15s ease-out;
    `;

    drawer.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; margin-bottom: 10px;">
        <div style="font-weight: 700; font-size: 13px; color: #fbbf24; display: flex; align-items: center; gap: 6px;">
          <span>🔔</span> Case Action Inbox
        </div>
        <button id="haya-close-inbox-btn" style="background: transparent; border: none; color: #94a3b8; font-size: 14px; cursor: pointer;">✕</button>
      </div>
      <div id="haya-inbox-drawer-content" style="font-size: 12px; color: #cbd5e1; display: flex; flex-direction: column; gap: 8px;">
        <div style="padding: 12px; text-align: center; color: #94a3b8;">Loading case action items…</div>
      </div>
    `;

    document.body.appendChild(drawer);

    drawer.querySelector('#haya-close-inbox-btn')?.addEventListener('click', () => {
      drawer.remove();
    });

    const loadItems = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${this.getApiPort()}/api/hayagriva/inbox`);
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.items) ? data.items : [];
          const container = drawer.querySelector('#haya-inbox-drawer-content');
          if (!container) return;

          if (items.length === 0) {
            container.innerHTML = `<div style="padding: 16px; text-align: center; color: #94a3b8;">✓ All statutory actions current. Zero pending alerts.</div>`;
            return;
          }

          container.innerHTML = items.map((it: any) => `
            <div style="padding: 8px 10px; background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px;">
              <div style="font-weight: 600; color: #f1f5f9; margin-bottom: 3px;">${it.title || 'Case Alert'}</div>
              <div style="color: #94a3b8; font-size: 11.5px; margin-bottom: 6px;">${it.summary || it.description || ''}</div>
              <div style="display: flex; gap: 6px;">
                <button class="haya-inbox-ack-btn" data-id="${it.id}" style="padding: 3px 8px; font-size: 10.5px; background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 4px; cursor: pointer;">Acknowledge</button>
              </div>
            </div>
          `).join('');
        }
      } catch (err: any) {
        const container = drawer.querySelector('#haya-inbox-drawer-content');
        if (container) {
          container.innerHTML = `<div style="color: #f87171; padding: 8px;">Error loading inbox: ${err.message}</div>`;
        }
      }
    };

    loadItems();

    const dismissDrawer = (e: MouseEvent) => {
      if (!drawer.contains(e.target as Node) && !(e.target as HTMLElement).closest('#hayagriva-header-notif-chip')) {
        drawer.remove();
        document.removeEventListener('click', dismissDrawer, true);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', dismissDrawer, true);
    }, 50);
  }

  initializeInboxExplorerWidget(): void {
    this.mountHeaderNotificationChip();
  }

  initializeBillingExplorerWidget(): void {
    // Task Queue & IBBI Reg 34B Fee Ledger is accessible on-demand via the
    // Chamber Cockpit dropdown and Top Agents menubar. Do not auto-open modal on start.
  }

  syncFeatureGating(): void {
    const isAuth = this.authManager.isAuthenticated();

    // 1. Sync Estate Accounts & Billing Widget
    if (isAuth) {
      this.initializeBillingExplorerWidget();
    } else {
      if (this.billingWidget) {
        try { this.billingWidget.close(); } catch (_) {}
      }
    }

    // 2. Sync Hayagriva Agents tab in left sidebar
    const chatWidget = this.shell.getWidgets('left').find(w => w.id === 'chat-view-widget');
    if (chatWidget) {
      if (isAuth) {
        chatWidget.title.label = 'Hayagriva Agents';
        chatWidget.title.caption = 'Hayagriva Autonomous Agents';
      } else {
        chatWidget.title.label = '🔒 Hayagriva Agents (Locked)';
        chatWidget.title.caption = 'Sign in to unlock Hayagriva AI Agents';
      }
    }
  }

  openNotificationCenter(): void {
    if (!this.notificationWidget) {
      this.initializeNotificationCenterWidget();
    }
    if (this.notificationWidget) {
      this.shell.activateWidget(this.notificationWidget.id);
    }
  }

  openEntityExplorer(): void {
    if (!this.entityMapWidget) {
      this.initializeEntityMapWidget();
    }
    if (this.entityMapWidget) {
      this.shell.activateWidget(this.entityMapWidget.id);
    }
  }

  openBillingExplorer(): void {
    if (!this.billingWidget) {
      this.initializeBillingExplorerWidget();
    }
    if (this.billingWidget) {
      this.shell.activateWidget(this.billingWidget.id);
    }
  }

  focusPillar(pillarRank: number): void {
    switch (pillarRank) {
      case 100:
        this.shell.activateWidget('explorer-view-container');
        break;
      case 200:
        this.shell.activateWidget('chat-view-widget');
        break;
      case 300:
        this.openEntityExplorer();
        break;
      case 400:
        this.openNotificationCenter();
        break;
      case 500:
        this.openBillingExplorer();
        break;
    }
  }

  async openToolComingSoon(toolKey: string): Promise<Widget> {
    const id = `hayagriva-tool-${toolKey}`;
    let widget = this.shell.getWidgets('main').find(w => w.id === id);
    if (widget) {
      this.shell.activateWidget(widget.id);
      return widget;
    }

    const meta = (TOOLS_CATALOG && TOOLS_CATALOG[toolKey]) || {
      title: 'Chamber Tool',
      shortTitle: 'Tool',
      icon: '🛠️'
    };

    widget = new Widget();
    widget.id = id;
    widget.title.label = `${meta.icon} ${meta.shortTitle}`;
    widget.title.caption = meta.title;
    widget.title.closable = true;

    const isLight = this.isCurrentThemeLight();
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.srcdoc = toolComingSoonHtml(toolKey, isLight);
    widget.node.appendChild(iframe);

    this.shell.addWidget(widget, { area: 'main' });
    this.shell.activateWidget(widget.id);
    return widget;
  }

  updateSidebarCase(caseName: string): void {
    if (this.uploadModalElement) {
      const iframe = this.uploadModalElement.querySelector('iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'select-case', caseName }, '*');
      }
    }
    if (this.wikiWidget) {
      const iframe = this.wikiWidget.node.querySelector('iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'select-case', caseName }, '*');
      }
    }
    if (this.conceptsWidget) {
      const iframe = this.conceptsWidget.node.querySelector('iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'select-case', caseName }, '*');
      }
    }
    if (this.inboxWidget) {
      const iframe = this.inboxWidget.node.querySelector('iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'select-case', caseName }, '*');
      }
    }
    if (this.notificationWidget) {
      const iframe = this.notificationWidget.node.querySelector('iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'select-case', caseName }, '*');
      }
    }
    if (this.billingWidget) {
      const iframe = this.billingWidget.node.querySelector('iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'select-case', caseName }, '*');
      }
    }
    if (this.entityMapWidget) {
      const iframe = this.entityMapWidget.node.querySelector('iframe');
      if (iframe) {
        iframe.srcdoc = entityExplorerHtml(caseName, this.getApiPort(), this.isCurrentThemeLight());
      }
    }
  }

  // ── Backend Health Monitor & Telemetry ─────────────────────────────────────
  startBackendMonitor(): void {
    setTimeout(() => {
      this.checkBackendHealth();
    }, 8000);

    setInterval(() => {
      this.checkBackendHealth();
    }, 10000);
  }

  updateStatusBarStyle(mode: 'lite' | 'standard' | 'offline'): void {
    const style = document.getElementById('hayagriva-statusbar-style') || document.createElement('style');
    style.id = 'hayagriva-statusbar-style';

    let bgColor = '#0d1117';
    let textColor = '#c9d1d9';

    if (mode === 'lite') {
      bgColor = '#002d3a';
      textColor = '#00d4ff';
    } else if (mode === 'standard') {
      bgColor = '#3a2000';
      textColor = '#ff9900';
    } else if (mode === 'offline') {
      bgColor = '#4a1010';
      textColor = '#ff4d4d';
    }

    style.textContent = `
      #theia-statusbar, #theia-statusBar, .theia-statusBar, .theia-statusbar, [id*="statusbar"], [id*="statusBar"] {
        background-color: ${bgColor} !important;
        color: ${textColor} !important;
      }
      #theia-statusbar .statusbar-item, #theia-statusBar .statusbar-item, .theia-statusBar .statusbar-item, .theia-statusbar .statusbar-item {
        color: ${textColor} !important;
      }
      #theia-statusbar .statusbar-item .codicon, #theia-statusBar .statusbar-item .codicon, .theia-statusBar .statusbar-item .codicon,
      #theia-statusbar .statusbar-item .fa, #theia-statusBar .statusbar-item .fa, .theia-statusBar .statusbar-item .fa {
        color: ${textColor} !important;
      }
    `;

    if (!style.parentElement) {
      document.head.appendChild(style);
    }
  }

  async checkBackendHealth(): Promise<void> {
    try {
      const apiPort = this.getApiPort();
      const caseName = this.getActiveCaseName();

      const res = await fetch(`http://127.0.0.1:${apiPort}/api/hayagriva/cases`);
      if (res.ok) {
        this.isBackendOnline = true;
        this.showOfflineWarning = true;
        this.offlineFailureCount = 0;
        this.statusBar.setElement('hayagriva-status-item', {
          text: '$(fa-check) Hayagriva Server: Online',
          alignment: StatusBarAlignment.RIGHT,
          tooltip: 'The Hayagriva Node.js backend proxy is running normally.',
          priority: 100
        });

        let activeMode = 'lite';
        let cloudProvider = '';
        try {
          const settingsRes = await fetch(`http://127.0.0.1:${apiPort}/api/hayagriva/settings/get?case=${encodeURIComponent(caseName)}`);
          if (settingsRes.ok) {
            const settings = await settingsRes.json();
            activeMode = settings.activeMode || 'lite';
            cloudProvider = settings.cloudProvider || '';

            const documentCount = settings.documentCount !== undefined ? settings.documentCount : 1;
            const isDomainConfigured = settings.isDomainConfigured !== undefined ? settings.isDomainConfigured : true;
            if ((documentCount === 0 || !isDomainConfigured) && !this.hasSmartLaunchedSettings) {
              this.hasSmartLaunchedSettings = true;
              setTimeout(() => {
                this.openSettingsPanel().catch(err => this.logger.warn(`[Hayagriva] Smart-launch settings failed: ${err.message}`));
              }, 400);
            }
          }
        } catch (_) {}

        if (activeMode === 'cloud' || activeMode === 'local' || activeMode === 'standard') {
          const providerLabel = cloudProvider ? ` (${cloudProvider})` : '';
          this.statusBar.setElement('hayagriva-mode-item', {
            text: `$(fa-brain) Standard Mode${providerLabel}`,
            alignment: StatusBarAlignment.LEFT,
            tooltip: 'Hayagriva is running in Standard Mode (specialized compliance agents, background worker queue, semantic reranking).',
            priority: 150
          });
          this.updateStatusBarStyle('standard');
        } else {
          this.statusBar.setElement('hayagriva-mode-item', {
            text: '$(fa-bolt) Lite Mode',
            alignment: StatusBarAlignment.LEFT,
            tooltip: 'Hayagriva is running in Lite Mode (100% offline, local ONNX search, low-resource profile).',
            priority: 150
          });
          this.updateStatusBarStyle('lite');
        }

        // Tamper-Resistant Tri-Tier License Status Bar Element
        try {
          const licRes = await fetch(`http://127.0.0.1:${apiPort}/api/hayagriva/license/status?case=${encodeURIComponent(caseName)}`);
          if (licRes.ok) {
            const licData = await licRes.json();
            const isSubscribed = Boolean(licData.is_subscribed || (licData.tri_tier && licData.tri_tier.is_subscribed));
            const inTrial = Boolean(licData.in_trial || (licData.tri_tier && licData.tri_tier.in_trial));
            const trialExpired = Boolean(licData.trial_expired || (licData.tri_tier && licData.tri_tier.trial_expired));
            const stage2Local = licData.stage2_local || (licData.tri_tier && licData.tri_tier.stage2_local) || {};
            const daysRem = licData.trial_days_remaining || (licData.tri_tier && licData.tri_tier.trial_days_remaining) || (stage2Local.days_remaining || 0);

            if (isSubscribed) {
              const tierStr = (licData.tier || 'Starter').toUpperCase();
              this.statusBar.setElement('hayagriva-license-item', {
                text: `$(fa-shield) ${tierStr} Active`,
                alignment: StatusBarAlignment.LEFT,
                color: '#10b981',
                tooltip: `Hayagriva ${tierStr} Active: Autonomous AI Agents Unlocked. Click to manage settings.`,
                priority: 140,
                onclick: () => this.commandRegistry.executeCommand('hayagriva:openSettingsPanel')
              });
            } else if (inTrial) {
              this.statusBar.setElement('hayagriva-license-item', {
                text: `$(fa-clock-o) Pro Trial: ${daysRem}d left`,
                alignment: StatusBarAlignment.LEFT,
                color: '#38bdf8',
                tooltip: `Hayagriva Pro 7-Day Trial Active (${daysRem} days remaining). Full autonomous drafting unlocked.`,
                priority: 140,
                onclick: () => this.commandRegistry.executeCommand('hayagriva:openSettingsPanel')
              });
            } else if (trialExpired) {
              this.statusBar.setElement('hayagriva-license-item', {
                text: `$(fa-lock) Unlock Pro (₹25k/yr)`,
                alignment: StatusBarAlignment.LEFT,
                color: '#f59e0b',
                tooltip: '7-Day Free Trial Concluded. Click to enter a license key or subscribe.',
                priority: 140,
                onclick: () => this.commandRegistry.executeCommand('hayagriva:openSettingsPanel')
              });
            } else {
              // Free Core
              this.statusBar.setElement('hayagriva-license-item', {
                text: `$(fa-check-circle) Free Core (Agents Gated)`,
                alignment: StatusBarAlignment.LEFT,
                color: '#eab308',
                tooltip: 'Free Legal Workbench: Ingestion, PDF OCR, Search & Monaco Editor are 100% Free Forever. Click to enter your License Key and unlock AI Agents.',
                priority: 140,
                onclick: () => this.commandRegistry.executeCommand('hayagriva:openSettingsPanel')
              });
            }
          }
        } catch (_) {}

        // Resolution Bazaar Billing Status Bar Element
        try {
          const billRes = await fetch(`http://127.0.0.1:${apiPort}/api/billing/case-summary?case=${encodeURIComponent(caseName)}`);
          if (billRes.ok) {
            const billData = await billRes.json();
            const ledger = billData.ledger || {};
            const totalDue = (ledger.total_due_inr !== undefined) ? ledger.total_due_inr : 0;
            const pendingCount = ledger.pending_approval_count || 0;
            const pendingStr = pendingCount > 0 ? ` (${pendingCount} pending)` : '';
            this.statusBar.setElement('hayagriva-billing-item', {
              text: `$(fa-credit-card) RBZ: ₹${totalDue.toFixed(2)}${pendingStr}`,
              alignment: StatusBarAlignment.RIGHT,
              tooltip: `Resolution Bazaar Diligence Ledger: ₹${totalDue.toFixed(2)} due. Click to view ledger and invoices.`,
              priority: 95,
              onclick: () => this.commandRegistry.executeCommand('hayagriva.billing.open')
            });
          }
        } catch (_) {}

        return;
      }
      throw new Error('Non-ok response');
    } catch (_) {
      this.isBackendOnline = false;
      this.offlineFailureCount++;
      this.statusBar.setElement('hayagriva-status-item', {
        text: '$(fa-warning) Hayagriva Server: Offline',
        alignment: StatusBarAlignment.RIGHT,
        color: '#ff4d4d',
        tooltip: 'The Hayagriva Node.js backend is offline. Run ./launchers/start.command to start it.',
        priority: 100
      });
      this.statusBar.setElement('hayagriva-mode-item', {
        text: '$(fa-warning) Offline',
        alignment: StatusBarAlignment.LEFT,
        tooltip: 'Hayagriva backend proxy is offline.',
        priority: 150
      });
      this.updateStatusBarStyle('offline');

      // Only notify if the backend has failed at least 3 consecutive checks (~28s)
      if (this.showOfflineWarning && this.offlineFailureCount >= 3) {
        this.showOfflineWarning = false;
        setTimeout(() => {
          if (!this.isBackendOnline) {
            this.messageService.error('Hayagriva backend server is offline. Please launch it using ./launchers/start.command');
          }
        }, 3000);
      }
    }
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      /* ── Permanently Suppress Developer Gear & Accounts from Left Activity Bar ── */
      #settings-menu,
      #accounts-menu,
      [id="settings-menu"],
      [id="accounts-menu"],
      [data-id="settings-menu"],
      [data-id="accounts-menu"],
      .codicon-settings-gear,
      .codicon-account,
      .theia-tab-bar-container.left .p-TabBar-tab[title*="Manage"],
      .theia-tab-bar-container.left .lm-TabBar-tab[title*="Manage"],
      .theia-tab-bar-container.left .p-TabBar-tab[title*="Accounts"],
      .theia-tab-bar-container.left .lm-TabBar-tab[title*="Accounts"],
      .theia-tab-bar-container.left [data-id="settings-menu"],
      .theia-tab-bar-container.left [data-id="accounts-menu"] {
        display: none !important;
      }

      .theia-AgentAvatar.codicon-copilot {
        background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAJRklEQVR42u1dfWgVRxD/GbXFkIoEbQhSG9IgWhWRWCviB2JFsSVorW1TJYiI1lqrhDS0iohYQpCiiBRRiggiRVKliCi2hNYgxYpiU6kEEUloQ9A/rA1+UIq9/vH2kn3n7t3ufeT2bucHy3vvbm/f3s7s7O7M7CxAIBAIBAKBQCAQCASLMNyy990PYDSAm0R6O9EHwAHQSE1hJy4yBnAA7KTmsA/nOQZwANRRk9jNAA6AUpsbpMTgut0BcD/mMl8UXHtE/cI8jON6aJz4VyABHABt1ORm4XeOOEdiLNfxSZU2NvQwQ+vlJFRPJ6PtYdUcoFxwrTWGcqcr5Kkn4Zs+VkhEdFTsDhgCkphzkAQIgVck1/sjlvuOYr6V1AfTRYtP7zyQ0ATQWilgogR44nPvEwDbqI/kG/UKPXRrwhKglciQHiYqEmlDggzgEBnS1wOopDnEAHYzgA6hrmiWO44mgemhRyPvQ4iVSYuZTmE2t7rQwXzqh+lho2Zvncye+yGEqJclWm1kaBhIIl0jEqSLfgOYwGH1aIKFhqK0McMQBvCm3UQae4YBv9QJYAyRyG4mcAB0EYmSxaIMMIEDYBeRKjkszwgTkAYxQZw0iMi3FfUShBzPBY4DmAbga8n994hkSMRL2LS0gNXxqODeRiJddIzMwLh/j6vvU8+9NUTCaLiaoQngXFbnvRIpQYhh7N9oOBO4u4ymeK7XECmjz/wveZjiGPd9D4DnDWGCRxIGHk4kjdb7q1HsMlbnWX9vNVQnQHqCELgtadBzHPFb2fdbBquNwe1CJiZAeIeQbg+R+e8vARiVAe1gOzFBMGZKGnERR/QWATN0GD45dC2HTbDM71AHEwJ6UZtgbG3LiNXQncMAQAV3bTuRvYDxPg33lCPyVfZ9C8cM8zKkK6jl3nktu9bHmIJm/JLUwOUZxb53cwzwT4YYgB/OwHk/NbJOYCXOKEyitgjE/x6DxH+fZv6lJPTVLX08A1z1XN9uUM/eolmfJUR6NQao9lGoDCWBVayS89iMX3TvCeT2A2IA6HvaDHUPX4FC+DrVMf6B4F6jrdvQRCjTXL+3sAbsQ7pKHZV8q1jew57rVwCMBbmSDeB4xmbw8MQx9EtuUOplEDuQEhNoiPMKFFv/0kqbIbb5y9IhTtqJzMNeCUcMIJlYmeIbeCdEXS77WAbLSQoUa8VkaSaKLWqmuH7r7DF0cQ+D3sUAsJDLd4ukQLZ8/7eGfPZnj3RrheWOI1na/LE4pvAznZ7frp6g3UYGuJwhBvjSU/dJEZjgDlsqQmDihk0hYl7PELO+xj5Xs88uAH+HDFxdjeJDK7ZxS0dQLACz9wH0cUxQGcN8gmeOByT+zU1PPDuWEHAghS4T1Nu2JHQyltwlnauYmuUjyTpCMoHDVMa5nwPMyyDDumHsTrDPX9jndYjPKvxeocxePBsX2QqfgVsZlADHBdKriv3egfAGJG809IUk/s1MqwX1b/d5JwC4oVj2DJvG/jUZZYDREG9fkzHAEk1mtwYPMsoAMg2mG7x6l+Yw0Oz5fZ1m/+ambp/3OM9+l0oYoEpSZhmePdOoOu/E35RRBnBDvxwK2Pwp8hqWMf1eGx1EnIyL/6Ddv12CZ6tYzxbpCkRljSYGMCtdRLErOq8XcDxKoeVQ9ynsg9i8fCavxN+fg97P/26T7PWTBY8o13AyyaUmMIux+L9ln6sE926iOLKpi6mCvKUonGvwk89/vZtn0T82J72fv7YazxqKIPD08UsTJFJgNsjyl3qq8Lhx8TuWgUIUMD+xfUThP45Jhsk1NPlLN7mOGQ2e66e4d5qmMG7vQDiLYGOeiN+dMeK7xphaH8aAYGnn4hpjDlXV93IBAzSBvH5SScMlvVvUW2sg9/dzULzvf46GFGhHwV2eRP8Qpg0K2sqeAOauEGx7m+IjMWShZefmJcDkRYMJ3gtgnyA6Rw/Uw8EvhPhE0xbJkAImYaywBi5Adg59qvDM9FUJtNZzfz27vk7wbJ2CZPyOZv3JBnN2GbMeBR9/ncnpBME7etf6+wLG+waFNhqZB+LXGqjImRihjHOS9zzvyXcWwZHPNgcwQS8sPAI2icRvtmxGfI4grZAfcnlbUQLyS8nJgvuZP6yyLmXiH4xxIgqPI+uBACLrBMCCJNzdiawzQJoBHHmjzYmYVMFgunneCzgqA/QGdJhMY0NKxK/01GNWhLImScbqoLLDBsBy8mQOLkuB6Yah2MECKARmQsjYxV0CL6C/uGsfxVDnZp97mY4gVoN0TumIYzk6yuf5dQrluvhD4b+u+5RXS3oAvZl+HPWAhliWleHu67sQ4YiZxBmgZIhEMhLepzcxwfp6Cd7hsdnL8DIGLaBBeI7TUXjxZx70ATuQvIIniWikQRo6v7LqMej+FvS/PZyruZNHn8DTCZX7sWK+MZo9v0zS+L+iEAMAAN4KKG8SpzOAgrEMAD5EjpFm798VUA5vqi0PuVzzppMaE+FpgnMGnQQ7TiroNVT8t3mWXLJ82wURPPzSFQWzb9C+wdI8McCwmIl/LKb/VWWUMNJMJf89iE3Qd2HZoVBJ9f7TCA7mrEP8Do3Q8lGGv1wHi2yISPxNMYl/KAR3WiWwA+icCbQyxPs1wwKE3SCyX+M/DvqU06UwQWwPIfqXRgyA0QmLsBnhQ7NE7f11CYz7vNZufcgjaaxDJQp76/wa5lSIcr9QIG6XIvFVdvZMR/HeR13inwIBQOEI+LFsPZ6k3qHK595aBB9lyydehdsUgviziezxYgnUDEii6w81GYn34/9Mk/CniVTJ4EZMy0uV0K81Ib2fjDgqtiSnDDA15HOfeiZxIxSecf0G3lT8j8+Zcuou9VMYZ3cIU8ZkRYunkTP8EuKVAfA9+MeY23I+ig1OBAMlADSMNyIJsFNw77DpDTWCeAUA8D73/beQZfARQ/4D8AKAx6a/OA0BGIj36+LVkGW4s/oPmBR5TM2aLkFVRTgfi+9oiKGjhtvaRTAEpRoEHB9x7lBFzW0m+jUnf9NDEH8fNXO2pcAlLv8FDcKTEicjCLLirQwh/pdRs+ZnKNDRHXxFTZk/xRC4Uzplee7nuWFs0QMEbU97W3L9DUT3SyAYKgk6fQ53OEJNlV+cZUT+RsAY/ci5OzYBAwEZ+FBt9zEY249AIBAIBAKBQMg3/gecXk2ChjekwwAAAABJRU5ErkJggg==') !important;
        background-size: contain !important;
        background-repeat: no-repeat !important;
        background-position: center !important;
        width: 24px !important;
        height: 24px !important;
        display: inline-block !important;
      }

      /* ── Hayagriva 6-Pillar Sovereign Left Activity Bar Icons ── */

      /* Universal Reset for 6-Pillar Tab Icons (prevent font icon glyph clashing) */
      .theia-tab-bar-container.left .p-TabBar-tab .p-TabBar-tabIcon::before,
      .theia-tab-bar-container.left .lm-TabBar-tab .lm-TabBar-tabIcon::before,
      .hayagriva-registry-icon::before,
      .hayagriva-advisor-icon::before,
      .hayagriva-document-icon::before,
      .hayagriva-forms-icon::before,
      .hayagriva-claims-icon::before,
      .hayagriva-bank-icon::before,
      .hayagriva-pillar1-icon::before,
      .hayagriva-pillar2-icon::before,
      .hayagriva-horse-icon::before,
      .hayagriva-pillar4-icon::before,
      .hayagriva-pillar5-icon::before,
      .hayagriva-pillar6-icon::before {
        content: "" !important;
      }

      /* Pillar 1: @Registry / Documents (Executive Tabbed Dossier Folder) */
      .hayagriva-registry-icon,
      i.hayagriva-registry-icon,
      .theia-tab-icon.hayagriva-registry-icon,
      .p-TabBar-tabIcon.hayagriva-registry-icon,
      .lm-TabBar-tabIcon.hayagriva-registry-icon,
      .hayagriva-pillar1-icon,
      i.hayagriva-pillar1-icon,
      .theia-tab-icon.hayagriva-pillar1-icon,
      .p-TabBar-tabIcon.hayagriva-pillar1-icon,
      .lm-TabBar-tabIcon.hayagriva-pillar1-icon,
      #theia-left-content-panel [data-id*="explorer-view-container"] [class*="tabIcon"],
      .theia-app-left [data-id*="explorer-view-container"] [class*="tabIcon"],
      [id*="explorer-view-container"] [class*="tabIcon"],
      .theia-tab-bar-container.left [title*="@Registry"] [class*="tabIcon"],
      .theia-tab-bar-container.left [title*="Files & Folders"] [class*="tabIcon"],
      .theia-tab-bar-container.left [title*="Documents"] [class*="tabIcon"],
      .theia-tab-bar-container.left .p-TabBar-tab:nth-child(1) .p-TabBar-tabIcon,
      .theia-tab-bar-container.left .lm-TabBar-tab:nth-child(1) .lm-TabBar-tabIcon {
        display: inline-block !important;
        width: 22px !important;
        height: 22px !important;
        background-color: currentColor !important;
        -webkit-mask: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTMgNi41QTIuNSAyLjUgMCAwIDEgNS41IDRIOS4yYy43IDAgMS40LjMgMS44LjhsMS4yIDEuNGMuNS41IDEuMS44IDEuOC44SDE4LjVBMi41IDIuNSAwIDAgMSAyMSA5LjVWMTcuNUEyLjUgMi41IDAgMCAxIDE4LjUgMjBINS41QTIuNSAyLjUgMCAwIDEgMyAxNy41VjYuNXoiLz48cGF0aCBkPSJNMyAxMS41YzEuNS0xIDMuNS0xLjUgNS41LTEuNWg3YzIgMCA0IC41IDUuNSAxLjUiLz48L3N2Zz4=") center / contain no-repeat !important;
        mask: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTMgNi41QTIuNSAyLjUgMCAwIDEgNS41IDRIOS4yYy43IDAgMS40LjMgMS44LjhsMS4yIDEuNGMuNS41IDEuMS44IDEuOC44SDE4LjVBMi41IDIuNSAwIDAgMSAyMSA5LjVWMTcuNUEyLjUgMi41IDAgMCAxIDE4LjUgMjBINS41QTIuNSAyLjUgMCAwIDEgMyAxNy41VjYuNXoiLz48cGF0aCBkPSJNMyAxMS41YzEuNS0xIDMuNS0xLjUgNS41LTEuNWg3YzIgMCA0IC41IDUuNSAxLjUiLz48L3N2Zz4=") center / contain no-repeat !important;
        -webkit-mask-size: contain !important;
        mask-size: contain !important;
        vertical-align: middle !important;
        transition: color 0.15s ease, filter 0.15s ease !important;
      }

      /* Suppress Search tab from Left Sovereign Activity Bar */
      #theia-left-content-panel [data-id*="search-view-container"],
      .theia-app-left [data-id*="search-view-container"],
      [id*="search-view-container"].p-TabBar-tab,
      [id*="search-view-container"].lm-TabBar-tab {
        display: none !important;
      }

      /* Pillar 2: AskHaya Senior Partner (Option 3: Flowing Stallion Profile) */
      .hayagriva-horse-icon,
      i.hayagriva-horse-icon,
      .theia-tab-icon.hayagriva-horse-icon,
      .p-TabBar-tabIcon.hayagriva-horse-icon,
      .lm-TabBar-tabIcon.hayagriva-horse-icon,
      #theia-left-content-panel [data-id*="chat-view-container"] [class*="tabIcon"],
      .theia-app-left [data-id*="chat-view-container"] [class*="tabIcon"],
      [id*="chat-view-container"] [class*="tabIcon"],
      .theia-tab-bar-container.left [title*="AskHaya"] [class*="tabIcon"],
      .theia-tab-bar-container.left .p-TabBar-tab:nth-child(2) .p-TabBar-tabIcon,
      .theia-tab-bar-container.left .lm-TabBar-tab:nth-child(2) .lm-TabBar-tabIcon {
        display: inline-block !important;
        width: 22px !important;
        height: 22px !important;
        background-color: currentColor !important;
        -webkit-mask: url("data:image/png;base64,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") center / contain no-repeat !important;
        mask: url("data:image/png;base64,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") center / contain no-repeat !important;
        -webkit-mask-size: contain !important;
        mask-size: contain !important;
        vertical-align: middle !important;
        transition: color 0.15s ease, filter 0.15s ease !important;
      }


      /* Coworker Icons */
      .hayagriva-advisor-icon,
      i.hayagriva-advisor-icon,
      .theia-tab-icon.hayagriva-advisor-icon,
      .p-TabBar-tabIcon.hayagriva-advisor-icon,
      .lm-TabBar-tabIcon.hayagriva-advisor-icon {
        display: inline-block !important;
        width: 22px !important;
        height: 22px !important;
        background-color: currentColor !important;
        -webkit-mask: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0ibTE2IDE2IDMtOCAzIDhjLS44Ny42NS0xLjkyIDEtMyAxcy0yLjEzLS4zNS0zLTFaIi8+PHBhdGggZD0ibTIgMTYgMy04IDMgOGMtLjg3LjY1LTEuOTIgMS0zIDFzLTIuMTMtLjM1LTMtMVoiLz48cGF0aCBkPSJNNyAyMWgxMCIvPjxwYXRoIGQ9Ik0xMiAzdjE4Ii8+PHBhdGggZD0iTTMgN2gyYzIgMCA1LTEgNy0yIDIgMSA1IDIgNyAyaDIiLz48L3N2Zz4=") center / contain no-repeat !important;
        mask: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0ibTE2IDE2IDMtOCAzIDhjLS44Ny42NS0xLjkyIDEtMyAxcy0yLjEzLS4zNS0zLTFaIi8+PHBhdGggZD0ibTIgMTYgMy04IDMgOGMtLjg3LjY1LTEuOTIgMS0zIDFzLTIuMTMtLjM1LTMtMVoiLz48cGF0aCBkPSJNNyAyMWgxMCIvPjxwYXRoIGQ9Ik0xMiAzdjE4Ii8+PHBhdGggZD0iTTMgN2gyYzIgMCA1LTEgNy0yIDIgMSA1IDIgNyAyaDIiLz48L3N2Zz4=") center / contain no-repeat !important;
        -webkit-mask-size: contain !important;
        mask-size: contain !important;
        vertical-align: middle !important;
      }

      .hayagriva-document-icon,
      i.hayagriva-document-icon,
      .theia-tab-icon.hayagriva-document-icon,
      .p-TabBar-tabIcon.hayagriva-document-icon,
      .lm-TabBar-tabIcon.hayagriva-document-icon {
        display: inline-block !important;
        width: 22px !important;
        height: 22px !important;
        background-color: currentColor !important;
        -webkit-mask: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTE0IDJINmEyIDIgMCAwIDAtMiAydjE2YTIgMiAwIDAgMCAyIDJoMTJhMiAyIDAgMCAwIDItMlY4eiIvPjxwb2x5bGluZSBwb2ludHM9IjE0IDIgMTQgOCAyMCA4Ii8+PGxpbmUgeDE9IjE2IiB5MT0iMTMiIHgyPSI4IiB5Mj0iMTMiLz48bGluZSB4MT0iMTYiIHkxPSIxNyIgeDI9IjgiIHkyPSIxNyIvPjxwb2x5bGluZSBwb2ludHM9IjEwIDkgOSA5IDggOSIvPjwvc3ZnPg==") center / contain no-repeat !important;
        mask: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTE0IDJINmEyIDIgMCAwIDAtMiAydjE2YTIgMiAwIDAgMCAyIDJoMTJhMiAyIDAgMCAwIDItMlY4eiIvPjxwb2x5bGluZSBwb2ludHM9IjE0IDIgMTQgOCAyMCA4Ii8+PGxpbmUgeDE9IjE2IiB5MT0iMTMiIHgyPSI4IiB5Mj0iMTMiLz48bGluZSB4MT0iMTYiIHkxPSIxNyIgeDI9IjgiIHkyPSIxNyIvPjxwb2x5bGluZSBwb2ludHM9IjEwIDkgOSA5IDggOSIvPjwvc3ZnPg==") center / contain no-repeat !important;
        -webkit-mask-size: contain !important;
        mask-size: contain !important;
        vertical-align: middle !important;
      }

      .hayagriva-forms-icon,
      i.hayagriva-forms-icon,
      .theia-tab-icon.hayagriva-forms-icon,
      .p-TabBar-tabIcon.hayagriva-forms-icon,
      .lm-TabBar-tabIcon.hayagriva-forms-icon {
        display: inline-block !important;
        width: 22px !important;
        height: 22px !important;
        background-color: currentColor !important;
        -webkit-mask: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0ibTkgMTEgMyAzTDIyIDQiLz48cGF0aCBkPSJNMjEgMTJ2N2EyIDIgMCAwIDEtMiAySDVhMiAyIDAgMCAxLTItMlY1YTIgMiAwIDAgMSAyLTJoMTEiLz48L3N2Zz4=") center / contain no-repeat !important;
        mask: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0ibTkgMTEgMyAzTDIyIDQiLz48cGF0aCBkPSJNMjEgMTJ2N2EyIDIgMCAwIDEtMiAySDVhMiAyIDAgMCAxLTItMlY1YTIgMiAwIDAgMSAyLTJoMTEiLz48L3N2Zz4=") center / contain no-repeat !important;
        -webkit-mask-size: contain !important;
        mask-size: contain !important;
        vertical-align: middle !important;
      }

      .hayagriva-claims-icon,
      i.hayagriva-claims-icon,
      .theia-tab-icon.hayagriva-claims-icon,
      .p-TabBar-tabIcon.hayagriva-claims-icon,
      .lm-TabBar-tabIcon.hayagriva-claims-icon {
        display: inline-block !important;
        width: 22px !important;
        height: 22px !important;
        background-color: currentColor !important;
        -webkit-mask: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3Qgd2lkdGg9IjIwIiBoZWlnaHQ9IjE0IiB4PSIyIiB5PSI1IiByeD0iMiIvPjxsaW5lIHgxPSIyIiB4Mj0iMjIiIHkxPSIxMCIgeTI9IjEwIi8+PHBhdGggZD0iTTYgMTVoLjAxIi8+PHBhdGggZD0iTTEwIDE1aC4wMSIvPjxwYXRoIGQ9Ik0xNCAxNWguMDEiLz48cGF0aCBkPSJNMTggMTVoLjAxIi8+PC9zdmc+") center / contain no-repeat !important;
        mask: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3Qgd2lkdGg9IjIwIiBoZWlnaHQ9IjE0IiB4PSIyIiB5PSI1IiByeD0iMiIvPjxsaW5lIHgxPSIyIiB4Mj0iMjIiIHkxPSIxMCIgeTI9IjEwIi8+PHBhdGggZD0iTTYgMTVoLjAxIi8+PHBhdGggZD0iTTEwIDE1aC4wMSIvPjxwYXRoIGQ9Ik0xNCAxNWguMDEiLz48cGF0aCBkPSJNMTggMTVoLjAxIi8+PC9zdmc+") center / contain no-repeat !important;
        -webkit-mask-size: contain !important;
        mask-size: contain !important;
        vertical-align: middle !important;
      }

      .hayagriva-bank-icon,
      i.hayagriva-bank-icon,
      .theia-tab-icon.hayagriva-bank-icon,
      .p-TabBar-tabIcon.hayagriva-bank-icon,
      .lm-TabBar-tabIcon.hayagriva-bank-icon {
        display: inline-block !important;
        width: 22px !important;
        height: 22px !important;
        background-color: currentColor !important;
        -webkit-mask: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBvbHlnb24gcG9pbnRzPSIxMiAyIDIgNyAyMiA3IDEyIDIiLz48bGluZSB4MT0iMiIgeDI9IjIyIiB5MT0iMjAiIHkyPSIyMCIvPjxsaW5lIHgxPSI0IiB4Mj0iNCIgeTE9IjE3IiB5Mj0iNyIvPjxsaW5lIHgxPSI5IiB4Mj0iOSIgeTE9IjE3IiB5Mj0iNyIvPjxsaW5lIHgxPSIxNSIgeDI9IjE1IiB5MT0iMTciIHkyPSI3Ii8+PGxpbmUgeDE9IjIwIiB4Mj0iMjAiIHkxPSIxNyIgeTI9IjciLz48L3N2Zz4=") center / contain no-repeat !important;
        mask: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBvbHlnb24gcG9pbnRzPSIxMiAyIDIgNyAyMiA3IDEyIDIiLz48bGluZSB4MT0iMiIgeDI9IjIyIiB5MT0iMjAiIHkyPSIyMCIvPjxsaW5lIHgxPSI0IiB4Mj0iNCIgeTE9IjE3IiB5Mj0iNyIvPjxsaW5lIHgxPSI5IiB4Mj0iOSIgeTE9IjE3IiB5Mj0iNyIvPjxsaW5lIHgxPSIxNSIgeDI9IjE1IiB5MT0iMTciIHkyPSI3Ii8+PGxpbmUgeDE9IjIwIiB4Mj0iMjAiIHkxPSIxNyIgeTI9IjciLz48L3N2Zz4=") center / contain no-repeat !important;
        -webkit-mask-size: contain !important;
        mask-size: contain !important;
        vertical-align: middle !important;
      }

      /* Pillar 3: Forensic Entity Map (Radial Corporate Web / X-Nodes Network) */
      .hayagriva-pillar4-icon,
      i.hayagriva-pillar4-icon,
      .theia-tab-icon.hayagriva-pillar4-icon,
      .p-TabBar-tabIcon.hayagriva-pillar4-icon,
      .lm-TabBar-tabIcon.hayagriva-pillar4-icon,
      #theia-left-content-panel [data-id*="entity-map"] [class*="tabIcon"],
      .theia-app-left [data-id*="entity-map"] [class*="tabIcon"],
      [id*="entity-map"] [class*="tabIcon"],
      .theia-tab-bar-container.left [title*="Forensic Entity Map"] [class*="tabIcon"],
      .theia-tab-bar-container.left [title*="Entity Map"] [class*="tabIcon"],
      .theia-tab-bar-container.left [title*="Forensic Entities"] [class*="tabIcon"],
      .theia-tab-bar-container.left .p-TabBar-tab:nth-child(3) .p-TabBar-tabIcon,
      .theia-tab-bar-container.left .lm-TabBar-tab:nth-child(3) .lm-TabBar-tabIcon {
        display: inline-block !important;
        width: 22px !important;
        height: 22px !important;
        background-color: currentColor !important;
        -webkit-mask: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMy4yIi8+PGNpcmNsZSBjeD0iNS41IiBjeT0iNS41IiByPSIyLjUiLz48Y2lyY2xlIGN4PSIxOC41IiBjeT0iNS41IiByPSIyLjUiLz48Y2lyY2xlIGN4PSI1LjUiIGN5PSIxOC41IiByPSIyLjUiLz48Y2lyY2xlIGN4PSIxOC41IiBjeT0iMTguNSIgcj0iMi41Ii8+PGxpbmUgeDE9IjcuMyIgeTE9IjcuMyIgeDI9IjkuOCIgeTI9IjkuOCIvPjxsaW5lIHgxPSIxNi43IiB5MT0iNy4zIiB4Mj0iMTQuMiIgeTI9IjkuOCIvPjxsaW5lIHgxPSI3LjMiIHkxPSIxNi43IiB4Mj0iOS44IiB5Mj0iMTQuMiIvPjxsaW5lIHgxPSIxNi43IiB5MT0iMTYuNyIgeDI9IjE0LjIiIHkyPSIxNC4yIi8+PC9zdmc+") center / contain no-repeat !important;
        mask: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMy4yIi8+PGNpcmNsZSBjeD0iNS41IiBjeT0iNS41IiByPSIyLjUiLz48Y2lyY2xlIGN4PSIxOC41IiBjeT0iNS41IiByPSIyLjUiLz48Y2lyY2xlIGN4PSI1LjUiIGN5PSIxOC41IiByPSIyLjUiLz48Y2lyY2xlIGN4PSIxOC41IiBjeT0iMTguNSIgcj0iMi41Ii8+PGxpbmUgeDE9IjcuMyIgeTE9IjcuMyIgeDI9IjkuOCIgeTI9IjkuOCIvPjxsaW5lIHgxPSIxNi43IiB5MT0iNy4zIiB4Mj0iMTQuMiIgeTI9IjkuOCIvPjxsaW5lIHgxPSI3LjMiIHkxPSIxNi43IiB4Mj0iOS44IiB5Mj0iMTQuMiIvPjxsaW5lIHgxPSIxNi43IiB5MT0iMTYuNyIgeDI9IjE0LjIiIHkyPSIxNC4yIi8+PC9zdmc+") center / contain no-repeat !important;
        -webkit-mask-size: contain !important;
        mask-size: contain !important;
        vertical-align: middle !important;
        transition: color 0.15s ease, filter 0.15s ease !important;
      }

      /* Pillar 4: Notification Center (Statutory & Task Notification Bell) */
      .hayagriva-pillar5-icon,
      i.hayagriva-pillar5-icon,
      .theia-tab-icon.hayagriva-pillar5-icon,
      .p-TabBar-tabIcon.hayagriva-pillar5-icon,
      .lm-TabBar-tabIcon.hayagriva-pillar5-icon,
      #theia-left-content-panel [data-id*="notification"] [class*="tabIcon"],
      .theia-app-left [data-id*="notification"] [class*="tabIcon"],
      [id*="notification"] [class*="tabIcon"],
      .theia-tab-bar-container.left [title*="Notification Center"] [class*="tabIcon"],
      .theia-tab-bar-container.left [title*="Notification"] [class*="tabIcon"],
      .theia-tab-bar-container.left .p-TabBar-tab:nth-child(4) .p-TabBar-tabIcon,
      .theia-tab-bar-container.left .lm-TabBar-tab:nth-child(4) .lm-TabBar-tabIcon {
        display: inline-block !important;
        width: 22px !important;
        height: 22px !important;
        background-color: currentColor !important;
        -webkit-mask: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTE4IDhBNiA2IDAgMCAwIDYgOGMwIDctMyA5LTMgOWgxOHMtMy0yLTMtOSIvPjxwYXRoIGQ9Ik0xMy43MyAyMWEyIDIgMCAwIDEtMy40NiAwIi8+PC9zdmc+") center / contain no-repeat !important;
        mask: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTE4IDhBNiA2IDAgMCAwIDYgOGMwIDctMyA5LTMgOWgxOHMtMy0yLTMtOSIvPjxwYXRoIGQ9Ik0xMy43MyAyMWEyIDIgMCAwIDEtMy40NiAwIi8+PC9zdmc+") center / contain no-repeat !important;
        -webkit-mask-size: contain !important;
        mask-size: contain !important;
        vertical-align: middle !important;
        transition: color 0.15s ease, filter 0.15s ease !important;
      }

      /* Pillar 5: Billing Center (Resolution Bazaar Diligence Ledger & Payment Card) */
      .hayagriva-pillar6-icon,
      i.hayagriva-pillar6-icon,
      .theia-tab-icon.hayagriva-pillar6-icon,
      .p-TabBar-tabIcon.hayagriva-pillar6-icon,
      .lm-TabBar-tabIcon.hayagriva-pillar6-icon,
      #theia-left-content-panel [data-id*="billing"] [class*="tabIcon"],
      .theia-app-left [data-id*="billing"] [class*="tabIcon"],
      [id*="billing"] [class*="tabIcon"],
      .theia-tab-bar-container.left [title*="Billing Center"] [class*="tabIcon"],
      .theia-tab-bar-container.left [title*="Billing"] [class*="tabIcon"],
      .theia-tab-bar-container.left .p-TabBar-tab:nth-child(5) .p-TabBar-tabIcon,
      .theia-tab-bar-container.left .lm-TabBar-tab:nth-child(5) .lm-TabBar-tabIcon {
        display: inline-block !important;
        width: 22px !important;
        height: 22px !important;
        background-color: currentColor !important;
        -webkit-mask: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMiIgeT0iNSIgd2lkdGg9IjIwIiBoZWlnaHQ9IjE0IiByeD0iMiIvPjxsaW5lIHgxPSIyIiB5MT0iMTAiIHgyPSIyMiIgeTI9IjEwIi8+PC9zdmc+") center / contain no-repeat !important;
        mask: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMiIgeT0iNSIgd2lkdGg9IjIwIiBoZWlnaHQ9IjE0IiByeD0iMiIvPjxsaW5lIHgxPSIyIiB5MT0iMTAiIHgyPSIyMiIgeTI9IjEwIi8+PC9zdmc+") center / contain no-repeat !important;
        -webkit-mask-size: contain !important;
        mask-size: contain !important;
        vertical-align: middle !important;
        transition: color 0.15s ease, filter 0.15s ease !important;
      }

      /* Hover & Current Active Tab States across Left Activity Bar (Theme Adaptive) */
      #theia-left-content-panel .p-TabBar-tab:hover [class*="tabIcon"],
      #theia-left-content-panel .lm-TabBar-tab:hover [class*="tabIcon"],
      .theia-app-left .p-TabBar-tab:hover [class*="tabIcon"],
      .theia-app-left .lm-TabBar-tab:hover [class*="tabIcon"],
      .theia-tab-bar-container.left [class*="TabBar-tab"]:hover [class*="tabIcon"] {
        color: var(--theia-activityBar-foreground, #000000) !important;
      }
      #theia-left-content-panel .p-TabBar-tab.p-mod-current [class*="tabIcon"],
      #theia-left-content-panel .lm-TabBar-tab.lm-mod-current [class*="tabIcon"],
      .theia-app-left .p-TabBar-tab.p-mod-current [class*="tabIcon"],
      .theia-app-left .lm-TabBar-tab.lm-mod-current [class*="tabIcon"],
      .theia-tab-bar-container.left [class*="TabBar-tab"][class*="mod-current"] [class*="tabIcon"] {
        color: var(--theia-activityBar-foreground, #000000) !important;
        filter: drop-shadow(0 0 2px rgba(245, 158, 11, 0.5)) !important;
      }

      /* Top-Left Window Header Brand Icon Replacement (Option 3B: Lord Hayagriva Bust Silhouette - Crisp Solid Black) */
      .theia-icon,
      #theia-top-panel .theia-icon,
      #theia-top-panel [class*="theia-icon"],
      .theia-app-icon {
        display: inline-block !important;
        width: 22px !important;
        height: 22px !important;
        margin: 4px 6px 4px 10px !important;
        background-color: #18181b !important;
        -webkit-mask: url("data:image/png;base64,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") center / contain no-repeat !important;
        mask: url("data:image/png;base64,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") center / contain no-repeat !important;
        -webkit-mask-size: contain !important;
        mask-size: contain !important;
        filter: none !important;
        vertical-align: middle !important;
        cursor: pointer !important;
      }



      /* Chat Header icon and avatar override */
      .theia-chat-header .hayagriva-horse-icon,
      .theia-view-container .theia-header .hayagriva-horse-icon {
        display: inline-block !important;
        width: 18px !important;
        height: 18px !important;
      }

      /* Permanently eliminate OPEN EDITORS from Left Explorer */
      #theia-open-editors-widget,
      .theia-open-editors-widget,
      [id*="open-editors-widget"],
      [id*="open-editors"],
      #explorer-view-container--theia-open-editors-widget,
      [id*="theia-open-editors-widget"],
      .theia-header[title*="Open Editors"],
      .theia-header[title*="OPEN EDITORS"] {
        display: none !important;
        height: 0 !important;
        max-height: 0 !important;
        min-height: 0 !important;
        overflow: hidden !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* Permanently eliminate Right Activity Bar and Right Side Panel (zero right-side icons) */
      #theia-right-content-panel,
      .theia-app-right,
      .theia-right-side-bar,
      #theia-right-side-bar,
      .theia-tab-bar-container.right,
      .p-TabBar.right,
      #theia-right-side-panel,
      .theia-side-panel.theia-right-side-panel,
      .theia-mini-browser-panel.right {
        display: none !important;
        width: 0 !important;
        min-width: 0 !important;
        max-width: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* Hide browser back/forward navigation controls & main toolbar */
      #main-toolbar,
      .theia-toolbar,
      .theia-toolbar-container,
      .theia-navigation-controls,
      .theia-top-panel .theia-navigation-button,
      [id*="workbench.action.navigateBack"],
      [id*="workbench.action.navigateForward"] {
        display: none !important;
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* Hide duplicate header toolbars inside workspace folder tree and navigator */
      .theia-TreeContainer .theia-header-toolbar,
      .theia-TreeNode .theia-header-toolbar,
      .theia-header .theia-header-toolbar,
      .theia-navigator-container .theia-header-toolbar,
      .theia-view-container .theia-header-toolbar,
      .theia-navigator-view .theia-header-toolbar,
      .theia-navigator .theia-header-toolbar {
        display: none !important;
      }

      /* Reveal and style "New File" button as Sovereign Legal Draft in navigator toolbar */
      #theia-left-content-panel [id*="file.newFile"],
      #theia-left-content-panel [title*="New File"],
      #theia-left-content-panel .theia-tabBar-toolbar-item[title*="New File"] {
        display: inline-flex !important;
        visibility: visible !important;
        pointer-events: auto !important;
        cursor: pointer !important;
        opacity: 0.85;
        transition: opacity 0.15s ease;
      }
      #theia-left-content-panel [id*="file.newFile"]:hover,
      #theia-left-content-panel [title*="New File"]:hover,
      #theia-left-content-panel .theia-tabBar-toolbar-item[title*="New File"]:hover {
        opacity: 1 !important;
      }

      /* ── AskHaya Sovereign AI Chat Styling ───────────────────────────── */
      /* Suppress duplicate generic developer AI welcome banner, compact banner, and dividers */
      .theia-WelcomeMessage:not(.hayagriva-welcome-banner),
      .theia-WelcomeMessage-Main:not(.hayagriva-welcome-banner),
      .theia-WelcomeMessage-Compact,
      .theia-WelcomeMessage-Divider {
        display: none !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
      }

      .hayagriva-welcome-banner {
        padding: 14px 12px;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        margin: 0 !important;
      }

      /* ── Clean Modern Single-Box Chat Composer ───────────────────────────── */
      .theia-ChatInputOptions .theia-ChatInputOptions-left,
      .theia-ChatInputOptions .option:has(.codicon-mention),
      .theia-ChatInputOptions .codicon-mention {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
      }

      .theia-ChatInput-Editor-Box {
        border-radius: 8px !important;
        margin: 0 10px 10px 10px !important;
        background: var(--theia-input-background, #1e293b) !important;
        border: 1px solid var(--theia-input-border, rgba(255, 255, 255, 0.15)) !important;
        box-sizing: border-box !important;
        padding: 4px 8px !important;
        transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
      }
      .theia-ChatInput-Editor-Box:focus-within {
        border-color: var(--theia-focusBorder, #38bdf8) !important;
        box-shadow: 0 0 0 1px var(--theia-focusBorder, #38bdf8) !important;
      }

      .theia-ChatInput-Editor {
        position: relative !important;
        width: 100% !important;
      }
      .theia-ChatInput-Editor .monaco-editor,
      .theia-ChatInput-Editor .monaco-editor .overflow-guard {
        border-radius: 4px !important;
      }
      .theia-ChatInput-Editor-Placeholder {
        font-size: 0 !important;
        position: absolute !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        left: 4px !important;
        line-height: normal !important;
        pointer-events: none !important;
      }
      .theia-ChatInput-Editor-Placeholder::after {
        content: "Ask a question or type '/' for commands, '@' to mention..";
        font-size: 13px !important;
        color: var(--theia-descriptionForeground, #64748b) !important;
        white-space: nowrap !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ── RBZ Proactive Context Advisor (Bottom-Right Non-Blocking Toast) ────────
  protected initializeRbzAdvisor(): void {
    let dwellTimer: any = null;
    let currentToastEl: HTMLElement | null = null;
    let fileOpenTime = Date.now();
    let currentFilePath = '';

    const checkContextAndSuggest = async (filePath: string) => {
      try {
        const dwellSec = Math.round((Date.now() - fileOpenTime) / 1000);
        const apiPort = this.getApiPort();
        const caseName = this.getActiveCaseName();

        // Sample snippet from active editor if available
        let snippet = '';
        const activeEditor = this.editorManager.currentEditor;
        if (activeEditor && activeEditor.editor) {
          const doc = activeEditor.editor.document;
          snippet = doc.getText({
            start: { line: 0, character: 0 },
            end: { line: Math.min(100, doc.lineCount - 1), character: 500 }
          });
        }

        const res = await fetch(`http://127.0.0.1:${apiPort}/api/hayagriva/rbz-advisor/evaluate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            case: caseName,
            filePath: filePath,
            contentSnippet: snippet,
            dwellTimeSec: dwellSec
          })
        });

        if (!res.ok) return;
        const data = await res.json();

        if (data.success && data.shouldSuggest) {
          renderRbzToast(data);
        }
      } catch (_) {}
    };

    const renderRbzToast = (suggestion: any) => {
      if (currentToastEl) {
        currentToastEl.remove();
        currentToastEl = null;
      }

      const isLocal = (suggestion.executionTier || 'LOCAL').toUpperCase() === 'LOCAL';
      const tierBadgeHtml = isLocal
        ? `<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; color: #38bdf8; background: rgba(56, 189, 248, 0.12); padding: 2px 7px; border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.3);">🏠 In-Chamber Agent</span>`
        : `<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; color: #10b981; background: rgba(16, 185, 129, 0.12); padding: 2px 7px; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.3);">🌐 LexAI Desk</span>`;

      const toast = document.createElement('div');
      toast.id = 'rbz-advisor-toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 34px;
        right: 24px;
        width: 340px;
        background: rgba(13, 17, 23, 0.95);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(56, 189, 248, 0.4);
        border-radius: 12px;
        padding: 16px 16px 18px 16px;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6), 0 0 12px rgba(56, 189, 248, 0.2);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #e2e8f0;
        animation: slideUpFade 0.3s ease-out;
        overflow: hidden;
      `;

      toast.innerHTML = `
        <style>
          @keyframes slideUpFade {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
          }
        </style>
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
          <div style="font-weight: 700; font-size: 13px; color: #38bdf8; display: flex; align-items: center; gap: 6px;">
            ${suggestion.title}
          </div>
          <button id="btnDismissRbzToast" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 14px; line-height: 1;">&times;</button>
        </div>
        <div style="font-size: 11px; font-weight: 600; color: #f1f5f9; margin-top: 4px;">
          ${suggestion.subtitle || ''}
        </div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 6px; line-height: 1.4;">
          ${suggestion.description}
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08);">
          <div>
            ${tierBadgeHtml}
          </div>
          <div style="display: flex; gap: 6px;">
            <button id="btnStageRbzToast" style="background: #0284c7; color: #ffffff; border: none; border-radius: 6px; padding: 5px 12px; font-size: 11px; font-weight: 600; cursor: pointer; transition: background 0.15s ease;">
              ⚡ Review &amp; Stage
            </button>
          </div>
        </div>
        <div id="rbzToastProgressBar" style="position: absolute; bottom: 0; left: 0; height: 3px; background: ${isLocal ? '#38bdf8' : '#10b981'}; width: 100%; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; transition: width 5s linear;"></div>
      `;

      document.body.appendChild(toast);
      currentToastEl = toast;

      // ── 5-Second Ambient Auto-Dismiss with Hover Pause ──
      let autoDismissTimer: any = null;
      const progressBar = toast.querySelector('#rbzToastProgressBar') as HTMLElement;

      const triggerFadeOut = () => {
        if (currentToastEl === toast) {
          toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
          toast.style.opacity = '0';
          toast.style.transform = 'translateY(16px)';
          setTimeout(() => {
            toast.remove();
            if (currentToastEl === toast) currentToastEl = null;
          }, 400);
        }
      };

      const startDismissCountdown = (ms: number) => {
        if (autoDismissTimer) clearTimeout(autoDismissTimer);
        autoDismissTimer = setTimeout(triggerFadeOut, ms);
      };

      // Kick off 5s countdown
      setTimeout(() => {
        if (progressBar) progressBar.style.width = '0%';
      }, 50);
      startDismissCountdown(5000);

      // Pause when user hovers to read
      toast.addEventListener('mouseenter', () => {
        if (autoDismissTimer) clearTimeout(autoDismissTimer);
        if (progressBar) progressBar.style.transition = 'none';
      });

      // Resume on mouse leave (grace period 2.5s)
      toast.addEventListener('mouseleave', () => {
        if (progressBar) {
          progressBar.style.transition = 'width 2.5s linear';
          progressBar.style.width = '0%';
        }
        startDismissCountdown(2500);
      });

      // Bind Dismiss
      const btnDismiss = toast.querySelector('#btnDismissRbzToast');
      if (btnDismiss) {
        btnDismiss.addEventListener('click', async () => {
          if (autoDismissTimer) clearTimeout(autoDismissTimer);
          toast.remove();
          currentToastEl = null;
          const apiPort = this.getApiPort();
          try {
            await fetch(`http://127.0.0.1:${apiPort}/api/hayagriva/rbz-advisor/dismiss`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ targetKey: suggestion.targetKey })
            });
          } catch (_) {}
        });
      }

      // Bind Stage & Review -> Direct to Relevant Compliance Page
      const btnStage = toast.querySelector('#btnStageRbzToast');
      if (btnStage) {
        btnStage.addEventListener('click', async () => {
          if (autoDismissTimer) clearTimeout(autoDismissTimer);
          btnStage.textContent = 'Staging…';
          const apiPort = this.getApiPort();
          const caseName = this.getActiveCaseName();
          try {
            const stageRes = await fetch(`http://127.0.0.1:${apiPort}/api/hayagriva/rbz-advisor/stage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ case: caseName, suggestion })
            });
            const stageData = await stageRes.json();
            toast.remove();
            currentToastEl = null;
            if (stageData.success) {
              const tier = (stageData.executionTier || suggestion.executionTier || 'LOCAL').toUpperCase();
              this.messageService.info(`⚡ Staged in ${tier === 'LOCAL' ? 'Local' : 'Global'} Compliance Queue!`);
              this.openComplianceQueue(caseName, tier);
            }
          } catch (err: any) {
            this.messageService.error(`Failed to stage task: ${err.message}`);
          }
        });
      }
    };

    // Track active editor switches
    this.editorManager.onCurrentEditorChanged(editorWidget => {
      if (dwellTimer) {
        clearTimeout(dwellTimer);
        dwellTimer = null;
      }
      if (currentToastEl) {
        currentToastEl.remove();
        currentToastEl = null;
      }

      if (editorWidget && editorWidget.editor) {
        currentFilePath = editorWidget.editor.document.uri.toString();
        fileOpenTime = Date.now();

        // Arm dwell check for 8.5 seconds
        dwellTimer = setTimeout(() => {
          checkContextAndSuggest(currentFilePath);
        }, 8500);
      }
    });
  }
}
