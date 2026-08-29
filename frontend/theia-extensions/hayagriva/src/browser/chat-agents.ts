import { inject, optional, injectable } from '@theia/core/shared/inversify';
import { ChatAgent, ChatAgentLocation, ChatMode } from '@theia/ai-chat/lib/common/chat-agents';
import { MutableChatRequestModel, ErrorChatResponseContentImpl, MarkdownChatResponseContentImpl } from '@theia/ai-chat/lib/common/chat-model';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { PreferenceService } from '@theia/core/lib/common';
import { ILogger } from '@theia/core/lib/common/logger';
import URI from '@theia/core/lib/common/uri';
import { LanguageModelRequirement, AgentSpecificVariables, PromptVariantSet } from '@theia/ai-core';
import { OutputChannelManager } from '@theia/output/lib/browser/output-channel';
import { EditorManager } from '@theia/editor/lib/browser';

@injectable()
export abstract class BaseHayagrivaChatAgent implements ChatAgent {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly iconClass: string;

  readonly locations = [ChatAgentLocation.Panel];
  readonly variables: string[] = ['caseName', 'activeFile', 'memoryDirectory'];
  readonly prompts: PromptVariantSet[] = [];
  readonly languageModelRequirements: LanguageModelRequirement[] = [{ purpose: 'chat' }];
  readonly agentSpecificVariables: AgentSpecificVariables[] = [
    { name: 'caseName', description: 'Active case folder path in workspace', usedInPrompt: true },
    { name: 'memoryDirectory', description: 'Per-case wiki & structured facts repository', usedInPrompt: true }
  ];
  readonly functions: string[] = ['retrieveContexts', 'getKVValue', 'queryTimeline'];
  readonly tags?: string[] = ['hayagriva', 'legal'];
  readonly modes?: ChatMode[] = [];
  readonly requiresLargeModel: boolean = false;

  constructor(
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService,
    @inject(ILogger) protected readonly logger: ILogger,
    @inject(EditorManager) @optional() protected readonly editorManager?: EditorManager,
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
    const activeMode = request.request.modeId || 'default';

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
      } catch (e: any) {
        this.logger.warn(`[HAYAGRIVA] Failed to check model-info for quality badge: ${e ? e.message : e}`);
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
          mode: activeMode,
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
        } catch (e: any) {
          this.logger.warn(`[HAYAGRIVA] Output channel log stream error: ${e ? e.message : e}`);
        }
      }
      
      request.response.response.addContent(new MarkdownChatResponseContentImpl(responseText));

      // Auto-Open generated claim drafts / verification reports in Monaco Editor (Middle Panel)
      if (this.editorManager && currentCase) {
        const draftMatch = responseText.match(/(?:drafts|claims)[\/\\][a-zA-Z0-9_.\-]+\.md/i);
        if (draftMatch) {
          try {
            const relPath = draftMatch[0].replace(/\\/g, '/');
            const cleanCase = currentCase.replace(/\/+$/, '');
            const targetUri = new URI(`file://${cleanCase}/${relPath}`);
            setTimeout(() => {
              this.editorManager?.open(targetUri);
            }, 150);
          } catch (e: any) {
            this.logger.warn(`[HAYAGRIVA] Auto-open draft error: ${e ? e.message : e}`);
          }
        }
      }
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
  override readonly tags = ['legal', 'research', 'precedents'];
  override readonly modes: ChatMode[] = [
    { id: 'plan', name: 'Strategy / Plan', isDefault: true },
    { id: 'draft', name: 'Full Advisory' }
  ];
  override readonly prompts: PromptVariantSet[] = [
    {
      id: 'advisor-system-prompt',
      defaultVariant: {
        id: 'default',
        template: 'You are HAYAGRIVA Advisor Agent, an expert legal strategist and counsel co-pilot for Indian insolvency law (IBC 2016 / 2026).'
      },
      variants: [
        {
          id: 'concise',
          template: 'You are HAYAGRIVA Advisor Agent. Provide concise, bulleted strategic legal advice focusing directly on actionable grounds.'
        },
        {
          id: 'precedent-heavy',
          template: 'You are HAYAGRIVA Advisor Agent. Provide deep case law analysis citing Supreme Court and NCLAT precedents with full bench ratios.'
        }
      ]
    }
  ];
}

@injectable()
export class FormsChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Forms';
  readonly name = 'Forms';
  readonly description = 'Audit & fill statutory forms. Commands: /fill ibbi-form-a, /fill ibbi-form-b, /fill ibbi-h, /fill aoc-4';
  readonly iconClass = 'codicon codicon-checklist';
  override readonly tags = ['statutory', 'compliance', 'forms'];
  override readonly modes: ChatMode[] = [
    { id: 'fill', name: 'Auto-Fill', isDefault: true },
    { id: 'audit', name: 'Audit & Cross-Check' }
  ];
  override readonly prompts: PromptVariantSet[] = [
    {
      id: 'forms-system-prompt',
      defaultVariant: {
        id: 'default',
        template: 'You are HAYAGRIVA Forms Agent. Audit statutory compliance and populate statutory IBC / NCLT form fields.'
      },
      variants: [
        {
          id: 'strict-math',
          template: 'You are HAYAGRIVA Forms Agent. Enforce strict mathematical and date chronology verification across all form schedules.'
        }
      ]
    }
  ];
}

