import { injectable, inject } from '@theia/core/shared/inversify';
import { TreeDecorator, TreeDecoration, TreeNode, Tree, TopDownTreeIterator } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { Event, Emitter } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class HayagrivaTreeDecorator implements TreeDecorator {
  readonly id = 'hayagriva-tree-decorator';

  protected readonly emitter = new Emitter<(tree: Tree) => Map<string, TreeDecoration.Data>>();
  private statusCache: { [path: string]: string } = {};
  private isFetching = false;

  constructor(
    @inject(WorkspaceService) private readonly workspaceService: WorkspaceService
  ) {
    console.log('[Hayagriva] HayagrivaTreeDecorator: constructor called');
    // Pre-warm cache on startup, then poll every 4 seconds
    setTimeout(() => this.refreshStatuses(), 500);
    setInterval(() => this.refreshStatuses(), 4000);
  }

  get onDidChangeDecorations(): Event<(tree: Tree) => Map<string, TreeDecoration.Data>> {
    return this.emitter.event;
  }

  // Resolve case name from workspace root URI
  private resolveCaseName(): string {
    try {
      const workspaceRoot = this.workspaceService.getWorkspaceRootUri(undefined);
      if (workspaceRoot) {
        const rootPath = decodeURIComponent(workspaceRoot.path.toString());
        const parts = rootPath.split(/[\/\\]/).filter(Boolean);
        return parts[parts.length - 1] || 'Case_Alpha';
      }
    } catch (_) {}
    return 'Case_Alpha';
  }

  // Background fetch — populates cache, THEN fires emitter with REAL decoration builder
  private async refreshStatuses(): Promise<void> {
    if (this.isFetching) return;
    this.isFetching = true;
    try {
      const caseName = this.resolveCaseName();
      const url = `http://127.0.0.1:3210/api/hayagriva/file-statuses?case=${encodeURIComponent(caseName)}`;
      console.log('[Hayagriva] fetching statuses:', url);
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        this.statusCache = data.statuses || {};
        console.log('[Hayagriva] statusCache populated:', Object.keys(this.statusCache).length, 'entries', this.statusCache);
        this.emitter.fire(tree => this.buildDecorations(tree));
      } else {
        console.warn('[Hayagriva] file-statuses API responded:', res.status);
      }
    } catch (err) {
      console.warn('[Hayagriva] fetch error (server may not be up yet):', err);
    } finally {
      this.isFetching = false;
    }
  }

  // Called once by Theia on init — delegates to buildDecorations()
  decorations(tree: Tree): Map<string, TreeDecoration.Data> {
    return this.buildDecorations(tree);
  }

  // Core synchronous decoration builder — reads from pre-populated cache
  private buildDecorations(tree: Tree): Map<string, TreeDecoration.Data> {
    const result = new Map<string, TreeDecoration.Data>();
    if (!tree.root) { console.log('[Hayagriva] buildDecorations: no tree root'); return result; }
    console.log('[Hayagriva] buildDecorations called, cache size:', Object.keys(this.statusCache).length);

    const caseName = this.resolveCaseName();
    const docExts = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.csv'];

    for (const node of new TopDownTreeIterator(tree.root)) {
      const uri = this.getUri(node);
      if (!uri) continue;

      // Always decode so spaces in folder names work (e.g. IBC%20formats → IBC formats)
      const filePath = decodeURIComponent(uri.path.toString());

      // Skip system/generated folders
      if (
        filePath.includes('/concepts/') ||
        filePath.includes('/wiki/') ||
        filePath.includes('/conversions/') ||
        filePath.includes('/reviews/') ||
        filePath.includes('/drafts/') ||
        filePath.includes('/exports/')
      ) {
        continue;
      }

      const idxDot = filePath.lastIndexOf('.');
      if (idxDot === -1) continue;
      const ext = filePath.substring(idxDot).toLowerCase();
      if (!docExts.includes(ext)) continue;

      // Resolve relative path key — must match what file-statuses API returns
      let relative = filePath;
      const caseMarker = `/Documents/${caseName}/`;
      const docIdx = filePath.indexOf(caseMarker);
      if (docIdx !== -1) {
        relative = filePath.substring(docIdx + caseMarker.length);
      } else {
        try {
          const wsRoot = this.workspaceService.getWorkspaceRootUri(undefined);
          if (wsRoot) {
            const rootPath = decodeURIComponent(wsRoot.path.toString());
            if (filePath.startsWith(rootPath)) {
              relative = filePath.substring(rootPath.length).replace(/^[\/\\]/, '');
            }
          }
        } catch (_) {}
      }

      const status = this.statusCache[relative];
      if (!status) continue;

      if (status === 'unprocessed') {
        result.set(node.id, {
          iconColor: '#ef4444',
          captionPrefixes: [{ data: '● ', fontData: { color: '#ef4444' } }],
          tailDecorations: [{ icon: 'circle', color: '#ef4444', tooltip: 'Unprocessed — right-click › Generate Companion File' }],
          tooltip: 'Unprocessed — right-click › Generate Companion File'
        });
      } else if (status === 'processing') {
        result.set(node.id, {
          iconColor: '#f59e0b',
          captionPrefixes: [{ data: '● ', fontData: { color: '#f59e0b' } }],
          tailDecorations: [{ icon: 'circle-o-notch', color: '#f59e0b', tooltip: 'Converting to companion markdown...' }],
          tooltip: 'Converting to companion markdown...'
        });
      } else if (status === 'companion_ready' || status === 'pending_review') {
        result.set(node.id, {
          iconColor: '#10b981',
          captionPrefixes: [{ data: '● ', fontData: { color: '#10b981' } }],
          tailDecorations: [{ icon: 'check-circle', color: '#10b981', tooltip: 'Companion ready — open Concepts panel to build index' }],
          tooltip: 'Companion ready — open Concepts panel to build index'
        });
      } else if (status === 'indexed') {
        result.set(node.id, {
          iconColor: '#10b981',
          captionPrefixes: [{ data: '● ', fontData: { color: '#10b981' } }],
          tailDecorations: [{ icon: 'check-circle', color: '#10b981', tooltip: 'Fully ingested & indexed' }],
          tooltip: 'Fully ingested & indexed'
        });
      }
    }

    return result;
  }

  private getUri(node: TreeNode): URI | undefined {
    if (node && 'uri' in node && node.uri instanceof URI) {
      return node.uri;
    }
    return undefined;
  }
}
