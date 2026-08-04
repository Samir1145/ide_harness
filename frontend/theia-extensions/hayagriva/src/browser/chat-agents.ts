import { inject, optional, injectable } from '@theia/core/shared/inversify';
import { ChatAgent, ChatAgentLocation } from '@theia/ai-chat/lib/common/chat-agents';
import { MutableChatRequestModel, ErrorChatResponseContentImpl, MarkdownChatResponseContentImpl } from '@theia/ai-chat/lib/common/chat-model';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { PreferenceService } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { LanguageModelRequirement } from '@theia/ai-core';
import { OutputChannelManager } from '@theia/output/lib/browser/output-channel';

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
  readonly requiresLargeModel: boolean = false;

  constructor(
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService,
    @inject(OutputChannelManager) @optional() protected readonly outputChannelManager?: OutputChannelManager
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

  async invoke(request: MutableChatRequestModel): Promise<void> {
    const progress = request.response.addProgressMessage({ content: `Routing query to ${this.name}...` });
    
    const userMessage = request.request.text;
    const currentCase = this.getCaseName();

    if (this.requiresLargeModel) {
      try {
        const modelRes = await fetch(`${this.getBackendUrl()}/api/hayagriva/llm/model-info?case=${encodeURIComponent(currentCase)}`);
        if (modelRes.ok) {
          const modelInfo = await modelRes.json();
          if (modelInfo && modelInfo.tier === 'small') {
            request.response.response.addContent(new MarkdownChatResponseContentImpl(
              `> ⚠️ **Model Quality Notice:** You are running **${modelInfo.modelName}** (${modelInfo.sizeB}B parameters). ` +
              `This agent produces significantly better results with a **7B+ model or Cloud API**. ` +
              `Results may be incomplete or imprecise.\n\n`
            ));
          }
        }
      } catch (e) {
        console.warn('[HAYAGRIVA] Failed to check model-info for quality badge:', e);
      }
    }

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
        let errMsg = `Backend returned status code ${res.status}`;
        try {
          const errData = await res.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }

      const data = await res.json();
      const responseText = data.response || 'No response returned from agent.';

      // Stream logs to IDE Output Channel
      if (this.outputChannelManager && Array.isArray(data.logs) && data.logs.length > 0) {
        try {
          const channel = this.outputChannelManager.getChannel('Hayagriva AI Agent Logs');
          data.logs.forEach((l: any) => {
            channel.appendLine(`[${l.timestamp}] [${l.agent}:${l.phase}] ${l.message}`);
          });
        } catch (e) {
          console.warn('[HAYAGRIVA] Output channel log stream error:', e);
        }
      }
      
      request.response.response.addContent(new MarkdownChatResponseContentImpl(responseText));
    } catch (err: any) {
      request.response.response.addContent(new ErrorChatResponseContentImpl(err));
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
  readonly description = 'Legal research & precedents. Commands: /strength (score grounds), /analyse-order (decode orders)';
  readonly iconClass = 'codicon codicon-law';
}

@injectable()
export class FormsChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Forms';
  readonly name = 'Forms';
  readonly description = 'Audit & fill statutory forms. Commands: /fill ibbi-form-a, /fill ibbi-form-b, /fill ibbi-h, /fill aoc-4';
  readonly iconClass = 'codicon codicon-checklist';
}

@injectable()
export class DocumentChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Document';
  readonly name = 'Document';
  readonly description = 'Draft court petitions & filings. Commands: /draft sec7-petition, /draft sec9-petition, /draft slp-sc, /draft ibc-sec61-appeal';
  readonly iconClass = 'codicon codicon-diff-added';
}

@injectable()
export class ClaimsVerificationChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Claims';
  readonly name = 'Claims';
  readonly description = 'Audit creditor claims & debt voting shares. Commands: /claims-check';
  readonly iconClass = 'codicon codicon-briefcase';
  override readonly requiresLargeModel = true;
}

@injectable()
export class ImCompilerChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'IM';
  readonly name = 'IM';
  readonly description = 'Compile Reg 36 Information Memorandum. Commands: /im-build';
  readonly iconClass = 'codicon codicon-book';
  override readonly requiresLargeModel = true;
}

@injectable()
export class ResolutionPlanEvaluatorChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Plan';
  readonly name = 'Plan';
  readonly description = 'Audit Sec 30(2) & Reg 39(4) Resolution Plans. Commands: /plan-audit';
  readonly iconClass = 'codicon codicon-compass';
  override readonly requiresLargeModel = true;
}

@injectable()
export class AvoidanceScannerChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Avoidance';
  readonly name = 'Avoidance';
  readonly description = 'Audit Sec 43/45/49/50 avoidance transactions. Commands: /avoidance-scan';
  readonly iconClass = 'codicon codicon-search';
  override readonly requiresLargeModel = true;
}

@injectable()
export class LitigationTrackerChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Litigation';
  readonly name = 'Litigation';
  readonly description = 'NCLT bench briefs & counter-arguments. Commands: /brief, /counter, /timeline';
  readonly iconClass = 'codicon codicon-issue-opened';
}
