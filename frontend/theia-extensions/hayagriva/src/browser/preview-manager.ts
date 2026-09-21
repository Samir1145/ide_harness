import { injectable, inject } from '@theia/core/shared/inversify';
import { ApplicationShell, Widget } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { PreferenceService } from '@theia/core/lib/common';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { ILogger } from '@theia/core/lib/common/logger';
import URI from '@theia/core/lib/common/uri';
import { HayagrivaEditorDecorator } from './highlight-decorator';

const {
  kvEditorHtml,
  formEditorHtml,
  draftingPanelHtml,
  citationPreviewPanelHtml
} = require('./templates');

function getBasename(pathStr: string): string {
  const parts = pathStr.split(/[\\/]/);
  return parts[parts.length - 1] || pathStr;
}

@injectable()
export class HayagrivaPreviewManager {
  constructor(
    @inject(ApplicationShell) protected readonly shell: ApplicationShell,
    @inject(EditorManager) protected readonly editorManager: EditorManager,
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService,
    @inject(ThemeService) protected readonly themeService: ThemeService,
    @inject(HayagrivaEditorDecorator) protected readonly decorator: HayagrivaEditorDecorator,
    @inject(ILogger) protected readonly logger: ILogger
  ) {}

  protected getApiPort(): number {
    return this.preferenceService.get<number>('hayagriva.apiPort', 3210);
  }

  protected getBackendUrl(): string {
    return `http://127.0.0.1:${this.getApiPort()}`;
  }

  closeOtherDocumentViewers(activeId?: string): void {
    const mainWidgets = this.shell.getWidgets('main');
    for (const w of mainWidgets) {
      if (
        w.id !== activeId &&
        (w.id.startsWith('hayagriva-office-preview-') ||
         w.id.startsWith('hayagriva-wiki-viewer-') ||
         w.id.startsWith('hayagriva-md-live-preview-'))
      ) {
        w.close();
      }
    }
  }

