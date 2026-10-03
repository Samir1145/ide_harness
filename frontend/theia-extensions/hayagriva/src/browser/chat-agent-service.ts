import { injectable } from '@theia/core/shared/inversify';
import {
  ChatAgentService,
  ChatAgentServiceImpl
} from '@theia/ai-chat/lib/common/chat-agent-service';
import { ChatAgent } from '@theia/ai-chat/lib/common/chat-agents';

@injectable()
export class HayagrivaChatAgentServiceImpl extends ChatAgentServiceImpl implements ChatAgentService {

  /**
   * Filter available agents to return ONLY Hayagriva Legal & Insolvency domain agents.
   * Strips out built-in developer/software-engineering agents (@workspace, @editor, @terminal, @claude, etc.).
   */
  protected override get agents(): ChatAgent[] {
    const rawAgents = super.agents;
    const filtered = rawAgents.filter(agent => {
      const id = (agent.id || '').toLowerCase();
      const tags = (agent.tags || []).map(t => t.toLowerCase());

      const isLegalDomain = 
        id.startsWith('hayagriva') ||
        tags.includes('hayagriva') ||
        tags.includes('legal') ||
        tags.includes('insolvency') ||
        tags.includes('claims') ||
        tags.includes('finance') ||
        ['askhaya', 'advisor', 'forms', 'document', 'claims', 'claim-prep', 'claim_prep', 'claim_preparation', 'claim_preparer', 'claim-preparer', 'claim-verify', 'claim_verification', 'claim_verifier', 'claim-verifier', 'im', 'plan', 'avoidance', 'litigation', 'precedent'].some(k => id === k || id === `hayagriva-${k}`);

      return isLegalDomain;
    });

    filtered.sort((a, b) => {
      if (a.id === 'Advisor') return -1;
      if (b.id === 'Advisor') return 1;
      return 0;
    });

    return filtered;
  }

  override getDefaultAgent(): ChatAgent | undefined {
    return this.getAgent('Advisor') || this.getAgent('advisor') || this.getAgents()[0];
  }

  override getFallbackAgent(): ChatAgent | undefined {
    return this.getAgent('Advisor') || this.getAgent('advisor') || this.getAgents()[0];
  }

  override getPreferenceDefaultAgent(): ChatAgent | undefined {
    const prefAgent = super.getPreferenceDefaultAgent();
    if (prefAgent && (prefAgent.id === 'Advisor' || prefAgent.id === 'advisor')) {
      return prefAgent;
    }
    return this.getAgent('Advisor') || prefAgent || this.getDefaultAgent();
  }

  override getEffectiveDefaultAgent(): ChatAgent | undefined {
    return this.getAgent('Advisor') || this.getPreferenceDefaultAgent() || this.getDefaultAgent();
  }
}
