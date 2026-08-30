import { injectable, inject } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { PreferenceService } from '@theia/core/lib/common';
import { ILogger } from '@theia/core/lib/common/logger';

import * as monaco from '@theia/monaco-editor-core';

@injectable()
export class HayagrivaLspClient {
  protected lspConnection: any = undefined;
  protected lspSocket: WebSocket | undefined = undefined;
  protected lspReconnectTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  protected activeLspCaseDir = '';
  protected getCaseNameFn?: () => string;

  constructor(
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService,
    @inject(ILogger) protected readonly logger: ILogger
  ) {}

  protected getApiPort(): number {
    return this.preferenceService.get<number>('hayagriva.apiPort', 3210);
  }

  start(getCaseNameFn: () => string): void {
    this.getCaseNameFn = getCaseNameFn;
    // Out-of-process LSP WebSocket bridge is detached for now.
    // Monaco editor uses high-speed direct HTTP REST providers in monaco-providers.ts.
  }

  syncOpenModelsToLsp(): void {
    if (!this.lspConnection || !monaco || !monaco.editor || !monaco.editor.getModels) return;
    const models = monaco.editor.getModels();
    for (const m of models) {
      if (m.uri.path.endsWith('.md')) {
        this.notifyLspDocumentChange(m);
      }
    }
  }

  notifyLspDocumentChange(model: any): void {
    if (!this.lspConnection) return;
    const uri = model.uri.toString();
    const text = model.getValue();
    try {
      this.lspConnection.sendNotification('textDocument/didChange', {
        textDocument: { uri, version: model.getVersionId ? model.getVersionId() : 1 },
        contentChanges: [{ text }]
      });
    } catch (_) {}
  }

  getConnection(): any {
    return this.lspConnection;
  }

  dispose(): void {
    if (this.lspReconnectTimer !== undefined) {
      clearTimeout(this.lspReconnectTimer);
      this.lspReconnectTimer = undefined;
    }
    if (this.lspSocket) {
      this.lspSocket.close();
      this.lspSocket = undefined;
    }
    this.lspConnection = undefined;
  }
}
