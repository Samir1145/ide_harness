import * as monaco from '@theia/monaco-editor-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ThemeService } from '@theia/core/lib/browser/theming';
import {
  FrontendApplicationContribution,
  FrontendApplication,
  ApplicationShell,
  OpenHandler,
  WidgetManager
} from '@theia/core/lib/browser';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { ILogger, CommandRegistry, PreferenceService, MessageService } from '@theia/core/lib/common';
import { PreferenceSchema } from '@theia/core/lib/common/preferences';
import { Widget } from '@lumino/widgets';
import URI from '@theia/core/lib/common/uri';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';

export const hayagrivaPreferenceSchema: PreferenceSchema = {
  properties: {
    'hayagriva.apiPort': {
      type: 'number',
      description: 'The port of the Hayagriva API backend server.',
      default: 3210
    },
    'hayagriva.rag.citationLimit': {
      type: 'number',
      description: 'Top N limit for RAG citation matching.',
      default: 5
    },
    'hayagriva.rag.hoverLimit': {
      type: 'number',
      description: 'Top N limit for RAG hover completions.',
      default: 1
    },
    'files.exclude': {
      type: 'object',
      description: 'Configure glob patterns for excluding files and folders in File Explorer.',
      default: {
        '**/.*': true,
        '**/.*/**': true,
        '.*': true,
        '.*/**': true,
        '**/.prompts': true,
        '**/.prompts/**': true,
        '**/.localized': true,
        '**/.trash': true,
        '**/.trash/**': true,
        '**/concepts': true,
        '**/conversions': true,
        '**/wiki': true,
        '**/drafts': true,
        '**/exports': true,
        '**/summaries': true,
        '**/reviews': true,
        '**/*_conversions_haya': true,
        '**/*_concepts_haya': true,
        '**/*_wiki_haya': true,
        '**/*_conversions_haya/**': true,
        '**/*_concepts_haya/**': true,
        '**/*_wiki_haya/**': true,
        '*_conversions_haya': true,
        '*_concepts_haya': true,
        '*_wiki_haya': true,
        'concepts': true,
        'conversions': true,
        'wiki': true,
        'drafts': true,
        'exports': true,
        'summaries': true,
        'reviews': true,
        '**/concepts/**': true,
        '**/conversions/**': true,
        '**/wiki/**': true,
        '**/drafts/**': true,
        '**/exports/**': true,
        '**/summaries/**': true,
        '**/reviews/**': true,
        'concepts/': true,
        'conversions/': true,
        'wiki/': true,
        'drafts/': true,
        'exports/': true,
        'summaries/': true,
        'reviews/': true,
        '**/*.status': true,
        '**/*.error': true,
        '**/*.footer': true,
        '**/*.cache': true,
        '**/index.json': true,
        '**/index.sqlite': true,
        '**/sqlite.db': true,
        '**/case_manifest.json': true,
        '**/case_kv_dictionary.json': true,
        '**/CASE_AUDIT.md': true,
        '**/hayagriva_settings.json': true,
        '**/index.md': true,
        '**/.last-launch-build-checksum': true
      }
    }
  }
};
import { HayagrivaEditorDecorator } from './highlight-decorator';
import { HayagrivaTreeDecorator } from './tree-decorator';
import {
  wikiExplorerHtml,
  conceptsExplorerHtml,
  kvEditorHtml,
  formEditorHtml,
  draftingPanelHtml
} from './templates';

const HAYAGRIVA_NS = 'hayagriva';

function getBasename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1];
}

@injectable()
export class HayagrivaFrontendContribution implements FrontendApplicationContribution, OpenHandler, TabBarToolbarContribution {

  readonly id = 'hayagriva-wiki-open-handler';
  readonly label = 'HAYAGRIVA Wiki Viewer';

  private uploadModalElement: HTMLElement | undefined;
  private wikiWidget: Widget | undefined;
  private conceptsWidget: Widget | undefined;

  isBackendOnline: boolean = true;
  private showOfflineWarning: boolean = true;

  constructor(
    @inject(WorkspaceService) private readonly workspaceService: WorkspaceService,
    @inject(EditorManager) private readonly editorManager: EditorManager,
    @inject(ApplicationShell) private readonly shell: ApplicationShell,
    @inject(HayagrivaEditorDecorator) private readonly decorator: HayagrivaEditorDecorator,
    @inject(ILogger) private readonly logger: ILogger,
    @inject(WidgetManager) private readonly widgetManager: WidgetManager,
    @inject(ThemeService) private readonly themeService: ThemeService,
    @inject(CommandRegistry) private readonly commandRegistry: CommandRegistry,
    @inject(PreferenceService) private readonly preferenceService: PreferenceService,
    @inject(HayagrivaTreeDecorator) private readonly treeDecorator: HayagrivaTreeDecorator,
    @inject(StatusBar) private readonly statusBar: StatusBar,
    @inject(MessageService) private readonly messageService: MessageService
  ) {}

  getApiPort(): number {
    return this.preferenceService.get<number>('hayagriva.apiPort', 3210);
  }

  getBackendUrl(): string {
    return `http://127.0.0.1:${this.getApiPort()}`;
  }

  getCitationLimit(): number {
    return this.preferenceService.get<number>('hayagriva.rag.citationLimit', 5);
  }

  getHoverLimit(): number {
    return this.preferenceService.get<number>('hayagriva.rag.hoverLimit', 1);
  }

  canHandle(uri: URI): number {
    if (uri.scheme === 'hayagriva-citation') {
      return 100;
    }
    const filePath = uri.path.toString().toLowerCase();
    if (filePath.endsWith('case_kv_dictionary.json')) {
      return 600;
    }
    if (filePath.includes('/reviews/filled-') && filePath.endsWith('.json')) {
      return 600;
    }
    if (filePath.endsWith('.docx') ||
        filePath.endsWith('.xlsx') || filePath.endsWith('.xls') ||
        filePath.endsWith('.wiki.html') || filePath.endsWith('.html') || filePath.endsWith('.pdf')) {
      return 600;
    }
    return 0;
  }

  async open(uri: URI): Promise<Widget> {
    if (uri.scheme === 'hayagriva-citation') {
      const docName = decodeURIComponent(uri.authority);
      const query = uri.query;
      const pageMatch = query.match(/page=(\d+)/);
      const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : 1;
      return await this.openCitationPreview(docName, pageNum);
    }
    
    const filePath = uri.path.toString();
    const caseName = this.getCaseName(filePath);

    if (filePath.endsWith('case_kv_dictionary.json')) {
      return await this.openKvEditor(caseName);
    }
    if (filePath.includes('/reviews/filled-') && filePath.endsWith('.json')) {
      const base = getBasename(filePath);
      const formId = base.replace(/^filled-/, '').replace(/\.json$/, '');
      return await this.openFormEditor(caseName, formId);
    }

    const lowerPath = filePath.toLowerCase();
    if (lowerPath.endsWith('.wiki.html') || lowerPath.endsWith('.html')) {
      const wikiId = `hayagriva-wiki-viewer-${encodeURIComponent(filePath)}`;
      const wikiAlreadyOpen = !!this.shell.getWidgets('main').find(w => w.id === wikiId);

      const wikiWidget = await this.openWikiHtmlViewer(filePath, caseName);
      
      if (!wikiAlreadyOpen) {
        // Auto split-open the first extracted Markdown card to the side if it exists
        try {
          const caseDir = filePath.substring(0, filePath.lastIndexOf('/'));
          const wikiCardUri = uri.withPath(`${caseDir}/wiki/00_Workflow_Architecture.md`);
          // If 00_Workflow_Architecture.md doesn't exist, try TableOfContents.md or index card
          await this.editorManager.openToSide(wikiCardUri);
        } catch (_) {}
      }

      return wikiWidget;
    }
    if (lowerPath.endsWith('.docx') || lowerPath.endsWith('.doc') ||
        lowerPath.endsWith('.xlsx') || lowerPath.endsWith('.xls') ||
        lowerPath.endsWith('.pdf')) {
      
      const rel = this.getRelativePath(uri);
      const status = this.treeDecorator.statusCache[rel];
      // D2/D6: Companion exists when the backend reports files.companion.exists === true (dot1 === 'green')
      const hasCompanion = status?.files?.companion?.exists === true;

      
      const previewWidget = await this.openOfficePreview(filePath, caseName);
      
      if (hasCompanion) {
        // status.files.companion.path is a relative path from the case dir root
        // (e.g. "conversions/ipie.md"). uri.withPath() expects an absolute path,
        // so we must join it with the case directory first.
        let companionUri: URI;
        const relCompanion = status?.files?.companion?.path;
        if (relCompanion) {
          const caseDir = this.getCaseName(filePath);
          const absCompanionPath = `${caseDir}/${relCompanion}`;
          companionUri = uri.withPath(absCompanionPath);
        } else {
          // Fallback: same folder, same stem, .md extension (absolute)
          companionUri = uri.withPath(filePath.replace(/\.[a-zA-Z0-9]+$/, '.md'));
        }
        // Split open the companion MD to the side of the preview widget
        await this.editorManager.openToSide(companionUri);
      }
      
      return previewWidget;
    }

    const base = getBasename(filePath);
    const docName = base.replace(/\.wiki\.html$/i, '');
    await this.openWiki(docName, caseName);
    return new Widget();
  }

