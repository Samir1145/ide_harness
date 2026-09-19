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
import { HayagrivaEditorDecorator } from './highlight-decorator';
import { HayagrivaLspClient } from './lsp-client';
import { HayagrivaMonacoProviders } from './monaco-providers';
import { HayagrivaPreviewManager } from './preview-manager';

const { wikiExplorerHtml, conceptsExplorerHtml, inboxExplorerHtml, billingExplorerHtml } = require('./templates');

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
  protected hasSmartLaunchedSettings = false;

  protected wikiWidget?: Widget;
  protected conceptsWidget?: Widget;
  protected inboxWidget?: Widget;
  protected billingWidget?: Widget;
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
    @inject(ILogger) protected readonly logger: ILogger
  ) {}

  getApiPort(): number {
    return this.preferenceService.get<number>('hayagriva.apiPort', 3210);
  }

  getBackendUrl(): string {
    return `http://127.0.0.1:${this.getApiPort()}`;
  }

  // ── OpenHandler ────────────────────────────────────────────────────────────
  canHandle(uri: URI): number {
    const p = uri.path.toString().toLowerCase();
    if (p.endsWith('.pdf') || p.endsWith('.docx') || p.endsWith('.doc') || p.endsWith('.xlsx') || p.endsWith('.xls') || p.endsWith('.wiki.html')) {
      return 500;
    }
    return 0;
  }

  async open(uri: URI, _options?: OpenerOptions): Promise<Widget> {
    const filePath = decodeURIComponent(uri.path.toString());
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
        const editors = this.editorManager.all;
        for (const ed of editors) {
          const resUri = ed.getResourceUri();
          if (resUri && resUri.toString() === companionUri.toString()) {
            ed.close();
          }
        }
        await this.editorManager.openToSide(companionUri);
      }

      return previewWidget;
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
      this.preferenceService.set('editor.inlineSuggest.enabled', true);
      this.preferenceService.set('editor.suggestOnTriggerCharacters', true);
      this.preferenceService.set('editor.quickSuggestions', { other: true, comments: true, strings: true });
    } catch (_) {}

    this.initializeWikiExplorerWidget();
    this.initializeConceptsExplorerWidget();
    this.initializeInboxExplorerWidget();
    this.initializeBillingExplorerWidget();
    this.monacoProviders.registerAllProviders(() => this.getActiveCaseName());
    this.startBackendMonitor();
    this.initializeRbzAdvisor();

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
      } catch (err: any) {
        this.logger.warn(`[Hayagriva] Failed to sync settings iframe theme: ${err.message}`);
      }
    });
  }

  onDidInitializeLayout(_app: FrontendApplication): void {
    const leftWidgets = this.shell.getWidgets('left');
    for (const widget of leftWidgets) {
      const id = widget.id.toLowerCase();
      if (id !== 'explorer-view-container' && id !== 'hayagriva-wiki-explorer' && id !== 'hayagriva-concepts-explorer' && id !== 'hayagriva-inbox-explorer' && id !== 'hayagriva-billing-explorer') {
        widget.close();
      }
    }
  }

  registerToolbarItems(registry: TabBarToolbarRegistry): void {
    registry.registerItem({
      id: 'hayagriva-upload-toolbar-item',
      command: 'hayagriva:openUploadSplit',
      tooltip: 'Upload to Hayagriva',
      icon: 'fa fa-upload',
      priority: 0
    });
    registry.registerItem({
      id: 'hayagriva-theme-toolbar-item',
      command: 'hayagriva:toggleTheme',
      tooltip: 'Toggle Light/Dark Theme',
      icon: 'fa fa-adjust',
      priority: 2
    });
    registry.registerItem({
      id: 'hayagriva-settings-toolbar-item',
      command: 'hayagriva:openSettingsPanel',
      tooltip: 'Open Case Settings',
      icon: 'fa fa-cog',
      priority: 3
    });
    registry.registerItem({
      id: 'hayagriva-chronology-toolbar-item',
      command: 'hayagriva:openChronology',
      tooltip: 'Open Case Chronology',
      icon: 'fa fa-calendar',
      priority: 4
    });
    registry.registerItem({
      id: 'hayagriva-topic-overlap-toolbar-item',
      command: 'hayagriva:openTopicOverlap',
      tooltip: 'Open Topic Overlap Map',
      icon: 'fa fa-link',
      priority: 5
    });
  }

  // ── Delegated Preview Operations ───────────────────────────────────────────
  async openOfficePreview(filePath: string, caseName: string): Promise<Widget> {
    return this.previewManager.openOfficePreview(filePath, caseName);
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

  async openSettingsPanel(caseName?: string): Promise<Widget> {
    const targetCase = caseName || this.getActiveCaseName();
    return this.previewManager.openSettingsPanel(targetCase);
  }

  async openChronologyPanel(caseName?: string): Promise<Widget> {
    const targetCase = caseName || this.getActiveCaseName();
    return this.previewManager.openChronologyPanel(targetCase);
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
        return decodeURIComponent(new URI(workspaceRoot.toString()).path.toString());
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
        return decodeURIComponent(new URI(workspaceRoot.toString()).path.toString());
      }
    } catch (_) {}
    const active = this.editorManager.activeEditor;
    if (active) {
      const uri = active.getResourceUri();
      if (uri) {
        return decodeURIComponent(uri.path.toString());
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
    this.shell.addWidget(widget, { area: 'right' });
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

  // ── Explorer Sidebar Widgets ───────────────────────────────────────────────
  initializeWikiExplorerWidget(): void {
    if (this.wikiWidget) return;

    const initialCase = this.getActiveCaseName();
    const wikiExplorer = new Widget();
    wikiExplorer.id = 'hayagriva-wiki-explorer';
    wikiExplorer.title.label = 'Case Wiki & Q&A';
    wikiExplorer.title.caption = 'Curated Case Wiki & LLM Q&A cards';
    wikiExplorer.title.iconClass = 'fa fa-book';
    wikiExplorer.title.closable = false;

    const wikiIframe = document.createElement('iframe');
    wikiIframe.style.width = '100%';
    wikiIframe.style.height = '100%';
    wikiIframe.style.border = 'none';
    wikiIframe.srcdoc = wikiExplorerHtml(initialCase, this.getApiPort());
    wikiExplorer.node.appendChild(wikiIframe);

    this.wikiWidget = wikiExplorer;
    this.shell.addWidget(wikiExplorer, { area: 'left', rank: 600 });

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
          wikiIframe.contentWindow?.postMessage({ type: 'select-case', caseName: event.data.caseName }, '*');
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
                await this.editorManager.open(uri);
              }
            }
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

  initializeConceptsExplorerWidget(): void {
    if (this.conceptsWidget) return;

    const initialCase = this.getActiveCaseName();
    const conceptsExplorer = new Widget();
    conceptsExplorer.id = 'hayagriva-concepts-explorer';
    conceptsExplorer.title.label = 'Concepts';
    conceptsExplorer.title.caption = 'Case Document Chunks & Concepts';
    conceptsExplorer.title.iconClass = 'fa fa-lightbulb-o';
    conceptsExplorer.title.closable = false;

    const conceptsIframe = document.createElement('iframe');
    conceptsIframe.style.width = '100%';
    conceptsIframe.style.height = '100%';
    conceptsIframe.style.border = 'none';
    conceptsIframe.srcdoc = conceptsExplorerHtml(initialCase, this.getApiPort());
    conceptsExplorer.node.appendChild(conceptsIframe);

    this.conceptsWidget = conceptsExplorer;
    this.shell.addWidget(conceptsExplorer, { area: 'left', rank: 550 });
  }

  initializeInboxExplorerWidget(): void {
    if (this.inboxWidget) return;

    const initialCase = this.getActiveCaseName();
    const inboxExplorer = new Widget();
    inboxExplorer.id = 'hayagriva-inbox-explorer';
    inboxExplorer.title.label = 'Inbox';
    inboxExplorer.title.caption = 'Case Action Inbox & Approvals';
    inboxExplorer.title.iconClass = 'fa fa-inbox';
    inboxExplorer.title.closable = false;

    const inboxIframe = document.createElement('iframe');
    inboxIframe.style.width = '100%';
    inboxIframe.style.height = '100%';
    inboxIframe.style.border = 'none';
    inboxIframe.srcdoc = inboxExplorerHtml(initialCase, this.getApiPort());
    inboxExplorer.node.appendChild(inboxIframe);

    this.inboxWidget = inboxExplorer;
    this.shell.addWidget(inboxExplorer, { area: 'left', rank: 540 });
  }

  initializeBillingExplorerWidget(): void {
    if (this.billingWidget) return;

    const initialCase = this.getActiveCaseName();
    const billingExplorer = new Widget();
    billingExplorer.id = 'hayagriva-billing-explorer';
    billingExplorer.title.label = 'Billing';
    billingExplorer.title.caption = 'Resolution Bazaar Diligence Ledger & Settlement';
    billingExplorer.title.iconClass = 'fa fa-credit-card';
    billingExplorer.title.closable = false;

    const billingIframe = document.createElement('iframe');
    billingIframe.style.width = '100%';
    billingIframe.style.height = '100%';
    billingIframe.style.border = 'none';
    billingIframe.srcdoc = billingExplorerHtml(initialCase, this.getApiPort());
    billingExplorer.node.appendChild(billingIframe);

    this.billingWidget = billingExplorer;
    this.shell.addWidget(billingExplorer, { area: 'left', rank: 535 });
  }

  openBillingExplorer(): void {
    if (this.billingWidget) {
      this.shell.activateWidget(this.billingWidget.id);
    }
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
    if (this.billingWidget) {
      const iframe = this.billingWidget.node.querySelector('iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'select-case', caseName }, '*');
      }
    }
  }

  // ── Backend Health Monitor & Telemetry ─────────────────────────────────────
  startBackendMonitor(): void {
    setTimeout(() => {
      this.checkBackendHealth();
    }, 3000);

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
            const access = licData.access || {};
            const isKycDone = Boolean(licData.initial_kyc_completed || (licData.tri_tier && licData.tri_tier.initial_kyc_completed));
            const stage2Local = licData.stage2_local || (licData.tri_tier && licData.tri_tier.stage2_local) || {};
            const daysRem = stage2Local.days_remaining !== undefined ? stage2Local.days_remaining : (licData.daysRemaining || 0);

            if (!isKycDone) {
              this.statusBar.setElement('hayagriva-license-item', {
                text: `$(fa-lock) Activate Core (₹1)`,
                alignment: StatusBarAlignment.LEFT,
                color: '#ef4444',
                tooltip: 'Initial ₹1 token KYC verification required. Click to activate Stage 1 (Lifetime DMS) + Stage 2 (90-Day Full AI Pilot).',
                priority: 140,
                onclick: () => this.commandRegistry.executeCommand('hayagriva.license.activate')
              });
              if (!this.hasSmartLaunchedSettings) {
                this.hasSmartLaunchedSettings = true;
                setTimeout(() => {
                  this.openSettingsPanel().catch(err => this.logger.warn(`[Hayagriva] Auto-launch activation failed: ${err.message}`));
                }, 400);
              }
            } else if (!stage2Local.allowed) {
              const icon = access.status === 'TAMPERED' ? '$(fa-warning)' : '$(fa-clock-o)';
              const label = access.status === 'TAMPERED' ? 'Clock Altered' : 'Stage 2 Sub Due';
              this.statusBar.setElement('hayagriva-license-item', {
                text: `${icon} Local AI: ${label}`,
                alignment: StatusBarAlignment.LEFT,
                color: '#f59e0b',
                tooltip: 'Stage 1 DMS is lifetime active. Stage 3 Global Agents (@Precedent, @Forensic) are always available. Click to renew Stage 2 local AI.',
                priority: 140,
                onclick: () => this.commandRegistry.executeCommand('hayagriva.license.activate')
              });
            } else {
              this.statusBar.setElement('hayagriva-license-item', {
                text: `$(fa-shield) Local AI: ${daysRem}d`,
                alignment: StatusBarAlignment.LEFT,
                tooltip: `Tri-Tier Hybrid: Stage 1 Lifetime DMS Active | Stage 2 Local AI Pilot (${daysRem} days remaining) | Stage 3 Pay-Per-Use Precedents Always On.`,
                priority: 140,
                onclick: () => this.commandRegistry.executeCommand('hayagriva.license.activate')
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

      if (this.showOfflineWarning) {
        this.showOfflineWarning = false;
        setTimeout(() => {
          this.messageService.error('Hayagriva backend server is offline. Please launch it using ./launchers/start.command');
        }, 3000);
      }
    }
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .theia-AgentAvatar.codicon-copilot {
        background-image: url('data:image/png;base64,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') !important;
        background-size: contain !important;
        background-repeat: no-repeat !important;
        background-position: center !important;
        width: 24px !important;
        height: 24px !important;
        display: inline-block !important;
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

      const toast = document.createElement('div');
      toast.id = 'rbz-advisor-toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 34px;
        right: 24px;
        width: 330px;
        background: rgba(13, 17, 23, 0.95);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(56, 189, 248, 0.4);
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6), 0 0 12px rgba(56, 189, 248, 0.2);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #e2e8f0;
        animation: slideUpFade 0.3s ease-out;
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
          <div style="font-size: 11px; font-weight: 700; color: #10b981;">
            ₹${suggestion.totalInr} <span style="font-size: 9px; color: #64748b; font-weight: normal;">(incl. GST)</span>
          </div>
          <div style="display: flex; gap: 6px;">
            <button id="btnStageRbzToast" style="background: #0284c7; hover: background: #0369a1; color: #ffffff; border: none; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 600; cursor: pointer;">
              ⚡ Review &amp; Stage
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(toast);
      currentToastEl = toast;

      // Bind Dismiss
      const btnDismiss = toast.querySelector('#btnDismissRbzToast');
      if (btnDismiss) {
        btnDismiss.addEventListener('click', async () => {
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

      // Bind Stage & Review
      const btnStage = toast.querySelector('#btnStageRbzToast');
      if (btnStage) {
        btnStage.addEventListener('click', async () => {
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
              this.messageService.info(`⚡ ${suggestion.title} staged in Settings Queue! Opening review…`);
              this.openSettingsPanel(caseName);
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
