import { injectable, inject } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry, ILogger } from '@theia/core/lib/common';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import URI from '@theia/core/lib/common/uri';
import { HayagrivaFrontendContribution } from './extension';

const HAYAGRIVA_NS = 'hayagriva';

function getBasename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1];
}

@injectable()
export class HayagrivaCommandContribution implements CommandContribution {

  constructor(
    @inject(WorkspaceService) private readonly workspaceService: WorkspaceService,
    @inject(EditorManager) private readonly editorManager: EditorManager,
    @inject(HayagrivaFrontendContribution) private readonly contribution: HayagrivaFrontendContribution,
    @inject(ILogger) private readonly logger: ILogger
  ) {}

  registerCommands(registry: CommandRegistry): void {
    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:ingest`, label: 'Ingest Document' },
      { execute: async (uri?: URI) => {
        let resourceUri = uri;
        if (!resourceUri) {
          const activeEditor = this.editorManager.activeEditor;
          if (activeEditor) {
            resourceUri = activeEditor.getResourceUri();
          }
        }
        if (!resourceUri) {
          this.logger.error('[HAYAGRIVA] No file selected for ingestion');
          return;
        }
        const filePath = resourceUri.path.toString();
        const caseName = this.contribution.getCaseName(filePath);
        await this.contribution.ingestDocument(filePath, caseName);
      }}
    );

    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:openWiki`, label: 'Open Companion Wiki' },
      { execute: async (uri?: URI) => {
        let resourceUri = uri;
        if (!resourceUri) {
          const activeEditor = this.editorManager.activeEditor;
          if (activeEditor) {
            resourceUri = activeEditor.getResourceUri();
          }
        }
        if (!resourceUri) {
          this.logger.error('[HAYAGRIVA] No file selected to open wiki');
          return;
        }
        const filePath = resourceUri.path.toString();
        const base = getBasename(filePath);
        const docName = base.replace(/\.(wiki\.html|pdf|docx|doc|xlsx|xls|pptx|csv|md|txt)$/i, '');
        const caseName = this.contribution.getCaseName(filePath);
        await this.contribution.openWiki(docName, caseName);
      }}
    );

    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:openCaseDashboard`, label: 'Open Case Dashboard Wiki' },
      { execute: async (uri?: URI) => {
        let resourceUri = uri;
        if (!resourceUri) {
          const activeEditor = this.editorManager.activeEditor;
          if (activeEditor) {
            resourceUri = activeEditor.getResourceUri();
          }
        }
        if (!resourceUri) {
          const ws = this.workspaceService.getWorkspaceRootUri(undefined);
          if (ws) resourceUri = new URI(ws.toString());
        }
        if (!resourceUri) {
          this.logger.error('[HAYAGRIVA] No active workspace selected');
          return;
        }
        const filePath = resourceUri.path.toString();
        const caseName = this.contribution.getCaseName(filePath);
        await this.contribution.openWiki('global', caseName);
      }}
    );

    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:openRagChat`, label: 'Open RAG Chat' },
      { execute: async () => { await this.contribution.openRagChat(); }}
    );

    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:openUploadSplit`, label: 'Upload to Hayagriva', iconClass: 'fa fa-upload' },
      { 
        execute: async () => { await this.contribution.openUploadSplit(); },
        isVisible: (widget: any) => {
          // If called without widget (e.g. from File Menu), always return true
          if (!widget) return true;
          // If rendering in a toolbar, only show on the explorer view
          const id = (widget.id || '').toLowerCase();
          return id.includes('explorer-view-container') || id === 'files';
        }
      }
    );

    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:compareDocuments`, label: 'Compare with... (Diff)' },
      { execute: async (uri?: URI) => {
        let resourceUri = uri;
        if (!resourceUri) {
          const activeEditor = this.editorManager.activeEditor;
          if (activeEditor) {
            resourceUri = activeEditor.getResourceUri();
          }
        }
        if (!resourceUri) {
          this.logger.error('[HAYAGRIVA] No active document open for comparison');
          return;
        }

        const caseName = this.contribution.getCaseName(resourceUri.path.toString());
        try {
          const indexRes = await fetch(`http://127.0.0.1:3210/api/hayagriva/read-file?path=${encodeURIComponent(caseName + '/concepts/index.json')}`);
          if (!indexRes.ok) throw new Error('Index not found');
          const indexData = await indexRes.json();
          const docs = indexData.documents || [];

          if (docs.length === 0) {
            alert('No other documents in case to compare with.');
            return;
          }

          const fileNames = docs.map((d: any) => d.title);
          const choice = prompt(`Select document to compare with ${getBasename(resourceUri.path.toString())}:\n\nAvailable:\n${fileNames.join('\n')}`);
          if (!choice) return;

          const matchedDoc = docs.find((d: any) => d.title.toLowerCase() === choice.toLowerCase().trim());
          if (!matchedDoc) {
            alert(`Document not found: "${choice}"`);
            return;
          }

          const workspaceRoot = this.workspaceService.getWorkspaceRootUri(undefined);
          if (workspaceRoot) {
            const rightRelative = matchedDoc.filename.replace(/\.(pdf|docx|xlsx|doc|xls)$/i, '.md');
            const rightUri = new URI(workspaceRoot.toString()).resolve(rightRelative);
            registry.executeCommand('vscode.diff', resourceUri, rightUri, `Comparison: ${getBasename(resourceUri.path.toString())} vs ${matchedDoc.title}`);
          }
        } catch (e: any) {
          this.logger.error(`[HAYAGRIVA] Diff comparison failed: ${e.message}`);
          alert('Failed to load case files for comparison.');
        }
      }}
    );

    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:outlineAskRag`, label: 'Ask about this section' },
      { execute: async (node?: any) => {
        const label = node && node.name ? node.name : '';
        if (label) {
          await this.contribution.openRagChat();
          this.contribution.prefillChat(`Summarize this section: ${label}`);
        }
      }}
    );

    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:outlineFindRelated`, label: 'Find related pages' },
      { execute: async (node?: any) => {
        const label = node && node.name ? node.name : '';
        if (label) {
          const activeEditor = this.editorManager.activeEditor;
          if (activeEditor) {
            const caseName = this.contribution.getCaseName(activeEditor.getResourceUri()!.path.toString());
            try {
              const res = await fetch(`http://127.0.0.1:3210/api/hayagriva/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ case: caseName, query: label })
              });
              const data = await res.json();
              if (data.sources && data.sources.length > 0) {
                alert(`Related pages found in:\n- ${data.sources.join('\n- ')}`);
              } else {
                alert('No related pages found.');
              }
            } catch (e: any) {
              this.logger.error(`[HAYAGRIVA] Search failed: ${e.message}`);
            }
          }
        }
      }}
    );

    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:outlineAddToWiki`, label: 'Add to Wiki' },
      { execute: async (node?: any) => {
        const label = node && node.name ? node.name : '';
        if (label) {
          await this.contribution.openRagChat();
          this.contribution.prefillChat(`Draft a case wiki card for the section: ${label}`);
        }
      }}
    );

    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:toggleWordIllusion`, label: 'Toggle Word Illusion Layout' },
      { execute: async () => {
        this.contribution.toggleWordIllusion();
      }}
    );

    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:toggleTheme`, label: 'Toggle Light/Dark Theme' },
      { execute: async () => {
        this.contribution.toggleTheme();
      }}
    );

    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:openKvEditor`, label: 'Open Case KV Dictionary' },
      { execute: async () => {
        const activeEditor = this.editorManager.activeEditor;
        const ws = this.workspaceService.getWorkspaceRootUri(undefined);
        let caseName = 'Case_Alpha';
        if (activeEditor) {
          caseName = this.contribution.getCaseName(activeEditor.getResourceUri()!.path.toString());
        } else if (ws) {
          caseName = this.contribution.getCaseName(new URI(ws.toString()).path.toString());
        }
        await this.contribution.openKvEditor(caseName);
      }}
    );

    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:openFormEditor`, label: 'Open Form Review Dashboard' },
      { execute: async () => {
        const activeEditor = this.editorManager.activeEditor;
        const ws = this.workspaceService.getWorkspaceRootUri(undefined);
        let caseName = 'Case_Alpha';
        if (activeEditor) {
          caseName = this.contribution.getCaseName(activeEditor.getResourceUri()!.path.toString());
        } else if (ws) {
          caseName = this.contribution.getCaseName(new URI(ws.toString()).path.toString());
        }
        const formId = prompt('Enter Form ID (e.g. aoc-4):') || 'aoc-4';
        await this.contribution.openFormEditor(caseName, formId.toLowerCase().trim());
      }}
    );

    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:openDraftingPanel`, label: 'Open Drafting Panel' },
      { execute: async () => {
        const activeEditor = this.editorManager.activeEditor;
        const ws = this.workspaceService.getWorkspaceRootUri(undefined);
        let caseName = 'Case_Alpha';
        if (activeEditor) {
          caseName = this.contribution.getCaseName(activeEditor.getResourceUri()!.path.toString());
        } else if (ws) {
          caseName = this.contribution.getCaseName(new URI(ws.toString()).path.toString());
        }
        await this.contribution.openDraftingPanel(caseName);
      }}
    );
  }
}

