import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatAgent, ChatAgentLocation } from '@theia/ai-chat/lib/common/chat-agents';
import { MutableChatRequestModel } from '@theia/ai-chat/lib/common/chat-model';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { PreferenceService } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { LanguageModelRequirement } from '@theia/ai-core';

@injectable()
export abstract class BaseHayagrivaChatAgent implements ChatAgent {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly iconClass: string;

  readonly locations = [ChatAgentLocation.Panel];
  readonly variables = [];
  readonly prompts = [];
  readonly languageModelRequirements: LanguageModelRequirement[] = [{ purpose: 'chat' }];
  readonly agentSpecificVariables = [];
  readonly functions = [];

  constructor(
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService
  ) {}

  protected getBackendUrl(): string {
    const port = this.preferenceService.get('hayagriva.apiPort') || 3210;
    return `http://127.0.0.1:${port}`;
  }

  protected getCaseName(): string {
    let caseName = 'Case_Alpha';
    const ws = this.workspaceService.getWorkspaceRootUri(undefined);
    if (ws) {
      const parts = new URI(ws.toString()).path.toString().split(/[\\/]/);
      caseName = parts[parts.length - 1];
    }
    return caseName;
  }

  async invoke(request: MutableChatRequestModel): Promise<void> {
    const progress = request.response.addProgressMessage({ content: `Routing query to ${this.name}...` });
    
    const userMessage = request.request.text;
    const currentCase = this.getCaseName();

    try {
      const url = `${this.getBackendUrl()}/api/agents/chat`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case: currentCase,
          agent: this.id.toLowerCase(),
          message: userMessage,
          history: [] // Can be extended with request.session history if needed
        })
      });

      if (!res.ok) {
        throw new Error(`Backend returned status code ${res.status}`);
      }

      const data = await res.json();
      const responseText = data.response || 'No response returned from agent.';
      
      request.response.response.addContent({
        kind: 'text',
        content: responseText
      } as any);
    } catch (err: any) {
      request.response.response.addContent({
        kind: 'text',
        content: `❌ Error communicating with ${this.name}: ${err.message}`
      } as any);
    } finally {
      request.response.updateProgressMessage({ id: progress.id, content: 'Done.' });
      request.response.complete();
    }
  }
}

@injectable()
export class AdvisorChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Advisor';
  readonly name = 'Advisor';
  readonly description = 'Consult legal statutes, IBC codes, regulations, and case precedents.';
  readonly iconClass = 'codicon codicon-law';
}

@injectable()
export class FormsChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Forms';
  readonly name = 'Forms';
  readonly description = 'Audit legal and financial forms, run math logic, and check timelines.';
  readonly iconClass = 'codicon codicon-checklist';
}

@injectable()
export class DocumentChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Document';
  readonly name = 'Document';
  readonly description = 'Draft documents, resolutions, and compile narrative sections.';
  readonly iconClass = 'codicon codicon-diff-added';
}

@injectable()
export class ClaimsVerificationChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Claims';
  readonly name = 'Claims';
  readonly description = 'Audit creditor claims, calculate interest rates, and verify balances.';
  readonly iconClass = 'codicon codicon-briefcase';
}

@injectable()
export class ImCompilerChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'IM';
  readonly name = 'IM';
  readonly description = 'Compile the Information Memorandum (IM) under Regulation 36 of CIRP.';
  readonly iconClass = 'codicon codicon-book';
}

@injectable()
export class ResolutionPlanEvaluatorChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Plan';
  readonly name = 'Plan';
  readonly description = 'Audit submitted resolution plans against Section 30(2) parameters.';
  readonly iconClass = 'codicon codicon-compass';
}

@injectable()
export class AvoidanceScannerChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Avoidance';
  readonly name = 'Avoidance';
  readonly description = 'Scan financial ledgers and party relationships for avoidance transactions.';
  readonly iconClass = 'codicon codicon-search';
}

@injectable()
export class NcltDrafterChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'NCLT';
  readonly name = 'NCLT';
  readonly description = 'Generate and draft petitions, synopsis of dates, and legal affidavits.';
  readonly iconClass = 'codicon codicon-edit';
}

@injectable()
export class LitigationTrackerChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Litigation';
  readonly name = 'Litigation';
  readonly description = 'Track active court disputes and query case law precedents.';
  readonly iconClass = 'codicon codicon-issue-opened';
}
