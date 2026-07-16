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
        filePath.endsWith('.wiki.html') || filePath.endsWith('.pdf')) {
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
      
      await this.openCitationSideBySide(docName, pageNum);
      return new Widget();
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
    if (lowerPath.endsWith('.wiki.html')) {
      return await this.openWikiHtmlViewer(filePath, caseName);
    }
    if (lowerPath.endsWith('.docx') || lowerPath.endsWith('.doc') ||
        lowerPath.endsWith('.xlsx') || lowerPath.endsWith('.xls') ||
        lowerPath.endsWith('.pdf')) {
      
      const rel = this.getRelativePath(uri);
      const status = this.treeDecorator.statusCache[rel];
      const hasCompanion = !!status && (status.dot1 === 'companion_ready' || status.dot1 === 'reviewed');
      
      const previewWidget = await this.openOfficePreview(filePath, caseName);
      
      if (hasCompanion) {
        const companionPath = filePath.replace(/\.[a-zA-Z0-9]+$/, '.md');
        const companionUri = uri.withPath(companionPath);
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
    `;
    document.head.appendChild(style);

    // Disabled custom sidebars - users interact via the native file tree status dots
    // this.initializeWikiExplorerWidget();
    // this.initializeConceptsExplorerWidget();
    this.registerMonacoLinkProvider();
    this.registerLawCompletion();
    this.registerLawHoverProvider();
    this.registerDiagnosticsLinter();
    
    // Start polling the backend proxy server's connection health
    this.startBackendMonitor();
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
  }

  onDidInitializeLayout(app: FrontendApplication): void {
    const leftWidgets = this.shell.getWidgets('left');
    for (const widget of leftWidgets) {
      const id = widget.id.toLowerCase();
      // Keep only standard explorer-view-container visible (Wiki and Concepts are disabled)
      if (id !== 'explorer-view-container') {
        widget.close();
      }
    }
  }

  private getRelativePath(uri: URI): string {
    const filePath = uri.path.toString();
    try {
      const wsRoot = this.workspaceService.getWorkspaceRootUri(undefined);
      if (wsRoot) {
        const rootPath = decodeURIComponent(wsRoot.path.toString());
        if (filePath.startsWith(rootPath)) {
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
        const rootPath = workspaceRoot.path.toString();
        if (filePath.startsWith(rootPath)) {
          const relative = filePath.substring(rootPath.length).replace(/^[\\/]/, '');
          const parts = relative.split(/[\\/]/).filter(Boolean);
          if (parts.length > 0) {
            // Check if the first segment is a file (e.g. contains dot)
            if (parts[0].includes('.')) {
              return getBasename(rootPath);
            }
            return parts[0];
          }
          return getBasename(rootPath);
        }
      }
    } catch (e: any) {
      this.logger.error(`[HAYAGRIVA] Error resolving workspace root relative path: ${e.message}`);
    }

    const idx = filePath.indexOf('/Documents/');
    if (idx !== -1) {
      const sub = filePath.substring(idx + '/Documents/'.length);
      const parts = sub.split(/[\\/]/).filter(Boolean);
      if (parts.length > 0) {
        return parts[0];
      }
    }

    // Default fallback to workspace folder name if workspace root is available
    try {
      const workspaceRoot = this.workspaceService.getWorkspaceRootUri(undefined);
      if (workspaceRoot) {
        return getBasename(workspaceRoot.path.toString());
      }
    } catch (e) {}

    return 'Case_Alpha';
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
      
      let caseName = 'Case_Alpha';
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

    let initialCase = 'Case_Alpha';
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

    let initialCase = 'Case_Alpha';
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
        setTimeout(checkMonaco, 300);
        return;
      }

      const LANGS = ['markdown', 'plaintext'];

      for (const lang of LANGS) {
        monaco.languages.registerCompletionItemProvider(lang, {
          triggerCharacters: ['/'],
          provideCompletionItems: async (model: any, position: any, _context: any, token: any) => {
            const lineText: string = model.getLineContent(position.lineNumber);
            const textUpToCursor = lineText.substring(0, position.column - 1);

            // ── Notion-Style Slash Commands ─────────────────────────────────
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

              let currentCase = 'Case_Alpha';
              const ws = this.workspaceService.getWorkspaceRootUri(undefined);
              if (ws) {
                currentCase = this.getCaseName(new URI(ws.toString()).path.toString());
              }

              // A. Level 1: Just typed "/", or typing the command prefix
              if (!rawSlash.includes(' ') && !rawSlash.startsWith('law') && !rawSlash.startsWith('concept') && !rawSlash.startsWith('qa') && !rawSlash.startsWith('clause')) {
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

              // B. Level 2: Command matches "/law <query>"
              if (rawSlashLower.startsWith('law')) {
                const query = rawSlash.substring(3).trim();
                if (query.length < 3) return { suggestions: [] };
                
                const results = await fetchCompletions(query);
                if (token.isCancellationRequested) return { suggestions: [] };
                
                const suggestions = results.map((r: any) => {
                  const cleanText = (r.text as string).replace(/^---[\s\S]*?---\r?\n?/, '').trimStart();
                  const { snippet, hasSnippets } = convertToSnippet(cleanText);
                  return {
                    label: `/law → ${r.title || `Section ${r.section}`}`,
                    filterText: `/law ${query}`,
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
            }

            return { suggestions: [] };
          }
        });
      }

      this.logger.info('[HAYAGRIVA] Command Dropdown (/) registered for markdown and plaintext.');
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
            let currentCase = 'Case_Alpha';
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
      let currentCase = 'Case_Alpha';
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
    if (current.id === 'dark') {
      this.themeService.setCurrentTheme('light', true);
      this.logger.info('[HAYAGRIVA] Switched IDE Theme to Light.');
    } else {
      this.themeService.setCurrentTheme('dark', true);
      this.logger.info('[HAYAGRIVA] Switched IDE Theme to Dark.');
    }
  }

  private triggerEditorLayout(): void {
    setTimeout(() => {
      const active = this.editorManager.activeEditor;
      if (active && (active as any).editor && typeof (active as any).editor.layout === 'function') {
        (active as any).editor.layout();
      }
    }, 50);
  }

  async openWikiHtmlViewer(filePath: string, caseName: string): Promise<Widget> {
    const id = `hayagriva-wiki-viewer-${encodeURIComponent(filePath)}`;
    let widget = this.shell.getWidgets('main').find(w => w.id === id);
    
    if (widget) {
      this.shell.activateWidget(widget.id);
      return widget;
    }

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

    let caseName = 'Case_Alpha';
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
    iframe.src = `http://127.0.0.1:${this.getApiPort()}/api/hayagriva/settings/panel?case=${encodeURIComponent(caseName)}`;
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

  async checkBackendHealth(): Promise<void> {
    try {
      const apiPort = this.getApiPort();
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
