import { injectable, inject } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry, ILogger } from '@theia/core/lib/common';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import URI from '@theia/core/lib/common/uri';
import { SelectionService } from '@theia/core/lib/common/selection-service';
import { UriSelection } from '@theia/core/lib/common/selection';
import { HayagrivaFrontendContribution } from './extension';
import { HayagrivaTreeDecorator } from './tree-decorator';

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
    @inject(HayagrivaTreeDecorator) private readonly treeDecorator: HayagrivaTreeDecorator,
    @inject(SelectionService) private readonly selectionService: SelectionService,
    @inject(ILogger) private readonly logger: ILogger
  ) {}

  private getRelativePath(uri: URI): string {
    const filePath = uri.path.toString();
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

  private getCasePath(): string {
    try {
      const wsRoot = this.workspaceService.getWorkspaceRootUri(undefined);
      if (wsRoot) {
        return decodeURIComponent(wsRoot.path.toString());
      }
    } catch (_) {}
    return 'Case_Alpha';
  }

  private resolveUri(uri?: any): URI | undefined {
    console.log('[HAYAGRIVA-CMD] resolveUri input:', typeof uri, uri ? JSON.stringify(uri) : 'null');
    
    // Check if the input object is a valid URI
    if (uri && typeof uri === 'object' && ('path' in uri || 'scheme' in uri) && typeof uri.toString === 'function') {
      try {
        const res = new URI(uri.toString());
        console.log('[HAYAGRIVA-CMD] resolveUri matched URI object:', res.toString());
        return res;
      } catch (e: any) {
        console.log('[HAYAGRIVA-CMD] resolveUri URI object parse error:', e.message);
      }
    }
    
    // Check if the input is a node with a uri property (like FileStatNode)
    if (uri && typeof uri === 'object' && uri.uri) {
      try {
        const res = new URI(uri.uri.toString());
        console.log('[HAYAGRIVA-CMD] resolveUri matched node.uri object:', res.toString());
        return res;
      } catch (e: any) {
        console.log('[HAYAGRIVA-CMD] resolveUri node.uri parse error:', e.message);
      }
    }
    
    // Check if the input is an array (e.g. multi-selection list)
    if (Array.isArray(uri) && uri.length > 0) {
      console.log('[HAYAGRIVA-CMD] resolveUri matched array, parsing first item');
      return this.resolveUri(uri[0]);
    }

    // Try SelectionService fallback (critical when context menu passes coordinates)
    try {
      const activeSelection = this.selectionService.selection;
      if (activeSelection) {
        const selUri = UriSelection.getUri(activeSelection);
        if (selUri) {
          const res = new URI(selUri.toString());
          console.log('[HAYAGRIVA-CMD] resolveUri resolved via SelectionService:', res.toString());
          return res;
        }
      }
    } catch (e: any) {
      console.log('[HAYAGRIVA-CMD] resolveUri SelectionService error:', e.message);
    }

    // Secondary fallback: active editor
    if (!uri || (typeof uri === 'object' && 'x' in uri && 'y' in uri)) {
      const activeEditor = this.editorManager.activeEditor;
      if (activeEditor) {
        const res = activeEditor.getResourceUri();
        console.log('[HAYAGRIVA-CMD] resolveUri fallback to active editor:', res?.toString());
        return res;
      }
    }

    console.log('[HAYAGRIVA-CMD] resolveUri failed to resolve');
    return undefined;
  }

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
      { id: `${HAYAGRIVA_NS}:openCompanionSideBySide`, label: '2. Review/Edit Markdown' },
      {
        execute: async (uri?: any) => {
          const resourceUri = this.resolveUri(uri);
          if (!resourceUri) {
            this.logger.error('[HAYAGRIVA] No file selected to open companion');
            return;
          }

          const originalPath = resourceUri.path.toString();
          const lowerPath = originalPath.toLowerCase();
          if (!lowerPath.endsWith('.docx') && !lowerPath.endsWith('.doc') &&
              !lowerPath.endsWith('.xlsx') && !lowerPath.endsWith('.xls') &&
              !lowerPath.endsWith('.pdf')) {
            this.logger.warn('[HAYAGRIVA] Open Companion Side-by-Side only supported for DOCX, XLSX, and PDF');
            return;
          }

          const companionPath = originalPath.replace(/\.[a-zA-Z0-9]+$/, '.md');
          const companionUri = resourceUri.withPath(companionPath);

          // Open original file/preview first
          await this.contribution.open(resourceUri);
          // Split open the companion Markdown file to the right side
          await this.editorManager.openToSide(companionUri);
        },
        isEnabled: (uri?: URI) => {
          const resolved = this.resolveUri(uri);
          if (!resolved) {
            console.log('[HAYAGRIVA-CMD] openCompanionSideBySide isEnabled: resolved URI is empty -> false');
            return false;
          }
          const lower = resolved.path.toString().toLowerCase();
          if (lower.endsWith('.wiki.html')) {
            console.log('[HAYAGRIVA-CMD] openCompanionSideBySide isEnabled for wiki.html -> true (pre-converted)');
            return true;
          }
          if (!lower.endsWith('.pdf') && !lower.endsWith('.docx') && !lower.endsWith('.doc') && !lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
            console.log('[HAYAGRIVA-CMD] openCompanionSideBySide isEnabled for unsupported file extension:', lower, '-> false');
            return false;
          }
          const rel = this.getRelativePath(resolved);
          const status = this.treeDecorator.statusCache[rel];
          const hasCompanion = !!status && (status.dot1 === 'companion_ready' || status.dot1 === 'reviewed');
          console.log('[HAYAGRIVA-CMD] openCompanionSideBySide isEnabled:', rel, 'statusCache dot1:', status ? status.dot1 : 'undefined', '->', hasCompanion);
          return hasCompanion;
        }
      }
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
      { id: `${HAYAGRIVA_NS}:openSettingsPanel`, label: 'Open Case Settings', iconClass: 'fa fa-cog' },
      { 
        execute: async () => { await this.contribution.openSettingsPanel(); },
        isVisible: (widget: any) => {
          if (!widget) return true;
          const id = (widget.id || '').toLowerCase();
          return id.includes('explorer-view-container') || id === 'files';
        }
      }
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
          const indexRes = await fetch(`${this.contribution.getBackendUrl()}/api/hayagriva/read-file?path=${encodeURIComponent(caseName + '/concepts/index.json')}`);
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
              const res = await fetch(`${this.contribution.getBackendUrl()}/api/hayagriva/query`, {
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

    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:convertToMd`, label: '1. Convert to Markdown' },
      {
        execute: async (uri?: any) => {
          const resourceUri = this.resolveUri(uri);
          if (!resourceUri) {
            this.logger.error('[HAYAGRIVA] No file selected for conversion');
            return;
          }
          const filePath = resourceUri.path.toString();
          const caseName = this.getCasePath();
          try {
            const apiPort = this.contribution.getApiPort();
            const res = await fetch(`http://127.0.0.1:${apiPort}/api/hayagriva/convert-to-md`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ case: caseName, file: filePath, force: true })
            });
            const result = await res.json();
            if (result.success) {
              this.logger.info(`[HAYAGRIVA] Started conversion of ${getBasename(filePath)}`);
              await this.treeDecorator.refreshStatuses();
            } else {
              alert(result.error || 'Conversion failed');
            }
          } catch (e: any) {
            this.logger.error(`[HAYAGRIVA] Conversion failed: ${e.message}`);
          }
        },
        isEnabled: (uri?: URI) => {
          const resolved = this.resolveUri(uri);
          if (!resolved) {
            console.log('[HAYAGRIVA-CMD] convertToMd isEnabled: resolved URI is empty -> false');
            return false;
          }
          const lower = resolved.path.toString().toLowerCase();
          const matches = lower.endsWith('.pdf') || lower.endsWith('.docx') || lower.endsWith('.doc') || lower.endsWith('.xlsx') || lower.endsWith('.xls');
          console.log('[HAYAGRIVA-CMD] convertToMd isEnabled for', lower, '->', matches);
          return matches;
        },
        isVisible: () => true
      }
    );

    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:ingestToAi`, label: '2. Generate Search Vectors' },
      {
        execute: async (uri?: any) => {
          const resourceUri = this.resolveUri(uri);
          if (!resourceUri) {
            this.logger.error('[HAYAGRIVA] No file selected for Ingestion');
            return;
          }
          const filePath = resourceUri.path.toString();
          const caseName = this.getCasePath();

          // Auto-save the companion .md file if open and dirty before indexing
          const companionPath = filePath.replace(/\.[a-zA-Z0-9]+$/, '.md');
          const companionUri = resourceUri.withPath(companionPath);
          try {
            const editorWidget = await this.editorManager.getByUri(companionUri);
            if (editorWidget) {
              await editorWidget.saveable.save();
            }
          } catch (e: any) {
            console.warn('[HAYAGRIVA] Save check failed:', e.message);
          }

          try {
            const apiPort = this.contribution.getApiPort();
            const res = await fetch(`http://127.0.0.1:${apiPort}/api/hayagriva/ingest-to-ai`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ case: caseName, file: filePath, enrich: false })
            });
            const result = await res.json();
            if (result.success) {
              this.logger.info(`[HAYAGRIVA] Indexing started for ${getBasename(filePath)}`);
              await this.treeDecorator.refreshStatuses();
            } else {
              alert(result.error || 'Indexing failed');
            }
          } catch (e: any) {
            this.logger.error(`[HAYAGRIVA] Indexing failed: ${e.message}`);
          }
        },
        isEnabled: (uri?: URI) => {
          const resolved = this.resolveUri(uri);
          if (!resolved) return false;
          const rel = this.getRelativePath(resolved);
          const status = this.treeDecorator.statusCache[rel];
          return !!status && (status.dot1 === 'companion_ready' || status.dot1 === 'reviewed');
        },
        isVisible: () => true
      }
    );

    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:enrichToAi`, label: '3. Run AI Enrichment' },
      {
        execute: async (uri?: any) => {
          const resourceUri = this.resolveUri(uri);
          if (!resourceUri) {
            this.logger.error('[HAYAGRIVA] No file selected for Enrichment');
            return;
          }
          const filePath = resourceUri.path.toString();
          const caseName = this.getCasePath();

          try {
            const apiPort = this.contribution.getApiPort();
            const res = await fetch(`http://127.0.0.1:${apiPort}/api/hayagriva/enrich-ai`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ case: caseName, file: filePath })
            });
            const result = await res.json();
            if (result.success) {
              this.logger.info(`[HAYAGRIVA] Enrichment queued for ${getBasename(filePath)}`);
              await this.treeDecorator.refreshStatuses();
            } else {
              alert(result.error || 'Enrichment failed');
            }
          } catch (e: any) {
            this.logger.error(`[HAYAGRIVA] Enrichment failed: ${e.message}`);
          }
        },
        isEnabled: (uri?: URI) => {
          const resolved = this.resolveUri(uri);
          if (!resolved) return false;
          const rel = this.getRelativePath(resolved);
          const status = this.treeDecorator.statusCache[rel];
          return !!status && (status.dot2 === 'indexed');
        },
        isVisible: () => true
      }
    );

    // ── Pipeline Audit ────────────────────────────────────────────────────────
    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:showPipelineAudit`, label: 'Show Pipeline Audit' },
      {
        execute: async (uri?: any) => {
          const resourceUri = this.resolveUri(uri);
          if (!resourceUri) {
            alert('Please right-click a document file to view its pipeline audit.');
            return;
          }
          const caseName = this.getCasePath();
          try {
            const apiPort = this.contribution.getApiPort();
            const res = await fetch(`http://127.0.0.1:${apiPort}/api/hayagriva/file-statuses?case=${encodeURIComponent(caseName)}`);
            const data = await res.json();
            const rel = this.getRelativePath(resourceUri);
            const entry = (data.statuses || {})[rel];
            if (!entry) {
              alert(`No pipeline status found for:\n${rel}\n\nThe file may not be a recognised document type.`);
              return;
            }
            const f = entry.files || {};
            const dot = (d: string) => d === 'companion_ready' || d === 'reviewed' || d === 'indexed' || d === 'green' ? '✅' : d === 'blue' ? '⏳' : d === 'red' ? '❌' : '⚪';
            const exists = (v: boolean) => v ? '✓ exists' : '✗ missing';

            const lines: string[] = [
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
              `📋  PIPELINE AUDIT`,
              `📁  ${rel}`,
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
              ``,
              `${dot(entry.dot1)}  Step 1 — Convert to Markdown`,
              `   📄  ${f.companion?.path || '—'}`,
              `        ${exists(f.companion?.exists)}`,
              ``,
              `${dot(entry.dot2)}  Step 2 — Generate Search Vectors`,
              `   🗂  ${f.pageindexTree?.path || '—'}`,
              `        ${exists(f.pageindexTree?.exists)}`,
              `   🗂  ${f.bm25Index?.path || '—'}`,
              `        ${exists(f.bm25Index?.exists)}`,
              `   📂  ${f.conceptsDir?.path || '—'}`,
              `        ${exists(f.conceptsDir?.exists)}`,
              `        ${f.sectionCards?.total ?? 0} section cards generated`,
              ``,
              `${dot(entry.dot3)}  Step 3 — AI Enrichment`,
              `   🤖  ${f.sectionCards?.enriched ?? 0} / ${f.sectionCards?.total ?? 0} sections enriched`,
            ];

            if (entry.error) {
              lines.push(``);
              lines.push(`⚠️  Error: ${entry.error}`);
            }

            lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            alert(lines.join('\n'));
          } catch (e: any) {
            alert(`Failed to fetch pipeline audit:\n${e.message}`);
          }
        },
        isEnabled: (uri?: URI) => {
          const resolved = this.resolveUri(uri);
          if (!resolved) return false;
          const lower = resolved.path.toString().toLowerCase();
          return lower.endsWith('.pdf') || lower.endsWith('.docx') || lower.endsWith('.doc') || lower.endsWith('.xlsx') || lower.endsWith('.xls');
        },
        isVisible: () => true
      }
    );

    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:archiveCase`, label: 'Archive to Vault' },
      {
        execute: async () => {
          const caseName = this.getCasePath();
          try {
            const apiPort = this.contribution.getApiPort();
            const res = await fetch(`http://127.0.0.1:${apiPort}/api/hayagriva/archive-case`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ case: caseName })
            });
            const result = await res.json();
            if (result.success) {
              this.logger.info('[HAYAGRIVA] Case archived successfully in concepts/case_vault.db');
              alert('✓ Case archived successfully inside concepts/case_vault.db!');
            } else {
              alert(result.error || 'Archiving failed');
            }
          } catch (e: any) {
            this.logger.error(`[HAYAGRIVA] Archiving failed: ${e.message}`);
          }
        },
        isEnabled: (uri?: URI) => {
          const resolved = this.resolveUri(uri);
          if (!resolved) return false;
          const lower = resolved.path.toString().toLowerCase();
          return lower.endsWith('.pdf') || lower.endsWith('.docx') || lower.endsWith('.doc') || lower.endsWith('.xlsx') || lower.endsWith('.xls');
        },
        isVisible: () => true
      }
    );

    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:restoreCase`, label: 'Restore from Vault' },
      {
        execute: async () => {
          const caseName = this.getCasePath();
          try {
            const apiPort = this.contribution.getApiPort();
            const res = await fetch(`http://127.0.0.1:${apiPort}/api/hayagriva/restore-case`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ case: caseName })
            });
            const result = await res.json();
            if (result.success) {
              this.logger.info('[HAYAGRIVA] Case restored successfully from concepts/case_vault.db');
              alert('✓ Case workspace files restored successfully!');
            } else {
              alert(result.error || 'Restoration failed');
            }
          } catch (e: any) {
            this.logger.error(`[HAYAGRIVA] Restoration failed: ${e.message}`);
          }
        },
        isEnabled: (uri?: URI) => {
          const resolved = this.resolveUri(uri);
          if (!resolved) return false;
          const lower = resolved.path.toString().toLowerCase();
          return lower.endsWith('.pdf') || lower.endsWith('.docx') || lower.endsWith('.doc') || lower.endsWith('.xlsx') || lower.endsWith('.xls');
        },
        isVisible: () => true
      }
    );

    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:openCaseVault`, label: '4. Open Database Viewer' },
      {
        execute: async () => {
          try {
            const wsRoot = this.workspaceService.getWorkspaceRootUri(undefined);
            if (wsRoot) {
              const dbUri = new URI(wsRoot.toString()).resolve('concepts/case_vault.db');
              this.logger.info(`[HAYAGRIVA] Opening database: ${dbUri.toString()}`);
              await this.editorManager.open(dbUri);
            } else {
              alert('No active workspace root found.');
            }
          } catch (e: any) {
            this.logger.error(`[HAYAGRIVA] Failed to open Database Viewer: ${e.message}`);
            alert(`Failed to open Database Viewer: ${e.message}`);
          }
        },
        isEnabled: (uri?: URI) => {
          const resolved = this.resolveUri(uri);
          if (!resolved) return false;
          const lower = resolved.path.toString().toLowerCase();
          return lower.endsWith('.pdf') || lower.endsWith('.docx') || lower.endsWith('.doc') || lower.endsWith('.xlsx') || lower.endsWith('.xls');
        },
        isVisible: () => true
      }
    );

    // ── Monaco Context Lookup: Statutes ──────────────────────────────────
    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:lookupCitation`, label: 'Lookup Statute in Law Vault' },
      {
        execute: async () => {
          const activeEditor = this.editorManager.activeEditor;
          if (!activeEditor) return;
          const selectedText = activeEditor.editor.document.getText(activeEditor.editor.selection).trim();
          if (!selectedText) {
            alert('Please highlight a section or statute keyword to lookup (e.g. "Section 135").');
            return;
          }
          try {
            const apiPort = this.contribution.getApiPort();
            const res = await fetch(`http://127.0.0.1:${apiPort}/api/laws/query?q=${encodeURIComponent(selectedText)}`);
            if (!res.ok) {
              alert('Law Vault query failed');
              return;
            }
            const json = await res.json();
            const results = json.results || [];
            if (results.length === 0) {
              alert(`No matching section found for "${selectedText}" in the Law Vault.`);
              return;
            }
            const match = results[0];
            const cleanText = (match.text as string).replace(/^---[\s\S]*?---\r?\n?/, '').trimStart();
            const preview = `Title: ${match.title || `Section ${match.section}`}\n\n${cleanText}`;
            alert(`--- [Statute Vault Match] ---\n${preview.substring(0, 1000)}${preview.length > 1000 ? '...' : ''}`);
            
            const doInsert = confirm('Do you want to insert this statute text at your cursor?');
            if (doInsert) {
              activeEditor.editor.executeEdits([{
                range: activeEditor.editor.selection,
                newText: `\n\n> **${match.title || `Section ${match.section}`}**\n> ${cleanText.replace(/\n/g, '\n> ')}\n\n`
              }]);
            }
          } catch (e: any) {
            this.logger.error(`[HAYAGRIVA] Law lookup failed: ${e.message}`);
          }
        }
      }
    );

    // ── Monaco Context Lookup: Judgments ─────────────────────────────────
    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:lookupJudgment`, label: 'Lookup Judgment in Precedents' },
      {
        execute: async () => {
          const activeEditor = this.editorManager.activeEditor;
          if (!activeEditor) return;
          const selectedText = activeEditor.editor.document.getText(activeEditor.editor.selection).trim();
          if (!selectedText) {
            alert('Please highlight a case law name or citation first (e.g. "Kesavananda").');
            return;
          }
          try {
            const caseName = this.contribution.getCaseName(activeEditor.getResourceUri()!.path.toString());
            const apiPort = this.contribution.getApiPort();
            const res = await fetch(`http://127.0.0.1:${apiPort}/api/hayagriva/wiki-cards?case=${encodeURIComponent(caseName)}`);
            if (!res.ok) {
              alert('Judgments query failed');
              return;
            }
            const json = await res.json();
            const list = json.cards || [];
            
            // Search matching card by title/tags/filename
            const match = list.find((c: any) => 
              c.title.toLowerCase().includes(selectedText.toLowerCase()) || 
              c.filename.toLowerCase().includes(selectedText.toLowerCase())
            );
            
            if (!match) {
              alert(`No matching precedent card found for "${selectedText}" in the case Wiki.`);
              return;
            }

            const readRes = await fetch(`http://127.0.0.1:${apiPort}/api/hayagriva/read-file?path=${encodeURIComponent(`wiki/${match.filename}`)}`);
            if (!readRes.ok) {
              alert('Failed to read judgment content');
              return;
            }
            const content = await readRes.text();
            alert(`--- [Precedent Match: ${match.title}] ---\n\n${content.substring(0, 1000)}${content.length > 1000 ? '...' : ''}`);
            
            const doInsert = confirm('Do you want to insert this judgment summary at your cursor?');
            if (doInsert) {
              activeEditor.editor.executeEdits([{
                range: activeEditor.editor.selection,
                newText: `\n\n${content}\n\n`
              }]);
            }
          } catch (e: any) {
            this.logger.error(`[HAYAGRIVA] Judgment lookup failed: ${e.message}`);
          }
        }
      }
    );

    // ── Monaco Context Lookup: Case Concepts ──────────────────────────────
    registry.registerCommand(
      { id: `${HAYAGRIVA_NS}:lookupConcept`, label: 'Lookup Case Concept Card' },
      {
        execute: async () => {
          const activeEditor = this.editorManager.activeEditor;
          if (!activeEditor) return;
          const selectedText = activeEditor.editor.document.getText(activeEditor.editor.selection).trim();
          if (!selectedText) {
            alert('Please highlight a concept name (e.g. "Payment Terms").');
            return;
          }
          try {
            const caseName = this.contribution.getCaseName(activeEditor.getResourceUri()!.path.toString());
            const apiPort = this.contribution.getApiPort();
            const res = await fetch(`http://127.0.0.1:${apiPort}/api/hayagriva/concepts?case=${encodeURIComponent(caseName)}`);
            if (!res.ok) {
              alert('Concepts query failed');
              return;
            }
            const json = await res.json();
            const list = json.concepts || [];
            
            const match = list.find((c: any) => c.title.toLowerCase().trim() === selectedText.toLowerCase());
            if (!match) {
              const partials = list.filter((c: any) => c.title.toLowerCase().includes(selectedText.toLowerCase()));
              if (partials.length > 0) {
                const options = partials.map((c: any) => c.title).join(', ');
                alert(`No exact match. Did you mean: ${options}?`);
              } else {
                alert(`No concept card found for "${selectedText}" in this case.`);
              }
              return;
            }

            const readRes = await fetch(`http://127.0.0.1:${apiPort}/api/hayagriva/read-file?path=${encodeURIComponent(match.relativePath)}`);
            if (!readRes.ok) {
              alert('Failed to read concept content');
              return;
            }
            const content = await readRes.text();
            alert(`--- [Case Concept: ${match.title}] ---\n\n${content.substring(0, 1000)}${content.length > 1000 ? '...' : ''}`);
            
            const insertType = prompt('Type "link" to insert reference link, or "text" to insert full content:');
            if (insertType && insertType.toLowerCase().trim() === 'link') {
              activeEditor.editor.executeEdits([{
                range: activeEditor.editor.selection,
                newText: `[${selectedText}](${match.relativePath})`
              }]);
            } else if (insertType && insertType.toLowerCase().trim() === 'text') {
              activeEditor.editor.executeEdits([{
                range: activeEditor.editor.selection,
                newText: `\n\n${content}\n\n`
              }]);
            }
          } catch (e: any) {
            this.logger.error(`[HAYAGRIVA] Concept lookup failed: ${e.message}`);
          }
        }
      }
    );
  }
}
