import { injectable } from '@theia/core/shared/inversify';
import { MenuContribution, MenuModelRegistry, MAIN_MENU_BAR, MenuPath } from '@theia/core/lib/common/menu';
import { CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution';
import { NavigatorContextMenu } from '@theia/navigator/lib/browser/navigator-contribution';

const HAYAGRIVA_NS = 'hayagriva';
const HAYAGRIVA_MAIN_MENU: MenuPath = [...MAIN_MENU_BAR, '3_hayagriva'];
const WIKI_MENU = [...CommonMenus.VIEW, 'wiki'];

export const NAVIGATOR_PRUNE_COMMAND_IDS = [
  'navigator.openWith',                   // Open With... (already in top File menu)
  'revealFileInOS',                       // Reveal in Finder / Explorer (already in top File menu)
  'core.cut',                             // Cut (already in top Edit menu / Cmd+X)
  'core.copy',                            // Copy (already in top Edit menu / Cmd+C)
  'core.paste',                           // Paste (already in top Edit menu / Cmd+V)
  'core.copyPath',                        // Copy Path (already in top File & Edit menus)
  'navigator.copyRelativeFilePath',       // Copy Relative Path
  'file.duplicate',                       // Duplicate
  'file.copyDownloadLink',                // Download Link
  'file.delete',                          // Raw permanent delete (replaced by Hayagriva 7-day safe trash)
  'navigator.compareFirst',               // Select for Compare (available in Hayagriva top menu)
  'navigator.compareSecond',              // Compare with Selected (available in Hayagriva top menu)
  'terminal:open-in-folder',              // Open in Terminal
];

export function pruneNavigatorContextMenu(registry: MenuModelRegistry): void {
  const NAV_MENU: MenuPath = ['navigator-context-menu'];
  for (const cmdId of NAVIGATOR_PRUNE_COMMAND_IDS) {
    try {
      registry.unregisterMenuAction(cmdId, NAV_MENU);
    } catch (_) {}
  }
}

@injectable()
export class HayagrivaMenuContribution implements MenuContribution {
  registerMenus(registry: MenuModelRegistry): void {
    // ═════════════════════════════════════════════════════════════════════════
    // 1. TOP-LEVEL "HAYAGRIVA" MENU TAB
    // ═════════════════════════════════════════════════════════════════════════
    registry.registerSubmenu(HAYAGRIVA_MAIN_MENU, 'Hayagriva', { sortString: '3_hayagriva' });

    // ── 0. New Matter / CIRP Estate Action ──
    registry.registerMenuAction(HAYAGRIVA_MAIN_MENU, {
      commandId: `${HAYAGRIVA_NS}:openNewCaseWizard`,
      label: '➕ New Matter / CIRP Estate…',
      order: '0'
    });

    // ── 1. Document & Preview Submenu ──
    const DOCS_SUBMENU: MenuPath = [...HAYAGRIVA_MAIN_MENU, '1_docs_submenu'];
    registry.registerSubmenu(DOCS_SUBMENU, '📄 Document & Preview', { sortString: '1_docs' });
    registry.registerMenuAction(DOCS_SUBMENU, { commandId: `${HAYAGRIVA_NS}:previewInMiddlePanel`, label: 'Open Preview in Middle Panel', order: '1' });
    registry.registerMenuAction(DOCS_SUBMENU, { commandId: `${HAYAGRIVA_NS}:openCompanionWithLivePreview`, label: 'Edit Companion (with Live Preview)', order: '2' });
    registry.registerMenuAction(DOCS_SUBMENU, { commandId: `${HAYAGRIVA_NS}:enhanceMarkdown`, label: 'Review / Edit Companion Markdown', order: '3' });
    registry.registerMenuAction(DOCS_SUBMENU, { commandId: `${HAYAGRIVA_NS}:compareDocuments`, label: 'Compare Documents (Diff)', order: '4' });

    // ── 2. Ingestion & OCR Submenu ──
    const INGEST_SUBMENU: MenuPath = [...HAYAGRIVA_MAIN_MENU, '2_ingest_submenu'];
    registry.registerSubmenu(INGEST_SUBMENU, '⚡ Ingestion & OCR', { sortString: '2_ingest' });
    registry.registerMenuAction(INGEST_SUBMENU, { commandId: `${HAYAGRIVA_NS}:openUploadSplit`, label: 'Upload & Ingest Document...', order: '1' });
    registry.registerMenuAction(INGEST_SUBMENU, { commandId: `${HAYAGRIVA_NS}:ingestToAi`, label: 'Re-index Document into AI Memory', order: '2' });
    registry.registerMenuAction(INGEST_SUBMENU, { commandId: `${HAYAGRIVA_NS}:enrichToAi`, label: 'Extract Case Facts (K-V)', order: '3' });
    registry.registerMenuAction(INGEST_SUBMENU, { commandId: `${HAYAGRIVA_NS}:parseWithLlamaParse`, label: 'Cloud OCR Fallback (LlamaParse)', order: '4' });

    // ── 3. Court Compilers & Drafting Submenu ──
    const COMPILERS_SUBMENU: MenuPath = [...HAYAGRIVA_MAIN_MENU, '3_compilers_submenu'];
    registry.registerSubmenu(COMPILERS_SUBMENU, '⚖️ Court Compilers & Drafting', { sortString: '3_compilers' });
    registry.registerMenuAction(COMPILERS_SUBMENU, { commandId: `${HAYAGRIVA_NS}:exportScDocx`, label: 'Export to Supreme Court DOCX (A4, 14pt)', order: '1' });
    registry.registerMenuAction(COMPILERS_SUBMENU, { commandId: `${HAYAGRIVA_NS}:exportCourtPdf`, label: 'Export to Court PDF & Preview', order: '2' });
    registry.registerMenuAction(COMPILERS_SUBMENU, { commandId: `${HAYAGRIVA_NS}:openDraftingPanel`, label: 'Open Drafting & Pleadings Panel', order: '3' });
    registry.registerMenuAction(COMPILERS_SUBMENU, { commandId: `${HAYAGRIVA_NS}:openFormEditor`, label: 'Open Form Review Dashboard', order: '4' });

    // ── 4. Case Intelligence & Databases Submenu ──
    const INTEL_SUBMENU: MenuPath = [...HAYAGRIVA_MAIN_MENU, '4_intel_submenu'];
    registry.registerSubmenu(INTEL_SUBMENU, '📊 Case Intelligence & Databases', { sortString: '4_intel' });
    registry.registerMenuAction(INTEL_SUBMENU, { commandId: `${HAYAGRIVA_NS}:openCaseVault`, label: 'Open Case Database Viewer', order: '1' });
    registry.registerMenuAction(INTEL_SUBMENU, { commandId: `${HAYAGRIVA_NS}:showPipelineAudit`, label: 'Case Ingestion Audit Log', order: '2' });
    registry.registerMenuAction(INTEL_SUBMENU, { commandId: `${HAYAGRIVA_NS}:openKvEditor`, label: 'Case Fact Dictionary (KV)', order: '3' });
    registry.registerMenuAction(INTEL_SUBMENU, { commandId: `${HAYAGRIVA_NS}:openChronology`, label: 'Open Case Chronology', order: '4' });
    registry.registerMenuAction(INTEL_SUBMENU, { commandId: `${HAYAGRIVA_NS}:openTopicOverlap`, label: 'Open Topic Overlap Map', order: '5' });
    registry.registerMenuAction(INTEL_SUBMENU, { commandId: `${HAYAGRIVA_NS}:exportChunksToTiddlyWiki`, label: 'Export Chunks to TiddlyWiki', order: '6' });

    // ── 5. Vault & Archival Submenu ──
    const VAULT_SUBMENU: MenuPath = [...HAYAGRIVA_MAIN_MENU, '5_vault_submenu'];
    registry.registerSubmenu(VAULT_SUBMENU, '🔒 Vault & Archival', { sortString: '5_vault' });
    registry.registerMenuAction(VAULT_SUBMENU, { commandId: `${HAYAGRIVA_NS}:archiveCase`, label: 'Archive Case to Vault', order: '1' });
    registry.registerMenuAction(VAULT_SUBMENU, { commandId: `${HAYAGRIVA_NS}:restoreCase`, label: 'Restore Case from Vault', order: '2' });

    // ── 6. Practice Governance & Cockpit Submenu ──
    const GOV_SUBMENU: MenuPath = [...HAYAGRIVA_MAIN_MENU, '6_governance_submenu'];
    registry.registerSubmenu(GOV_SUBMENU, '🏛️ Practice Governance & Cockpit', { sortString: '6_gov' });
    registry.registerMenuAction(GOV_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openMissionControl`,
      label: '🚀 Open Practice Governance Cockpit...',
      order: '1'
    });
    registry.registerMenuAction(GOV_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openHilApprovals`,
      label: '🛡️ Human-In-The-Loop (HIL) Approvals...',
      order: '2'
    });
    registry.registerMenuAction(GOV_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openBillingLedger`,
      label: '💳 CIRP Expense & Diligence Ledger...',
      order: '3'
    });
    registry.registerMenuAction(GOV_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openLocalObservability`,
      label: '📈 Local Telemetry & Observability...',
      order: '4'
    });
    registry.registerMenuAction(GOV_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openSettingsPanel`,
      label: '⚙️ Practice Settings & AI Engines...',
      order: '5'
    });
    registry.registerMenuAction(GOV_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openLicensePanel`,
      label: '🔑 Software Licensing & Machine Identity...',
      order: '6'
    });
    registry.registerMenuAction(GOV_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openOnboardingModal`,
      label: '👤 Verify Practitioner Identity & Stamp…',
      order: '7'
    });

    // ── 6. Help & User Guides Submenu ──
    const HELP_SUBMENU: MenuPath = [...HAYAGRIVA_MAIN_MENU, 'z_help_submenu'];
    registry.registerSubmenu(HELP_SUBMENU, '❓ Help & User Guides', { sortString: 'z_help' });
    registry.registerMenuAction(HELP_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:showIngestionHelp`,
      label: '📄 Document Ingestion & Pipeline Guide',
      order: '1'
    });
    registry.registerMenuAction(HELP_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:showMonacoVaultsHelp`,
      label: '⚖️ Monaco Vaults & Drafting Shortcuts Guide',
      order: '2'
    });

    // Also register directly in the top-level Help menu bar for quick access
    registry.registerMenuAction([...CommonMenus.HELP, '0_hayagriva_guides'], {
      commandId: `${HAYAGRIVA_NS}:showIngestionHelp`,
      label: '📄 Hayagriva: Document Ingestion Guide',
      order: '1'
    });
    registry.registerMenuAction([...CommonMenus.HELP, '0_hayagriva_guides'], {
      commandId: `${HAYAGRIVA_NS}:showMonacoVaultsHelp`,
      label: '⚖️ Hayagriva: Monaco Vaults & Shortcuts Guide',
      order: '2'
    });


// ═════════════════════════════════════════════════════════════════════════
// 2. NAVIGATOR CONTEXT MENU (FOCUSED LEGAL WORKBENCH & 3-DOT PIPELINE)
// ═════════════════════════════════════════════════════════════════════════

    // ── Prune generic developer clutter from Explorer right-click ──
    pruneNavigatorContextMenu(registry);

    // ── Group 1: Viewing & Preview ──
    registry.registerMenuAction(NavigatorContextMenu.NAVIGATION, {
      commandId: `${HAYAGRIVA_NS}:previewInMiddlePanel`,
      label: '📄 Open Preview in Middle Panel',
      order: '1'
    });

    // ── Group 2: The Three Status Dots Pipeline ──
    const PIPELINE_GROUP: MenuPath = ['navigator-context-menu', '2_pipeline'];
    registry.registerMenuAction(PIPELINE_GROUP, {
      commandId: `${HAYAGRIVA_NS}:openCompanionWithLivePreview`,
      label: '🟢 1. Review Companion (Edit & Live Preview)',
      order: '1'
    });

    registry.registerMenuAction(PIPELINE_GROUP, {
      commandId: `${HAYAGRIVA_NS}:ingestToAi`,
      label: '🟢 2. Re-Index into AI Memory (Vector & FTS5)',
      order: '2'
    });

    registry.registerMenuAction(PIPELINE_GROUP, {
      commandId: `${HAYAGRIVA_NS}:enrichToAi`,
      label: '🟢 3. Extract Case Facts & Claims (K-V)',
      order: '3'
    });

    // ── Group 3: File Management (Safe Soft-Delete to .trash/) ──
    registry.registerMenuAction(NavigatorContextMenu.MODIFICATION, {
      commandId: `${HAYAGRIVA_NS}:deleteFile`,
      label: '🗑 Delete File (move to trash)',
      order: 'z_delete'
    });


    // ═════════════════════════════════════════════════════════════════════════
    // 3. EDITOR CONTEXT MENU & AUXILIARY MENUS
    // ═════════════════════════════════════════════════════════════════════════
    registry.registerMenuAction(['editor_context_menu'], {
      commandId: `${HAYAGRIVA_NS}:previewInMiddlePanel`,
      label: '📄 Open Preview in Middle Panel',
      order: '0'
    });

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
      commandId: `${HAYAGRIVA_NS}:exportCourtPdf`,
      label: 'Export to Court PDF & Preview',
      order: '6'
    });

    registry.registerMenuAction(['editor_context_menu'], {
      commandId: `${HAYAGRIVA_NS}:exportScDocx`,
      label: 'Export to SC DOCX',
      order: '7'
    });

    // File menu action
    registry.registerMenuAction([...CommonMenus.FILE, '1_hayagriva'], {
      commandId: `${HAYAGRIVA_NS}:openUploadSplit`,
      label: 'Upload to Hayagriva...',
    });

    // View -> Wiki menu
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

    // Outline panel context menu node actions
    registry.registerMenuAction(['outline.context'], { commandId: `${HAYAGRIVA_NS}:outlineAskRag`, label: 'Ask about this section', order: '1' });
    registry.registerMenuAction(['outline.context'], { commandId: `${HAYAGRIVA_NS}:outlineFindRelated`, label: 'Find related pages', order: '2' });
    registry.registerMenuAction(['outline.context'], { commandId: `${HAYAGRIVA_NS}:outlineAddToWiki`, label: 'Add to Wiki', order: '3' });
  }
}

