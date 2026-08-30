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
    return rawAgents.filter(agent => {
      const id = (agent.id || '').toLowerCase();
      const tags = (agent.tags || []).map(t => t.toLowerCase());

      const isLegalDomain = 
        id.startsWith('hayagriva') ||
        tags.includes('hayagriva') ||
        tags.includes('legal') ||
        tags.includes('insolvency') ||
        tags.includes('claims') ||
        tags.includes('finance') ||
        ['advisor', 'forms', 'document', 'claims', 'claim-prep', 'claim_prep', 'claim_preparation', 'claim-prep', 'claim_preparer', 'claim-preparer', 'claim-verify', 'claim_verification', 'claim_verifier', 'claim-verifier', 'im', 'plan', 'avoidance', 'litigation'].some(k => id === k || id === `hayagriva-${k}`);

      return isLegalDomain;
    });
  }

  override getDefaultAgent(): ChatAgent | undefined {
    return this.getAgent('hayagriva-advisor') || this.getAgent('advisor') || this.getAgents()[0];
  }

  override getFallbackAgent(): ChatAgent | undefined {
    return this.getAgent('hayagriva-advisor') || this.getAgent('advisor') || this.getAgents()[0];
  }

  override getEffectiveDefaultAgent(): ChatAgent | undefined {
    const prefAgent = this.getPreferenceDefaultAgent();
    if (prefAgent) {
      return prefAgent;
    }
    return this.getDefaultAgent();
  }
}
