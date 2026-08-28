import { injectable, inject } from '@theia/core/shared/inversify';
import { ToolProvider } from '@theia/ai-core/lib/common/tool-invocation-registry';
import { ToolRequest } from '@theia/ai-core';
import { PreferenceService } from '@theia/core/lib/common';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import URI from '@theia/core/lib/common/uri';

@injectable()
export abstract class BaseHayagrivaToolProvider implements ToolProvider {
    constructor(
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(PreferenceService) protected readonly preferenceService: PreferenceService
    ) {}

    abstract getTool(): ToolRequest;

    protected getBackendUrl(): string {
        const port = this.preferenceService.get('hayagriva.apiPort') || 3210;
        return `http://127.0.0.1:${port}`;
    }

    protected getCaseName(): string {
        const ws = this.workspaceService.getWorkspaceRootUri(undefined);
        if (ws) {
            return decodeURIComponent(new URI(ws.toString()).path.toString());
        }
        return '';
    }

    protected async executeBackendTool(toolName: string, args: Record<string, unknown>): Promise<any> {
        const url = `${this.getBackendUrl()}/api/agents/tools/execute`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                case: this.getCaseName(),
                tool: toolName,
                args
            })
        });

        if (!res.ok) {
            let errMsg = `Backend returned ${res.status}`;
            try {
                const errData = await res.json();
                if (errData && errData.error) errMsg = errData.error;
            } catch (_) {}
            throw new Error(errMsg);
        }

        const data = await res.json();
        return data.result;
    }
}

// ─── 1. Retrieve Contexts Tool Provider ────────────────────────────────────────

@injectable()
export class RetrieveContextsToolProvider extends BaseHayagrivaToolProvider {
    getTool(): ToolRequest {
        return {
            id: 'hayagriva:retrieveContexts',
            name: 'retrieveContexts',
            providerName: 'Hayagriva',
            description: 'Performs semantic & keyword hybrid RAG retrieval over case files using InLegal-SBERT or Finance-Embeddings.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The search query or factual question to look up.' },
                    limit: { type: 'number', description: 'Maximum number of contextual passages to retrieve (default: 4).' }
                },
                required: ['query']
            },
            handler: async (argString: string) => {
                const args = argString ? JSON.parse(argString) : {};
                const result = await this.executeBackendTool('retrieveContexts', args);
                return {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
                };
            }
        };
    }
}

// ─── 2. Get KV Value Tool Provider ─────────────────────────────────────────────

@injectable()
export class GetKVValueToolProvider extends BaseHayagrivaToolProvider {
    getTool(): ToolRequest {
        return {
            id: 'hayagriva:getKVValue',
            name: 'getKVValue',
            providerName: 'Hayagriva',
            description: 'Fetches verified case facts (e.g. corporate debtor name, default date, admitted claim amounts) from the case KV dictionary.',
            parameters: {
                type: 'object',
                properties: {
                    key: { type: 'string', description: 'The exact key name to fetch (e.g. "corporate_debtor", "date_of_default").' }
                },
                required: ['key']
            },
            handler: async (argString: string) => {
                const args = argString ? JSON.parse(argString) : {};
                const result = await this.executeBackendTool('getKVValue', args);
                return {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
                };
            }
        };
    }
}

// ─── 3. Query Timeline Tool Provider ───────────────────────────────────────────

@injectable()
export class QueryTimelineToolProvider extends BaseHayagrivaToolProvider {
    getTool(): ToolRequest {
        return {
            id: 'hayagriva:queryTimeline',
            name: 'queryTimeline',
            providerName: 'Hayagriva',
            description: 'Queries the reconstructed case chronology events and CIRP statutory timeline milestones.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            },
            handler: async (argString: string) => {
                const args = argString ? JSON.parse(argString) : {};
                const result = await this.executeBackendTool('queryTimeline', args);
                return {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
                };
            }
        };
    }
}

// ─── 4. Vault Lookup Tool Provider ─────────────────────────────────────────────

@injectable()
export class VaultLookupToolProvider extends BaseHayagrivaToolProvider {
    getTool(): ToolRequest {
        return {
            id: 'hayagriva:vaultLookup',
            name: 'vaultLookup',
            providerName: 'Hayagriva',
            description: 'Queries the encrypted Indian Law & Precedent Vault for statutory sections, tribunal rules, and Supreme Court ratios.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Statutory section or legal keyword (e.g. "Section 7 IBC financial creditor").' },
                    limit: { type: 'number', description: 'Maximum statutory sections to return (default: 3).' }
                },
                required: ['query']
            },
            handler: async (argString: string) => {
                const args = argString ? JSON.parse(argString) : {};
                const result = await this.executeBackendTool('vaultLookup', args);
                return {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
                };
            }
        };
    }
}

// ─── 5. Cross Reference Tool Provider ──────────────────────────────────────────

@injectable()
export class CrossReferenceToolProvider extends BaseHayagrivaToolProvider {
    getTool(): ToolRequest {
        return {
            id: 'hayagriva:checkCrossReference',
            name: 'checkCrossReference',
            providerName: 'Hayagriva',
            description: 'Cross-checks factual statements against case evidence to identify corroborating records or contradicting documents.',
            parameters: {
                type: 'object',
                properties: {
                    statement: { type: 'string', description: 'The factual claim or assertion to cross-verify against case documents.' }
                },
                required: ['statement']
            },
            handler: async (argString: string) => {
                const args = argString ? JSON.parse(argString) : {};
                const result = await this.executeBackendTool('checkCrossReference', args);
                return {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
                };
            }
        };
    }
}
