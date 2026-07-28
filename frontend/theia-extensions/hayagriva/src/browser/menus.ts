import { injectable } from '@theia/core/shared/inversify';
import { MenuContribution, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution';
import { NavigatorContextMenu } from '@theia/navigator/lib/browser/navigator-contribution';

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
    registry.registerMenuAction(WIKI_MENU, { commandId: `${HAYAGRIVA_NS}:openChronology`, label: 'Open Case Chronology', order: '9' });
    registry.registerMenuAction(WIKI_MENU, { commandId: `${HAYAGRIVA_NS}:openTopicOverlap`, label: 'Open Topic Overlap Map', order: '10' });

    // File menu action
    registry.registerMenuAction([...CommonMenus.FILE, '1_hayagriva'], {
      commandId: `${HAYAGRIVA_NS}:openUploadSplit`,
      label: 'Upload to Hayagriva...',
    });

    // File Editor right click menu
    registry.registerMenuAction(['editor_context_menu'], {
      commandId: `${HAYAGRIVA_NS}:compareDocuments`,
      label: 'Compare with... (Diff)',
      order: '1'
    });

    registry.registerMenuAction(['editor_context_menu'], {
      commandId: `${HAYAGRIVA_NS}:openCompanionSideBySide`,
      label: 'Open Companion Side-by-Side',
      order: '2'
    });

    registry.registerMenuAction(['editor_context_menu'], {
      commandId: `${HAYAGRIVA_NS}:lookupCitation`,
      label: 'Lookup Statute in Law Vault',
      order: '3'
    });

    registry.registerMenuAction(['editor_context_menu'], {
      commandId: `${HAYAGRIVA_NS}:lookupJudgment`,
      label: 'Lookup Judgment in Precedents',
      order: '4'
    });

    registry.registerMenuAction(['editor_context_menu'], {
      commandId: `${HAYAGRIVA_NS}:lookupConcept`,
      label: 'Lookup Case Concept Card',
      order: '5'
    });

    registry.registerMenuAction(['editor_context_menu'], {
      commandId: `${HAYAGRIVA_NS}:exportScDocx`,
      label: 'Export to SC DOCX',
      order: '6'
    });

    // Navigator (File Explorer) right click sibling submenus
    const PIPELINE_SUBMENU = [...NavigatorContextMenu.NAVIGATION, 'hayagriva_pipeline_submenu'];
    registry.registerSubmenu(PIPELINE_SUBMENU, 'Hayagriva (Pipeline)', { sortString: 'a_hayagriva_1' });

    const ARCHIVE_SUBMENU = [...NavigatorContextMenu.NAVIGATION, 'hayagriva_archive_submenu'];
    registry.registerSubmenu(ARCHIVE_SUBMENU, 'Hayagriva (Archive)', { sortString: 'a_hayagriva_2' });

    // Pipeline Submenu actions
    registry.registerMenuAction(PIPELINE_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:convertToMd`,
      label: '1. Convert to Markdown',
      order: '1'
    });

    registry.registerMenuAction(PIPELINE_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:enhanceMarkdown`,
      label: '2. Enhance Markdown',
      order: '2'
    });

    registry.registerMenuAction(PIPELINE_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:ingestToAi`,
      label: '3. Generate Search Vectors',
      order: '3'
    });

    registry.registerMenuAction(PIPELINE_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:enrichToAi`,
      label: '4. Run AI Enrichment',
      order: '4'
    });

    registry.registerMenuAction(PIPELINE_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openCaseVault`,
      label: '5. Open Database Viewer',
      order: '5'
    });

    registry.registerMenuAction(PIPELINE_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:exportScDocx`,
      label: '6. Export to SC DOCX',
      order: '6'
    });

    // Archive Submenu actions
    registry.registerMenuAction(ARCHIVE_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:showPipelineAudit`,
      label: 'Show Pipeline Audit',
      order: '1'
    });

    registry.registerMenuAction(ARCHIVE_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:archiveCase`,
      label: 'Archive to Vault',
      order: '2'
    });

    registry.registerMenuAction(ARCHIVE_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:restoreCase`,
      label: 'Restore from Vault',
      order: '3'
    });

    // Outline panel context menu node actions
    registry.registerMenuAction(['outline.context'], { commandId: `${HAYAGRIVA_NS}:outlineAskRag`, label: 'Ask about this section', order: '1' });
    registry.registerMenuAction(['outline.context'], { commandId: `${HAYAGRIVA_NS}:outlineFindRelated`, label: 'Find related pages', order: '2' });
    registry.registerMenuAction(['outline.context'], { commandId: `${HAYAGRIVA_NS}:outlineAddToWiki`, label: 'Add to Wiki', order: '3' });
  }
}
