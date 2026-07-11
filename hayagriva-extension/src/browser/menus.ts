import { injectable } from '@theia/core/shared/inversify';
import { MenuContribution, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution';

const HAYAGRIVA_NS = 'hayagriva';
const WIKI_MENU = [...CommonMenus.VIEW, 'wiki'];

@injectable()
export class HayagrivaMenuContribution implements MenuContribution {
  registerMenus(registry: MenuModelRegistry): void {
    registry.registerSubmenu(WIKI_MENU, 'Wiki');
    registry.registerMenuAction(WIKI_MENU, { commandId: `${HAYAGRIVA_NS}:ingest`, label: 'Ingest Document', order: '1' });
    registry.registerMenuAction(WIKI_MENU, { commandId: `${HAYAGRIVA_NS}:openWiki`, label: 'Open Companion Wiki', order: '2' });
    registry.registerMenuAction(WIKI_MENU, { commandId: `${HAYAGRIVA_NS}:openCaseDashboard`, label: 'Open Case Dashboard Wiki', order: '3' });
    registry.registerMenuAction(WIKI_MENU, { commandId: `${HAYAGRIVA_NS}:openRagChat`, label: 'RAG Chat', order: '4' });
    registry.registerMenuAction(WIKI_MENU, { commandId: `${HAYAGRIVA_NS}:openUploadSplit`, label: 'Upload and Split...', order: '5' });
    registry.registerMenuAction(WIKI_MENU, { commandId: `${HAYAGRIVA_NS}:openKvEditor`, label: 'Case KV Dictionary', order: '6' });
    registry.registerMenuAction(WIKI_MENU, { commandId: `${HAYAGRIVA_NS}:openFormEditor`, label: 'Form Review Dashboard', order: '7' });
    registry.registerMenuAction(WIKI_MENU, { commandId: `${HAYAGRIVA_NS}:openDraftingPanel`, label: 'Drafting Panel', order: '8' });
    registry.registerMenuAction(WIKI_MENU, { commandId: `${HAYAGRIVA_NS}:openCaseGraph`, label: 'Visual Case Map', order: '9' });

    // File menu actions
    registry.registerMenuAction([...CommonMenus.FILE, '1_hayagriva'], {
      commandId: `${HAYAGRIVA_NS}:openUploadSplit`,
      label: 'Upload to Hayagriva...',
    });
    registry.registerMenuAction([...CommonMenus.FILE, '1_hayagriva'], {
      commandId: `${HAYAGRIVA_NS}:openCaseGraph`,
      label: 'Visual Case Map...',
    });

    // File Editor right click menu
    registry.registerMenuAction(['editor_context_menu'], {
      commandId: `${HAYAGRIVA_NS}:compareDocuments`,
      label: 'Compare with... (Diff)',
      order: '1'
    });

    // Outline panel context menu node actions
    registry.registerMenuAction(['outline.context'], { commandId: `${HAYAGRIVA_NS}:outlineAskRag`, label: 'Ask about this section', order: '1' });
    registry.registerMenuAction(['outline.context'], { commandId: `${HAYAGRIVA_NS}:outlineFindRelated`, label: 'Find related pages', order: '2' });
    registry.registerMenuAction(['outline.context'], { commandId: `${HAYAGRIVA_NS}:outlineAddToWiki`, label: 'Add to Wiki', order: '3' });
  }
}