@injectable()
export class DocumentChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Document';
  readonly name = 'Document';
  readonly description = 'Draft court petitions & filings. Commands: /draft sec7-petition, /draft sec9-petition, /draft slp-sc, /draft ibc-sec61-appeal';
  readonly iconClass = 'codicon codicon-diff-added';
  override readonly tags = ['litigation', 'petitions', 'drafting'];
  override readonly modes: ChatMode[] = [
    { id: 'plan', name: 'Outline / Skeleton', isDefault: true },
    { id: 'draft', name: 'Full Court Draft' }
  ];
  override readonly prompts: PromptVariantSet[] = [
    {
      id: 'document-system-prompt',
      defaultVariant: {
        id: 'default',
        template: 'You are HAYAGRIVA Document Agent. Draft court petitions, applications, and legal pleadings conforming to NCLT / Supreme Court rules.'
      },
      variants: [
        {
          id: 'outline-only',
          template: 'You are HAYAGRIVA Document Agent. Generate an executive outline and skeleton with grounds, facts, and prayers only.'
        }
      ]
    }
  ];
}

@injectable()
export class ClaimsVerificationChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Claims';
  readonly name = 'Claims';
  readonly description = 'Audit creditor claims & debt voting shares. Commands: /claims-check';
  readonly iconClass = 'codicon codicon-briefcase';
  override readonly tags = ['claims', 'voting-share', 'cirp'];
  override readonly modes: ChatMode[] = [
    { id: 'check', name: 'Verify Claims', isDefault: true },
    { id: 'calculate', name: 'Calculate Voting Shares' }
  ];
  override readonly requiresLargeModel = true;
  override readonly prompts: PromptVariantSet[] = [
    {
      id: 'claims-system-prompt',
      defaultVariant: {
        id: 'default',
        template: 'You are HAYAGRIVA Claims Auditor. Audit creditor claims, compute voting shares, and exclude related party debt under Sec 5(24).'
      },
      variants: [
        {
          id: 'voting-breakdown',
          template: 'You are HAYAGRIVA Claims Auditor. Produce a financial creditor voting share breakdown table with relative percentage formulas.'
        }
      ]
    }
  ];
}

@injectable()
export class ImCompilerChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'IM';
  readonly name = 'IM';
  readonly description = 'Compile Reg 36 Information Memorandum. Commands: /im-build';
  readonly iconClass = 'codicon codicon-book';
  override readonly tags = ['im', 'reg36', 'memorandum'];
  override readonly modes: ChatMode[] = [
    { id: 'build', name: 'Build IM Sections', isDefault: true },
    { id: 'audit', name: 'Information Gap Audit' }
  ];
  override readonly requiresLargeModel = true;
  override readonly prompts: PromptVariantSet[] = [
    {
      id: 'im-system-prompt',
      defaultVariant: {
        id: 'default',
        template: 'You are HAYAGRIVA IM Compiler. Structure and compile Regulation 36 Information Memorandum for Corporate Debtor assets.'
      },
      variants: [
        {
          id: 'gap-audit',
          template: 'You are HAYAGRIVA IM Compiler. Perform an information deficiency audit identifying missing Reg 36 disclosures.'
        }
      ]
    }
  ];
}

@injectable()
export class ResolutionPlanEvaluatorChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Plan';
  readonly name = 'Plan';
  readonly description = 'Audit Sec 30(2) & Reg 39(4) Resolution Plans. Commands: /plan-audit';
  readonly iconClass = 'codicon codicon-compass';
  override readonly tags = ['plan-evaluator', 'sec30', 'form-h'];
  override readonly modes: ChatMode[] = [
    { id: 'audit', name: 'Sec 30(2) Audit', isDefault: true },
    { id: 'formh', name: 'Form H Compliance Certificate' }
  ];
  override readonly requiresLargeModel = true;
  override readonly prompts: PromptVariantSet[] = [
    {
      id: 'plan-system-prompt',
      defaultVariant: {
        id: 'default',
        template: 'You are HAYAGRIVA Plan Evaluator. Audit Resolution Plans under Section 30(2) & Section 29A, compiling Regulation 39(4) Form H certificates.'
      },
      variants: [
        {
          id: 'form-h',
          template: 'You are HAYAGRIVA Plan Evaluator. Generate complete Regulation 39(4) Form H compliance certificate tables.'
        }
      ]
    }
  ];
}