  async openWikiHtmlViewer(filePath: string, _caseName: string): Promise<Widget> {
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

  async openOfficePreview(filePath: string, _caseName: string): Promise<Widget> {
    const id = `hayagriva-office-preview-${encodeURIComponent(filePath)}`;
    let widget = this.shell.getWidgets('main').find(w => w.id === id);

    if (widget) {
      this.shell.activateWidget(widget.id);
      return widget;
    }

    this.closeOtherDocumentViewers(id);

    widget = new Widget();
    widget.id = id;
    widget.node.style.width = '100%';
    widget.node.style.height = '100%';
    widget.node.style.overflow = 'hidden';
    widget.node.style.display = 'flex';
    widget.node.style.flexDirection = 'column';

    const base = getBasename(filePath);
    widget.title.label = base;
    widget.title.caption = `Office preview for ${base}`;
    widget.title.iconClass = 'fa fa-file-text-o';
    widget.title.closable = true;

    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.flex = '1';
    iframe.style.border = 'none';
    iframe.style.display = 'block';
    iframe.src = `${this.getBackendUrl()}/api/hayagriva/office-preview?path=${encodeURIComponent(filePath)}#view=FitH&zoom=page-width&navpanes=0`;
    widget.node.appendChild(iframe);

    this.shell.addWidget(widget, { area: 'main' });
    this.shell.activateWidget(widget.id);
    return widget;
  }

  async openLiveMarkdownPreview(filePath: string, _caseName: string): Promise<Widget> {
    const id = `hayagriva-md-live-preview-${encodeURIComponent(filePath)}`;
    let widget = this.shell.getWidgets('main').find(w => w.id === id);

    if (widget) {
      this.shell.activateWidget(widget.id);
      return widget;
    }

    // Close any previous office/PDF previewers so the user has full focus on authoring
    this.closeOtherDocumentViewers(id);

    widget = new Widget();
    widget.id = id;
    widget.node.style.width = '100%';
    widget.node.style.height = '100%';
    widget.node.style.overflow = 'hidden';
    widget.node.style.display = 'flex';
    widget.node.style.flexDirection = 'column';

    const base = getBasename(filePath);
    widget.title.label = `📖 ${base} (Preview)`;
    widget.title.caption = `Live Rendered Markdown Preview for ${base}`;
    widget.title.iconClass = 'fa fa-columns';
    widget.title.closable = true;

    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.flex = '1';
    iframe.style.border = 'none';
    iframe.style.display = 'block';
    iframe.src = `${this.getBackendUrl()}/api/hayagriva/office-preview?path=${encodeURIComponent(filePath)}#view=FitH&zoom=page-width&navpanes=0`;
    widget.node.appendChild(iframe);

    // Split to the right of the active Monaco editor in area 'main'
    this.shell.addWidget(widget, { area: 'main', mode: 'split-right' });
    this.shell.activateWidget(widget.id);
    return widget;
  }

  refreshPreview(filePath: string): void {
    const liveId = `hayagriva-md-live-preview-${encodeURIComponent(filePath)}`;
    const officeId = `hayagriva-office-preview-${encodeURIComponent(filePath)}`;
    const mainWidgets = this.shell.getWidgets('main');
    for (const w of mainWidgets) {
      if (w.id === liveId || w.id === officeId) {
        const iframe = w.node.querySelector('iframe');
        if (iframe) {
          const currentSrc = iframe.src;
          const cleanUrl = currentSrc.split('#')[0].split('&_t=')[0];
          const hash = currentSrc.includes('#') ? '#' + currentSrc.split('#')[1] : '';
          iframe.src = `${cleanUrl}&_t=${Date.now()}${hash}`;
        }
      }
    }
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
    widget.title.label = 'Case KV Dictionary';
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

  async openSettingsPanel(caseName: string): Promise<Widget> {
    const id = 'hayagriva-settings-panel';
    let widget = this.shell.getWidgets('main').find(w => w.id === id);

    if (widget) {
      this.shell.activateWidget(widget.id);
      return widget;
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

  async openChronologyPanel(caseName: string): Promise<Widget> {
    const id = 'hayagriva-chronology-panel';
    let widget = this.shell.getWidgets('main').find(w => w.id === id);

    if (widget) {
      this.shell.activateWidget(widget.id);
      return widget;
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

  async openTopicOverlapPanel(caseName: string): Promise<Widget> {
    const id = 'hayagriva-topic-overlap-panel';
    let widget = this.shell.getWidgets('main').find(w => w.id === id);

    if (widget) {
      this.shell.activateWidget(widget.id);
      return widget;
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

  async openCitationPreview(docName: string, pageNum: number): Promise<Widget> {
    const id = `hayagriva-citation-preview-${encodeURIComponent(docName)}-${pageNum}`;
    let widget = this.shell.getWidgets('right').find(w => w.id === id);

    if (widget) {
      this.shell.activateWidget(widget.id);
      return widget;
    }

    widget = new Widget();
    widget.id = id;
    widget.title.label = `Citation: ${docName}`;
    widget.title.caption = `Preview Citation at Page ${pageNum}`;
    widget.title.iconClass = 'fa fa-bookmark-o';
    widget.title.closable = true;

    let cardContent = `### Citation Source: ${docName}\n\nLoading preview from page ${pageNum}...`;

    try {
      const workspaceRoot = this.workspaceService.getWorkspaceRootUri(undefined);
      if (workspaceRoot) {
        const conceptsUri = new URI(workspaceRoot.toString()).resolve(`concepts/${docName}`);
        const treeUri = conceptsUri.resolve('pageindex_tree.json');
        const res = await fetch(`${this.getBackendUrl()}/api/hayagriva/read-file?path=${encodeURIComponent(treeUri.path.toString())}`);
        if (res.ok) {
          const treeData = await res.json();
          const flatNodes: any[] = [];
          const flatten = (node: any) => {
            flatNodes.push(node);
            if (node.children) {
              for (const child of node.children) flatten(child);
            }
          };
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
      }
    } catch (e: any) {
      this.logger.error(`[HAYAGRIVA] Failed to load card details for preview: ${e.message}`);
    }

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
      const flatten = (node: any) => {
        flatNodes.push(node);
        if (node.children) {
          for (const child of node.children) flatten(child);
        }
      };
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
    } catch {
      this.logger.warn(`[HAYAGRIVA] No PageIndex concept node found for page ${pageNum} in ${docName}`);
    }
  }

  async openIngestionHelpPanel(caseName: string): Promise<Widget> {
    const id = 'hayagriva-ingestion-help-panel';
    let widget = this.shell.getWidgets('main').find(w => w.id === id);

    if (widget) {
      this.shell.activateWidget(widget.id);
      return widget;
    }

    widget = new Widget();
    widget.id = id;
    widget.title.label = 'Document Ingestion Guide';
    widget.title.caption = 'IMS 3-Dot Status Pipeline & Ingestion Guide';
    widget.title.iconClass = 'fa fa-book';
    widget.title.closable = true;

    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    const currentTheme = this.themeService.getCurrentTheme();
    const isLight = currentTheme && currentTheme.id && currentTheme.id.toLowerCase().includes('light');
    const theme = isLight ? 'light' : 'dark';
    iframe.src = `http://127.0.0.1:${this.getApiPort()}/api/hayagriva/help/ingestion?case=${encodeURIComponent(caseName)}&theme=${theme}`;
    widget.node.appendChild(iframe);

    this.shell.addWidget(widget, { area: 'main' });
    this.shell.activateWidget(widget.id);
    return widget;
  }

  async openMonacoVaultsHelpPanel(caseName: string): Promise<Widget> {
    const id = 'hayagriva-vaults-help-panel';
    let widget = this.shell.getWidgets('main').find(w => w.id === id);

    if (widget) {
      this.shell.activateWidget(widget.id);
      return widget;
    }

    widget = new Widget();
    widget.id = id;
    widget.title.label = 'Monaco Vaults & Shortcuts';
    widget.title.caption = 'Statutory Laws & Precedents Drafting Cheatsheet';
    widget.title.iconClass = 'fa fa-keyboard';
    widget.title.closable = true;

    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    const currentTheme = this.themeService.getCurrentTheme();
    const isLight = currentTheme && currentTheme.id && currentTheme.id.toLowerCase().includes('light');
    const theme = isLight ? 'light' : 'dark';
    iframe.src = `http://127.0.0.1:${this.getApiPort()}/api/hayagriva/help/vaults?case=${encodeURIComponent(caseName)}&theme=${theme}`;
    widget.node.appendChild(iframe);

    this.shell.addWidget(widget, { area: 'main' });
    this.shell.activateWidget(widget.id);
    return widget;
  }
}

