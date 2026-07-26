import { ContainerModule } from 'inversify';
import { FrontendApplicationContribution, OpenHandler } from '@theia/core/lib/browser';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { HayagrivaFrontendContribution } from './extension';
import { HayagrivaCommandContribution } from './commands';
import { HayagrivaMenuContribution } from './menus';
import { HayagrivaEditorDecorator } from './highlight-decorator';
import { HayagrivaTreeDecorator } from './tree-decorator';
import { NavigatorTreeDecorator } from '@theia/navigator/lib/browser/navigator-decorator-service';
import { PreferenceContribution } from '@theia/core/lib/common/preferences';
import { hayagrivaPreferenceSchema } from './extension';
import { ChatAgent } from '@theia/ai-chat/lib/common/chat-agents';
import {
  AdvisorChatAgent,
  FormsChatAgent,
  DocumentChatAgent,
  ClaimsVerificationChatAgent,
  ImCompilerChatAgent,
  ResolutionPlanEvaluatorChatAgent,
  AvoidanceScannerChatAgent,
  LitigationTrackerChatAgent
} from './chat-agents';

export default new ContainerModule((bind) => {
  // Bind preference contribution
  bind(PreferenceContribution).toConstantValue({ schema: hayagrivaPreferenceSchema });
  // Bind Monaco Editor highlight decorator
  bind(HayagrivaEditorDecorator).toSelf().inSingletonScope();

  // Bind File Tree Status color-coding decorator to the native NavigatorTreeDecorator
  bind(HayagrivaTreeDecorator).toSelf().inSingletonScope();
  bind(NavigatorTreeDecorator).to(HayagrivaTreeDecorator).inSingletonScope();

  // Bind main Event Broker / Contribution entry point
  bind(HayagrivaFrontendContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(HayagrivaFrontendContribution);
  bind(OpenHandler).toService(HayagrivaFrontendContribution);
  bind(TabBarToolbarContribution).toService(HayagrivaFrontendContribution);

  // Bind separate commands registry
  bind(HayagrivaCommandContribution).toSelf().inSingletonScope();
  bind(CommandContribution).toService(HayagrivaCommandContribution);

  // Bind separate menus registry
  bind(HayagrivaMenuContribution).toSelf().inSingletonScope();
  bind(MenuContribution).toService(HayagrivaMenuContribution);

  // Bind custom Chat Agents
  bind(ChatAgent).to(AdvisorChatAgent).inSingletonScope();
  bind(ChatAgent).to(FormsChatAgent).inSingletonScope();
  bind(ChatAgent).to(DocumentChatAgent).inSingletonScope();
  bind(ChatAgent).to(ClaimsVerificationChatAgent).inSingletonScope();
  bind(ChatAgent).to(ImCompilerChatAgent).inSingletonScope();
  bind(ChatAgent).to(ResolutionPlanEvaluatorChatAgent).inSingletonScope();
  bind(ChatAgent).to(AvoidanceScannerChatAgent).inSingletonScope();
  bind(ChatAgent).to(LitigationTrackerChatAgent).inSingletonScope();
});
