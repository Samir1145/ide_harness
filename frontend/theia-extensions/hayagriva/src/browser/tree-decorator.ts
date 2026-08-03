import { injectable, inject } from '@theia/core/shared/inversify';
import { TreeDecorator, TreeDecoration, TreeNode, Tree, TopDownTreeIterator } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { Event, Emitter, PreferenceService, MessageService } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class HayagrivaTreeDecorator implements TreeDecorator {
  readonly id = 'hayagriva-tree-decorator';

  protected readonly emitter = new Emitter<(tree: Tree) => Map<string, TreeDecoration.Data>>();
  statusCache: { [path: string]: any } = {};
  private pollTimer: any = undefined;
  private isFetching = false;

  constructor(
    @inject(WorkspaceService) private readonly workspaceService: WorkspaceService,
    @inject(PreferenceService) private readonly preferenceService: PreferenceService,
    @inject(MessageService) private readonly messageService: MessageService
  ) {
    console.log('[Hayagriva] HayagrivaTreeDecorator: constructor called');
    // Bootstrap case settings synchronously before first render so that
    // settings.json (Open Editors hidden, file exclusions) is written
    // BEFORE Theia reads it for the sidebar layout.
    this.bootstrapCaseSettings();
    // Pre-warm status cache on startup
    this.reschedulePoll(500);
  }

  // Fire-and-forget: write settings.json for this workspace immediately on startup
  private bootstrapCaseSettings(): void {
    try {
      const caseName = this.resolveCaseName();
      if (!caseName) {
        console.log('[Hayagriva] No active case folder open. Skipping automatic bootstrap.');
        return;
      }
      const port = this.preferenceService.get<number>('hayagriva.apiPort', 3210);
      fetch(`http://127.0.0.1:${port}/api/hayagriva/bootstrap-case`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case: caseName })
      }).then(res => {
        console.log('[Hayagriva] bootstrap-case response:', res.status);
      }).catch(err => {
        console.warn('[Hayagriva] bootstrap-case call failed (server may not be up yet):', err.message);
      });
    } catch (e) {
      console.warn('[Hayagriva] bootstrapCaseSettings error:', e);
    }
  }

  get onDidChangeDecorations(): Event<(tree: Tree) => Map<string, TreeDecoration.Data>> {
    return this.emitter.event;
  }

  // Resolve case name from workspace root URI
  private resolveCaseName(): string {
    try {
      const workspaceRoot = this.workspaceService.getWorkspaceRootUri(undefined);
      if (workspaceRoot) {
        const pathStr = decodeURIComponent(workspaceRoot.path.toString());
        const normalized = pathStr.replace(/\/$/, '');
        if (normalized.endsWith('/Documents') || normalized.endsWith('/Documents/')) {
          return '';
        }
        return pathStr;
      }
    } catch (_) {}
    return '';
  }

  getApiPort(): number {
    return this.preferenceService.get<number>('hayagriva.apiPort', 3210);
  }

  private hasActiveTask(): boolean {
    for (const key of Object.keys(this.statusCache)) {
      const val = this.statusCache[key];
      if (val && (val.dot1 === 'blue' || val.dot2 === 'blue' || val.dot3 === 'blue')) {
        return true;
      }
    }
    return false;
  }

  private reschedulePoll(delay: number): void {
    if (this.pollTimer !== undefined) {
      clearTimeout(this.pollTimer);
    }
    this.pollTimer = setTimeout(async () => {
      await this.refreshStatuses();
    }, delay);
  }

  // Background fetch — populates cache, THEN fires emitter with REAL decoration builder
  async refreshStatuses(): Promise<void> {
    if (this.isFetching) return;
    this.isFetching = true;
    try {
      const caseName = this.resolveCaseName();
      const url = `http://127.0.0.1:${this.getApiPort()}/api/hayagriva/file-statuses?case=${encodeURIComponent(caseName)}`;
      console.log('[Hayagriva] fetching statuses:', url);
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const nextCache = data.statuses || {};
        
        let hasChanges = false;
        const currentKeys = Object.keys(this.statusCache);
        const nextKeys = Object.keys(nextCache);
        
        if (currentKeys.length !== nextKeys.length) {
          hasChanges = true;
        } else {
          for (const key of currentKeys) {
            const currentVal = this.statusCache[key];
            const nextVal = nextCache[key];
            if (!currentVal || !nextVal ||
                JSON.stringify(currentVal) !== JSON.stringify(nextVal)) {
              hasChanges = true;
              break;
            }
          }
        }
        
        // Check for state changes to fire notifications
        if (currentKeys.length > 0) {
          for (const key of nextKeys) {
            const oldVal = this.statusCache[key];
            const newVal = nextCache[key];
            if (oldVal && newVal) {
              const baseName = key.split(/[\\/]/).pop() || key;
              // Dot 1: Companion MD extraction
              if (oldVal.dot1 !== 'red' && newVal.dot1 === 'red') {
                this.messageService.error(`Extraction failed for ${baseName}: ${newVal.error || 'Unknown error'}`);
              } else if (oldVal.dot1 === 'blue' && (newVal.dot1 === 'green')) {
                this.messageService.info(`✓ Text extraction complete for ${baseName}`);
              }
              // Dot 2: AI Memory Indexing
              if (oldVal.dot2 !== 'red' && newVal.dot2 === 'red') {
                this.messageService.error(`Failed to index ${baseName} into AI Memory: ${newVal.error || 'Unknown error'}`);
              } else if (oldVal.dot2 === 'blue' && newVal.dot2 === 'green') {
                this.messageService.info(`✓ ${baseName} successfully indexed into AI Memory`);
              }
              // Dot 3: AI Enrichment
              if (oldVal.dot3 !== 'red' && newVal.dot3 === 'red') {
                this.messageService.error(`AI Enrichment failed for ${baseName}: ${newVal.error || 'Unknown error'}`);
              } else if (oldVal.dot3 === 'blue' && newVal.dot3 === 'green') {
                this.messageService.info(`✓ Full context AI enrichment ready for ${baseName}`);
              }
            }
          }
        }

        if (hasChanges || currentKeys.length === 0) {
          this.statusCache = nextCache;
          console.log('[Hayagriva] statusCache updated, firing decoration update event');
          this.emitter.fire(tree => this.buildDecorations(tree));
        }

        // Adaptive rate: 1 second if tasks are active, 4 seconds otherwise
        const active = this.hasActiveTask();
        const nextDelay = active ? 1000 : 4000;
        this.reschedulePoll(nextDelay);
      } else {
        console.warn('[Hayagriva] file-statuses API responded:', res.status);
        this.reschedulePoll(10000);
      }
    } catch (err: any) {
      console.warn('[Hayagriva] fetch error (server may not be up yet):', err.message);
      this.statusCache = {};
      this.emitter.fire(tree => this.buildDecorations(tree));
      this.reschedulePoll(10000);
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

    const docExts = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.csv', '.wiki.html', '.html'];

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

      // Resolve relative path key — must match what file-statuses API returns
      let relative = filePath;
      try {
        const wsRoot = this.workspaceService.getWorkspaceRootUri(undefined);
        if (wsRoot) {
          const rootPath = decodeURIComponent(wsRoot.path.toString());
          const fileLower = filePath.toLowerCase();
          const rootLower = rootPath.toLowerCase();
          if (fileLower.startsWith(rootLower)) {
            relative = filePath.substring(rootPath.length).replace(/^[\/\\]/, '');
          }
        }
      } catch (_) {}

      if (!docExts.includes(ext) && !(ext === '.md' && !!this.statusCache[relative])) continue;

      const statusObj: any = this.statusCache[relative];
      if (!statusObj || typeof statusObj !== 'object') continue;

      const { dot1, dot2, dot3 } = statusObj;
      const files: any = statusObj.files || {};

      // D6: Updated color map — 'green' is canonical, legacy aliases map to same colour
      const colorMap: { [key: string]: string } = {
        grey: '#6b7280',
        blue: '#3b82f6',
        green: '#10b981',
        red: '#ef4444',
        // Legacy aliases (backward compat during transition)
        amber: '#f59e0b',
        companion_ready: '#10b981',
        reviewed: '#10b981',
        indexed: '#10b981',
        outline_approved: '#10b981',
      };
      const dot1Color = colorMap[dot1] || '#6b7280';
      const dot2Color = colorMap[dot2] || '#6b7280';
      const dot3Color = colorMap[dot3] || '#6b7280';

      // ── Dot 1 tooltip — Text Extraction (D6) ────────────────────────────────
      const companionRelPath = files.companion?.path || '';
      const companionExists = files.companion?.exists === true;
      const companionBasename = companionRelPath ? companionRelPath.split('/').pop() : '—';
      let tooltip1: string;
      if (dot1 === 'green' || dot1 === 'companion_ready' || dot1 === 'reviewed') {
        tooltip1 = `● Step 1 ✓  Text extracted\n   📝 ${companionRelPath || '—'}  (click file to edit)`;
      } else if (dot1 === 'blue') {
        tooltip1 = `● Step 1 ⏳  Extracting text to Markdown… (auto-started on drop)`;
      } else if (dot1 === 'red') {
        tooltip1 = `● Step 1 ✗  Extraction failed — drop a companion .md to self-heal`;
      } else {
        tooltip1 = `● Step 1 ○  Extracting… (started automatically)`;
      }

      // ── Dot 2 tooltip — Index into AI Memory (D6) ────────────────────────────
      const treePath = files.pageindexTree?.path || '—';
      const totalCards = files.sectionCards?.total ?? 0;
      let tooltip2: string;
      if (dot2 === 'green' || dot2 === 'indexed') {
        tooltip2 = `● Step 2 ✓  Indexed into AI Memory (${totalCards} sections)\n   🗂 ${treePath}`;
      } else if (dot2 === 'blue') {
        tooltip2 = `● Step 2 ⏳  Indexing into AI Memory…`;
      } else if (dot2 === 'red') {
        tooltip2 = `● Step 2 ✗  Indexing failed\n   🗂 ${treePath}`;
      } else {
        tooltip2 = `● Step 2 ○  Not indexed — right-click › 2. Index into AI Memory`;
      }

      // ── Dot 3 tooltip — AI Enrichment (D6) ───────────────────────────────────
      const enrichedCards = files.sectionCards?.enriched ?? 0;
      let tooltip3: string;
      if (dot3 === 'green') {
        tooltip3 = `● Step 3 ✓  AI Enrichment complete (${totalCards} sections enriched)`;
      } else if (dot3 === 'blue') {
        tooltip3 = `● Step 3 ⏳  AI Enrichment running… (${enrichedCards}/${totalCards} sections done)`;
      } else if (dot3 === 'red') {
        tooltip3 = `● Step 3 ✗  AI Enrichment failed`;
      } else {
        tooltip3 = `● Step 3 ○  Not enriched — right-click › 3. Run AI Enrichment`;
      }

      let errorSuffix = '';
      if (statusObj.error) {
        errorSuffix = `\n⚠ Error: ${statusObj.error}`;
      }

      // D3: Companion .md caption suffix — shows "  📝 ipie.md" inline after filename
      const captionSuffixes: TreeDecoration.CaptionAffix[] = [];
      if (companionExists && companionRelPath) {
        captionSuffixes.push({
          data: `  📝 ${companionBasename}`,
          fontData: { color: '#6b7280' }  // subtle grey
        });
      }

      const decoration: TreeDecoration.Data = {
        captionPrefixes: [
          { data: '●', fontData: { color: dot1Color } },
          { data: '●', fontData: { color: dot2Color } },
          { data: '● ', fontData: { color: dot3Color } }
        ],
        tooltip: `${tooltip1}\n${tooltip2}\n${tooltip3}${errorSuffix}`
      };
      if (captionSuffixes.length > 0) {
        (decoration as any).captionSuffixes = captionSuffixes;
      }
      result.set(node.id, decoration);
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
