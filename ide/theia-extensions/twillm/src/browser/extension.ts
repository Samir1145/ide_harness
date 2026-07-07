import { inject, injectable } from '@theia/core/shared/inversify';
import {
  FrontendApplicationContribution,
  FrontendApplication,
  ApplicationShell,
  OpenHandler
} from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { ILogger } from '@theia/core/lib/common';
import { Widget } from '@lumino/widgets';
import URI from '@theia/core/lib/common/uri';
import { TwillmEditorDecorator } from './highlight-decorator';
import {
  sidebarHtml,
  wikiExplorerHtml,
  chatHtml
} from './templates';

function getBasename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1];
}

@injectable()
export class TwillmFrontendContribution implements FrontendApplicationContribution, OpenHandler {

  readonly id = 'twillm-wiki-open-handler';
  readonly label = 'TWILLM Wiki Viewer';

  private activeWikiPanels: Map<string, Widget> = new Map();
  private sidebarWidget: Widget | undefined;
  private wikiWidget: Widget | undefined;

  constructor(
    @inject(WorkspaceService) private readonly workspaceService: WorkspaceService,
    @inject(EditorManager) private readonly editorManager: EditorManager,
    @inject(ApplicationShell) private readonly shell: ApplicationShell,
    @inject(TwillmEditorDecorator) private readonly decorator: TwillmEditorDecorator,
    @inject(ILogger) private readonly logger: ILogger
  ) {}

  canHandle(uri: URI): number {
    return 0;
  }

  async open(uri: URI): Promise<Widget> {
    const filePath = uri.path.toString();
    const base = getBasename(filePath);
    const docName = base.replace(/\.wiki\.html$/i, '');
    const caseName = this.getCaseName(filePath);
    await this.openWiki(docName, caseName);
    return new Widget();
  }

  onStart(app: FrontendApplication): void {
    this.initializeSidebarWidget();
  }

  onDidInitializeLayout(app: FrontendApplication): void {
    const leftWidgets = this.shell.getWidgets('left');
    for (const widget of leftWidgets) {
      const id = widget.id.toLowerCase();
      // Keep only explorer-view-container (File Explorer), twillm-upload-sidebar, and twillm-wiki-explorer visible.
      // Close all other widgets in the left sidebar.
      if (id !== 'explorer-view-container' && id !== 'twillm-upload-sidebar' && id !== 'twillm-wiki-explorer') {
        widget.close();
      }
    }
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
      this.logger.error(`[TWILLM] Error resolving workspace root relative path: ${e.message}`);
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
      const res = await fetch('http://127.0.0.1:3210/api/twillm/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case: caseName, file: filePath })
      });
      const result = await res.json();
      if (result.success) {
        this.logger.info(`[TWILLM] Ingested ${getBasename(filePath)}`);
      } else {
        throw new Error(result.error || 'Ingest failed');
      }
    } catch (e: any) {
      this.logger.error(`[TWILLM] Ingest failed: ${e.message}`);
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
      this.logger.error(`[TWILLM] Failed to open native markdown wiki: ${e.message}`);
    }
    return new Widget();
  }

  async openUploadSplit(): Promise<Widget> {
    if (this.sidebarWidget) {
      this.shell.activateWidget(this.sidebarWidget.id);
      return this.sidebarWidget;
    }
    return new Widget();
  }

  async openRagChat(): Promise<Widget> {
    let caseName = 'Case_Alpha';
    const activeEditor = this.editorManager.activeEditor;
    if (activeEditor) {
      const uri = activeEditor.getResourceUri();
      if (uri) {
        caseName = this.getCaseName(uri.path.toString());
      }
    }

    const panelKey = `${caseName}::rag-chat`;
    const existing = this.activeWikiPanels.get(panelKey);
    if (existing) {
      this.shell.activateWidget(existing.id);
      return existing;
    }

    const widget = new Widget();
    widget.id = `twillm-rag-chat-${caseName}`;
    widget.title.label = `RAG Chat (${caseName})`;
    widget.title.iconClass = 'fa fa-magic';
    widget.title.closable = true;
    
    widget.node.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.srcdoc = chatHtml(caseName);
    widget.node.appendChild(iframe);
    
    this.activeWikiPanels.set(panelKey, widget);
    widget.disposed.connect(() => { this.activeWikiPanels.delete(panelKey); });
    
    this.shell.addWidget(widget, { area: 'right' });
    this.shell.activateWidget(widget.id);
    return widget;
  }

  prefillChat(text: string): void {
    for (const [key, widget] of this.activeWikiPanels.entries()) {
      if (key.endsWith('::rag-chat')) {
        const iframe = widget.node.querySelector('iframe');
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'prefill-query', query: text }, '*');
        }
      }
    }
  }

  initializeSidebarWidget(): void {
    if (this.sidebarWidget) return;

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

    const widget = new Widget();
    widget.id = 'twillm-upload-sidebar';
    widget.title.label = 'Upload';
    widget.title.caption = 'Upload and Split Document';
    widget.title.iconClass = 'fa fa-upload';
    widget.title.closable = false;

    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.srcdoc = sidebarHtml(initialCase);
    widget.node.appendChild(iframe);

    this.sidebarWidget = widget;
    this.shell.addWidget(widget, { area: 'left', rank: 500 });

    const wikiExplorer = new Widget();
    wikiExplorer.id = 'twillm-wiki-explorer';
    wikiExplorer.title.label = 'Case Wiki';
    wikiExplorer.title.caption = 'Curated Case Wiki Cards';
    wikiExplorer.title.iconClass = 'fa fa-book';
    wikiExplorer.title.closable = false;

    const wikiIframe = document.createElement('iframe');
    wikiIframe.style.width = '100%';
    wikiIframe.style.height = '100%';
    wikiIframe.style.border = 'none';
    wikiIframe.srcdoc = wikiExplorerHtml(initialCase);
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
        } else if (event.data.type === 'open-citation') {
          const { filePath, anchor } = event.data;
          const workspaceRoot = this.workspaceService.getWorkspaceRootUri(undefined);
          if (workspaceRoot) {
            const relativePath = filePath.replace(/\.(pdf|docx|xlsx|doc|xls)$/i, '.md');
            const uri = new URI(workspaceRoot.toString()).resolve(relativePath);
            
            try {
              const res = await fetch(`http://127.0.0.1:3210/api/twillm/read-file?path=${encodeURIComponent(uri.path.toString())}`);
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
  }

  updateSidebarCase(caseName: string): void {
    if (this.sidebarWidget) {
      const iframe = this.sidebarWidget.node.querySelector('iframe');
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
  }

}
