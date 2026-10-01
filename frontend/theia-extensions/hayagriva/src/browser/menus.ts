import { injectable } from '@theia/core/shared/inversify';
import { MenuContribution, MenuModelRegistry, MAIN_MENU_BAR, MenuPath } from '@theia/core/lib/common/menu';
import { CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution';
import { NavigatorContextMenu } from '@theia/navigator/lib/browser/navigator-contribution';

const HAYAGRIVA_NS = 'hayagriva';
const HAYAGRIVA_MAIN_MENU: MenuPath = [...MAIN_MENU_BAR, '3_hayagriva'];

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

export const BLOCKED_MENU_COMMAND_IDS = new Set([
  // View Views clutter
  'ai-agent-history', 'ai-chat', 'ai-sessions', 'chat-view-widget',
  'debug:open', 'debug', 'debugConsole:open',
  'explorer-view-container',
  'search-view-container',
  'outline-view', 'output', 'plugin-view', 'problems', 'property-view',
  'scmView', 'type-hierarchy', 'call-hierarchy',
  'workbench.action.openView',

  // Editor toggles
  'editor.action.toggleMinimap',
  'editor.action.toggleRenderWhitespace',
  'breadcrumbs.toggle',

  // Workspace / Coder File clutter
  'core.newTextFile',
  'core.newFile',
  'file.newFolder',
  'window.newWindow',
  'workspace:openConfigFile',
  'workspace:openRecent',
  'workspace:addFolder',
  'workspace:saveAs',
  'workspace:uploadFiles',
  'workspace:close'
]);

export function isCoderMenuRegistration(menuPath: MenuPath, item?: any): boolean {
  const pathParts = (menuPath || []).map(p => String(p).toLowerCase());

  // 1. Block top-level coder menus (Selection, Go, Run, Terminal)
  if (pathParts.some(p => p.includes('selection') || p.includes('go') || p.includes('run') || p.includes('terminal'))) {
    return true;
  }

  // 2. Block 2_views in View menu (all 16 generic coder views)
  if (pathParts.includes('2_views')) {
    return true;
  }

  // 3. Block coder new-file / workspace groups in File menu
  if (pathParts.includes('1_new_text') || pathParts.includes('1_new') || pathParts.includes('2_workspace') || pathParts.includes('4_downloadupload')) {
    return true;
  }

  // 4. Block duplicate Preferences in File menu (already in Practice Governance Cockpit)
  if (pathParts.includes('5_settings') && pathParts.some(p => p.includes('1_file'))) {
    return true;
  }

  // 5. Block specific command IDs & labels
  if (item) {
    const cmdId = item.commandId || item.id || '';
    if (BLOCKED_MENU_COMMAND_IDS.has(cmdId)) {
      return true;
    }
    const label = (item.label || '').toLowerCase();
    if (label.includes('minimap') || label.includes('whitespace') || label.includes('breadcrumbs')) {
      return true;
    }
    if (label.includes('workspace from file') || label.includes('recent workspace') || label.includes('add folder to workspace') || label.includes('save workspace as')) {
      return true;
    }
    if (label === 'close workspace' || label === 'upload files...' || label === 'open view...') {
      return true;
    }
    if (label.includes('call hierarchy') || label.includes('type hierarchy') || label.includes('debug console')) {
      return true;
    }
    if (pathParts.some(p => p.includes('4_view')) && (
      label === 'explorer' || label === 'search' || label === 'outline' || label === 'output' ||
      label === 'plugins' || label === 'problems' || label === 'properties' || label === 'extensions' ||
      label === 'source control' || label === 'debug' || label === 'ai chat' || label === 'ai sessions' ||
      label === 'ai agent history'
    )) {
      return true;
    }
  }

  return false;
}

export function installMenuGuard(registry: MenuModelRegistry): void {
  const reg = registry as any;
  if (!reg || reg.__hayagriva_guarded) return;
  reg.__hayagriva_guarded = true;

  const origRegisterMenuAction = registry.registerMenuAction.bind(registry);
  registry.registerMenuAction = function (menuPath: MenuPath, item: any) {
    if (isCoderMenuRegistration(menuPath, item)) {
      return { dispose: () => {} };
    }
    return origRegisterMenuAction(menuPath, item);
  };

  if (reg.registerCommandMenu) {
    const origRegisterCommandMenu = reg.registerCommandMenu.bind(registry);
    reg.registerCommandMenu = function (menuPath: MenuPath, item: any) {
      if (isCoderMenuRegistration(menuPath, item)) {
        return { dispose: () => {} };
      }
      return origRegisterCommandMenu(menuPath, item);
    };
  }

  const origRegisterSubmenu = registry.registerSubmenu.bind(registry);
  registry.registerSubmenu = function (menuPath: MenuPath, label: string, options?: any) {
    const pathParts = (menuPath || []).map(p => String(p).toLowerCase());
    if (pathParts.some(p => p.includes('selection') || p.includes('go') || p.includes('run') || p.includes('terminal') || p.includes('2_views'))) {
      return { dispose: () => {} };
    }
    if (pathParts.includes('5_settings') && pathParts.some(p => p.includes('1_file'))) {
      return { dispose: () => {} };
    }
    return origRegisterSubmenu(menuPath, label, options);
  };
}

function pruneRecursive(node: any, shouldRemove: (child: any) => boolean): void {
  if (!node || !Array.isArray(node.children)) return;
  node.children = node.children.filter((child: any) => {
    if (shouldRemove(child)) return false;
    pruneRecursive(child, shouldRemove);
    return true;
  });
}

let isPruning = false;
export function pruneDeveloperMenus(registry: MenuModelRegistry): void {
  if (isPruning) return;
  isPruning = true;
  try {
    const reg = registry as any;
    installMenuGuard(registry);

    const menubar = reg.getMenuNode(MAIN_MENU_BAR);
    if (menubar) {
      const devLabels = ['selection', 'go', 'run', 'terminal'];
      pruneRecursive(menubar, (child: any) => {
        const id = (child.id || '').toLowerCase();
        const label = (child.label || '').toLowerCase();
        return devLabels.some(l => id.includes(l) || label === l);
      });
    }

    // ── Prune View Menu ──
    const viewNode = reg.getMenuNode(CommonMenus.VIEW);
    if (viewNode) {
      pruneRecursive(viewNode, (child: any) => {
        const id = (child.id || '').toLowerCase();
        const label = (child.label || '').toLowerCase();

        // 1. Drop the entire 2_views group (all 16 generic coder views)
        if (id === '2_views' || id.includes('2_views')) return true;

        // 2. Drop generic views and coder tools
        if (label === 'ai agent history' || id.includes('ai-agent-history')) return true;
        if (label === 'ai chat' || id.includes('ai-chat')) return true;
        if (label === 'ai sessions' || id.includes('ai-sessions')) return true;
        if (label.includes('call hierarchy') || id.includes('call_hierarchy') || id.includes('callhierarchy')) return true;
        if (label === 'debug' || id === 'debug' || id.includes('debug:')) return true;
        if (label.includes('debug console') || id.includes('debug_console')) return true;
        if (label === 'explorer' && id !== '0_perspectives_submenu' && id !== '2_pillars_submenu') return true;
        if (label === 'extensions' || id.includes('extensions')) return true;
        if (label === 'outline' || id.includes('outline')) return true;
        if (label === 'output' || id.includes('output')) return true;
        if (label === 'plugins' || id.includes('plugins')) return true;
        if (label === 'problems' || id.includes('problems')) return true;
        if (label === 'properties' || id.includes('properties')) return true;
        if (label === 'search' && id !== '0_perspectives_submenu' && id !== '2_pillars_submenu') return true;
        if (label.includes('source control') || id.includes('scm') || id.includes('source_control')) return true;
        if (label.includes('type hierarchy') || id.includes('type_hierarchy') || id.includes('typehierarchy')) return true;
        if (label === 'open view...' || id.includes('openview')) return true;

        // 3. Drop unwanted toggles
        if (label.includes('minimap') || id.includes('minimap')) return true;
        if (label.includes('whitespace') || id.includes('whitespace')) return true;
        if (label.includes('sticky') || id.includes('sticky')) return true;
        if (label.includes('breadcrumb') || id.includes('breadcrumb')) return true;

        return false;
      });
    }

    // ── Prune File Menu ──
    const fileNode = reg.getMenuNode(CommonMenus.FILE);
    if (fileNode) {
      pruneRecursive(fileNode, (child: any) => {
        const id = (child.id || '').toLowerCase();
        const label = (child.label || '').toLowerCase();

        // Drop coder new file group (New Text File, New File..., New Folder..., New Window)
        if (id === '1_new_text' || id === '1_new') return true;
        if (label.includes('new text file') || label.includes('new file...') || label.includes('new folder') || label.includes('new window')) return true;

        // Drop workspace clutter
        if (id === '2_workspace' || id === 'file_workspace') return true;
        if (label.includes('workspace from file') || label.includes('recent workspace') || label.includes('add folder to workspace') || label.includes('save workspace as')) return true;
        if (label.includes('close workspace')) return true;

        // Drop duplicate upload & preferences (managed in Cockpit)
        if (id === '4_downloadupload' || id === 'uploadfiles' || label.includes('upload files...')) return true;
        if (id === '5_settings' || label.includes('preferences')) return true;

        return false;
      });
    }

    // ── Prune Edit Menu ──
    const editNode = reg.getMenuNode(CommonMenus.EDIT);
    if (editNode) {
      pruneRecursive(editNode, (child: any) => {
        const id = (child.id || '').toLowerCase();
        const label = (child.label || '').toLowerCase();
        if (id.includes('comment') || label.includes('comment')) return true;
        if (id.includes('emmet') || label.includes('emmet')) return true;
        return false;
      });
    }
  } catch (_) {
  } finally {
    isPruning = false;
  }
}

@injectable()
export class HayagrivaMenuContribution implements MenuContribution {
  registerMenus(registry: MenuModelRegistry): void {
    installMenuGuard(registry);
    pruneDeveloperMenus(registry);

    // ═════════════════════════════════════════════════════════════════════════
    // 1. TOP-LEVEL "HAYAGRIVA" SUITE MENU TAB
    // ═════════════════════════════════════════════════════════════════════════
    registry.registerSubmenu(HAYAGRIVA_MAIN_MENU, 'Hayagriva', { sortString: '3_hayagriva' });

    // ── 0. New Matter / CIRP Estate Action ──
    registry.registerMenuAction(HAYAGRIVA_MAIN_MENU, {
      commandId: `${HAYAGRIVA_NS}:openNewCaseWizard`,
      label: '➕ New Matter / CIRP Estate…',
      order: '0'
    });

    // ── 1. Court Compilers & Drafting Submenu ──
    const COMPILERS_SUBMENU: MenuPath = [...HAYAGRIVA_MAIN_MENU, '1_compilers_submenu'];
    registry.registerSubmenu(COMPILERS_SUBMENU, '⚖️ Court Compilers & Drafting', { sortString: '1_compilers' });
    registry.registerMenuAction(COMPILERS_SUBMENU, { commandId: `${HAYAGRIVA_NS}:openDraftingPanel`, label: '📄 Open Drafting & Pleadings Factory', order: '1' });
    registry.registerMenuAction(COMPILERS_SUBMENU, { commandId: `${HAYAGRIVA_NS}:openFormEditor`, label: '📋 Open Creditor Claim Verification (Forms B/C/CA)', order: '2' });
    registry.registerMenuAction(COMPILERS_SUBMENU, { commandId: 'hayagriva.draftOrder38', label: '⚖️ Commercial Courts: Order 38 Rule 5 (Attachment Before Judgment)', order: '3' });
    registry.registerMenuAction(COMPILERS_SUBMENU, { commandId: 'hayagriva.draftOrder39', label: '⚖️ Commercial Courts: Order 39 Rules 1 & 2 (Temporary Injunction)', order: '4' });
    registry.registerMenuAction(COMPILERS_SUBMENU, { commandId: 'hayagriva.draftTruth', label: '📑 Statement of Truth (Order VI Rule 15A CPC)', order: '5' });
    registry.registerMenuAction(COMPILERS_SUBMENU, { commandId: `${HAYAGRIVA_NS}:exportScDocx`, label: '🏛️ Export to Supreme Court DOCX (A4, 14pt)', order: '6' });
    registry.registerMenuAction(COMPILERS_SUBMENU, { commandId: `${HAYAGRIVA_NS}:exportCourtPdf`, label: '📄 Export to Court PDF & Preview', order: '7' });

    // ── 2. Case Intelligence & Databases Submenu ──
    const INTEL_SUBMENU: MenuPath = [...HAYAGRIVA_MAIN_MENU, '2_intel_submenu'];
    registry.registerSubmenu(INTEL_SUBMENU, '📊 Case Intelligence & Evidence', { sortString: '2_intel' });
    registry.registerMenuAction(INTEL_SUBMENU, { commandId: `${HAYAGRIVA_NS}:openKvEditor`, label: '📋 Case Fact Dictionary (Master KV)', order: '1' });
    registry.registerMenuAction(INTEL_SUBMENU, { commandId: `${HAYAGRIVA_NS}:openChronology`, label: '⏱️ Interactive CIRP Chronology & Milestones', order: '2' });
    registry.registerMenuAction(INTEL_SUBMENU, { commandId: `${HAYAGRIVA_NS}:openCaseVault`, label: '🏛️ Statutory Vaults & Bare Acts Catalog', order: '3' });
    registry.registerMenuAction(INTEL_SUBMENU, { commandId: `${HAYAGRIVA_NS}:showPipelineAudit`, label: '📜 Fiduciary Ingestion Audit Log (Section 65B/63)', order: '4' });
    registry.registerMenuAction(INTEL_SUBMENU, { commandId: 'hayagriva.auditContradictions', label: '⚠️ Audit Cross-Filing Contradictions', order: '5' });
    registry.registerMenuAction(INTEL_SUBMENU, { commandId: 'hayagriva.openCommercialReadinessPanel', label: '🔍 Commercial Courts Readiness Matrix', order: '6' });

    // ── 3. Vault & Archival Submenu ──
    const VAULT_SUBMENU: MenuPath = [...HAYAGRIVA_MAIN_MENU, '3_vault_submenu'];
    registry.registerSubmenu(VAULT_SUBMENU, '🔒 Vault & Archival', { sortString: '3_vault' });
    registry.registerMenuAction(VAULT_SUBMENU, { commandId: `${HAYAGRIVA_NS}:archiveCase`, label: '📦 Archive Case to Vault', order: '1' });
    registry.registerMenuAction(VAULT_SUBMENU, { commandId: `${HAYAGRIVA_NS}:restoreCase`, label: '🔓 Restore Case from Vault', order: '2' });

    // ── 4. Practice Governance & Cockpit Submenu ──
    const GOV_SUBMENU: MenuPath = [...HAYAGRIVA_MAIN_MENU, '4_governance_submenu'];
    registry.registerSubmenu(GOV_SUBMENU, '🏛️ Practice Governance Cockpit', { sortString: '4_gov' });
    registry.registerMenuAction(GOV_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openMissionControl`,
      label: '🚀 Open Practice Governance Cockpit...',
      order: '1'
    });
    registry.registerMenuAction(GOV_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openSettingsPanel`,
      label: '⚙️ Practice Settings & AI Engines...',
      order: '2'
    });
    registry.registerMenuAction(GOV_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openLicensePanel`,
      label: '🔑 Software Licensing & Machine Identity...',
      order: '3'
    });
    registry.registerMenuAction(GOV_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openOnboardingModal`,
      label: '👤 Verify Practitioner Identity & Stamp…',
      order: '4'
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 2. ENHANCED "FILE" MENU: MATTER LIFECYCLE & COURT DELIVERABLES
    // ═════════════════════════════════════════════════════════════════════════
    registry.registerMenuAction([...CommonMenus.FILE, '0_case'], {
      commandId: `${HAYAGRIVA_NS}:openNewCaseWizard`,
      label: '➕ New Matter / CIRP Estate…',
      order: '0'
    });
    registry.registerMenuAction([...CommonMenus.FILE, '1_draft'], {
      commandId: `${HAYAGRIVA_NS}:openDraftingPanel`,
      label: '📄 New Pleadings Draft…',
      order: '1'
    });
    registry.registerMenuAction([...CommonMenus.FILE, '2_ingest'], {
      commandId: `${HAYAGRIVA_NS}:openUploadSplit`,
      label: '📥 Ingest Filings, Claims & Statements…',
      order: '2'
    });

    const FILE_COURT_SUBMENU: MenuPath = [...CommonMenus.FILE, '4_court_submenu'];
    registry.registerSubmenu(FILE_COURT_SUBMENU, '🏛️ Court Deliverables & Production', { sortString: '4_court' });
    registry.registerMenuAction(FILE_COURT_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:exportScDocx`,
      label: '📄 Export to Supreme Court DOCX (A4, 14pt)',
      order: '1'
    });
    registry.registerMenuAction(FILE_COURT_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:exportCourtPdf`,
      label: '📑 Export Court-Ready PDF (with § 63/65B Certificate)',
      order: '2'
    });

    registry.registerMenuAction([...CommonMenus.FILE, '5_milestone'], {
      commandId: `${HAYAGRIVA_NS}:createVersionMilestone`,
      label: '🏷️ Create Version Milestone Snapshot…',
      order: '5'
    });
    registry.registerMenuAction([...CommonMenus.FILE, 'z_lock'], {
      commandId: `${HAYAGRIVA_NS}:closeVaultOrMatter`,
      label: '🔒 Close Matter & Lock Encrypted Vault',
      order: 'z_lock'
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 3. ENHANCED "EDIT" MENU: LEGAL TEXT & FORENSIC REDACTION
    // ═════════════════════════════════════════════════════════════════════════
    const EDIT_PRIVACY_SUBMENU: MenuPath = [...CommonMenus.EDIT, '3_privacy_submenu'];
    registry.registerSubmenu(EDIT_PRIVACY_SUBMENU, '🛡️ Forensic Privacy & Masking', { sortString: '3_privacy' });
    registry.registerMenuAction(EDIT_PRIVACY_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:redactSelection`,
      label: '🖤 Redact Selected Text (Permanent Blackout)',
      order: '1'
    });
    registry.registerMenuAction(EDIT_PRIVACY_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:maskPii`,
      label: '🎭 Auto-Mask Sensitive PII (PAN / Aadhaar / Phone)',
      order: '2'
    });

    registry.registerMenuAction([...CommonMenus.EDIT, '4_kv'], {
      commandId: `${HAYAGRIVA_NS}:openKvEditor`,
      label: '📋 Insert Case Fact Variable…',
      order: '4'
    });
    registry.registerMenuAction([...CommonMenus.EDIT, '5_truth'], {
      commandId: 'hayagriva.draftTruth',
      label: '📑 Insert Statement of Truth Verification Clause',
      order: '5'
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 4. TOP-LEVEL "TOOLS" FORENSIC & STATUTORY CHAMBER SUITE MENU
    // ═════════════════════════════════════════════════════════════════════════
    const TOOLS_MAIN_MENU: MenuPath = [...MAIN_MENU_BAR, '35_tools'];
    registry.registerSubmenu(TOOLS_MAIN_MENU, 'Tools', { sortString: '35_tools' });

    // ── Quick-Launch Direct Utilities ──
    registry.registerMenuAction(TOOLS_MAIN_MENU, {
      commandId: 'hayagriva.tool.redactFile',
      label: '🔒 Redact & Duplicate File (VDR Mode)…',
      order: '01'
    });
    registry.registerMenuAction(TOOLS_MAIN_MENU, {
      commandId: 'hayagriva.tool.bsaCertificate',
      label: '📜 Generate § 63 BSA / § 65B EA Certificate…',
      order: '02'
    });

    // ── 1. Privacy & VDR Sanitization Submenu ──
    const TOOLS_PRIVACY_SUBMENU: MenuPath = [...TOOLS_MAIN_MENU, '1_privacy_tools'];
    registry.registerSubmenu(TOOLS_PRIVACY_SUBMENU, '🔒 Privacy & VDR Sanitization', { sortString: '1_privacy' });
    registry.registerMenuAction(TOOLS_PRIVACY_SUBMENU, { commandId: 'hayagriva.tool.redactFile', label: '🔒 Redact & Duplicate File (VDR Mode)…', order: '1' });
    registry.registerMenuAction(TOOLS_PRIVACY_SUBMENU, { commandId: 'hayagriva.tool.batchWatermark', label: '🏷️ Batch Watermark & Docket Stamping…', order: '2' });

    // ── 2. Evidence & Court Certification Submenu ──
    const TOOLS_EVIDENCE_SUBMENU: MenuPath = [...TOOLS_MAIN_MENU, '2_evidence_tools'];
    registry.registerSubmenu(TOOLS_EVIDENCE_SUBMENU, '⚖️ Evidence & Court Certification', { sortString: '2_evidence' });
    registry.registerMenuAction(TOOLS_EVIDENCE_SUBMENU, { commandId: 'hayagriva.tool.bsaCertificate', label: '📜 Generate § 63 BSA / § 65B EA Certificate…', order: '1' });
    registry.registerMenuAction(TOOLS_EVIDENCE_SUBMENU, { commandId: 'hayagriva.tool.tamperCheck', label: '🛡️ Cryptographic Integrity & Tamper-Check…', order: '2' });

    // ── 3. Restructuring & Financial Calculators Submenu ──
    const TOOLS_CALC_SUBMENU: MenuPath = [...TOOLS_MAIN_MENU, '3_calc_tools'];
    registry.registerSubmenu(TOOLS_CALC_SUBMENU, '📊 Restructuring & Financial Calculators', { sortString: '3_calc' });
    registry.registerMenuAction(TOOLS_CALC_SUBMENU, { commandId: 'hayagriva.tool.cirpClock', label: '⏱️ CIRP Statutory Milestone Clock (T₀ → T₃₃₀)…', order: '1' });
    registry.registerMenuAction(TOOLS_CALC_SUBMENU, { commandId: 'hayagriva.tool.cocVoting', label: '🧮 CoC Voting Share & Waterfall Recalculator…', order: '2' });
    registry.registerMenuAction(TOOLS_CALC_SUBMENU, { commandId: 'hayagriva.tool.bankNormalizer', label: '🏦 Multi-Bank Statement Forensic Normalizer…', order: '3' });

    // ── 4. Docketing & Court Filing Submenu ──
    const TOOLS_DOCKET_SUBMENU: MenuPath = [...TOOLS_MAIN_MENU, '4_docket_tools'];
    registry.registerSubmenu(TOOLS_DOCKET_SUBMENU, '📑 Docketing & Court Filing Preparation', { sortString: '4_docket' });
    registry.registerMenuAction(TOOLS_DOCKET_SUBMENU, { commandId: 'hayagriva.tool.bundleBuilder', label: '📑 Master Exhibit Numberer & Court Bundle Builder…', order: '1' });
    registry.registerMenuAction(TOOLS_DOCKET_SUBMENU, { commandId: 'hayagriva.tool.legalRedline', label: '⚖️ Blackline / Legal Redline Diff (Plans & Contracts)…', order: '2' });

    // ═════════════════════════════════════════════════════════════════════════
    // 5. ENHANCED "VIEW" MENU: READING PERSPECTIVES & SOVEREIGN PILLARS
    // ═════════════════════════════════════════════════════════════════════════
    const VIEW_PERSPECTIVES_SUBMENU: MenuPath = [...CommonMenus.VIEW, '0_perspectives_submenu'];
    registry.registerSubmenu(VIEW_PERSPECTIVES_SUBMENU, '📐 Document Perspectives', { sortString: '0_perspectives' });
    registry.registerMenuAction(VIEW_PERSPECTIVES_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:previewInMiddlePanel`,
      label: '📄 Scanned Court Filing (Original PDF/Office)',
      order: '1'
    });
    registry.registerMenuAction(VIEW_PERSPECTIVES_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openMilkdownEditor`,
      label: '✍️ Formatted Word View (Milkdown)',
      order: '2'
    });
    registry.registerMenuAction(VIEW_PERSPECTIVES_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openAsMarkdown`,
      label: '📝 Markdown Source View (Raw Text)',
      order: '3'
    });
    registry.registerMenuAction(VIEW_PERSPECTIVES_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openCaseWiki`,
      label: '🧠 Case Wiki Knowledge Canvas',
      order: '4'
    });

    registry.registerMenuAction([...CommonMenus.VIEW, '1_diff'], {
      commandId: `${HAYAGRIVA_NS}:compareDocuments`,
      label: '⚖️ Side-by-Side Comparison (Diff Inspector)',
      order: '1'
    });

    const VIEW_PILLARS_SUBMENU: MenuPath = [...CommonMenus.VIEW, '2_pillars_submenu'];
    registry.registerSubmenu(VIEW_PILLARS_SUBMENU, '🏛️ Sovereign Left Pillars', { sortString: '2_pillars' });
    registry.registerMenuAction(VIEW_PILLARS_SUBMENU, { commandId: 'hayagriva.focus.documents', label: '📁 1. Case Documents Explorer', order: '1' });
    registry.registerMenuAction(VIEW_PILLARS_SUBMENU, { commandId: 'hayagriva.focus.askhaya', label: '🐴 2. AskHaya Ambient Partner', order: '2' });
    registry.registerMenuAction(VIEW_PILLARS_SUBMENU, { commandId: 'hayagriva.focus.entitymap', label: '🔀 3. Forensic Entity Map', order: '3' });
    registry.registerMenuAction(VIEW_PILLARS_SUBMENU, { commandId: 'hayagriva.focus.notifications', label: '🔔 4. Notification & Compliance Center', order: '4' });
    registry.registerMenuAction(VIEW_PILLARS_SUBMENU, { commandId: 'hayagriva.focus.billing', label: '💳 5. Estate Accounts & Billing', order: '5' });

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

    // ── Submenu 1: View File ──
    const NAV_VIEW_SUBMENU: MenuPath = ['navigator-context-menu', '1_view_submenu'];
    registry.registerSubmenu(NAV_VIEW_SUBMENU, '👁️ View File', { sortString: '1_view' });
    registry.registerMenuAction(NAV_VIEW_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:previewInMiddlePanel`,
      label: '📄 View Original Court Filing',
      order: '1'
    });
    registry.registerMenuAction(NAV_VIEW_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openMilkdownEditor`,
      label: '✍️ View as Word',
      order: '2'
    });

    // ── Submenu 2: Edit File ──
    const NAV_EDIT_SUBMENU: MenuPath = ['navigator-context-menu', '2_edit_submenu'];
    registry.registerSubmenu(NAV_EDIT_SUBMENU, '✏️ Edit File', { sortString: '2_edit' });
    registry.registerMenuAction(NAV_EDIT_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openMilkdownEditor`,
      label: '✍️ Edit in Word View',
      order: '1'
    });
    registry.registerMenuAction(NAV_EDIT_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openAsMarkdown`,
      label: '📝 Edit in Markdown',
      order: '2'
    });
    registry.registerMenuAction(NAV_EDIT_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openCaseWiki`,
      label: '🧠 Edit in Case Wiki',
      order: '3'
    });

    // ── Submenu 3: Ingest File ──
    const NAV_INGEST_SUBMENU: MenuPath = ['navigator-context-menu', '3_ingest_submenu'];
    registry.registerSubmenu(NAV_INGEST_SUBMENU, '⚙️ Ingest File', { sortString: '3_ingest' });
    registry.registerMenuAction(NAV_INGEST_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:runFullIngestion`,
      label: '⚡ Run Full Ingestion (All 3 Steps)',
      order: '0'
    });

    const NAV_INGEST_STEPS: MenuPath = [...NAV_INGEST_SUBMENU, 'steps'];
    registry.registerMenuAction(NAV_INGEST_STEPS, {
      commandId: `${HAYAGRIVA_NS}:convertToMd`,
      label: '🟢 1. Re-Parse & Extract Companion',
      order: '1'
    });
    registry.registerMenuAction(NAV_INGEST_STEPS, {
      commandId: `${HAYAGRIVA_NS}:ingestToAi`,
      label: '🟢 2. Re-Index into AI Search (Vector & FTS5)',
      order: '2'
    });
    registry.registerMenuAction(NAV_INGEST_STEPS, {
      commandId: `${HAYAGRIVA_NS}:enrichToAi`,
      label: '🟢 3. Re-Extract Facts & Claims (K-V)',
      order: '3'
    });

    // ── Group 4: File Management (Delete File) ──
    registry.registerMenuAction(NavigatorContextMenu.MODIFICATION, {
      commandId: `${HAYAGRIVA_NS}:deleteFile`,
      label: '🗑 Delete File',
      order: 'z_delete'
    });


    // ═════════════════════════════════════════════════════════════════════════
    // 3. TAB BAR CONTEXT MENU (Right-click on Editor Tab)
    // ═════════════════════════════════════════════════════════════════════════
    const TABBAR_VIEW_SUBMENU: MenuPath = ['shell-tabbar-context-menu', '1_view_submenu'];
    registry.registerSubmenu(TABBAR_VIEW_SUBMENU, '👁️ View File', { sortString: '1_view' });
    registry.registerMenuAction(TABBAR_VIEW_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:previewInMiddlePanel`,
      label: '📄 View Original Court Filing',
      order: '1'
    });
    registry.registerMenuAction(TABBAR_VIEW_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openMilkdownEditor`,
      label: '✍️ View as Word',
      order: '2'
    });

    const TABBAR_EDIT_SUBMENU: MenuPath = ['shell-tabbar-context-menu', '2_edit_submenu'];
    registry.registerSubmenu(TABBAR_EDIT_SUBMENU, '✏️ Edit File', { sortString: '2_edit' });
    registry.registerMenuAction(TABBAR_EDIT_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openMilkdownEditor`,
      label: '✍️ Edit in Word View',
      order: '1'
    });
    registry.registerMenuAction(TABBAR_EDIT_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openAsMarkdown`,
      label: '📝 Edit in Markdown',
      order: '2'
    });
    registry.registerMenuAction(TABBAR_EDIT_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:openCaseWiki`,
      label: '🧠 Edit in Case Wiki',
      order: '3'
    });

    const TABBAR_INGEST_SUBMENU: MenuPath = ['shell-tabbar-context-menu', '3_ingest_submenu'];
    registry.registerSubmenu(TABBAR_INGEST_SUBMENU, '⚙️ Ingest File', { sortString: '3_ingest' });
    registry.registerMenuAction(TABBAR_INGEST_SUBMENU, {
      commandId: `${HAYAGRIVA_NS}:runFullIngestion`,
      label: '⚡ Run Full Ingestion (All 3 Steps)',
      order: '0'
    });

    const TABBAR_INGEST_STEPS: MenuPath = [...TABBAR_INGEST_SUBMENU, 'steps'];
    registry.registerMenuAction(TABBAR_INGEST_STEPS, {
      commandId: `${HAYAGRIVA_NS}:convertToMd`,
      label: '🟢 1. Re-Parse & Extract Companion',
      order: '1'
    });
    registry.registerMenuAction(TABBAR_INGEST_STEPS, {
      commandId: `${HAYAGRIVA_NS}:ingestToAi`,
      label: '🟢 2. Re-Index into AI Search (Vector & FTS5)',
      order: '2'
    });
    registry.registerMenuAction(TABBAR_INGEST_STEPS, {
      commandId: `${HAYAGRIVA_NS}:enrichToAi`,
      label: '🟢 3. Re-Extract Facts & Claims (K-V)',
      order: '3'
    });


    // ═════════════════════════════════════════════════════════════════════════
    // 4. EDITOR CONTEXT MENU & AUXILIARY MENUS
    // ═════════════════════════════════════════════════════════════════════════
    registry.registerMenuAction(['editor_context_menu'], {
      commandId: `${HAYAGRIVA_NS}:openMilkdownEditor`,
      label: '✍️ Edit Document (Word View)',
      order: '1_word'
    });
    registry.registerMenuAction(['editor_context_menu'], {
      commandId: `${HAYAGRIVA_NS}:openCaseWiki`,
      label: '🧠 Open in Case Wiki (Legal Canvas)',
      order: '2_wiki'
    });

    registry.registerMenuAction(['editor_context_menu'], {
      commandId: `${HAYAGRIVA_NS}:compareDocuments`,
      label: 'Compare with... (Diff)',
      order: '4_compare'
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



    // Outline panel context menu node actions
    registry.registerMenuAction(['outline.context'], { commandId: `${HAYAGRIVA_NS}:outlineAskRag`, label: 'Ask about this section', order: '1' });
    registry.registerMenuAction(['outline.context'], { commandId: `${HAYAGRIVA_NS}:outlineFindRelated`, label: 'Find related pages', order: '2' });
    registry.registerMenuAction(['outline.context'], { commandId: `${HAYAGRIVA_NS}:outlineAddToWiki`, label: 'Add to Wiki', order: '3' });
  }
}

