import { injectable, inject } from '@theia/core/shared/inversify';
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
    @inject(ProfileWidget) protected readonly profileWidget: ProfileWidget
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
    this.voiceOrb.initialize();
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
      explorerWidget.title.label = 'Files & Folders';
      explorerWidget.title.caption = 'Files & Folders';
      explorerWidget.title.iconClass = 'hayagriva-pillar1-icon';
      await this.shell.addWidget(explorerWidget, { area: 'left', rank: 100 });
    }

    // Pillar 2: Hayagriva Agents (AskHaya) - Rank 200
    try {
      const chatWidget = await this.widgetManager.getOrCreateWidget('chat-view-widget');
      if (chatWidget) {
        chatWidget.title.label = 'Hayagriva Agents';
        chatWidget.title.caption = 'Hayagriva Agents';
        chatWidget.title.iconClass = 'hayagriva-horse-icon';
        chatWidget.title.closable = false;
        await this.shell.addWidget(chatWidget, { area: 'left', rank: 200 });
      }
    } catch (err: any) {
      this.logger.warn(`[Hayagriva] Failed to dock chat widget on left: ${err.message}`);
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
    notifChip.style.cssText = `
      margin-left: auto;
      margin-right: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: 14px;
      padding: 3px 10px;
      font-size: 11.5px;
      font-weight: 600;
      color: #fbbf24;
      cursor: pointer;
      user-select: none;
      transition: all 0.2s ease;
      z-index: 1000;
    `;
    notifChip.innerHTML = `
      <span>🔔</span>
      <span class="haya-notif-count">0</span>
      <span style="color: #94a3b8; font-weight: 400;">Alerts</span>
    `;

    notifChip.addEventListener('mouseenter', () => {
      notifChip.style.background = 'rgba(245, 158, 11, 0.2)';
      notifChip.style.borderColor = '#fbbf24';
    });
    notifChip.addEventListener('mouseleave', () => {
      notifChip.style.background = 'rgba(30, 41, 59, 0.7)';
      notifChip.style.borderColor = 'rgba(245, 158, 11, 0.3)';
    });

    const updateCount = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${this.getApiPort()}/api/hayagriva/inbox`);
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.items) ? data.items : [];
          const count = items.filter((it: any) => !it.resolved).length;
          const countEl = notifChip.querySelector('.haya-notif-count');
          if (countEl) countEl.textContent = String(count);
          if (count > 0) {
            notifChip.style.borderColor = '#f59e0b';
            notifChip.style.boxShadow = '0 0 8px rgba(245, 158, 11, 0.4)';
          } else {
            notifChip.style.boxShadow = 'none';
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
    this.commandRegistry.executeCommand('hayagriva.openTaskQueue');
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
        background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAeJ0lEQVR4nO18C3Ad13ne+c85uxcPEiABksC9d++9JASJFPWwJMp6+CVbVfxoYzt1EisZK47VaeOkTVu3bqadNsp06sRJ/EhjJel4mlEiP2RZctWkViRZSuU01sO2ZCqSI1EWRZHEfQIECQIkiMfdPefvfOuzyBUMUKDLjkLwfDMYAHv37p79z3/+x/f/Z4Xw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw+HsDer0H4PH6wyvBeTbZ2YTr4eHhrSscP28hxfpE5+Sy+xHFYvESpdTV5XJ5c+dxh/NSGdb9Qw8PD+9WSmkiOpYkiR4fHx8rFotviON4PAiCS/r7+x/ft29fW5ynkOtRoYeGhnqHhoa2CSGU1rpXa32Ema8nosFisXihEGI0DMNt1toDs7Oz0e7du8MtW7bkxXkIuR7NfhAEO7TWI4VC4e1SymNCiAUhRDcRXWStHRZCRDivUCi04jgePX78+KVhGO4eHR3NnW+xwbp80KGhoUsmJiZeiKLo3caYLinlkBDiGDMfwDMzMxHRO/A/EW2y1j5IRKy1Dmu1WlOcR6B18gxcLpd3WGu34IC1doiITllrEynlBiHEG4wx31dK4VxrjBFSym1E1M/Mj2XnSyn7mLnJzBtarda3hRCJWOdYDy4gM9lkrT3IzC055TARTTLzMWstVvgzWmtDRCettUeCIDBuog/BJRhjniWizcwsN23a9IIQ4tT54grWgwJYWIA4jhNm7hVCXJYkyRP1ev0FpdRbYAGICD6/xMxwBREzl6SU22H+lVI7gyDI9/T0PExEZmpqapSZ54UQZlmauC6hxTmOQqEwKIQYlFLmmXmnEOI74+PjLzrlPmCt3cHM00Q07SZUG2NeklL2wwVYa2eMMY0DBw4sbt68+Ymurq53wBpEUaTjOJ4dHBxsrOc0Ua6DsV9kjGkrpV6y1k4opZKtW7duqFQqIREFUspvBUHwElY1zL5SSllrG9baWEr5EBGNIT3EhTZu3DhARBPMXI/j+KCUcnRhYaFbrGPQuT72crm8iZm7MVG5XG7AWnsZEWHF/q3WeswYA/M/GMfx0SAIBpMkeVFrvdtae8Jau1Fr/bwxZpvWeoO19iettV9HMKi1/k673d7earV+kAWaYh3iXLYAKZVbrVZPMPM1YRheEccxUrwnrbVI/YKxsbFpYwxcwzQsQxzHPxgfH0dw2LTWLiqlJCYfk2ytfTMzIw5AloCfD0kpEQesa8hznPHbBrInjuPniGgWlG+SJNNSym8YY4ZLpdLVRNSVJAkmsiSEQJBIUAoi6mbmtpRyx/DwMM57qdlsPm2MCaWUITIDZAX5fP7Nnfdcb5Dn8OonKeUsMy9KKSestYeEEFu6uroGG41Gg5mPI9pn5r4gCC4F+aO1/vkoin5OKXWVUgrZwSXGmG4EkHANyPuVUkPGmCQMwxfwHSnlkfVq/teLVstisXiZEOLybKIajcaXC4XClTDn8PNCiB73GdK7Z4jovQj0pJQggPYjfbTWImYAZ/BBcAnMvBCG4XfHxsbG13MMoM915c3n81GSJGD8DsICgO+Ha5BSghfYiQBRKdUDdo+IYmaOiGgE5wohQAxdLYSowSUkSXKJlLLbWvsK3AUz9wwODm48duzYSbFOca4rgAW5o5Tqk1LG7XZ7IgiCjVLK98K0CyEw6czMJzH5sARSSqx2hRXNzNugGGAOHR28yRjzhFJqI2jkOI4v7+7uflisY9C5PO4oigrW2l1Jkhzq6uqaN8bcJIS4RgjxfSHEFUIImPdvWWvrMPNBEKAugJy/IaU81W63EfDBdVwvpVy01k4S0S4hxB84dzFore1rtVPrNBAsi5wLgeBwhhzXEqpu7u756rVaksIMUdEyNsfEkIcV0rd22w2/wapH5IGlIUXFxdfMsYMzczMzKM5pNls3u++0xBC4O+kv79/zAWSPVrrKUc3r0ucqwqQBmVhGKJ6h9SvUiwWb0TVz1qbY2as4kedUqTnM/OkMWZEaz1qrQ1nZmbmsosNDg7ehxVPRBcyczA1NfXefD7/FlzbWpv1EK5LnNMWYGxs7JiU8m+stSjrHhdCPIC6PxFdw8yNQqGws1AoXITzkREws0LBB1ZDCBEjwCsUCldMTEwgLkDQuMdae7+U8hWcB2swPz//jJPTujP/qymAvOGGG/QK8QGOIXhaDrXC+WqVAHP5cTrNddeCuFarjSNlQ2CH0q6U8kWkcS6qR9SPSS4FQXACE4/ysOsQkrlc7lIUfHK53AZnAZD7L7gMAUHi8ampqRNnOKb0mZxMVno2yDz7LPt8+TyQ+748Q3l2HqP1HAR2Iqvb26Ghoe1KqQuw0pVSWPlvY+b7hRB/BZ9eKBSuY+aRubm5B3p6etrGmAvCMPzniB2stU+jEARL0Gq1nnTl4Gzlr3X1r8YXrIVHkK9HrKGXD6BYLF6Xy+V2xXH8WK1WQz4s0DQ5Ozt7M1i3Wq32P9xA0/OjKHpbGIYjcRw/krVTRVH0j5FuVavVu50gUxSLxQ8gJ69Wq18F64b2bCJ6f5IkE41G46Efk3BJJ6hSqWxaXFxE39+stXYAxSAoAjOXm80mxsVJkhwE/z/zQ3CxWOxBTcAFjV1Y/VJKPNPw0NDQkb179yJ1XCvSsaMS2d3d/R4iuoyZZ5MkebzZbD6ZyatcLu+Gi7LWwsTgGOoSLzSbzVp2Tj6fL3d3d9+4uLj4YqPR+G6pVHqfEGLzxo0b73al6fS8SqXydiHEjoWFhXsnJibQxCJKpdL7cW6SJPe2Wq2515KpXP63lPKXpJR/KqW8IfvgxIkTyKe/KIS4Y7lJI6Lbcb4Q4oMdxz6otf5SuVx+Q3asVCoVgiC4j5n/baYUxph3KKVwry9WKpWujOI9A4GLgYGBPrB+cRxfrLXeCGXCik6S5Eij0fhcHMef27p1K5hA0IIye050Ds/Pz7/YbDY/3mw2/zczxy5+OAUKeXx8fE+5XB5ZY2cQZc/Y3d39HWQfQojbpJS/m8vlnoii6Hc6VvdPumfGzx1a64eCIHilVCr9x+ycIAiucZ//kpPnPw2C4M7p6elLOu9nrf1TZv6TZb0RXwuCAN+9ZoU5/hGs9OEsuHCs9qWTpIQ/nBVCICXKYLHLhohKSZJg4sCoZfgjfIGZoY0ZbsLqEkJ8LtNIIroaXK0Qos8YM9r5cGsBunhzuRxoYGAqjuNTQRDs0lrPaa0RvdPk5ORsEAS5/v7+fqXUCbSFOf8+5Py7wXNorRk5vyOEjkopT8ZxnN+2bduONShmSiwR0a9prS+J4/i32+32VjyTMWav1vrfVyqVi1OhWQsFQ6/hJ0A9G2PeyMyvKKV+C8Urd06COXCtafj/f8FiSimvcvczURShd6HIzH+RrX6l1MVEJK21CGCvXos8VwwCiehHggikRB2rP/0sl8tBI1GDhyDfmF0vl8uhqgZlubnjOjcbYyCkR7JrEtF11tp5VN+I6KozyExSszY3N4fGzi6YfZRuEfgZY0DwICjszyZucXGxHQRBNwTVbDaf3bNnT4BCj/i7a/UkSZK6DydwCBGVQihPeQ2uKXNzNyHwlFJ+utVqHYULZeYvSykhv3RCXCYCWc4dPHhwplarfY+ZYUUhmxuXnZOOEZkO5E9Eb1qaJCl3KaUCdEB1jANVTQTDkMV12dSdTCrCtv5J0y4iuN4eSSbDoyZr8XDM/PXkEMXi8UCjqO9ylr7NfTblUqlEaxUIrrJWvt4lpu7Y/CF30CjphDiracb6Cr3R3m3l4jm4jjGOBDJT2it4ScHELvgvO7ubli0JYXeu3cvqnwns0eVUhaRBWitY6XUYSllTimVKcOm17AAqXJEUYTy8hDGMDs7a9xxLCbsS2BXlOocewBFxBhdCps9TydSlzA/P78/SRIssus75ixVKGNMpwLcYK09bK19xMkT52ZjOTMFgPa7L5tWq3UcnHrHx9nfqJWjcnYfWq611qBVM3wVmo/++3a7vQc990T05WwwCwsLFyJQJCJE6ejEfYv73ms1YaQRv/t7JxHtiON4M1ZDGIZgBnOuTNw/PT0NIXFfX59JkmS+U7Du+QCstqvh8hAQttttWJRj7XYblUEUlXYjwHytlXTq1CkoG5QaJeW0URVitNY+IKW8NEmSr+E8fO5+zyHIdEHdZe65UHlcQiZzuDEieoqIdpbLZTCawJustVCs72enCyGQ5TwnpXxEKbUNhbKOz1bESrklWDNo/vXFYhFCw2rZ4M7NVkL6cOjEweRJKb+bfUcI8SCE2tfX9+3Z2VnU5H8enA26bBxRk/n/PTB7SL8cb/+20dHRvgMHDpx4rXQKPlspNWKtraFxIwxD5Ps9oHjn5+cP9vT0bJdSYhNIPyZv375908t6/JHqSfwRRdFuVAMRAyRJoqBESZLklVITRLSPmQ8vLi7CurUbjcbfrpYWLlsgS/ep1+tTy2KnTL5XojcByiGE+HiSJKCxv+GutVI6+LjW+qbFxcVdbtFdz8wvO5obrXHDrqgFd/FtyFZrjSC8eroU80csgEudMIh/p5R6UCn1ABHdgwZLrM5KpZJ+B+be7bh5oVqtorMWJjXtnhkdHdVOs++VUt5IRL9grf0WzH9mluHPrLXYoYMyLlq41cLCwq7VxpVpMSYUuX4ul0Mb15TWuq/dbm9GcafZbH4fk58kyQyYvLm5uSeZ+YKBgYEoiqJc53UGBwe3IMpHKbndbj+XJAmsHlYwKGZYJFQTEWTt1FojVTteKBSynoPTB1ZSMoiccrl8E3YnVSqV92CTqntu7eSLyb9bKfWfkGjFcfzOarV6aDUFwKS6a2OxoNkVscnjHZ9f5mKNF4noFSfbpZhh1bH+iJSJEnehj8VxXMGPtfZyly8rY0z28Je7wOVb0C4iwgCvhl87cOBA1kZ9rxs0rAdyf+ru7s5WypuMMdWxsTEwb8iTgSx1WU3AjCbPdrt9eH5+/nIi6unq6tqPbWCYxyiK4GrQ5Yv6f3z8+PEZa+2GMAyH6/V6as2yCRwaGjpqjNkzMDDwSi6XQ/4fzs/PoyN4YHFxcYSI6vV6/Sml1DPW2rcqpVA5NGtwB7Rx48akVquhn+ABpdRDUsoHgyD46JLQfyjfzxJR2omEeKC3t/d7p3PJWuvnsKNJCLGnUChcqpTCGB5bFlCLOI6/W61Wj1trEXtk7WyrEkyni7jHW61WFT/GmFeWa76UMosy8+Vy+UbU3FFHP3r06Gh2LhFhBWL1YKGBbGH4PRBAKNgQ0RH33Uvhz4jo+myiVxIsbotoXSl1JVYoegDTAeTzV6EHsK+v79mFhYXNrgU8DawQbSultrvdwqnrwu+ZmZk069i3bx8G17bWNnO5XBGlZYzLGHNxsVi8dnFx0Rhj7kc8gCAtSRK4wyU+YQXwyZMn9cGDB9GDsIuZwY8gKs9ikMwFnkS3ETODB9jUbrd/4jQTpQ8dOgTlhLW8SkqJgBquBErzw4syX8vMVim1x8kU51/u+BW72qJaVQGIKMweFOlVdtxpHoD8FZN8OxE9KqX8ace27clOdav7JDOb3t7e6Y7BXuqswtXuu/e4AV5xGn8FFg2bOUbRzyelhPCOz83N7Xb++sj09DRydnAByl0fUXL68FLKnSj+4Pbbtm0bcbuEZ8vlMmoFM1rr8vj4+MsItLB1rNVqPQMWjohQF9hmjGkppWIigs+2y8foAr/0XmhQwt8w6dh+ho87sxAng4zr/0u4BGZ+52pzUalUsljtMWRbRHSrMeaoUupAllEJITAuqbW+DzIlIjCOfUKIzK2emQI4TU0fSmudPiweYmxsDIxZQETXWmv3x3GMhoyLmPm9TtDXrnSPdru9lEoS0ZVQJGb+FXw3jmO0bj2M3NZFudlKzaCLxeLbjTEfwUQnSQKeIbHWwlRPYpVKKTcjjQuCAC7r5jiOx9zEIFh9GQESNoSmA5ISO4gmjTEIvFKrhBJxFEW/HARBK0mSrcViEatnGO4FDCNcgLV23FobFAqFjwwPD1c6WcLJyUlcawpWor+/P7MQuPcg7rE8SESM4uT7FLgLZv6HWVC+XFkyWGsfg2KD8BFCPO0WGNLEspSyZK29D7J08/ExrTXYz8tPN9crHUTZFBEzrxAbWMdCVbC1ipmfaDabLzUajZer1SryeTBSVy9L59KyaqcAQIrAnxljHsB3m83mfiHENxFTJEmye5nG4jfSOES7VRek9oVhiJwfmn9REARY0aj0gWO4BeTQwsJC263Gw9jqNT8///Dk5GTqyrTW/wdWQ0oZj42NpdU+5zaui+MYlkwg706SZCO2msM9wOWgN8Ba+x1m/mYYhic6FgmUG6Tm00h32+32e7LFQ0QfcTR0lv6l8nUKIJAlMPNfw01VKpULO2SE89OF19vbm/5WSu0FQYUqKBSnY24QE+B6j0KWkCkR/aVjWTsZ2jUpwAb3SpUsasaTwdRvYOZ0+zURvUVrje8iB5XOz4CIqSE2cJx0NuEo+PQaY7J74drYgYPVOpmVQxG9IhPQWv/EMgVI5REEATZ5jGEywjCca7fbYO4iKSW6eY4KIbDZczNYMPT59fT0wBIx0iQiAkeP4GkQsYDbCfyPkP4514Ix4nzsIUQUPRcEAXz+FvALsDTGmJeNMXBjlRYCo2o1izGW5oGZfx+xjNb67lKp9ESlUnkZQVscx6CgszeQZLHLkltF+ge3Za39gDvU5c5JiaEscMaeRrg4bHph5iUCiIhQfML5z2eWJwxDtMHh7/dli+i1FCCbsL9OkuQrzIybpYjjGJHQnUKIrPCAYstX4L8gwC1btmQ7aT9HRHcbY5ZYL1Chxpgv4Bo4MDIyguj4QWb+zcyEOU3fG8fxXajldxxbAlYfTBrMI3J+rFjs+7PWovcfcUeXMeZdRIS8F1z+VWgIwXfn5+e/jhq/lBKVy+uNMW9D1tJsNmvwn+gldApfN8aMNxqNNAOI4xit4ie01vjumycmJg7HcfxSPp+/YJmSpmxbo9GAdXintfbPiQjuBhnJu6y1n4TlcM+BlPMr1tqlAA5kWJIkd0Gu7tArTr5pmrd37940tkAmw8yfMcbcZYxZ+r4Q4iC+z8xIX1MSCnyKtfYzsKyjo6Phaunr2egHOJMS7o9T7k0DquHh4TcicpZSbgrD8JDze6lZRckXk4dav1IKDB7oXXT5oEbwdKPRSNkyBIHg+UdGRlIWLp/PY2Kx8i+01iJqR6p3T71eP76McUQgtt0YA7//VL1ex31XKhWfc/sHViwGdXSUdBaF0rpAdo4jdDofmJadk6HzWHbuSudl91s+ptTHOnJkp1JqDJs2lVJgw7DN+wfw+bAAzi9OSSmRuWD14X47h4eH310qlS7p7e3VYRgmExMT2FL2Jkc/w10dRRkY33GTn903GxeC38O4vsuCVpt85SLy7Nmybp/sebPgcPlzZrJ7VeC7yvys1PHTOWeryX5FnM4CLNfmNA93f2fBD/bODUCo2IiZDQaRfBiGU44QSkule/bskePj40Mwrx2CyK6zWt6P17xhpeOlDYgdQMI8KaU8ilW4bdu20pEjRw4Xi0UUQVDxa7Xb7QGlFFIf5N2YzCK2jRPRgMsApq21BSIC744CTho8onBFRPc56nallXymq7tT8J3P2LmgeLlvRlEJMYprrlEd982ukR1LnAyzTMQs+3y1/9eeBkZR9OulUinzd9lg0/QFaZJLET+Exg5oYKlU+rNSqfQLzPzRxcXFjBDCQA1WnZTy17KIOTuOc0ql0qcqlcoVK4wJpty6CWpKKfFKl6G5ublg69atlS1bttSjKIJS1MHYJUnS5zaDPovuYGNMzlq7z737BwrR4+hdlItzzufux+Q70z51mgbQ1SY/o8YvLJVKtxeLxdvL5XK+Q1aZ4IOhoaGst2BJLk5un8K7C8vl8m9JKS9m5n/RMWlLcnL3y45lipX9n6XOnf93XoPXWgzK2o2Qa37CCeo25L1BEKDPDm/ZBHX6e1EU/aoxBgzfPHJoKeWFaIBIkmQfER0aGRnpT5LkFmQH7Xb70VwuB2rYlMtlBG1gEhFoohEzD8p2BYETAjVE7sw8DHpXKdU/NTU1i1z72LFjgVKqt9lsghDhfD6vXEaA+sD9XV1d70bKKIRAyocXSRxlZpj6ghPetGtK2dtqtZ5b7vfXiHSV5XK5I3EcIytBY8pMoVC4XmuN19H05HK5ry4sLNymlHp3Pp+/RSl1RCn1c8aY5+v1Oqj0C1xguwtb3JgZQSta1vCaOzR5oBy8H7IolUofxhzVarU70fEspUTcs8MY8/V6vd4oFovvwGbYOI6/gXSwVCqBnym22+0vucaRV1my1WIARKu3JknyYddjr4MguM6VcwdcYQj5rFRK3YLoGqVQlwrKIAj+A17CEMfx510aeGNXVxdazP41fDEz/zEzh67F7CZmPrKCO0oHCiVClw1MPDp6nEKqmZmZU8YYULdpvu9+8O4fbBPvO3bs2Hyj0fgzvDhKCIHunDkIN0kSTDTeEdDrcvuHwfr9PwRwqaKiuYOZsfH0KfTiKaW+iEIUEX1oYWHhZ5Bauq6eTU6OQ1LKz0RR9FOg3V1afRytbVLKj6I3E4vMpXd3aa1vQNsYyutE9M5SqfRfpJQfJqJ/6Vzaf46i6AYp5W14PwIRvS+Kon8ihPhl9A2GYXhfhzt49WQvEzrMBSb4ZiklNPCtxWIRZAJSkC/UarXP33rrrRDsC41GA+/XAz2K2voj1tqnEHGjLuCoyaRarf5mtVr9mFLqeRQoiAiM19drtdp/tdbeDgLHBXgrCh+rCmQ8SKA4jtE8MV8oFLCqwSMg4EsJlyiK4KpQt0DAmBVszPj4+NNOUXvjOO7BG0JdZ9KAlPJZpPRnq+8fz5HV++FaarXa7zAz0rv+drv9FWPMN4kIG1GxCJCqPub4gKUSsyOKELO8DylftVr9A2stWuzQfvcuF9wiq8G2eMjus7Va7Tecu/wpIvpktVr9dL1eR7HpZ9HggvIxvocq7fK6wEo95UkURf8M6acQAhw9Iu1fRdECJBHOueOOO8DJg7IFKweCqNut9CEnTJj0H0gp31+pVH7FWru53W7vJSIwaX9CRJ8vl8sw2x9l5k9CQKBYVxIqfD7y4u7u7gB0MjNX3Dj/qtVqpQGb2/wRaq3HnSndn/lX/EbsIIT4AChtYww6f4rOjU2dhclP3caOHTuGkiT5ByhRR1H0525iMV4QT3Eulxtk5u25XO7k4uIiXmWH3sv96JKSUn7AnbvRtYOBtv4SM3+iXC7jWT9orf1tvP0EASLmRkqJrme4g8GRkZGtcRxjHyMW5Me3b98Oywh5gg2EJXksSZIaOrWW11pWSrmAg3Ec/5tarfZItVr9FDp+sOKllDBdpqurC9z1p/C3tfZ/CiG+p5TCw/yRo0T/sN1uP8/MUBwEXYi40fjxxXq9/rS19jZmRmSP349jlcDPuXu/Klp2xM+GdruNih1WPoK8w4hJ0PGydetWCPqiU6dO1TD52CAyNzeX1gGyCBukDmhnKWUPLAFSRWvtXY6IOhubPrFqYXYfZuanXd3g084lPsLMj2LMQog7QdAYY37RuYcwCIKTxpj/TkQHpJR/3NXVhYVxT7Va/SYz/zdXhZxwJezfICIEwwiwjxtj7oHbkVLOCCG+UK/XoXh3QrboI6zVar8Hy4ziG9LmZfL9OyGfBtC+s/2enLX62vQ8vMQZ9Xy8wHFmZuZK5zKOxnHcmJycnB8aGipprd/q+hHShk5XW+i8T9Zvj3jmqlardffrSNjQWu6NtvUgCH5daw0KuJIkyb9Co+kZXvs177VaGpjl6dnkd5IYGZZIoY4grJMAoY4tTtn/We6bkRnZ8ewanUgHfvToUZjLBB1GrusIscjWMAwvLZVKiLTRmTyVcesrTP7SM6F2oJRCPSBtGRdnd2dURmRlhEynfOSy5+/cHpYdf9VvROzGmM8aY75cq9VucZO//B6dcluSbce2sk5ZrzjXZ1MA/1+AjR9hGBbx8kcUnVB+hp9EAIT9CGhCQbkXAWbWH78KQFrBR4eoo6OKKV6n7Vg/Js45mvmswFHOnawaoSkUMUAURQjm1qLQWQPoZYVC4RddlkPi7z/OtpVal1izkPL5fI/b7pV977zHuSqEV/UKvI7j8DgHca4qvYeHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4fHeYT/CyI+uqsfOPChAAAAAElFTkSuQmCC') !important;
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
      .hayagriva-pillar1-icon::before,
      .hayagriva-pillar2-icon::before,
      .hayagriva-horse-icon::before,
      .hayagriva-pillar4-icon::before,
      .hayagriva-pillar5-icon::before,
      .hayagriva-pillar6-icon::before {
        content: "" !important;
      }

      /* Pillar 1: Documents (Executive Tabbed Dossier Folder) */
      .hayagriva-pillar1-icon,
      i.hayagriva-pillar1-icon,
      .theia-tab-icon.hayagriva-pillar1-icon,
      .p-TabBar-tabIcon.hayagriva-pillar1-icon,
      .lm-TabBar-tabIcon.hayagriva-pillar1-icon,
      #theia-left-content-panel [data-id*="explorer-view-container"] [class*="tabIcon"],
      .theia-app-left [data-id*="explorer-view-container"] [class*="tabIcon"],
      [id*="explorer-view-container"] [class*="tabIcon"],
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

      /* Top-Left Window Header Brand Icon Replacement (Flowing Stallion Silhouette) */
      .theia-icon,
      #theia-top-panel .theia-icon,
      #theia-top-panel [class*="theia-icon"],
      .theia-app-icon {
        display: inline-block !important;
        width: 22px !important;
        height: 22px !important;
        margin: 4px 6px 4px 10px !important;
        background-color: #fbbf24 !important;
        -webkit-mask: url("data:image/png;base64,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") center / contain no-repeat !important;
        mask: url("data:image/png;base64,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") center / contain no-repeat !important;
        -webkit-mask-size: contain !important;
        mask-size: contain !important;
        filter: drop-shadow(0 0 3px rgba(245, 158, 11, 0.4)) !important;
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