  onStart(app: FrontendApplication): void {
    // Inject CSS to hide filetype icons for leaf nodes & hide the Open Editors panel
    const style = document.createElement('style');
    style.id = 'hayagriva-hide-filetype-icons';
    style.textContent = `
      .theia-FileStatNode:not(.theia-DirNode) .file-icon,
      .theia-FileStatNode:not(.theia-DirNode) .theia-FileStatIcon,
      .theia-FileStatNode:not(.theia-DirNode) [class*="file-icon"] {
          display: none !important;
      }
      #theia-open-editors-widget,
      .theia-open-editors-widget,
      .theia-NavigatorWidget > .p-Panel > .theia-open-editors-widget {
          display: none !important;
      }
      
      /* --- HAYAGRIVA Custom Branding Logo Overrides --- */
      svg.theia-WelcomeMessage-Logo * {
          display: none !important;
      }
      svg.theia-WelcomeMessage-Logo {
          background-image: var(--theia-branding-logo) !important;
          background-position: center center !important;
          background-repeat: no-repeat !important;
          background-size: contain !important;
          width: 260px !important;
          height: 260px !important;
          max-width: 90% !important;
      }
      svg.theia-WelcomeMessage-Logo[width="64"] {
          width: 220px !important;
          height: 220px !important;
          max-width: 90% !important;
      }
      .theia-AgentAvatar.codicon-copilot::before {
          content: "" !important;
      }
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

    // Enable Monaco inline completions & ghost text preferences
    try {
      this.preferenceService.set('editor.inlineSuggest.enabled', true);
      this.preferenceService.set('editor.suggestOnTriggerCharacters', true);
      this.preferenceService.set('editor.quickSuggestions', { other: true, comments: true, strings: true });
    } catch (_) {}

    // Disabled custom sidebars - users interact via the native file tree status dots
    this.initializeWikiExplorerWidget();
    this.initializeConceptsExplorerWidget();
    this.registerMonacoLinkProvider();
    this.registerLawCompletion();
    this.registerLawHoverProvider();
    this.registerDiagnosticsLinter();
    
    // Start polling the backend proxy server's connection health
    this.startBackendMonitor();

    // Listen for theme changes to dynamically sync open Settings panel iframes
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
      } catch (err) {
        console.warn('[Hayagriva] Failed to sync settings iframe theme:', err);
      }
    });
  }

  registerToolbarItems(registry: TabBarToolbarRegistry): void {
    registry.registerItem({
      id: 'hayagriva-upload-toolbar-item',
      command: 'hayagriva:openUploadSplit',
      tooltip: 'Upload to Hayagriva',
      icon: 'fa fa-upload',
      priority: 0,
    });
    registry.registerItem({
      id: 'hayagriva-theme-toolbar-item',
      command: 'hayagriva:toggleTheme',
      tooltip: 'Toggle Light/Dark Theme',
      icon: 'fa fa-adjust',
      priority: 2,
    });
    registry.registerItem({
      id: 'hayagriva-settings-toolbar-item',
      command: 'hayagriva:openSettingsPanel',
      tooltip: 'Open Case Settings',
      icon: 'fa fa-cog',
      priority: 3,
    });
    registry.registerItem({
      id: 'hayagriva-chronology-toolbar-item',
      command: 'hayagriva:openChronology',
      tooltip: 'Open Case Chronology',
      icon: 'fa fa-calendar',
      priority: 4,
    });
    registry.registerItem({
      id: 'hayagriva-topic-overlap-toolbar-item',
      command: 'hayagriva:openTopicOverlap',
      tooltip: 'Open Topic Overlap Map',
      icon: 'fa fa-link',
      priority: 5,
    });
  }

  onDidInitializeLayout(app: FrontendApplication): void {
    const leftWidgets = this.shell.getWidgets('left');
    for (const widget of leftWidgets) {
      const id = widget.id.toLowerCase();
      // Keep only standard explorer-view-container, wiki-explorer, and concepts-explorer visible
      if (id !== 'explorer-view-container' && id !== 'hayagriva-wiki-explorer' && id !== 'hayagriva-concepts-explorer') {
        widget.close();
      }
    }
  }

  private getRelativePath(uri: URI): string {
    const filePath = decodeURIComponent(uri.path.toString());
    try {
      const wsRoot = this.workspaceService.getWorkspaceRootUri(undefined);
      if (wsRoot) {
        const rootPath = decodeURIComponent(wsRoot.path.toString());
        const fileLower = filePath.toLowerCase();
        const rootLower = rootPath.toLowerCase();
        if (fileLower.startsWith(rootLower)) {
          return filePath.substring(rootPath.length).replace(/^[\/\\]/, '');
        }
      }
    } catch (_) {}
    return filePath;
  }

  // Robust, Noob-Proof Case Folder Resolution relative to the Workspace Root
  getCaseName(filePath: string): string {
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

  async openWiki(docName: string, caseName: string): Promise<Widget> {
    try {
      const wsUri = this.workspaceService.getWorkspaceRootUri(undefined);
      if (!wsUri) {
        throw new Error('No active workspace root found');
      }
      
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
      
      // Batch upload confirmation check to prevent accidental folder/mass uploads
      if (input.files.length > 5) {
        const confirmed = confirm(`⚠️ Warning: You are about to upload and process a batch of ${input.files.length} files.\n\nAre you sure you want to proceed?`);
        if (!confirmed) {
          this.logger.info(`[HAYAGRIVA] Batch upload of ${input.files.length} files cancelled by user.`);
          return;
        }
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

  initializeWikiExplorerWidget(): void {
    if (this.wikiWidget) return;

    let initialCase = this.getActiveCaseName();
    const ws = this.workspaceService.getWorkspaceRootUri(undefined);
    if (ws) {
      initialCase = this.getCaseName(new URI(ws.toString()).path.toString());
    } else {
      const active = this.editorManager.activeEditor;
      if (active) {
        const uri = active.getResourceUri();
        if (uri) {
          initialCase = this.getCaseName(uri.path.toString());
        }
      }
    }

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
          // Also refresh the Concepts panel so newly uploaded docs appear immediately
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
              // Safety check: do not open directory paths or the workspace root
              if (uri.toString() !== workspaceRoot.toString()) {
                await this.editorManager.open(uri);
              } else {
                console.warn('[HAYAGRIVA] Aborted opening directory path:', uri.toString());
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
            } catch (err: any) {
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
            } catch (err) {}
          }
        } else if (event.data.type === 'compare-draft-versions') {
          const { draftName, version } = event.data;
          const workspaceRoot = this.workspaceService.getWorkspaceRootUri(undefined);
          if (workspaceRoot) {
            const leftRelative = draftName.replace(/\.md$/, `.v${version - 1}.md`);
            const leftUri = new URI(workspaceRoot.toString()).resolve(leftRelative);
            const rightUri = new URI(workspaceRoot.toString()).resolve(draftName);
            this.commandRegistry.executeCommand(
              'vscode.diff',
              leftUri,
              rightUri,
              `Draft Redlines: v${version - 1} vs v${version}`
            );
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
      const ws = wsStat ? wsStat.resource : this.workspaceService.getWorkspaceRootUri(undefined);
      if (ws) {
        const caseName = this.getCaseName(ws.path.toString());
        this.updateSidebarCase(caseName);
      }
    });
  }



  initializeConceptsExplorerWidget(): void {
    if (this.conceptsWidget) return;

    let initialCase = this.getActiveCaseName();
    const ws = this.workspaceService.getWorkspaceRootUri(undefined);
    if (ws) {
      initialCase = this.getCaseName(new URI(ws.toString()).path.toString());
    } else {
      const active = this.editorManager.activeEditor;
      if (active) {
        const uri = active.getResourceUri();
        if (uri) {
          initialCase = this.getCaseName(uri.path.toString());
        }
      }
    }

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
  }

  async openCitationPreview(docName: string, pageNum: number): Promise<Widget> {
    const id = 'hayagriva-citation-preview';
    let widget = this.shell.getWidgets('right').find(w => w.id === id);
    
    if (!widget) {
      widget = new Widget();
      widget.id = id;
      widget.title.label = 'Citation Preview';
      widget.title.closable = true;
      widget.title.iconClass = 'fa fa-eye';
    }

    while (widget.node.firstChild) {
      widget.node.removeChild(widget.node.firstChild);
    }

    const workspaceRoot = this.workspaceService.getWorkspaceRootUri(undefined);
    if (!workspaceRoot) return widget;
    
    const conceptsUri = new URI(workspaceRoot.toString()).resolve(`concepts/${docName}`);
    let cardContent = `No citation excerpt available for Page ${pageNum} of ${docName}.`;
    
    try {
      const treeUri = conceptsUri.resolve('pageindex_tree.json');
      const res = await fetch(`${this.getBackendUrl()}/api/hayagriva/read-file?path=${encodeURIComponent(treeUri.path.toString())}`);
      if (res.ok) {
        const treeData = await res.json();
        const flatNodes: any[] = [];
        function flatten(node: any) {
          flatNodes.push(node);
          if (node.children) {
            for (const child of node.children) {
              flatten(child);
            }
          }
        }
        flatten(treeData.tree);
        
        const targetNode = flatNodes.find(n => n.metadata && n.metadata.type === 'section' && n.pageStart <= pageNum && n.pageEnd >= pageNum);
        if (targetNode) {
          const safeTitle = targetNode.title.replace(/[^a-zA-Z0-9\s-_]/g, '').trim().replace(/\s+/g, '_') || 'untitled';
          let cardTitle = safeTitle;
          if (cardTitle.length > 60) {
              let hash = 0;
              for (let i = 0; i < targetNode.title.length; i++) {
                  hash = (hash << 5) - hash + targetNode.title.charCodeAt(i);
                  hash |= 0;
              }
              cardTitle = cardTitle.substring(0, 60) + '_' + Math.abs(hash);
          }
          
          const cardUri = conceptsUri.resolve(`${cardTitle}.md`);
          const cardRes = await fetch(`${this.getBackendUrl()}/api/hayagriva/read-file?path=${encodeURIComponent(cardUri.path.toString())}`);
          if (cardRes.ok) {
            const fileData = await cardRes.json();
            cardContent = fileData.content || cardContent;
          }
        }
      }
    } catch (e: any) {
      this.logger.error(`[HAYAGRIVA] Failed to load card details for preview: ${e.message}`);
    }

    const { citationPreviewPanelHtml } = require('./templates');
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.srcdoc = citationPreviewPanelHtml(docName, pageNum, cardContent);
    widget.node.appendChild(iframe);

    const messageListener = (event: MessageEvent) => {
      if (event.data && event.data.type === 'close-citation-preview') {
        widget?.close();
        window.removeEventListener('message', messageListener);
      } else if (event.data && event.data.type === 'open-full-citation') {
        this.openCitationSideBySide(docName, pageNum);
        widget?.close();
        window.removeEventListener('message', messageListener);
      }
    };
    window.addEventListener('message', messageListener);

    widget.disposed.connect(() => {
      window.removeEventListener('message', messageListener);
    });

    this.shell.addWidget(widget, { area: 'right' });
    this.shell.activateWidget(widget.id);
    return widget;
  }

  async openCitationSideBySide(docName: string, pageNum: number): Promise<void> {
    const workspaceRoot = this.workspaceService.getWorkspaceRootUri(undefined);
    if (!workspaceRoot) return;
    
    const conceptsUri = new URI(workspaceRoot.toString()).resolve(`concepts/${docName}`);
    
    try {
      const treeUri = conceptsUri.resolve('pageindex_tree.json');
      const res = await fetch(`${this.getBackendUrl()}/api/hayagriva/read-file?path=${encodeURIComponent(treeUri.path.toString())}`);
      if (!res.ok) throw new Error();
      
      const treeData = await res.json();
      const flatNodes: any[] = [];
      function flatten(node: any) {
        flatNodes.push(node);
        if (node.children) {
          for (const child of node.children) {
            flatten(child);
          }
        }
      }
      flatten(treeData.tree);
      
      const targetNode = flatNodes.find(n => n.metadata && n.metadata.type === 'section' && n.pageStart <= pageNum && n.pageEnd >= pageNum);
      if (targetNode) {
        const safeTitle = targetNode.title.replace(/[^a-zA-Z0-9\s-_]/g, '').trim().replace(/\s+/g, '_') || 'untitled';
        let cardTitle = safeTitle;
        if (cardTitle.length > 60) {
            let hash = 0;
            for (let i = 0; i < targetNode.title.length; i++) {
                hash = (hash << 5) - hash + targetNode.title.charCodeAt(i);
                hash |= 0;
            }
            cardTitle = cardTitle.substring(0, 60) + '_' + Math.abs(hash);
        }
        
        const cardUri = conceptsUri.resolve(`${cardTitle}.md`);
        
        const editor = await this.editorManager.openToSide(cardUri, {
          selection: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 99 }
          }
        });
        
        this.decorator.applyHighlight(editor, 0);
      }
    } catch (e: any) {
      this.logger.error(`[HAYAGRIVA] Failed to open side-by-side split citation: ${e.message}`);
    }
  }

  registerMonacoLinkProvider(): void {
    const checkMonaco = () => {
      if (monaco && monaco.languages) {
        monaco.languages.registerLinkProvider('markdown', {
          provideLinks: (model: any) => {
            const links: any[] = [];
            const lines = model.getLinesContent();
            const regex = /(?:see\s+|exhibit\s+)?([a-zA-Z0-9_\s-]+),\s*Page\s*(\d+)/gi;
            
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              let match;
              regex.lastIndex = 0;
              while ((match = regex.exec(line)) !== null) {
                const startCol = match.index + 1;
                const endCol = startCol + match[0].length;
                const docName = match[1].trim();
                const pageNum = match[2];
                
                links.push({
                  range: new monaco.Range(i + 1, startCol, i + 1, endCol),
                  url: `hayagriva-citation://${encodeURIComponent(docName)}?page=${pageNum}`
                });
              }
            }
            return { links };
          }
        });
        this.logger.info('[HAYAGRIVA] Successfully registered Monaco Link Provider for Citations.');
      } else {
        setTimeout(checkMonaco, 200);
      }
    };
    checkMonaco();
  }

  // ─── Law Completion (@@-triggered dropdown) ──────────────────────────────

  registerLawCompletion(): void {


    const cache = new Map<string, any[]>();

    const fetchCompletions = async (triggerText: string): Promise<any[]> => {
      if (cache.has(triggerText)) return cache.get(triggerText)!;
      try {
        const res = await fetch(
          `${this.getBackendUrl()}/api/laws/query?q=${encodeURIComponent(triggerText)}&n=${this.getHoverLimit()}`
        );
        if (!res.ok) return [];
        const json = await res.json();
        const results = json.results || [];
        cache.set(triggerText, results);
        if (cache.size > 200) {
          const firstKey = cache.keys().next().value;
          if (firstKey !== undefined) cache.delete(firstKey);
        }
        return results;
      } catch {
        return [];
      }
    };

    const checkMonaco = () => {
      if (!monaco || !monaco.languages || !monaco.languages.registerCompletionItemProvider) {
        console.log("[HAYAGRIVA-DEBUG] monaco not ready"); setTimeout(checkMonaco, 300);
        return;
      }

      const LANGS = ['markdown', 'plaintext'];

      for (const lang of LANGS) {
        // ── 1. Standard Completion Item Provider (@ and / triggers) ──────────────────────
        monaco.languages.registerCompletionItemProvider(lang, {
          triggerCharacters: ['@', '/'],
          provideCompletionItems: async (model: any, position: any, _context: any, token: any) => {
            const lineText: string = model.getLineContent(position.lineNumber);
            const textUpToCursor = lineText.substring(0, position.column - 1);

            let currentCase = this.getActiveCaseName();
            const ws = this.workspaceService.getWorkspaceRootUri(undefined);
            if (ws) {
              currentCase = this.getCaseName(new URI(ws.toString()).path.toString());
            }

            // ── A. Statutory Law & Concepts Trigger (@@ or @) ──────────────────────
            const atMatch = textUpToCursor.match(/(?:^|\s)@@?([\w\s./,-]*)$/);
            if (atMatch) {
              const atIdx = textUpToCursor.search(/(?:^|\s)@@?([\w\s./,-]*)$/);
              const matchStr = atMatch[0];
              const atSymbolIdx = matchStr.indexOf('@') + atIdx;
              const typedPrefix = textUpToCursor.substring(atSymbolIdx); // e.g. "@", "@@", "@@ibc"

              const replaceRange = new monaco.Range(
                position.lineNumber,
                atSymbolIdx + 1,
                position.lineNumber,
                position.column
              );

              const rawAt = atMatch[1];
              const query = rawAt.trim();

              if (!query) {
                const categorySuggestions = [
                  {
                    label: `${typedPrefix}ibc/ - Search Insolvency & Bankruptcy Code`,
                    filterText: `${typedPrefix}ibc`,
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: `${typedPrefix}ibc/`,
                    range: replaceRange,
                    detail: 'Statutory Law Vault'
                  },
                  {
                    label: `${typedPrefix}mca/ - Search Companies Act & Rules`,
                    filterText: `${typedPrefix}mca`,
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: `${typedPrefix}mca/`,
                    range: replaceRange,
                    detail: 'Statutory Law Vault'
                  },
                  {
                    label: `${typedPrefix}sec - Search Statutory Sections`,
                    filterText: `${typedPrefix}sec`,
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: `${typedPrefix}sec `,
                    range: replaceRange,
                    detail: 'Statutory Law Vault'
                  },
                  {
                    label: `${typedPrefix}concept - Link Case Facts`,
                    filterText: `${typedPrefix}concept`,
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: `${typedPrefix}concept `,
                    range: replaceRange,
                    detail: 'Workspace Concept Nodes'
                  },
                  {
                    label: `${typedPrefix}qa - Link Q&A Cards`,
                    filterText: `${typedPrefix}qa`,
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: `${typedPrefix}qa `,
                    range: replaceRange,
                    detail: 'Generated Case Q&As'
                  }
                ];
                return { suggestions: categorySuggestions };
              }

              const results = await fetchCompletions(query);
              if (token.isCancellationRequested) return { suggestions: [] };

              const suggestions = results.map((r: any) => {
                const cleanText = (r.text as string).replace(/^---[\s\S]*?---\r?\n?/, '').trimStart();
                const { snippet, hasSnippets } = convertToSnippet(cleanText);
                const titleOrSection = r.title || `Section ${r.section}`;
                return {
                  label: `${typedPrefix}${r.id || titleOrSection} - ${titleOrSection}`,
                  filterText: `${typedPrefix}${query}`,
                  kind: monaco.languages.CompletionItemKind.Snippet,
                  insertText: snippet,
                  insertTextRules: hasSnippets
                    ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                    : undefined,
                  range: replaceRange,
                  detail: r.id || 'Statutory Law',
                  documentation: cleanText.substring(0, 300) + '...'
                };
              });

              return { suggestions };
            }

            // ── B. Notion-Style Slash Commands ─────────────────────────────────
            const slashMatch = textUpToCursor.match(/(?:^|\s)\/([\w\s./,-]*)$/);
            if (slashMatch) {
              const slashIdx = textUpToCursor.search(/(?:^|\s)\/([\w\s./,-]*)$/);
              const startIdx = textUpToCursor.substring(slashIdx).indexOf('/') + slashIdx;
              
              const replaceRange = new monaco.Range(
                position.lineNumber,
                startIdx + 1,
                position.lineNumber,
                position.column
              );
              
              const rawSlash = slashMatch[1];
              const rawSlashLower = rawSlash.toLowerCase();

              const CLAUSES = [
                {
                  id: 'arbitration',
                  title: 'Arbitration Clause',
                  text: 'Any dispute, controversy, or claim arising out of or relating to this contract, including its formation, breach, termination, or invalidity, shall be referred to and finally resolved by arbitration under the Arbitration and Conciliation Act, 1996. The tribunal shall consist of ${1:one} arbitrator(s). The venue/seat of arbitration shall be ${2:city_name}, and the language of the proceedings shall be English.'
                },
                {
                  id: 'governing_law',
                  title: 'Governing Law & Jurisdiction',
                  text: 'This Agreement shall be governed by, construed, and enforced in accordance with the laws of India. The parties agree that the courts located in ${1:city_name} shall have exclusive jurisdiction to settle any disputes arising under this Agreement.'
                },
                {
                  id: 'indemnity',
                  title: 'Indemnification Clause',
                  text: 'The ${1:Indemnifying Party} shall defend, indemnify, and hold harmless the ${2:Indemnified Party} from and against any and all claims, losses, damages, liabilities, and expenses (including reasonable legal fees) arising from any breach of this Agreement or negligent acts.'
                },
                {
                  id: 'confidentiality',
                  title: 'Confidentiality Clause',
                  text: 'Each party agrees to hold in strict confidence all confidential information disclosed by the other party. Neither party shall disclose such information to any third party without the prior written consent of the disclosing party, except as required by law. This obligation survives for ${1:number} year(s) post-termination.'
                },
                {
                  id: 'force_majeure',
                  title: 'Force Majeure Clause',
                  text: 'Neither party shall be liable for any failure or delay in performance under this Agreement due to circumstances beyond its reasonable control, including but not limited to acts of God, war, riot, fire, flood, labor dispute, or government actions, provided prompt notice is given.'
                }
              ];

              // A. Level 1: Just typed "/", or typing the command prefix
              if (!rawSlash.includes(' ') &&
                  !rawSlash.startsWith('law') &&
                  !rawSlash.startsWith('ibc') &&
                  !rawSlash.startsWith('mca') &&
                  !rawSlash.startsWith('sec') &&
                  !rawSlash.startsWith('concept') &&
                  !rawSlash.startsWith('qa') &&
                  !rawSlash.startsWith('clause') &&
                  !rawSlash.startsWith('case')) {
                const commandSuggestions = [
                  {
                    label: '/law - Search Statutory Laws',
                    filterText: '/law',
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: 'law ',
                    range: replaceRange,
                    detail: 'AES Encrypted Law Vault',
                  },
                  {
                    label: '/ibc - Insolvency & Bankruptcy Code',
                    filterText: '/ibc',
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: 'ibc ',
                    range: replaceRange,
                    detail: 'IBC 2016 Rules & Regulations',
                  },
                  {
                    label: '/mca - Companies Act & Rules',
                    filterText: '/mca',
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: 'mca ',
                    range: replaceRange,
                    detail: 'Companies Act 2013',
                  },
                  {
                    label: '/sec - Statutory Section Lookup',
                    filterText: '/sec',
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: 'sec ',
                    range: replaceRange,
                    detail: 'Section Search',
                  },
                  {
                    label: '/concept - Link Case Facts',
                    filterText: '/concept',
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: 'concept ',
                    range: replaceRange,
                    detail: 'Workspace Concept Nodes',
                  },
                  {
                    label: '/qa - Link Case Q&A cards',
                    filterText: '/qa',
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: 'qa ',
                    range: replaceRange,
                    detail: 'Generated Case Q&As',
                  },
                  {
                    label: '/case - Link Case Law Summaries',
                    filterText: '/case',
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: 'case ',
                    range: replaceRange,
                    detail: '581 Case Law Summaries',
                  },
                  {
                    label: '/clause - Insert Drafting Boilerplate',
                    filterText: '/clause',
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: 'clause ',
                    range: replaceRange,
                    detail: 'Interactive Templates',
                  },
                  {
                    label: '/export-sc - Export to Supreme Court DOCX',
                    filterText: '/export-sc',
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: '',
                    range: replaceRange,
                    detail: 'Supreme Court Formatted Exporter',
                    command: {
                      id: `${HAYAGRIVA_NS}:exportScDocx`,
                      arguments: [model.uri]
                    }
                  }
                ].filter(s => s.filterText.startsWith('/' + rawSlashLower));
                
                return { suggestions: commandSuggestions };
              }

              // B. Level 2: Command matches "/law <query>", "/ibc <query>", "/mca <query>", "/sec <query>"
              if (rawSlashLower.startsWith('law') || rawSlashLower.startsWith('ibc') || rawSlashLower.startsWith('mca') || rawSlashLower.startsWith('sec')) {
                let query = rawSlash.trim();
                if (rawSlashLower.startsWith('law')) {
                  query = rawSlash.substring(3).trim();
                }
                if (query.length < 2) return { suggestions: [] };
                
                const results = await fetchCompletions(query);
                if (token.isCancellationRequested) return { suggestions: [] };
                
                const prefixCmd = rawSlash.split(/\s+/)[0];
                const suggestions = results.map((r: any) => {
                  const cleanText = (r.text as string).replace(/^---[\s\S]*?---\r?\n?/, '').trimStart();
                  const { snippet, hasSnippets } = convertToSnippet(cleanText);
                  return {
                    label: `/${prefixCmd} → ${r.title || `Section ${r.section}`}`,
                    filterText: `/${rawSlash}`,
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: snippet,
                    insertTextRules: hasSnippets
                        ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                        : undefined,
                    range: replaceRange,
                    detail: r.id,
                    documentation: cleanText.substring(0, 200) + '...'
                  };
                });
                return { suggestions };
              }

              // C. Level 2: Command matches "/concept <query>"
              if (rawSlashLower.startsWith('concept')) {
                const query = rawSlash.substring(7).trim().toLowerCase();
                try {
                  const res = await fetch(`${this.getBackendUrl()}/api/hayagriva/concepts?case=${encodeURIComponent(currentCase)}`);
                  if (token.isCancellationRequested || !res.ok) return { suggestions: [] };
                  const data = await res.json();
                  const list = data.concepts || [];
                  
                  const filtered = list.filter((c: any) => c.title.toLowerCase().includes(query));
                  const suggestions = filtered.map((c: any) => ({
                    label: `/concept → ${c.title}`,
                    filterText: `/concept ${query}`,
                    kind: monaco.languages.CompletionItemKind.Reference,
                    insertText: `[${c.title}](${c.relativePath})`,
                    range: replaceRange,
                    detail: 'Concept Link',
                    documentation: `Path: ${c.relativePath}`
                  }));
                  return { suggestions };
                } catch {
                  return { suggestions: [] };
                }
              }

              // D. Level 2: Command matches "/qa <query>"
              if (rawSlashLower.startsWith('qa')) {
                const query = rawSlash.substring(2).trim().toLowerCase();
                try {
                  const res = await fetch(`${this.getBackendUrl()}/api/hayagriva/wiki-cards?case=${encodeURIComponent(currentCase)}`);
                  if (token.isCancellationRequested || !res.ok) return { suggestions: [] };
                  const data = await res.json();
                  const list = data.cards || [];
                  
                  const filtered = list.filter((c: any) => c.title.toLowerCase().includes(query) || c.filename.toLowerCase().includes(query));
                  const suggestions = filtered.map((c: any) => ({
                    label: `/qa → ${c.title}`,
                    filterText: `/qa ${query}`,
                    kind: monaco.languages.CompletionItemKind.Reference,
                    insertText: `[${c.title}](wiki/${c.filename})`,
                    range: replaceRange,
                    detail: 'Wiki Q&A Link',
                    documentation: `Filename: wiki/${c.filename}`
                  }));
                  return { suggestions };
                } catch {
                  return { suggestions: [] };
                }
              }

              // E. Level 2: Command matches "/clause <query>"
              if (rawSlashLower.startsWith('clause')) {
                const query = rawSlash.substring(6).trim().toLowerCase();
                const filtered = CLAUSES.filter(c => c.title.toLowerCase().includes(query) || c.id.toLowerCase().includes(query));
                const suggestions = filtered.map(c => {
                  const { snippet, hasSnippets } = convertToSnippet(c.text);
                  return {
                    label: `/clause → ${c.title}`,
                    filterText: `/clause ${query}`,
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: snippet,
                    insertTextRules: hasSnippets
                        ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                        : undefined,
                    range: replaceRange,
                    detail: 'Standard Clause',
                    documentation: c.text.substring(0, 150) + '...'
                  };
                });
                return { suggestions };
              }

              // F. Level 2: Command matches "/case <query>"
              if (rawSlashLower.startsWith('case')) {
                const query = rawSlash.substring(4).trim().toLowerCase();
                try {
                  const res = await fetch(`${this.getBackendUrl()}/api/hayagriva/learning-curves?case=${encodeURIComponent(currentCase)}&query=${encodeURIComponent(query)}`);
                  if (token.isCancellationRequested || !res.ok) return { suggestions: [] };
                  const data = await res.json();
                  const list = data.learningCurves || [];
                  
                  const suggestions = list.map((c: any) => ({
                    label: `/case → ${c.case_title}`,
                    filterText: `/case ${query}`,
                    kind: monaco.languages.CompletionItemKind.Reference,
                    insertText: c.content || `[${c.case_title}](${c.relativePath})`,
                    range: replaceRange,
                    detail: c.citation || 'Case Summary',
                    documentation: `Issue: ${c.issue}\n\nDate: ${c.date_of_order} | Court: ${c.court_tribunal}`
                  }));
                  return { suggestions };
                } catch {
                  return { suggestions: [] };
                }
              }
            }

            return { suggestions: [] };
          }
        });

        // ── 2. Monaco Inline Completions Provider (Ghost Text) ────────────────
        if (monaco.languages.registerInlineCompletionsProvider) {
          monaco.languages.registerInlineCompletionsProvider(lang, {
            provideInlineCompletions: async (model: any, position: any, _context: any, token: any) => {
              const lineText: string = model.getLineContent(position.lineNumber);
              const textUpToCursor = lineText.substring(0, position.column - 1);

              const CLAUSES = [
                { id: 'arbitration', title: 'arbitration clause', text: 'Any dispute, controversy, or claim arising out of or relating to this contract, including its formation, breach, termination, or invalidity, shall be referred to and finally resolved by arbitration under the Arbitration and Conciliation Act, 1996. The tribunal shall consist of one arbitrator. The venue/seat of arbitration shall be New Delhi, and the language of the proceedings shall be English.' },
                { id: 'governing_law', title: 'governing law & jurisdiction', text: 'This Agreement shall be governed by, construed, and enforced in accordance with the laws of India. The parties agree that the courts located in New Delhi shall have exclusive jurisdiction to settle any disputes arising under this Agreement.' },
                { id: 'indemnity', title: 'indemnification clause', text: 'The Indemnifying Party shall defend, indemnify, and hold harmless the Indemnified Party from and against any and all claims, losses, damages, liabilities, and expenses (including reasonable legal fees) arising from any breach of this Agreement or negligent acts.' },
                { id: 'confidentiality', title: 'confidentiality clause', text: 'Each party agrees to hold in strict confidence all confidential information disclosed by the other party. Neither party shall disclose such information to any third party without the prior written consent of the disclosing party, except as required by law. This obligation survives for 3 years post-termination.' },
                { id: 'force_majeure', title: 'force majeure clause', text: 'Neither party shall be liable for any failure or delay in performance under this Agreement due to circumstances beyond its reasonable control, including but not limited to acts of God, war, riot, fire, flood, labor dispute, or government actions, provided prompt notice is given.' }
              ];

              let currentCase = this.getActiveCaseName();
              const ws = this.workspaceService.getWorkspaceRootUri(undefined);
              if (ws) {
                currentCase = this.getCaseName(new URI(ws.toString()).path.toString());
              }

              // A. Check for statutory law commands (/law, /ibc, /mca, /sec or @@, @)
              const lawSlashMatch = textUpToCursor.match(/(?:^|\s)\/(law|ibc|mca|sec)(?:\s+([\w\s./,-]*))?$/i);
              const atMatch = textUpToCursor.match(/(?:^|\s)@@?([\w\s./,-]+)$/);

              if (lawSlashMatch || atMatch) {
                let query = '';
                let matchStartChar = '/';
                if (atMatch) {
                  query = atMatch[1].trim();
                  matchStartChar = '@';
                } else if (lawSlashMatch) {
                  const cmd = lawSlashMatch[1].toLowerCase();
                  const rest = (lawSlashMatch[2] || '').trim();
                  query = cmd === 'law' ? (rest || 'ibc') : `${cmd} ${rest}`.trim();
                  matchStartChar = '/';
                }

                if (query.length >= 2) {
                  const results = await fetchCompletions(query);
                  if (!token.isCancellationRequested && results && results.length > 0) {
                    const first = results[0];
                    const cleanText = (first.text as string).replace(/^---[\s\S]*?---\r?\n?/, '').trimStart();
                    
                    const searchRegex = atMatch ? /(?:^|\s)@@?([\w\s./,-]+)$/ : /(?:^|\s)\/(law|ibc|mca|sec)(?:\s+[\w\s./,-]*)?$/i;
                    const matchIdx = textUpToCursor.search(searchRegex);
                    const activeMatch = atMatch || lawSlashMatch;
                    const matchStr = activeMatch![0];
                    const symbolIdx = matchStr.indexOf(matchStartChar) + matchIdx;
                    const typedText = textUpToCursor.substring(symbolIdx);

                    const replaceRange = new monaco.Range(
                      position.lineNumber,
                      symbolIdx + 1,
                      position.lineNumber,
                      position.column
                    );

                    return {
                      items: [
                        {
                          insertText: `${typedText}\n${cleanText}`,
                          range: replaceRange
                        }
                      ]
                    };
                  }
                }
              }

              // B. Check for /clause <query> for ghost text preview
              const slashClauseMatch = textUpToCursor.match(/(?:^|\s)\/clause(?:\s+([\w\s./,-]*))?$/i);
              if (slashClauseMatch) {
                const query = (slashClauseMatch[1] || '').trim().toLowerCase();
                const match = query ? CLAUSES.find(c => c.id.includes(query) || c.title.includes(query)) : CLAUSES[0];
                if (match) {
                  const slashIdx = textUpToCursor.search(/(?:^|\s)\/clause(?:\s+[\w\s./,-]*)?$/i);
                  const typedText = textUpToCursor.substring(slashIdx);
                  const replaceRange = new monaco.Range(
                    position.lineNumber,
                    slashIdx + 1,
                    position.lineNumber,
                    position.column
                  );
                  return {
                    items: [
                      {
                        insertText: `${typedText}\n${match.text}`,
                        range: replaceRange
                      }
                    ]
                  };
                }
              }

              // C. Check for /concept <query>
              const conceptMatch = textUpToCursor.match(/(?:^|\s)\/concept(?:\s+([\w\s./,-]*))?$/i);
              if (conceptMatch) {
                const query = (conceptMatch[1] || '').trim().toLowerCase();
                try {
                  const res = await fetch(`${this.getBackendUrl()}/api/hayagriva/concepts?case=${encodeURIComponent(currentCase)}`);
                  if (!token.isCancellationRequested && res.ok) {
                    const data = await res.json();
                    const list = data.concepts || [];
                    const filtered = query ? list.filter((c: any) => c.title.toLowerCase().includes(query)) : list;
                    if (filtered.length > 0) {
                      const first = filtered[0];
                      const slashIdx = textUpToCursor.search(/(?:^|\s)\/concept(?:\s+[\w\s./,-]*)?$/i);
                      const typedText = textUpToCursor.substring(slashIdx);
                      const replaceRange = new monaco.Range(
                        position.lineNumber,
                        slashIdx + 1,
                        position.lineNumber,
                        position.column
                      );
                      return {
                        items: [
                          {
                            insertText: `${typedText} [${first.title}](${first.relativePath})`,
                            range: replaceRange
                          }
                        ]
                      };
                    }
                  }
                } catch (_) {}
              }

              // D. Check for /qa <query>
              const qaMatch = textUpToCursor.match(/(?:^|\s)\/qa(?:\s+([\w\s./,-]*))?$/i);
              if (qaMatch) {
                const query = (qaMatch[1] || '').trim().toLowerCase();
                try {
                  const res = await fetch(`${this.getBackendUrl()}/api/hayagriva/wiki-cards?case=${encodeURIComponent(currentCase)}`);
                  if (!token.isCancellationRequested && res.ok) {
                    const data = await res.json();
                    const list = data.cards || [];
                    const filtered = query ? list.filter((c: any) => c.title.toLowerCase().includes(query) || c.filename.toLowerCase().includes(query)) : list;
                    if (filtered.length > 0) {
                      const first = filtered[0];
                      const slashIdx = textUpToCursor.search(/(?:^|\s)\/qa(?:\s+[\w\s./,-]*)?$/i);
                      const typedText = textUpToCursor.substring(slashIdx);
                      const replaceRange = new monaco.Range(
                        position.lineNumber,
                        slashIdx + 1,
                        position.lineNumber,
                        position.column
                      );
                      return {
                        items: [
                          {
                            insertText: `${typedText} [${first.title}](wiki/${first.filename})`,
                            range: replaceRange
                          }
                        ]
                      };
                    }
                  }
                } catch (_) {}
              }

              return { items: [] };
            },
            disposeInlineCompletions: () => {}
          });
        }
      }

      this.logger.info('[HAYAGRIVA] Monaco Completion Items (@ and /) and Ghost Text Provider registered for markdown and plaintext.');
    };

    checkMonaco();
  }

  registerLawHoverProvider(): void {
    const checkMonacoHover = () => {
      if (!monaco || !monaco.languages || !monaco.languages.registerHoverProvider) {
        setTimeout(checkMonacoHover, 300);
        return;
      }

      const LANGS = ['markdown', 'plaintext'];

      for (const lang of LANGS) {
        monaco.languages.registerHoverProvider(lang, {
          provideHover: async (model: any, position: any, token: any) => {
            const docUri = model.uri.toString();
            const content = model.getValue();
            let currentCase = this.getActiveCaseName();
            const ws = this.workspaceService.getWorkspaceRootUri(undefined);
            if (ws) {
              currentCase = this.getCaseName(new URI(ws.toString()).path.toString());
            }

            try {
              const res = await fetch(`${this.getBackendUrl()}/api/lsp/hover`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  case: currentCase,
                  docUri,
                  docContent: content,
                  position: {
                    line: position.lineNumber - 1,
                    character: position.column - 1
                  }
                })
              });
              if (token.isCancellationRequested || !res.ok) return null;
              const data = await res.json();
              if (data.hover && data.hover.contents) {
                const value = typeof data.hover.contents === 'string'
                  ? data.hover.contents
                  : (data.hover.contents.value || '');
                  
                if (!value.trim()) return null;

                let range = undefined;
                if (data.hover.range) {
                  range = new monaco.Range(
                    data.hover.range.start.line + 1,
                    data.hover.range.start.character + 1,
                    data.hover.range.end.line + 1,
                    data.hover.range.end.character + 1
                  );
                }

                return {
                  range,
                  contents: [{ value }]
                };
              }
            } catch (_) {}
            return null;
          }
        });
      }
      this.logger.info('[HAYAGRIVA] Law hover preview provider registered for markdown and plaintext.');
    };

    checkMonacoHover();
  }

  private wordIllusionActive = false;
  private wordIllusionStyleElement: HTMLStyleElement | undefined;

  registerDiagnosticsLinter(): void {
    const updateDiagnostics = async (model: any) => {
      const docUri = model.uri.toString();
      if (!docUri.endsWith('.md')) return;

      const content = model.getValue();
      let currentCase = this.getActiveCaseName();
      const ws = this.workspaceService.getWorkspaceRootUri(undefined);
      if (ws) {
        currentCase = this.getCaseName(new URI(ws.toString()).path.toString());
      }

      try {
        const res = await fetch(`${this.getBackendUrl()}/api/lsp/diagnostics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            case: currentCase,
            docUri,
            docContent: content
          })
        });
        if (!res.ok) return;
        const data = await res.json();
        const diagnostics = data.diagnostics || [];

        const markers = diagnostics.map((d: any) => ({
          severity: d.severity === 1 ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          message: d.message,
          startLineNumber: d.range.start.line + 1,
          startColumn: d.range.start.character + 1,
          endLineNumber: d.range.end.line + 1,
          endColumn: d.range.end.character + 1
        }));

        // Fetch ingestion status to add inline warnings
        try {
          const docRes = await fetch(`${this.getBackendUrl()}/api/hayagriva/documents?case=${currentCase}`);
          if (docRes.ok) {
            const docData = await docRes.json();
            const localFsPath = new URI(docUri).path.toString();
            const fileName = getBasename(localFsPath);
            const targetBasename = fileName.replace(/\.[a-zA-Z0-9]+$/, '');
            
            const matchingDoc = (docData.documents || []).find((d: any) => {
              return d.title === targetBasename || d.filename === fileName;
            });
            
            if (matchingDoc) {
              const status = matchingDoc.status;
              if (status === 'processing' || status === 'generating_companion') {
                markers.unshift({
                  severity: monaco.MarkerSeverity.Info,
                  message: '⏳ Document is still processing ingestion. Section lookup and autocompletes may be incomplete.',
                  startLineNumber: 1,
                  startColumn: 1,
                  endLineNumber: 1,
                  endColumn: 100
                });
              } else if (status === 'failed_convert' || status === 'failed_enrich' || status === 'failed') {
                markers.unshift({
                  severity: monaco.MarkerSeverity.Warning,
                  message: `❌ Ingestion failed: ${status}. Right-click the file in explorer to retry ingestion.`,
                  startLineNumber: 1,
                  startColumn: 1,
                  endLineNumber: 1,
                  endColumn: 100
                });
              }
            }
          }
        } catch (_) {}

        monaco.editor.setModelMarkers(model, 'hayagriva-lsp', markers);
      } catch (e) {
        this.logger.error('[LSP Frontend] Failed to fetch diagnostics: ' + e);
      }
    };

    let debounceTimer: any = null;

    this.editorManager.onCurrentEditorChanged(editor => {
      if (editor) {
        const control = (editor as any).getControl ? (editor as any).getControl() : null;
        if (control && typeof control.getModel === 'function') {
          const model = control.getModel();
          if (model) {
            updateDiagnostics(model);
            model.onDidChangeContent(() => {
              clearTimeout(debounceTimer);
              debounceTimer = setTimeout(() => updateDiagnostics(model), 1000);
            });
          }
        }
      }
    });
  }

  toggleWordIllusion(): void {
    this.wordIllusionActive = !this.wordIllusionActive;
    if (this.wordIllusionActive) {
      this.enableWordIllusion();
    } else {
      this.disableWordIllusion();
    }
  }

  enableWordIllusion(): void {
    if (this.wordIllusionStyleElement) return;

    const style = document.createElement('style');
    style.id = 'hayagriva-word-illusion-style';
    style.innerHTML = `
      #theia-statusBar {
        display: none !important;
      }
      .editor-widget {
        background-color: #f3f2f1 !important;
        display: flex !important;
        justify-content: center !important;
      }
      .editor-widget > .monaco-editor {
        max-width: 850px !important;
        width: 100% !important;
        box-shadow: 0 4px 15px rgba(0,0,0,0.12) !important;
        border-left: 1px solid #dcdcdc !important;
        border-right: 1px solid #dcdcdc !important;
      }
      .monaco-editor,
      .monaco-editor .margin,
      .monaco-editor .overflow-guard,
      .monaco-editor-background {
        background-color: #faf9f6 !important;
      }
      .monaco-editor .view-line {
        font-family: Garamond, Georgia, 'Times New Roman', serif !important;
        font-size: 16.5px !important;
        line-height: 1.6 !important;
        color: #1a1a1a !important;
      }
      .monaco-editor .minimap {
        display: none !important;
      }
      /* Direct overrides for editor token classes in dark or light theme */
      .monaco-editor .mtk1,
      .monaco-editor .mtk2,
      .monaco-editor .mtk3,
      .monaco-editor .mtk4,
      .monaco-editor .mtk5,
      .monaco-editor .mtk6,
      .monaco-editor .mtk7,
      .monaco-editor .mtk8,
      .monaco-editor .mtk9,
      .monaco-editor .mtk10,
      .monaco-editor .mtk11,
      .monaco-editor .mtk12,
      .monaco-editor .mtk13,
      .monaco-editor .mtk14,
      .monaco-editor .mtk15,
      .monaco-editor .mtk16,
      .monaco-editor .mtk17,
      .monaco-editor .mtk18,
      .monaco-editor .mtk19,
      .monaco-editor .mtk20,
      .monaco-editor .mtki,
      .monaco-editor .mtkb {
        color: #1a1a1a !important;
      }
      /* Override cursor and selection for readability */
      .monaco-editor .cursor {
        color: #1a1a1a !important;
        background-color: #1a1a1a !important;
        border-left: 2px solid #1a1a1a !important;
      }
      .monaco-editor .selected-text {
        background-color: rgba(0, 120, 215, 0.15) !important;
      }
      /* Style editor line numbers for readability */
      .monaco-editor .line-numbers {
        color: #8c8c8c !important;
      }
    `;
    document.head.appendChild(style);
    this.wordIllusionStyleElement = style;
    this.wordIllusionActive = true;
    
    this.triggerEditorLayout();
    this.logger.info('[HAYAGRIVA] Word Illusion Layout enabled.');
  }

  disableWordIllusion(): void {
    if (this.wordIllusionStyleElement) {
      document.head.removeChild(this.wordIllusionStyleElement);
      this.wordIllusionStyleElement = undefined;
    }
    this.wordIllusionActive = false;
    this.triggerEditorLayout();
    this.logger.info('[HAYAGRIVA] Word Illusion Layout disabled.');
  }

  toggleTheme(): void {
    const current = this.themeService.getCurrentTheme();
    const isDark = current && current.id && current.id.toLowerCase().includes('dark');
    const newTheme = isDark ? 'light' : 'dark';
    this.themeService.setCurrentTheme(newTheme, true);
    this.logger.info(`[HAYAGRIVA] Switched IDE Theme to ${newTheme}.`);
  }

  private triggerEditorLayout(): void {
    setTimeout(() => {
      const active = this.editorManager.activeEditor;
      if (active && (active as any).editor && typeof (active as any).editor.layout === 'function') {
        (active as any).editor.layout();
      }
    }, 50);
  }

  private closeOtherDocumentViewers(newWidgetId: string): void {
    for (const w of this.shell.getWidgets('main')) {
      if (
        (w.id.startsWith('hayagriva-office-preview-') || w.id.startsWith('hayagriva-wiki-viewer-')) &&
        w.id !== newWidgetId
      ) {
        w.close();
      }
    }
  }

  async openWikiHtmlViewer(filePath: string, caseName: string): Promise<Widget> {
    const id = `hayagriva-wiki-viewer-${encodeURIComponent(filePath)}`;
    let widget = this.shell.getWidgets('main').find(w => w.id === id);
    
    if (widget) {
      this.shell.activateWidget(widget.id);
      return widget;
    }

    this.closeOtherDocumentViewers(id);

    widget = new Widget();
    widget.id = id;
    const base = getBasename(filePath);
    widget.title.label = base;
    widget.title.caption = `Read-only Wiki Viewer for ${base}`;
    widget.title.iconClass = 'fa fa-book';
    widget.title.closable = true;

    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.src = `${this.getBackendUrl()}/api/hayagriva/read-file?path=${encodeURIComponent(filePath)}`;
    widget.node.appendChild(iframe);

    this.shell.addWidget(widget, { area: 'main' });
    this.shell.activateWidget(widget.id);
    return widget;
  }

  async openOfficePreview(filePath: string, caseName: string): Promise<Widget> {
    const id = `hayagriva-office-preview-${encodeURIComponent(filePath)}`;
    let widget = this.shell.getWidgets('main').find(w => w.id === id);
    
    if (widget) {
      this.shell.activateWidget(widget.id);
      return widget;
    }

    this.closeOtherDocumentViewers(id);

    widget = new Widget();
    widget.id = id;
    const base = getBasename(filePath);
    widget.title.label = base;
    widget.title.caption = `Office preview for ${base}`;
    widget.title.iconClass = 'fa fa-file-text-o';
    widget.title.closable = true;

    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.src = `${this.getBackendUrl()}/api/hayagriva/office-preview?path=${encodeURIComponent(filePath)}#view=FitH`;
    widget.node.appendChild(iframe);

    this.shell.addWidget(widget, { area: 'main' });
    this.shell.activateWidget(widget.id);
    return widget;
  }

  async openKvEditor(caseName: string): Promise<Widget> {
    const id = 'hayagriva-kv-editor';
    let widget = this.shell.getWidgets('main').find(w => w.id === id);
    
    if (widget) {
      this.shell.activateWidget(widget.id);
      return widget;
    }

    widget = new Widget();
    widget.id = id;
    widget.title.label = `Case KV Dictionary`;
    widget.title.caption = 'View and edit case variables';
    widget.title.iconClass = 'fa fa-database';
    widget.title.closable = true;

    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.srcdoc = kvEditorHtml(caseName, this.getApiPort());
    widget.node.appendChild(iframe);

    this.shell.addWidget(widget, { area: 'main' });
    this.shell.activateWidget(widget.id);
    return widget;
  }

  async openFormEditor(caseName: string, formId: string): Promise<Widget> {
    const id = `hayagriva-form-editor-${formId}`;
    let widget = this.shell.getWidgets('main').find(w => w.id === id);
    
    if (widget) {
      this.shell.activateWidget(widget.id);
      return widget;
    }

    widget = new Widget();
    widget.id = id;
    widget.title.label = `${formId.toUpperCase()} Review`;
    widget.title.caption = 'Review and validate extracted fields';
    widget.title.iconClass = 'fa fa-check-square-o';
    widget.title.closable = true;

    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.srcdoc = formEditorHtml(caseName, formId, this.getApiPort());
    widget.node.appendChild(iframe);

    this.shell.addWidget(widget, { area: 'main' });
    this.shell.activateWidget(widget.id);
    return widget;
  }

  async openDraftingPanel(caseName: string): Promise<Widget> {
    const id = 'hayagriva-drafting-panel';
    let widget = this.shell.getWidgets('right').find(w => w.id === id);
    
    if (widget) {
      this.shell.activateWidget(widget.id);
      return widget;
    }

    widget = new Widget();
    widget.id = id;
    widget.title.label = 'Drafting Panel';
    widget.title.caption = 'Draft corporate compliance documents';
    widget.title.iconClass = 'fa fa-magic';
    widget.title.closable = true;

    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.srcdoc = draftingPanelHtml(caseName, this.getApiPort());
    widget.node.appendChild(iframe);

    this.shell.addWidget(widget, { area: 'right' });
    this.shell.activateWidget(widget.id);
    return widget;
  }

  async openSettingsPanel(): Promise<Widget> {
    const id = 'hayagriva-settings-panel';
    let widget = this.shell.getWidgets('main').find(w => w.id === id);
    
    if (widget) {
      this.shell.activateWidget(widget.id);
      return widget;
    }

    let caseName = this.getActiveCaseName();
    const ws = this.workspaceService.getWorkspaceRootUri(undefined);
    if (ws) {
      caseName = this.getCaseName(new URI(ws.toString()).path.toString());
    }

    widget = new Widget();
    widget.id = id;
    widget.title.label = 'Hayagriva Settings';
    widget.title.caption = 'Configure dynamic routing and performance profiles';
    widget.title.iconClass = 'fa fa-cog';
    widget.title.closable = true;

    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    const currentTheme = this.themeService.getCurrentTheme();
    const isLight = currentTheme && currentTheme.id && currentTheme.id.toLowerCase().includes('light');
    const theme = isLight ? 'light' : 'dark';
    iframe.src = `http://127.0.0.1:${this.getApiPort()}/api/hayagriva/settings/panel?case=${encodeURIComponent(caseName)}&theme=${theme}`;
    widget.node.appendChild(iframe);

    this.shell.addWidget(widget, { area: 'main' });
    this.shell.activateWidget(widget.id);
    return widget;
  }

  async openChronologyPanel(): Promise<Widget> {
    const id = 'hayagriva-chronology-panel';
    let widget = this.shell.getWidgets('main').find(w => w.id === id);
    
    if (widget) {
      this.shell.activateWidget(widget.id);
      return widget;
    }

    let caseName = this.getActiveCaseName();
    const ws = this.workspaceService.getWorkspaceRootUri(undefined);
    if (ws) {
      caseName = this.getCaseName(new URI(ws.toString()).path.toString());
    }

    widget = new Widget();
    widget.id = id;
    widget.title.label = 'Case Chronology';
    widget.title.caption = 'Date & event chronology timeline';
    widget.title.iconClass = 'fa fa-calendar';
    widget.title.closable = true;

    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.src = `http://127.0.0.1:${this.getApiPort()}/api/hayagriva/chronology-panel?case=${encodeURIComponent(caseName)}`;
    widget.node.appendChild(iframe);

    this.shell.addWidget(widget, { area: 'main' });
    this.shell.activateWidget(widget.id);
    return widget;
  }

  async openTopicOverlapPanel(): Promise<Widget> {
    const id = 'hayagriva-topic-overlap-panel';
    let widget = this.shell.getWidgets('main').find(w => w.id === id);
    
    if (widget) {
      this.shell.activateWidget(widget.id);
      return widget;
    }

    let caseName = this.getActiveCaseName();
    const ws = this.workspaceService.getWorkspaceRootUri(undefined);
    if (ws) {
      caseName = this.getCaseName(new URI(ws.toString()).path.toString());
    }

    widget = new Widget();
    widget.id = id;
    widget.title.label = 'Topic Overlap Map';
    widget.title.caption = 'Map concepts across multiple case files';
    widget.title.iconClass = 'fa fa-link';
    widget.title.closable = true;

    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.src = `http://127.0.0.1:${this.getApiPort()}/api/hayagriva/topic-overlap-panel?case=${encodeURIComponent(caseName)}`;
    widget.node.appendChild(iframe);

    this.shell.addWidget(widget, { area: 'main' });
    this.shell.activateWidget(widget.id);
    return widget;
  }

  startBackendMonitor(): void {
    // Initial check with 3-second grace period
    setTimeout(() => {
      this.checkBackendHealth();
    }, 3000);
    
    // Poll every 10 seconds
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

        // Retrieve settings to check mode status
        let activeMode = 'lite';
        let cloudProvider = '';
        try {
          const settingsRes = await fetch(`http://127.0.0.1:${apiPort}/api/hayagriva/settings/get?case=${encodeURIComponent(caseName)}`);
          if (settingsRes.ok) {
            const settings = await settingsRes.json();
            activeMode = settings.activeMode || 'lite';
            cloudProvider = settings.cloudProvider || '';
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
        return;
      }
      throw new Error('Non-ok response');
    } catch (_) {
      this.isBackendOnline = false;
      this.statusBar.setElement('hayagriva-status-item', {
        text: '$(fa-warning) Hayagriva Server: Offline',
        alignment: StatusBarAlignment.RIGHT,
        color: '#ff4d4d',
        tooltip: 'The Hayagriva Node.js backend is offline. Run ./start.command to start it.',
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
          this.messageService.error('Hayagriva backend server is offline. Please launch it using ./start.command');
        }, 3000);
      }
    }
  }
}

