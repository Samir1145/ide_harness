import * as monaco from '@theia/monaco-editor-core';
import { inject, injectable } from '@theia/core/shared/inversify';
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
import { ILogger } from '@theia/core/lib/common';
import { Widget } from '@lumino/widgets';
import URI from '@theia/core/lib/common/uri';
import { TwillmEditorDecorator } from './highlight-decorator';
import {
  sidebarHtml,
  wikiExplorerHtml,
  conceptsExplorerHtml
} from './templates';

function getBasename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1];
}

@injectable()
export class TwillmFrontendContribution implements FrontendApplicationContribution, OpenHandler, TabBarToolbarContribution {

  readonly id = 'twillm-wiki-open-handler';
  readonly label = 'TWILLM Wiki Viewer';

  private uploadModalElement: HTMLElement | undefined;
  private wikiWidget: Widget | undefined;
  private conceptsWidget: Widget | undefined;

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
    this.initializeWikiExplorerWidget();
    this.initializeConceptsExplorerWidget();
    this.registerMonacoLinkProvider();
    this.registerLawCompletion();
  }

  registerToolbarItems(registry: TabBarToolbarRegistry): void {
    registry.registerItem({
      id: 'twillm-upload-toolbar-item',
      command: 'twillm:openUploadSplit',
      tooltip: 'Upload to Twillm',
      icon: 'fa fa-upload',
      priority: 0,
    });
  }

  onDidInitializeLayout(app: FrontendApplication): void {
    const leftWidgets = this.shell.getWidgets('left');
    for (const widget of leftWidgets) {
      const id = widget.id.toLowerCase();
      // Keep only explorer-view-container (File Explorer), twillm-wiki-explorer, and twillm-concepts-explorer visible.
      // Close all other widgets in the left sidebar.
      if (id !== 'explorer-view-container' && id !== 'twillm-wiki-explorer' && id !== 'twillm-concepts-explorer') {
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
    if (this.uploadModalElement) {
      document.body.removeChild(this.uploadModalElement);
      this.uploadModalElement = undefined;
      return new Widget();
    }

    let initialCase = 'Case_Alpha';
    const ws = this.workspaceService.getWorkspaceRootUri(undefined);
    if (ws) {
      initialCase = this.getCaseName(new URI(ws.toString()).path.toString());
    }

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.style.setProperty('-webkit-backdrop-filter', 'blur(4px)');
    overlay.style.zIndex = '99999';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';

    const modalContent = document.createElement('div');
    modalContent.style.width = '350px';
    modalContent.style.height = '480px';
    modalContent.style.backgroundColor = 'var(--theia-layout-color1, #f3f3f3)';
    modalContent.style.borderRadius = '8px';
    modalContent.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
    modalContent.style.overflow = 'hidden';
    modalContent.style.position = 'relative';

    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.srcdoc = sidebarHtml(initialCase);
    
    modalContent.appendChild(iframe);
    overlay.appendChild(modalContent);
    document.body.appendChild(overlay);

    this.uploadModalElement = overlay;

    // Click outside to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && this.uploadModalElement) {
        document.body.removeChild(this.uploadModalElement);
        this.uploadModalElement = undefined;
      }
    });

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
        } else if (event.data.type === 'close-upload-modal') {
          if (this.uploadModalElement) {
            document.body.removeChild(this.uploadModalElement);
            this.uploadModalElement = undefined;
          }
        } else if (event.data.type === 'open-concept-chunk') {
          const { relativePath } = event.data;
          const workspaceRoot = this.workspaceService.getWorkspaceRootUri(undefined);
          if (workspaceRoot) {
            const uri = new URI(workspaceRoot.toString()).resolve(relativePath);
            await this.editorManager.open(uri);
          }
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
    conceptsExplorer.id = 'twillm-concepts-explorer';
    conceptsExplorer.title.label = 'Concepts';
    conceptsExplorer.title.caption = 'Case Document Chunks & Concepts';
    conceptsExplorer.title.iconClass = 'fa fa-lightbulb-o';
    conceptsExplorer.title.closable = false;

    const conceptsIframe = document.createElement('iframe');
    conceptsIframe.style.width = '100%';
    conceptsIframe.style.height = '100%';
    conceptsIframe.style.border = 'none';
    conceptsIframe.srcdoc = conceptsExplorerHtml(initialCase);
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

  // ─── Law Completion (@@-triggered dropdown) ──────────────────────────────

  registerLawCompletion(): void {
    const LAW_DOMAINS = [
      { code: 'arb', label: 'ARB - Arbitration Act' },
      { code: 'cca', label: 'CCA - Commercial Courts Act' },
      { code: 'dpdp', label: 'DPDP - Digital Data Protection Act' },
      { code: 'esi', label: 'ESI - Employee State Insurance Act' },
      { code: 'iarb', label: 'IARB - International Arbitration Act' },
      { code: 'ibc', label: 'IBC - Insolvency & Bankruptcy Code' },
      { code: 'ica', label: 'ICA - Indian Contract Act' },
      { code: 'lima', label: 'LIMA - Limitation Act' },
      { code: 'llp', label: 'LLP - Limited Liability Partnership Act' },
      { code: 'mca', label: 'MCA - Companies Act' },
      { code: 'meda', label: 'MEDA - Mediation Act' },
      { code: 'msme', label: 'MSME - MSME Enterprises Act' },
      { code: 'nia', label: 'NIA - Negotiable Instruments Act' },
      { code: 'pa', label: 'PA - Partnership Act' },
      { code: 'pfa', label: 'PFA - Provident Funds Act' },
      { code: 'pmla', label: 'PMLA - Prevention of Money Laundering Act' },
      { code: 'rdba', label: 'RDBA - Debt Recovery Act' },
      { code: 'rera', label: 'RERA - Real Estate Regulation Act' },
      { code: 'sarfaesi', label: 'SARFAESI - Sarfaesi Act' },
      { code: 'sebi', label: 'SEBI - Securities Exchange Act' },
      { code: 'soga', label: 'SOGA - Sale of Goods Act' },
      { code: 'tpa', label: 'TPA - Transfer of Property Act' }
    ];

    const IBC_SUBDOMAINS = [
      { code: 'ciftp', label: 'CIFTP - Corporate Fast Track Process' },
      { code: 'cilp', label: 'CILP - Corporate Liquidation Process' },
      { code: 'cippp', label: 'CIPPP - Corporate Prepack Process' },
      { code: 'cirp', label: 'CIRP - Corporate Resolution Process' },
      { code: 'civlp', label: 'CIVLP - Corporate Voluntary Liquidation Process' },
      { code: 'ibbi', label: 'IBBI - IBBI Processes' },
      { code: 'iema', label: 'IEMA - Individual Estate Management' },
      { code: 'ifsp', label: 'IFSP - Individual Fresh Start Process' },
      { code: 'iibp', label: 'IIBP - Individual Bankruptcy Process' },
      { code: 'iirp', label: 'IIRP - Individual Resolution Process' },
      { code: 'insp', label: 'INSP - IBBI Inspection Process' },
      { code: 'misc', label: 'MISC - Miscellaneous' },
      { code: 'nclt', label: 'NCLT - NCLT Processes' },
      { code: 'penal', label: 'PENAL - Penal Provisions' },
      { code: 'pgbp', label: 'PGBP - Personal Guarantor Bankruptcy Process' },
      { code: 'pgrp', label: 'PGRP - Personal Guarantor Resolution Process' },
      { code: 'prelim', label: 'PRELIM - Preliminary Definitions' }
    ];

    const MCA_SUBDOMAINS = [
      { code: 'cc_aaa', label: 'Companies (Audit and Auditors) Rules' },
      { code: 'cc_acc', label: 'Companies (Accounts) Rules' },
      { code: 'cc_acisfi', label: 'Companies (Arrests in Connection with Investigation by Serious Fraud Investigation Office) Rules' },
      { code: 'cc_actstd', label: 'The Companies - Accounting Standards' },
      { code: 'cc_aod', label: 'Companies (Acceptance of Deposits) Rules' },
      { code: 'cc_aop', label: 'Companies (Adjudication of Penalties) Rules' },
      { code: 'cc_aqd', label: 'Companies (Appointment and Qualification of Directors) Rules' },
      { code: 'cc_armp', label: 'Companies (Appointment and Remuneration of Managerial Personnel) Rules' },
      { code: 'cc_atr', label: 'Companies (Authorised to Register) Rules' },
      { code: 'cc_caa', label: 'Companies (Compromises, Arrangements and Amalgamations) Rules' },
      { code: 'cc_cmdid', label: 'The Companies - Creation and Maintenance of databank of Independent Directors' },
      { code: 'cc_cra', label: 'Companies (Cost Records and Audit) Rules' },
      { code: 'cc_csrp', label: 'Companies (Corporate Social Responsibility Policy) Rules' },
      { code: 'cc_dpd', label: 'Companies (Declaration and Payment of Dividend) Rules' },
      { code: 'cc_fdf', label: 'Companies (Filing of Documents and Forms in Extensible Business Reporting Language) Rules' },
      { code: 'cc_ias', label: 'Companies (Indian Accounting Standards) Rules' },
      { code: 'cc_igdr', label: 'Companies (Issue of Global Depository Receipts) Rules' },
      { code: 'cc_iii', label: 'Companies (Inspection, Investigation and Inquiry) Rules' },
      { code: 'cc_incorp', label: 'Companies (Incorporation) Rules' },
      { code: 'cc_lespj', label: 'Companies (Listing of equity shares in permissible jurisdictions) Rules' },
      { code: 'cc_maa', label: 'Companies (Management and Administration) Rules' },
      { code: 'cc_mac', label: 'Companies (Mediation and Conciliation) Rules' },
      { code: 'cc_mbp', label: 'Companies (Meetings of Board and its Powers) Rules' },
      { code: 'cc_misc', label: 'Companies (Miscellaneous) Rules' },
      { code: 'cc_pas', label: 'Companies (Prospectus and Allotment of Securities) Rules' },
      { code: 'cc_rfc', label: 'Companies (Registration of Foreign Companies) Rules' },
      { code: 'cc_rncrc', label: 'Companies (Removal of Names of Companies from the Register of Companies) Rules' },
      { code: 'cc_rnol', label: 'Companies (Restriction on Number of Layers) Rules' },
      { code: 'cc_roc', label: 'The Companies - Registration of Charges' },
      { code: 'cc_roff', label: 'The Companies - Registration Offices and Fees' },
      { code: 'cc_rvv', label: 'The Companies - Registered Valuers and Valuation' },
      { code: 'cc_sbo', label: 'Companies (Significant Beneficial Owners) Rules' },
      { code: 'cc_scd', label: 'Companies (Share Capital and Debentures) Rules' },
      { code: 'cc_sodd', label: 'Companies (Specification of Definitions Details) Rules' },
      { code: 'cc_tpp', label: 'Companies (Transfer of Pending Proceedings) Rules' },
      { code: 'cc_wup', label: 'Companies (Winding Up) Rules' },
      { code: 'sec', label: 'Companies Act Sections (1 to 470)' },
      { code: 'iepfa_aatr', label: 'The Investor Education and Protection Fund Authority - Accounting Audit Transfer and Refund' },
      { code: 'iepfa_acm', label: 'IEPFA (Appointment of Chairperson and Members) Rules' },
      { code: 'nclat_rst', label: 'NCLAT (Procedure for Reduction of Share Capital) Rules' },
      { code: 'nclat_rules', label: 'National Company Appellate Law Tribunal - Rules' },
      { code: 'nclat_sat', label: 'NCLAT (Salary, Allowances and other Terms) Rules' },
      { code: 'nclt_prsc', label: 'NCLT (Procedure for Reduction of Share Capital) Rules' },
      { code: 'nclt_rst', label: 'NCLT (Salary, Allowances and other Terms) Rules' },
      { code: 'nclt_rules', label: 'National Company Law Tribunal - Rules' },
      { code: 'nclt_sat', label: 'NCLT (Salary, Allowances and other Terms) Rules' },
      { code: 'nfra_aptm', label: 'NFRA (Appointment of Part Time Members) Rules' },
      { code: 'nfra_moa', label: 'The National Financial Reporting Authority - Manner of Appointment and other Terms and Conditions of Service of Chairperson and Members' },
      { code: 'nfra_mtb', label: 'NFRA (Meeting for Transaction of Business) Rules' },
      { code: 'nfra_rules', label: 'National Financial Reporting Authority Rules' },
      { code: 'nidhi_rules', label: 'Nidhi Rules' },
      { code: 'prod_co', label: 'Producer Companies Rules' }
    ];

    const cache = new Map<string, any[]>();

    const fetchCompletions = async (triggerText: string): Promise<any[]> => {
      if (cache.has(triggerText)) return cache.get(triggerText)!;
      try {
        const res = await fetch(
          `http://127.0.0.1:3210/api/laws/query?q=${encodeURIComponent(triggerText)}&n=5`
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
          triggerCharacters: ['@', '/'],
          provideCompletionItems: async (model: any, position: any, _context: any, token: any) => {
            const lineText: string = model.getLineContent(position.lineNumber);
            const textUpToCursor = lineText.substring(0, position.column - 1);

            const triggerMatch = textUpToCursor.match(/@@([\w\s./,-]*)$/);
            if (!triggerMatch) return { suggestions: [] };

            const rawTrigger = triggerMatch[1].trim();

            const triggerStart = textUpToCursor.lastIndexOf('@@');
            const replaceRange = new monaco.Range(
                position.lineNumber,
                triggerStart + 1,
                position.lineNumber,
                position.column
            );

            let suggestions: any[] = [];
            const rawTriggerLower = rawTrigger.toLowerCase();
            const isGlobalSearch = !rawTrigger.includes('/') && rawTrigger.length > 3 && !LAW_DOMAINS.some(d => d.code === rawTriggerLower);

            // Level 1: Just typed @@, or typing the short code before the first slash
            if (!rawTrigger.includes('/')) {
                suggestions = LAW_DOMAINS.map(domain => ({
                    label: domain.label,
                    kind: monaco.languages.CompletionItemKind.Folder,
                    insertText: `@@${domain.code}/`,
                    range: replaceRange,
                    detail: 'Law Corpus',
                }));
                // If they are just typing a domain name, return early to save network calls
                if (!isGlobalSearch) return { suggestions };
            }

            const parts = rawTrigger.split('/');

            // Level 2: Detect @@ibc/ and no further characters yet
            if (parts.length === 2 && parts[0] === 'ibc' && parts[1] === '') {
                const ibcSuggestions = IBC_SUBDOMAINS.map(sub => ({
                    label: sub.label,
                    kind: monaco.languages.CompletionItemKind.Folder,
                    insertText: `@@ibc/${sub.code}/`,
                    range: replaceRange,
                    detail: 'Sub-Process',
                }));
                return { suggestions: ibcSuggestions };
            }

            // Level 2: Detect @@mca/ and no further characters yet
            if (parts.length === 2 && parts[0] === 'mca' && parts[1] === '') {
                const mcaSuggestions = MCA_SUBDOMAINS.map(sub => ({
                    label: sub.label,
                    kind: monaco.languages.CompletionItemKind.Folder,
                    insertText: `@@mca/${sub.code}/`,
                    range: replaceRange,
                    detail: 'Chapter/Rule',
                }));
                return { suggestions: mcaSuggestions };
            }

            // Level 3 & Global Search: Fetch from backend
            if (rawTrigger.length < 3) return { suggestions };

            const results = await fetchCompletions(rawTrigger);
            if (!results.length || token.isCancellationRequested) return { suggestions };

            const backendSuggestions = results.map((r: any) => {
                const cleanText = (r.text as string).replace(/^---[\s\S]*?---\r?\n?/, '').trimStart();
                return {
                    label: r.title || `Section ${r.section}`,
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: cleanText,
                    range: replaceRange,
                    detail: r.id,
                    documentation: cleanText.substring(0, 200) + '...'
                };
            });

            return { suggestions: [...suggestions, ...backendSuggestions] };
          }
        });
      }

      this.logger.info('[TWILLM] Law completion Dropdown (@@) registered for markdown and plaintext.');
    };

    checkMonaco();
  }

}
