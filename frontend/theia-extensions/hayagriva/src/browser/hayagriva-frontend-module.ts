import { ContainerModule } from 'inversify';
import { FrontendApplicationContribution, OpenHandler, KeybindingContribution } from '@theia/core/lib/browser';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { WindowTitleContribution } from '@theia/core/lib/browser/window/window-title-service';


import { HayagrivaFrontendContribution } from './extension';
import { HayagrivaCommandContribution } from './commands';
import { HayagrivaMenuContribution } from './menus';
import { HayagrivaEditorDecorator } from './highlight-decorator';
import { HayagrivaTreeDecorator } from './tree-decorator';
import { HayagrivaLspClient } from './lsp-client';
import { HayagrivaMonacoProviders } from './monaco-providers';
import { HayagrivaPreviewManager } from './preview-manager';
import { AskHayaVoiceOrb } from './askhaya-orb';
import { AuthManager } from './auth-manager';
import { AuthModal } from './auth-modal';
import { ProfileWidget } from './profile-widget';
import { NavigatorTreeDecorator } from '@theia/navigator/lib/browser/navigator-decorator-service';
import { PreferenceContribution } from '@theia/core/lib/common/preferences';
import { hayagrivaPreferenceSchema } from './extension';
import { ChatAgent } from '@theia/ai-chat/lib/common/chat-agents';
import {
  AdvisorChatAgent,
  FormsChatAgent,
  DocumentChatAgent,
  ClaimsVerificationChatAgent,
  ClaimPreparationChatAgent,
  ClaimVerificationChatAgent,
  ImCompilerChatAgent,
  ResolutionPlanEvaluatorChatAgent,
  AvoidanceScannerChatAgent,
  LitigationTrackerChatAgent,
  PrecedentChatAgent
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

import {
  ChatAgentService,
  ChatAgentServiceImpl,
  DefaultChatAgentId,
  FallbackChatAgentId
} from '@theia/ai-chat/lib/common/chat-agent-service';
import { HayagrivaChatAgentServiceImpl } from './chat-agent-service';
import { ChatWelcomeMessageProvider } from '@theia/ai-chat-ui/lib/browser/chat-tree-view';
import { HayagrivaChatWelcomeMessageProvider } from './chat-welcome-message';
import { NavigatorWidgetFactory, EXPLORER_VIEW_CONTAINER_ID, EXPLORER_VIEW_CONTAINER_TITLE_OPTIONS } from '@theia/navigator/lib/browser/navigator-widget-factory';
import { FILE_NAVIGATOR_ID } from '@theia/navigator/lib/browser/navigator-widget';
import { ViewContainer } from '@theia/core/lib/browser/view-container';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class HayagrivaNavigatorWidgetFactory extends NavigatorWidgetFactory {
  override async createWidget(): Promise<ViewContainer> {
    const viewContainer = this.viewContainerFactory({
      id: EXPLORER_VIEW_CONTAINER_ID,
      progressLocationId: 'explorer'
    });
    viewContainer.setTitleOptions(EXPLORER_VIEW_CONTAINER_TITLE_OPTIONS);
    const navigatorWidget = await this.widgetManager.getOrCreateWidget(FILE_NAVIGATOR_ID);
    viewContainer.addWidget(navigatorWidget, this.fileNavigatorWidgetOptions);
    // Permanently eliminate OpenEditorsWidget from Explorer ViewContainer
    return viewContainer;
  }
}

@injectable()
export class HayagrivaWindowTitleContribution implements WindowTitleContribution {
  enhanceTitle(title: string, _parts: Map<string, string | undefined>): string {
    const appName = 'Hayagriva';
    if (!title || title.trim().length === 0) {
      return appName;
    }
    if (!title.includes(appName)) {
      return `${title} — ${appName}`;
    }
    return title;
  }
}

export default new ContainerModule((bind, unbind, isBound, rebind) => {
  // Bind preference contribution
  bind(PreferenceContribution).toConstantValue({ schema: hayagrivaPreferenceSchema });
  
  // Bind auxiliary modular services
  bind(HayagrivaEditorDecorator).toSelf().inSingletonScope();
  bind(HayagrivaLspClient).toSelf().inSingletonScope();
  bind(HayagrivaMonacoProviders).toSelf().inSingletonScope();
  bind(HayagrivaPreviewManager).toSelf().inSingletonScope();
  bind(AskHayaVoiceOrb).toSelf().inSingletonScope();
  bind(AuthManager).toSelf().inSingletonScope();
  bind(AuthModal).toSelf().inSingletonScope();
  bind(ProfileWidget).toSelf().inSingletonScope();

  // Bind File Tree Status color-coding decorator to the native NavigatorTreeDecorator
  bind(HayagrivaTreeDecorator).toSelf().inSingletonScope();
  bind(NavigatorTreeDecorator).toService(HayagrivaTreeDecorator);

  // Rebind NavigatorWidgetFactory to permanently eliminate Open Editors from Explorer ViewContainer
  bind(HayagrivaNavigatorWidgetFactory).toSelf().inSingletonScope();
  rebind(NavigatorWidgetFactory).to(HayagrivaNavigatorWidgetFactory).inSingletonScope();

  // Bind main Event Broker / Contribution entry point
  bind(HayagrivaFrontendContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(HayagrivaFrontendContribution);
  bind(OpenHandler).toService(HayagrivaFrontendContribution);
  bind(TabBarToolbarContribution).toService(HayagrivaFrontendContribution);

  // Bind separate commands & keybindings registry
  bind(HayagrivaCommandContribution).toSelf().inSingletonScope();
  bind(CommandContribution).toService(HayagrivaCommandContribution);
  bind(KeybindingContribution).toService(HayagrivaCommandContribution);

  // Bind separate menus registry
  bind(HayagrivaMenuContribution).toSelf().inSingletonScope();
  bind(MenuContribution).toService(HayagrivaMenuContribution);

  // Bind custom Chat Agents (Written In-Chamber Coworkers)
  bind(ChatAgent).to(AdvisorChatAgent).inSingletonScope();
  bind(ChatAgent).to(FormsChatAgent).inSingletonScope();
  bind(ChatAgent).to(DocumentChatAgent).inSingletonScope();
  bind(ChatAgent).to(ClaimsVerificationChatAgent).inSingletonScope();
  bind(ChatAgent).to(ClaimPreparationChatAgent).inSingletonScope();
  bind(ChatAgent).to(ClaimVerificationChatAgent).inSingletonScope();
  bind(ChatAgent).to(ImCompilerChatAgent).inSingletonScope();
  bind(ChatAgent).to(ResolutionPlanEvaluatorChatAgent).inSingletonScope();
  bind(ChatAgent).to(AvoidanceScannerChatAgent).inSingletonScope();
  bind(ChatAgent).to(LitigationTrackerChatAgent).inSingletonScope();
  bind(ChatAgent).to(PrecedentChatAgent).inSingletonScope();

  // Enforce HayagrivaChatAgentService (purges all non-legal/developer agents from UI)
  rebind(ChatAgentServiceImpl).to(HayagrivaChatAgentServiceImpl).inSingletonScope();
  rebind(ChatAgentService).toService(ChatAgentServiceImpl);

  // Set default & fallback chat agent to @Advisor (Legal Strategist & Coworker Coordinator)
  if (isBound(DefaultChatAgentId)) {
    rebind(DefaultChatAgentId).toConstantValue({ id: 'Advisor' });
  } else {
    bind(DefaultChatAgentId).toConstantValue({ id: 'Advisor' });
  }
  if (isBound(FallbackChatAgentId)) {
    rebind(FallbackChatAgentId).toConstantValue({ id: 'Advisor' });
  } else {
    bind(FallbackChatAgentId).toConstantValue({ id: 'Advisor' });
  }

  // Bind Sovereign Legal Chat Welcome Banner (@AskHaya Senior Partner)
  bind(HayagrivaChatWelcomeMessageProvider).toSelf().inSingletonScope();
  bind(ChatWelcomeMessageProvider).toService(HayagrivaChatWelcomeMessageProvider);

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

  // Bind Sovereign Legal Workbench Window Title (Ensure Hayagriva is always displayed in the browser tab)
  bind(HayagrivaWindowTitleContribution).toSelf().inSingletonScope();
  bind(WindowTitleContribution).toService(HayagrivaWindowTitleContribution);
});
