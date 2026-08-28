import { injectable, inject } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { PreferenceService } from '@theia/core/lib/common';
import { ILogger } from '@theia/core/lib/common/logger';

declare const monaco: any;

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

    const connect = () => {
      try {
        const port = this.getApiPort();
        const wsUrl = `ws://127.0.0.1:${port}/lsp`;
        const ws = new WebSocket(wsUrl);
        this.lspSocket = ws;

        ws.onopen = async () => {
          this.logger.info('[Hayagriva LSP] Connected to WebSocket LSP bridge.');
          try {
            const { toSocket, createWebSocketConnection } = require('vscode-ws-jsonrpc');
            const connection = createWebSocketConnection(toSocket(ws));
            this.lspConnection = connection;
            connection.listen();

            let currentCase = this.getCaseNameFn ? this.getCaseNameFn() : '';
            const wsRoot = this.workspaceService.getWorkspaceRootUri(undefined);

            // Initialize LSP session with caseDir
            await connection.sendRequest('initialize', {
              processId: null,
              rootUri: wsRoot ? wsRoot.toString() : null,
              capabilities: {
                textDocument: {
                  synchronization: { dynamicRegistration: false, willSave: false, willSaveWaitUntil: false, didSave: true },
                  hover: { dynamicRegistration: false, contentFormat: ['markdown', 'plaintext'] },
                  completion: { dynamicRegistration: false, completionItem: { snippetSupport: true } }
                }
              },
              initializationOptions: { caseDir: currentCase }
            });

            // Listen for diagnostics pushed by the out-of-process LSP server
            connection.onNotification('textDocument/publishDiagnostics', (params: any) => {
              if (!params || !params.uri) return;
              if (monaco && monaco.editor && monaco.editor.getModels) {
                const targetUriStr = params.uri;
                const models = monaco.editor.getModels();
                for (const m of models) {
                  if (m.uri.toString() === targetUriStr || targetUriStr.endsWith(m.uri.path)) {
                    const markers = (params.diagnostics || []).map((d: any) => ({
                      severity: d.severity === 1 ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
                      message: d.message,
                      startLineNumber: d.range.start.line + 1,
                      startColumn: d.range.start.character + 1,
                      endLineNumber: d.range.end.line + 1,
                      endColumn: d.range.end.character + 1
                    }));
                    monaco.editor.setModelMarkers(m, 'hayagriva-lsp', markers);
                    break;
                  }
                }
              }
            });

            // Sync open models
            this.syncOpenModelsToLsp();
          } catch (initErr: any) {
            this.logger.error(`[Hayagriva LSP] Initialization error: ${initErr ? initErr.message : initErr}`);
          }
        };

        ws.onerror = () => {
          this.logger.warn('[Hayagriva LSP] WebSocket error. Reconnecting in 5s...');
          this.lspConnection = undefined;
        };

        ws.onclose = () => {
          this.lspConnection = undefined;
          if (this.lspReconnectTimer !== undefined) {
            clearTimeout(this.lspReconnectTimer);
          }
          this.lspReconnectTimer = setTimeout(connect, 5000);
        };
      } catch (e: any) {
        this.logger.error(`[Hayagriva LSP] Failed to create WebSocket: ${e ? e.message : e}`);
        if (this.lspReconnectTimer !== undefined) {
          clearTimeout(this.lspReconnectTimer);
        }
        this.lspReconnectTimer = setTimeout(connect, 5000);
      }
    };

    // 3 second grace period on startup
    setTimeout(connect, 3000);

    let lastCaseDir = '';
    // Re-initialize only when workspace folder actually switches
    this.workspaceService.onWorkspaceLocationChanged(() => {
      const wsRoot = this.workspaceService.getWorkspaceRootUri(undefined);
      const newCase = wsRoot ? (this.getCaseNameFn ? this.getCaseNameFn() : '') : '';
      if (lastCaseDir && newCase && newCase !== lastCaseDir) {
        if (this.lspSocket && this.lspSocket.readyState === WebSocket.OPEN) {
          this.lspSocket.close();
        }
      }
      lastCaseDir = newCase;
    });
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
