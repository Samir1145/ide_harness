import * as monaco from '@theia/monaco-editor-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
  FrontendApplicationContribution,
  FrontendApplication,
  ApplicationShell,
  OpenHandler,
  WidgetManager
} from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { ILogger } from '@theia/core/lib/common';
import { Widget } from '@lumino/widgets';
import URI from '@theia/core/lib/common/uri';
import { TwillmEditorDecorator } from './highlight-decorator';
import {
  sidebarHtml,
  wikiExplorerHtml
} from './templates';

function getBasename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1];
}

@injectable()
export class TwillmFrontendContribution implements FrontendApplicationContribution, OpenHandler {

  readonly id = 'twillm-wiki-open-handler';
  readonly label = 'TWILLM Wiki Viewer';

  private sidebarWidget: Widget | undefined;
  private wikiWidget: Widget | undefined;

  constructor(
    @inject(WorkspaceService) private readonly workspaceService: WorkspaceService,
    @inject(EditorManager) private readonly editorManager: EditorManager,
    @inject(ApplicationShell) private readonly shell: ApplicationShell,
    @inject(TwillmEditorDecorator) private readonly decorator: TwillmEditorDecorator,
    @inject(ILogger) private readonly logger: ILogger,
    @inject(WidgetManager) private readonly widgetManager: WidgetManager
  ) {}

  canHandle(uri: URI): number {
    if (uri.scheme === 'twillm-citation') {
      return 100;
    }
    return 0;
  }

  async open(uri: URI): Promise<Widget> {
    if (uri.scheme === 'twillm-citation') {
      const docName = decodeURIComponent(uri.authority);
      const query = uri.query;
      const pageMatch = query.match(/page=(\d+)/);
      const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : 1;
      
      await this.openCitationSideBySide(docName, pageNum);
      return new Widget();
    }
    
    const filePath = uri.path.toString();
    const base = getBasename(filePath);
    const docName = base.replace(/\.wiki\.html$/i, '');
    const caseName = this.getCaseName(filePath);
    await this.openWiki(docName, caseName);
    return new Widget();
  }

  onStart(app: FrontendApplication): void {
    this.initializeSidebarWidget();
    this.registerMonacoLinkProvider();
    this.registerLawCompletion();
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
      this.logger.error(`[TWILLM] Failed to prefill chat input: ${e.message}`);
    });
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

  async openCitationSideBySide(docName: string, pageNum: number): Promise<void> {
    const workspaceRoot = this.workspaceService.getWorkspaceRootUri(undefined);
    if (!workspaceRoot) return;
    
    const conceptsUri = new URI(workspaceRoot.toString()).resolve(`concepts/${docName}`);
    
    try {
      const treeUri = conceptsUri.resolve('pageindex_tree.json');
      const res = await fetch(`http://127.0.0.1:3210/api/twillm/read-file?path=${encodeURIComponent(treeUri.path.toString())}`);
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
      this.logger.error(`[TWILLM] Failed to open side-by-side split citation: ${e.message}`);
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
                  url: `twillm-citation://${encodeURIComponent(docName)}?page=${pageNum}`
                });
              }
            }
            return { links };
          }
        });
        this.logger.info('[TWILLM] Successfully registered Monaco Link Provider for Citations.');
      } else {
        setTimeout(checkMonaco, 200);
      }
    };
    checkMonaco();
  }

  // ─── Law Completion (@@-triggered ghost text) ──────────────────────────────

  registerLawCompletion(): void {
    // Small in-flight request cache to avoid hammering the API on every keystroke
    const cache = new Map<string, any[]>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchCompletions = async (triggerText: string): Promise<any[]> => {
      if (cache.has(triggerText)) return cache.get(triggerText)!;
      try {
        const res = await fetch(
          `http://127.0.0.1:3210/api/laws/query?q=${encodeURIComponent(triggerText)}&n=3`
        );
        if (!res.ok) return [];
        const json = await res.json();
        const results = json.results || [];
        cache.set(triggerText, results);
        // Evict cache when it grows large
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
      if (!monaco || !monaco.languages || !monaco.languages.registerInlineCompletionsProvider) {
        setTimeout(checkMonaco, 300);
        return;
      }

      // Register for all text-based languages commonly used in this workspace
      const LANGS = ['markdown', 'plaintext'];

      for (const lang of LANGS) {
        monaco.languages.registerInlineCompletionsProvider(lang, {
          // Called by Monaco on every cursor position change / keystroke
          provideInlineCompletions: async (model: any, position: any, _context: any, token: any) => {
            // Get text from start of line up to cursor
            const lineText: string = model.getLineContent(position.lineNumber);
            const textUpToCursor = lineText.substring(0, position.column - 1);

            // Detect @@ trigger: must be the last thing the user typed
            // Matches @@<anything> — capture the search term after @@
            const triggerMatch = textUpToCursor.match(/@@([\w\s./,-]*)$/);
            if (!triggerMatch) return { items: [] };

            const rawTrigger = triggerMatch[1].trim();
            // Wait until user has typed at least 2 chars after @@ to avoid flicker
            if (rawTrigger.length < 2) return { items: [] };

            // Debounce: wait 200ms for user to stop typing before firing
            await new Promise<void>(resolve => {
              if (debounceTimer) clearTimeout(debounceTimer);
              debounceTimer = setTimeout(resolve, 200);
            });
            if (token.isCancellationRequested) return { items: [] };

            const results = await fetchCompletions(rawTrigger);
            if (!results.length || token.isCancellationRequested) return { items: [] };

            // Build inline completion items — one per result
            const items = results.map((r: any) => {
              // Strip YAML frontmatter from the law text before showing as ghost text
              const cleanText = (r.text as string)
                .replace(/^---[\s\S]*?---\r?\n?/, '')  // remove frontmatter
                .trimStart();

              // The ghost text replaces the @@ trigger + search term with the law text
              const triggerStart = textUpToCursor.lastIndexOf('@@');
              const insertRange = new monaco.Range(
                position.lineNumber,
                triggerStart + 1,          // Monaco columns are 1-indexed
                position.lineNumber,
                position.column
              );
              const typedTrigger = textUpToCursor.substring(triggerStart);
              
              return {
                insertText:   typedTrigger + '\n\n' + cleanText,
                range:        insertRange
              };
            });

            return {
              items
            };
          },

          disposeInlineCompletions: (_completions: any, _reason: any) => { /* no-op */ }
        });
      }

      this.logger.info('[TWILLM] Law completion (@@) registered for markdown and plaintext.');
    };

    checkMonaco();
  }

}
