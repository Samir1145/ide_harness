import { injectable } from '@theia/core/shared/inversify';
import { MenuContribution, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution';

const TWILLM_NS = 'twillm';
const WIKI_MENU = [...CommonMenus.VIEW, 'wiki'];

@injectable()
export class TwillmMenuContribution implements MenuContribution {
  registerMenus(registry: MenuModelRegistry): void {
    registry.registerSubmenu(WIKI_MENU, 'Wiki');
    registry.registerMenuAction(WIKI_MENU, { commandId: `${TWILLM_NS}:ingest`, label: 'Ingest Document', order: '1' });
    registry.registerMenuAction(WIKI_MENU, { commandId: `${TWILLM_NS}:openWiki`, label: 'Open Companion Wiki', order: '2' });
    registry.registerMenuAction(WIKI_MENU, { commandId: `${TWILLM_NS}:openCaseDashboard`, label: 'Open Case Dashboard Wiki', order: '3' });
    registry.registerMenuAction(WIKI_MENU, { commandId: `${TWILLM_NS}:openRagChat`, label: 'RAG Chat', order: '4' });
    registry.registerMenuAction(WIKI_MENU, { commandId: `${TWILLM_NS}:openUploadSplit`, label: 'Upload and Split...', order: '5' });

    // File Editor right click menu
    registry.registerMenuAction(['editor_context_menu'], {
      commandId: `${TWILLM_NS}:compareDocuments`,
      label: 'Compare with... (Diff)',
      order: '1'
    });

    // Outline panel context menu node actions
    registry.registerMenuAction(['outline.context'], { commandId: `${TWILLM_NS}:outlineAskRag`, label: 'Ask about this section', order: '1' });
    registry.registerMenuAction(['outline.context'], { commandId: `${TWILLM_NS}:outlineFindRelated`, label: 'Find related pages', order: '2' });
    registry.registerMenuAction(['outline.context'], { commandId: `${TWILLM_NS}:outlineAddToWiki`, label: 'Add to Wiki', order: '3' });
  }
}
