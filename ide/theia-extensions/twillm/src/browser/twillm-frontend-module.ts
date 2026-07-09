import { ContainerModule } from 'inversify';
import { FrontendApplicationContribution, OpenHandler } from '@theia/core/lib/browser';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { TwillmFrontendContribution } from './extension';
import { TwillmCommandContribution } from './commands';
import { TwillmMenuContribution } from './menus';
import { TwillmEditorDecorator } from './highlight-decorator';

export default new ContainerModule((bind) => {
  // Bind Monaco Editor highlight decorator
  bind(TwillmEditorDecorator).toSelf().inSingletonScope();

  // Bind main Event Broker / Contribution entry point
  bind(TwillmFrontendContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(TwillmFrontendContribution);
  bind(OpenHandler).toService(TwillmFrontendContribution);
  bind(TabBarToolbarContribution).toService(TwillmFrontendContribution);

  // Bind separate commands registry
  bind(TwillmCommandContribution).toSelf().inSingletonScope();
  bind(CommandContribution).toService(TwillmCommandContribution);

  // Bind separate menus registry
  bind(TwillmMenuContribution).toSelf().inSingletonScope();
  bind(MenuContribution).toService(TwillmMenuContribution);
});