@injectable()
export class AvoidanceScannerChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Avoidance';
  readonly name = 'Avoidance';
  readonly description = 'Audit Sec 43/45/49/50 avoidance transactions. Commands: /avoidance-scan';
  readonly iconClass = 'codicon codicon-search';
  override readonly tags = ['avoidance', 'forensic', 'puda'];
  override readonly modes: ChatMode[] = [
    { id: 'scan', name: 'Lookback Scan', isDefault: true },
    { id: 'puda', name: 'PUDA Audit Classification' }
  ];
  override readonly requiresLargeModel = true;
  override readonly prompts: PromptVariantSet[] = [
    {
      id: 'avoidance-system-prompt',
      defaultVariant: {
        id: 'default',
        template: 'You are HAYAGRIVA Avoidance Scanner. Detect and classify preferential (Sec 43), undervalued (Sec 45), extortionate (Sec 50), and fraudulent (Sec 66) transactions.'
      },
      variants: [
        {
          id: 'puda-forensic',
          template: 'You are HAYAGRIVA Avoidance Scanner. Produce a forensic PUDA lookback ledger with lookback window calculations.'
        }
      ]
    }
  ];
}

@injectable()
export class LitigationTrackerChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Litigation';
  readonly name = 'Litigation';
  readonly description = 'NCLT bench briefs & counter-arguments. Commands: /brief, /counter, /timeline';
  readonly iconClass = 'codicon codicon-issue-opened';
  override readonly tags = ['nclt', 'bench-brief', 'litigation'];
  override readonly modes: ChatMode[] = [
    { id: 'brief', name: 'Bench Brief', isDefault: true },
    { id: 'counter', name: 'Counter Arguments' }
  ];
  override readonly prompts: PromptVariantSet[] = [
    {
      id: 'litigation-system-prompt',
      defaultVariant: {
        id: 'default',
        template: 'You are HAYAGRIVA Litigation Tracker. Generate NCLT bench briefs, track hearing milestones, and formulate strategic counter-arguments.'
      },
      variants: [
        {
          id: 'counter-rebuttal',
          template: 'You are HAYAGRIVA Litigation Tracker. Act as opposing counsel to anticipate defenses and draft counter-rebuttals.'
        }
      ]
    }
  ];
}

@injectable()
export class ClaimPreparationChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Claim_Preparation';
  readonly name = 'Claim-Prep';
  readonly description = 'Draft statutory IBBI claim forms (Form B, C, CA, D, F). Commands: /draft-form-b, /draft-form-c, /draft-form-ca, /draft-form-d, /draft-form-f';
  readonly iconClass = 'codicon codicon-file-text';
  override readonly tags = ['claims', 'form-b', 'form-c', 'form-ca', 'form-d', 'form-f', 'drafting', 'cirp'];
  override readonly modes: ChatMode[] = [
    { id: 'draft', name: 'Draft Form', isDefault: true },
    { id: 'financial', name: 'Form C (Financial)' },
    { id: 'operational', name: 'Form B (Operational)' },
    { id: 'class', name: 'Form CA (Class / Allottee)' }
  ];
  override readonly prompts: PromptVariantSet[] = [
    {
      id: 'claim-prep-system-prompt',
      defaultVariant: {
        id: 'default',
        template: 'You are HAYAGRIVA Claim Preparation Agent. Extract creditor debts and compile statutory IBBI CIRP claim forms (Form B, C, CA, D, F).'
      },
      variants: [
        {
          id: 'strict-interest',
          template: 'You are HAYAGRIVA Claim Preparation Agent. Calculate contractual interest strictly up to the Insolvency Commencement Date.'
        }
      ]
    }
  ];
}

@injectable()
export class ClaimVerificationChatAgent extends BaseHayagrivaChatAgent {
  readonly id = 'Claim_Verification';
  readonly name = 'Claim-Verify';
  readonly description = 'Statutory RP claim audit, limitation check, and voting share calculation. Commands: /verify-claim, /voting-share';
  readonly iconClass = 'codicon codicon-verified';
  override readonly tags = ['claims', 'audit', 'verification', 'limitation', 'voting-share', 'cirp'];
  override readonly modes: ChatMode[] = [
    { id: 'audit', name: 'Statutory Audit', isDefault: true },
    { id: 'voting', name: 'Voting Share & CoC' }
  ];
  override readonly requiresLargeModel = true;
  override readonly prompts: PromptVariantSet[] = [
    {
      id: 'claim-verify-system-prompt',
      defaultVariant: {
        id: 'default',
        template: 'You are HAYAGRIVA Claim Verification Agent. Audit claims against limitation, interest contractual basis, security registration, and Section 5(24) related-party rules.'
      },
      variants: [
        {
          id: 'limitation-focus',
          template: 'You are HAYAGRIVA Claim Verification Agent. Conduct deep scrutiny of Section 238A limitation periods and Section 18 balance sheet acknowledgments.'
        }
      ]
    }
  ];
}

