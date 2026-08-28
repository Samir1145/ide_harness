import { injectable, inject } from '@theia/core/shared/inversify';
import { AIVariableContribution, AIVariableService, AIVariableResolutionRequest, ResolvedAIVariable } from '@theia/ai-core';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { PreferenceService } from '@theia/core/lib/common';
import { EditorManager } from '@theia/editor/lib/browser';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class HayagrivaContextChipsContribution implements AIVariableContribution {
    constructor(
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(PreferenceService) protected readonly preferenceService: PreferenceService,
        @inject(EditorManager) protected readonly editorManager: EditorManager
    ) {}

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

    protected async fetchChipContent(chipName: string): Promise<string> {
        try {
            const url = `${this.getBackendUrl()}/api/agents/tools/execute`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    case: this.getCaseName(),
                    tool: chipName === 'case_facts' ? 'getAllKV' : (chipName === 'timeline' ? 'queryTimeline' : 'retrieveContexts'),
                    args: { query: chipName }
                })
            });
            if (res.ok) {
                const data = await res.json();
                return JSON.stringify(data.result || data, null, 2);
            }
        } catch (_) {}
        return '';
    }

    registerVariables(service: AIVariableService): void {
        // ── 1. #case_facts Context Chip ──────────────────────────────────────
        const caseFactsVar = {
            id: 'hayagriva:case_facts',
            name: 'case_facts',
            label: 'Case Facts',
            description: 'Verified case facts and attributes from case_kv_dictionary.json',
            isContextVariable: true,
            iconClasses: ['codicon', 'codicon-symbol-property']
        };
        service.registerVariable(caseFactsVar);
        service.registerResolver(caseFactsVar, {
            canResolve: (req: AIVariableResolutionRequest) => req.variable.name === 'case_facts' ? 100 : 0,
            resolve: async (req: AIVariableResolutionRequest): Promise<ResolvedAIVariable> => {
                const content = await this.fetchChipContent('case_facts');
                return {
                    variable: req.variable,
                    value: content || 'No verified case facts recorded yet.'
                };
            }
        });

        // ── 2. #timeline Context Chip ────────────────────────────────────────
        const timelineVar = {
            id: 'hayagriva:timeline',
            name: 'timeline',
            label: 'CIRP Timeline',
            description: 'Chronology and statutory milestone timeline for the active case',
            isContextVariable: true,
            iconClasses: ['codicon', 'codicon-calendar']
        };
        service.registerVariable(timelineVar);
        service.registerResolver(timelineVar, {
            canResolve: (req: AIVariableResolutionRequest) => req.variable.name === 'timeline' ? 100 : 0,
            resolve: async (req: AIVariableResolutionRequest): Promise<ResolvedAIVariable> => {
                const content = await this.fetchChipContent('timeline');
                return {
                    variable: req.variable,
                    value: content || 'No timeline records available.'
                };
            }
        });

        // ── 3. #claims_registry Context Chip ─────────────────────────────────
        const claimsVar = {
            id: 'hayagriva:claims_registry',
            name: 'claims_registry',
            label: 'Claims Registry',
            description: 'Financial and operational creditor admitted claims summary',
            isContextVariable: true,
            iconClasses: ['codicon', 'codicon-briefcase']
        };
        service.registerVariable(claimsVar);
        service.registerResolver(claimsVar, {
            canResolve: (req: AIVariableResolutionRequest) => req.variable.name === 'claims_registry' ? 100 : 0,
            resolve: async (req: AIVariableResolutionRequest): Promise<ResolvedAIVariable> => {
                const content = await this.fetchChipContent('claims_registry');
                return {
                    variable: req.variable,
                    value: content || 'No claims registry table found.'
                };
            }
        });

        // ── 4. #avoidance_ledger Context Chip ────────────────────────────────
        const avoidanceVar = {
            id: 'hayagriva:avoidance_ledger',
            name: 'avoidance_ledger',
            label: 'Avoidance Ledger',
            description: 'Voidable PUFE transactions (Sec 43, 45, 50, 66) audit records',
            isContextVariable: true,
            iconClasses: ['codicon', 'codicon-shield']
        };
        service.registerVariable(avoidanceVar);
        service.registerResolver(avoidanceVar, {
            canResolve: (req: AIVariableResolutionRequest) => req.variable.name === 'avoidance_ledger' ? 100 : 0,
            resolve: async (req: AIVariableResolutionRequest): Promise<ResolvedAIVariable> => {
                const content = await this.fetchChipContent('avoidance_ledger');
                return {
                    variable: req.variable,
                    value: content || 'No avoidance ledger records found.'
                };
            }
        });
    }
}