export function convertToSnippet(text: string): { snippet: string, hasSnippets: boolean } {
  let snippet = text;
  let index = 1;

  // Replace bracketed dates: [date], [insert date], [YYYY-MM-DD], [Date]
  snippet = snippet.replace(/\[\s*(date|yyyy-mm-dd|insert date)\s*\]/gi, () => `\${${index++}:date}`);

  // Replace bracketed names: [name], [insert name], [Name]
  snippet = snippet.replace(/\[\s*(name|insert name|party name)\s*\]/gi, () => `\${${index++}:name}`);

  // Replace bracketed amounts: [amount], [insert amount], [value]
  snippet = snippet.replace(/\[\s*(amount|value|sum|insert amount)\s*\]/gi, () => `\${${index++}:amount}`);

  // Replace bracketed company: [company], [company name]
  snippet = snippet.replace(/\[\s*(company|company name|corporate debtor)\s*\]/gi, () => `\${${index++}:company_name}`);

  // Replace bracketed generic place holders: [xxx], [insert]
  snippet = snippet.replace(/\[\s*(insert|xxx|fill|placeholder)\s*\]/gi, () => `\${${index++}:fill_in}`);

  // Replace generic underscores: _____
  snippet = snippet.replace(/_{3,}/g, () => `\${${index++}:_____}`);

  return { snippet, hasSnippets: index > 1 };
}
