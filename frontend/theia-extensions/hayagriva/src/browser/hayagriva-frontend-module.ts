import { ContainerModule } from 'inversify';
import { FrontendApplicationContribution, OpenHandler } from '@theia/core/lib/browser';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { HayagrivaFrontendContribution } from './extension';
import { HayagrivaCommandContribution } from './commands';
import { HayagrivaMenuContribution } from './menus';
import { HayagrivaEditorDecorator } from './highlight-decorator';
import { HayagrivaTreeDecorator } from './tree-decorator';
import { HayagrivaLspClient } from './lsp-client';
import { HayagrivaMonacoProviders } from './monaco-providers';
import { HayagrivaPreviewManager } from './preview-manager';
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
import {
  AiConfigurationCategory,
  HayagrivaEngineCategoryContribution,
  HayagrivaAgentsCategoryContribution,
  HayagrivaRagCategoryContribution
} from './ai-configuration-category';
import { bindToolProvider } from '@theia/ai-core/lib/common/tool-invocation-registry';
import {
  RetrieveContextsToolProvider,
  GetKVValueToolProvider,
  QueryTimelineToolProvider,
  VaultLookupToolProvider,
  CrossReferenceToolProvider
} from './hayagriva-tools';
import { VariableContribution } from '@theia/variable-resolver/lib/browser/variable';
import { HayagrivaVariableContribution } from './hayagriva-variables';
import { AIVariableContribution } from '@theia/ai-core';
import { HayagrivaContextChipsContribution } from './hayagriva-context-chips';

export default new ContainerModule((bind) => {
  // Bind preference contribution
  bind(PreferenceContribution).toConstantValue({ schema: hayagrivaPreferenceSchema });
  
  // Bind auxiliary modular services
  bind(HayagrivaEditorDecorator).toSelf().inSingletonScope();
  bind(HayagrivaLspClient).toSelf().inSingletonScope();
  bind(HayagrivaMonacoProviders).toSelf().inSingletonScope();
  bind(HayagrivaPreviewManager).toSelf().inSingletonScope();

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

  // Bind AI Configuration Categories (Forward-compatible for Theia AI Config View)
  bind(HayagrivaEngineCategoryContribution).toSelf().inSingletonScope();
  bind(AiConfigurationCategory).toService(HayagrivaEngineCategoryContribution);
  bind(HayagrivaAgentsCategoryContribution).toSelf().inSingletonScope();
  bind(AiConfigurationCategory).toService(HayagrivaAgentsCategoryContribution);
  bind(HayagrivaRagCategoryContribution).toSelf().inSingletonScope();
  bind(AiConfigurationCategory).toService(HayagrivaRagCategoryContribution);

  // Bind AI Tool Providers for function calling & autonomous agent tool requests
  bindToolProvider(RetrieveContextsToolProvider, bind);
  bindToolProvider(GetKVValueToolProvider, bind);
  bindToolProvider(QueryTimelineToolProvider, bind);
  bindToolProvider(VaultLookupToolProvider, bind);
  bindToolProvider(CrossReferenceToolProvider, bind);

  // Bind Dynamic Variable Resolvers (${caseName}, ${memoryDirectory}, ${activeFile})
  bind(HayagrivaVariableContribution).toSelf().inSingletonScope();
  bind(VariableContribution).toService(HayagrivaVariableContribution);

  // Bind AI Context Chips (#case_facts, #timeline, #claims_registry, #avoidance_ledger)
  bind(HayagrivaContextChipsContribution).toSelf().inSingletonScope();
  bind(AIVariableContribution).toService(HayagrivaContextChipsContribution);
});
