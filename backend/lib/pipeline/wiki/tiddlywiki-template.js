'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Generates an authoritative, standalone Single-File Legal TiddlyWiki HTML string.
 * Features:
 *  - Chamber Legal Styling (Georgia / Times New Roman serif body, crisp slate elevations)
 *  - Dual Perspective Switch: [ 🃏 Atomic Fact Cards ] <-> [ 📜 Continuous Plaint ]
 *  - Collapsible Curated Right Outline (TOC, Open Cards, Exhibits & Citations)
 *  - In-Card Visual Table Editing (contenteditable cells with auto-serialization to Markdown)
 *  - In-Card Monaco / Code View hook & Court DOCX Export hook
 *  - Zero scroll-snapping update loop with atomic JSON store synchronization
 *
 * @param {string} wikiTitle - Title of the Wiki
 * @param {Array<Object>} tiddlers - Array of tiddler objects { title, text, tags, created, modified }
 * @param {string|number} apiPort - Port of the local Hayagriva backend
 * @param {string} caseName - Active case name
 * @param {string} fileName - Target wiki filename (.wiki.html)
 * @returns {string} Standalone HTML document string
 */
function generateTiddlyWikiHtml(wikiTitle = 'Hayagriva Case Wiki', tiddlers = [], apiPort = 3210, caseName = '', fileName = '') {
    const nowStr = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17);
    
    // Default tiddlers to ensure core wiki compatibility
    const defaultTiddlers = [
        {
            title: '$:/SiteTitle',
            text: wikiTitle,
            tags: '$:/tags/SiteTitle'
        },
        {
            title: '$:/SiteSubtitle',
            text: 'Autonomous Sovereign Case Knowledge Base & Synthesis Engine',
            tags: '$:/tags/SiteSubtitle'
        },
        {
            title: '$:/DefaultTiddlers',
            text: '[[Getting Started]]',
            tags: ''
        },
        {
            title: 'Getting Started',
            text: `Welcome to **${wikiTitle}**!\n\nThis Chamber Legal Wiki is stored directly in your case directory:\n\`${caseName}/wiki/${fileName}\`\n\n### Sovereign Chamber Capabilities\n- **Dual Perspective:** Switch between isolated atomic fact cards and continuous court plaint.\n- **Interactive Tables:** Click directly into table cells to edit arrears and figures; edits persist without page jumps.\n- **Evidence Linking:** Click \`[[Exhibits]]\` or citation chips to inspect supporting orders.\n- **Continuous Court Compilation:** Export all transcluded paragraphs directly to court-ready DOCX.`,
            created: nowStr,
            modified: nowStr,
            tags: 'Overview Index'
        }
    ];

    // Merge custom tiddlers, preserving order
    const mergedMap = new Map();
    [...defaultTiddlers, ...tiddlers].forEach(tid => {
        if (tid && tid.title) {
            mergedMap.set(tid.title, tid);
        }
    });
    const finalTiddlers = Array.from(mergedMap.values());
    const jsonStore = JSON.stringify(finalTiddlers).replace(/</g, '\\u003c');

    return `<!doctype html>
<!--
Hayagriva Sovereign Legal Chamber Wiki — Standalone Minimalist Edition
Air-gapped, zero external dependencies, 100% offline sovereign legal assembly engine.
-->
<html lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html;charset=utf-8" />
<meta name="application-name" content="Hayagriva Legal Wiki" />
<meta name="generator" content="Hayagriva Sovereign Engine" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${wikiTitle}</title>
<style type="text/css">
  :root {
    --bg-workspace: #0b0f17;
    --bg-header: #111827;
    --bg-card: #151d2c;
    --bg-card-hover: #192335;
    --bg-card-inner: #0f1623;
    --border-card: #253349;
    --border-accent: #3b82f6;
    --accent-court: #f59e0b;
    --accent-court-dim: rgba(245, 158, 11, 0.15);
    --accent-cyan: #38bdf8;
    --accent-green: #10b981;
    --text-primary: #f8fafc;
    --text-secondary: #cbd5e1;
    --text-muted: #8492a6;
    --table-header-bg: #1e293b;
    --table-stripe-bg: #121927;
    --table-border: #334155;
    --table-cell-focus: #0284c7;
    --font-legal: "Georgia", "Times New Roman", "Cambria", serif;
    --font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --sidebar-width: 330px;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    background: var(--bg-workspace);
    color: var(--text-primary);
    font-family: var(--font-ui);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* 🏛️ Top Chamber Command Bar */
  .chamber-header {
    background: var(--bg-header);
    border-bottom: 1px solid var(--border-card);
    padding: 10px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 56px;
    flex-shrink: 0;
    z-index: 50;
  }
  .header-brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .header-brand h1 {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.2px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .case-badge {
    background: #1e293b;
    border: 1px solid var(--border-card);
    color: var(--accent-cyan);
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* 🃏 Dual Perspective Switcher */
  .view-switcher {
    display: flex;
    background: #0f172a;
    border: 1px solid var(--border-card);
    border-radius: 6px;
    padding: 3px;
    gap: 3px;
  }
  .view-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
    padding: 6px 14px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .view-btn:hover {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.05);
  }
  .view-btn.active {
    background: #2563eb;
    color: white;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }

  /* Command Actions */
  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .action-btn {
    background: #1e293b;
    border: 1px solid var(--border-card);
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 5px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
  }
  .action-btn:hover {
    border-color: var(--accent-cyan);
    background: #273549;
  }
  .btn-save {
    background: #065f46;
    border-color: #059669;
    color: #ecfdf5;
  }
  .btn-save:hover {
    background: #047857;
    border-color: #10b981;
  }
  .btn-export {
    background: #78350f;
    border-color: #b45309;
    color: #fef3c7;
  }
  .btn-export:hover {
    background: #92400e;
    border-color: #d97706;
  }

  /* 📐 Main App Workspace Layout */
  .app-workspace {
    display: flex;
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  /* Story River (Left / Center) */
  .story-river {
    flex: 1;
    overflow-y: auto;
    padding: 24px 32px;
    scroll-behavior: smooth;
    max-width: 1000px;
    margin: 0 auto;
    width: 100%;
  }

  /* 🃏 Fact Card View */
  .legal-card {
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 8px;
    margin-bottom: 20px;
    padding: 20px 24px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    transition: border-color 0.2s, box-shadow 0.2s;
    position: relative;
  }
  .legal-card:hover {
    border-color: #3b506d;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
  }
  .legal-card.highlighted {
    border-color: var(--accent-cyan);
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.25);
  }
  .card-topbar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--border-card);
    padding-bottom: 10px;
  }
  .card-title-group h3 {
    margin: 0 0 6px 0;
    font-size: 16px;
    font-weight: 700;
    color: var(--accent-cyan);
    letter-spacing: -0.2px;
  }
  .card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .tag-badge {
    background: #1e293b;
    border: 1px solid #334155;
    color: #94a3b8;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 500;
  }
  .tag-badge.exhibit {
    background: var(--accent-court-dim);
    border-color: var(--accent-court);
    color: var(--accent-court);
    font-weight: 600;
  }
  .card-tools {
    display: flex;
    gap: 4px;
  }
  .card-tool-btn {
    background: #1e293b;
    border: 1px solid #334155;
    color: var(--text-muted);
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .card-tool-btn:hover {
    color: var(--text-primary);
    background: #28374d;
    border-color: var(--accent-cyan);
  }

  /* Card Body & Typography */
  .card-body {
    font-family: var(--font-legal);
    font-size: 15px;
    line-height: 1.65;
    color: var(--text-secondary);
  }
  .card-body p {
    margin: 0 0 12px 0;
  }
  .card-body p:last-child {
    margin-bottom: 0;
  }
  .card-body h1, .card-body h2, .card-body h3, .card-body h4 {
    font-family: var(--font-ui);
    color: var(--text-primary);
    margin: 16px 0 8px 0;
    font-weight: 600;
  }
  .wiki-link {
    background: rgba(14, 165, 233, 0.15);
    border-bottom: 1px dashed var(--accent-cyan);
    color: #7dd3fc;
    padding: 1px 4px;
    border-radius: 3px;
    cursor: pointer;
    text-decoration: none;
    font-family: var(--font-ui);
    font-size: 13px;
  }
  .wiki-link:hover {
    background: rgba(14, 165, 233, 0.3);
    color: #38bdf8;
  }
  .exhibit-chip {
    background: var(--accent-court-dim);
    border: 1px solid var(--accent-court);
    color: #fef3c7;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 3px;
    font-family: var(--font-ui);
    font-size: 12px;
  }

  /* 📊 In-Card Visual Editable Tables */
  .legal-table-wrapper {
    margin: 16px 0;
    background: var(--bg-card-inner);
    border: 1px solid var(--table-border);
    border-radius: 6px;
    overflow: hidden;
  }
  .table-toolbar {
    background: #111a28;
    border-bottom: 1px solid var(--table-border);
    padding: 6px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--font-ui);
    font-size: 11px;
    color: var(--text-muted);
  }
  .table-toolbar-actions {
    display: flex;
    gap: 6px;
  }
  .table-mini-btn {
    background: #1e293b;
    border: 1px solid #334155;
    color: var(--text-secondary);
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 3px;
    cursor: pointer;
  }
  .table-mini-btn:hover {
    background: #2a3a52;
    color: var(--text-primary);
  }
  .court-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-ui);
    font-size: 13px;
    color: var(--text-secondary);
  }
  .court-table th, .court-table td {
    padding: 8px 12px;
    border: 1px solid var(--table-border);
    text-align: left;
    outline: none;
  }
  .court-table th {
    background: var(--table-header-bg);
    color: var(--text-primary);
    font-weight: 600;
  }
  .court-table tr:nth-child(even) td {
    background: var(--table-stripe-bg);
  }
  .court-table td[contenteditable="true"]:focus {
    background: rgba(2, 132, 199, 0.2);
    box-shadow: inset 0 0 0 1px var(--accent-cyan);
    color: #ffffff;
  }
  .court-table td.numeric, .court-table th.numeric {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .court-table tr.total-row td {
    font-weight: 700;
    color: var(--accent-court);
    background: rgba(245, 158, 11, 0.08);
  }

  /* 💻 Monaco Code / Raw Markdown Editor */
  .card-raw-editor {
    width: 100%;
    min-height: 160px;
    background: #090d14;
    border: 1px solid var(--border-card);
    border-radius: 4px;
    color: #e2e8f0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 13px;
    line-height: 1.5;
    padding: 12px;
    resize: vertical;
    outline: none;
    box-sizing: border-box;
    display: none;
  }
  .card-raw-editor:focus {
    border-color: var(--accent-cyan);
  }
  .raw-editor-actions {
    display: none;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }

  /* 📜 Continuous Plaint Perspective */
  #plaint-view {
    display: none;
    background: #0e1522;
    border: 1px solid var(--border-card);
    border-radius: 8px;
    padding: 48px 56px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.4);
    font-family: var(--font-legal);
    color: #f1f5f9;
  }
  .plaint-header-block {
    text-align: center;
    border-bottom: 2px solid #334155;
    padding-bottom: 24px;
    margin-bottom: 32px;
  }
  .plaint-court-name {
    font-size: 16px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 8px;
    color: #e2e8f0;
  }
  .plaint-suit-title {
    font-size: 15px;
    color: var(--accent-court);
    font-weight: 600;
    margin-bottom: 12px;
  }
  .plaint-parties {
    display: flex;
    justify-content: space-between;
    margin: 20px 0;
    font-size: 14px;
    text-align: left;
  }
  .plaint-para {
    font-size: 15px;
    line-height: 1.75;
    margin-bottom: 20px;
    text-align: justify;
  }
  .plaint-para-num {
    font-weight: 700;
    color: var(--accent-cyan);
    margin-right: 6px;
  }
  .plaint-prayer-box {
    background: rgba(245, 158, 11, 0.05);
    border-left: 3px solid var(--accent-court);
    padding: 16px 20px;
    margin: 28px 0;
    border-radius: 0 6px 6px 0;
  }
  .plaint-prayer-box h4 {
    margin: 0 0 8px 0;
    color: var(--accent-court);
    font-family: var(--font-ui);
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* 📑 Curated Right Panel (Outline & Exhibits) */
  .legal-sidebar {
    width: var(--sidebar-width);
    background: var(--bg-header);
    border-left: 1px solid var(--border-card);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    transition: margin-right 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 40;
  }
  .legal-sidebar.collapsed {
    margin-right: calc(-1 * var(--sidebar-width));
  }
  .sidebar-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-card);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sidebar-search {
    width: 100%;
    background: #0b0f17;
    border: 1px solid var(--border-card);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 12px;
    padding: 6px 10px;
    outline: none;
  }
  .sidebar-search:focus {
    border-color: var(--accent-cyan);
  }
  .sidebar-tabs {
    display: flex;
    border-bottom: 1px solid var(--border-card);
    background: #0d131f;
  }
  .sidebar-tab-btn {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    padding: 8px 4px;
    cursor: pointer;
    text-align: center;
    border-bottom: 2px solid transparent;
    transition: all 0.15s ease;
  }
  .sidebar-tab-btn:hover {
    color: var(--text-primary);
  }
  .sidebar-tab-btn.active {
    color: var(--accent-cyan);
    border-bottom-color: var(--accent-cyan);
    background: rgba(56, 189, 248, 0.05);
  }
  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }
  .toc-item {
    padding: 8px 10px;
    border-radius: 4px;
    font-size: 12px;
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: background 0.15s;
    margin-bottom: 2px;
  }
  .toc-item:hover {
    background: #1c2738;
    color: var(--text-primary);
  }
  .toc-item.active {
    background: #1e3a5f;
    color: var(--accent-cyan);
    font-weight: 600;
  }
  .toc-item-badge {
    font-size: 10px;
    background: #1e293b;
    padding: 1px 5px;
    border-radius: 3px;
    color: var(--text-muted);
  }

  /* Unsaved indicator */
  .dirty-indicator {
    display: none;
    color: #f59e0b;
    font-size: 11px;
    font-weight: bold;
    margin-right: 8px;
  }

  /* Floating outline toggle when collapsed */
  .floating-toc-btn {
    position: absolute;
    top: 14px;
    right: 14px;
    background: #1e293b;
    border: 1px solid var(--border-card);
    color: var(--accent-cyan);
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    z-index: 30;
    display: none;
    box-shadow: 0 4px 10px rgba(0,0,0,0.4);
  }

  /* Toast Notification */
  .chamber-toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #1e293b;
    border: 1px solid var(--border-accent);
    color: #f8fafc;
    padding: 10px 18px;
    border-radius: 6px;
    font-size: 13px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    z-index: 100;
    display: none;
    animation: fadeIn 0.2s ease-out;
  }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
</style>
</head>
<body>

<!-- 🏛️ Top Chamber Command Bar -->
<div class="chamber-header">
  <div class="header-brand">
    <h1>🏛️ ${wikiTitle}</h1>
    <span class="case-badge">${caseName || 'Active Matter'}</span>
    <span id="dirty-badge" class="dirty-indicator">● Unsaved Edits</span>
  </div>

  <!-- 🃏 Dual Perspective Switcher -->
  <div class="view-switcher">
    <button id="btn-mode-cards" class="view-btn active" onclick="switchPerspective('cards')">
      <span>🃏</span> Atomic Fact Cards
    </button>
    <button id="btn-mode-plaint" class="view-btn" onclick="switchPerspective('plaint')">
      <span>📜</span> Continuous Plaint
    </button>
  </div>

  <div class="header-actions">
    <button class="action-btn btn-export" onclick="exportCourtDocx()">🏛️ Export Court DOCX</button>
    <button class="action-btn btn-save" onclick="saveWikiToCase()">💾 Save Changes</button>
    <button class="action-btn" id="btn-toc-toggle" onclick="toggleSidebar()" title="Toggle Outline Sidebar">📑 Outline ⏵</button>
  </div>
</div>

<div class="app-workspace">
  <!-- Story River (Left/Center) -->
  <div class="story-river" id="story-river">
    <!-- View 1: Atomic Fact Cards -->
    <div id="cards-view"></div>

    <!-- View 2: Continuous Court Plaint -->
    <div id="plaint-view"></div>
  </div>

  <!-- 📑 Curated Right Panel -->
  <div class="legal-sidebar" id="legal-sidebar">
    <div class="sidebar-header">
      <input type="text" class="sidebar-search" id="sidebar-search" placeholder="🔍 Search cards or exhibits..." oninput="filterSidebar(this.value)" />
    </div>
    <div class="sidebar-tabs">
      <button class="sidebar-tab-btn active" id="tab-btn-toc" onclick="switchSidebarTab('toc')">📑 Outline</button>
      <button class="sidebar-tab-btn" id="tab-btn-open" onclick="switchSidebarTab('open')">📌 Open Cards</button>
      <button class="sidebar-tab-btn" id="tab-btn-exhibits" onclick="switchSidebarTab('exhibits')">🏷️ Exhibits</button>
    </div>
    <div class="sidebar-content" id="sidebar-content"></div>
  </div>

  <!-- Floating Toggle Button for collapsed state -->
  <button class="floating-toc-btn" id="floating-toc-btn" onclick="toggleSidebar()">📑 Outline ⏴</button>
</div>

<!-- Toast notification -->
<div id="chamber-toast" class="chamber-toast"></div>

<!-- Canonical JSON Data Store -->
<script type="application/json" class="tiddlywiki-tiddler-store">
${jsonStore}
</script>

<script>
  'use strict';

  const CASE_NAME = "${caseName}";
  const FILE_NAME = "${fileName}";
  const API_PORT = ${apiPort};

  let activePerspective = 'cards';
  let activeSidebarTab = 'toc';
  let currentOpenCards = new Set();
  let isDirty = false;

  // 1. Data Store Accessor
  function getTiddlersStore() {
    const storeScript = document.querySelector('script.tiddlywiki-tiddler-store');
    if (!storeScript) return [];
    try {
      return JSON.parse(storeScript.textContent);
    } catch(e) {
      console.error('Failed to parse tiddlers store:', e);
      return [];
    }
  }

  function updateTiddlerText(title, newText) {
    const storeScript = document.querySelector('script.tiddlywiki-tiddler-store');
    if (!storeScript) return;
    const tiddlers = getTiddlersStore();
    const index = tiddlers.findIndex(t => t.title === title);
    const nowStr = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17);

    if (index !== -1) {
      tiddlers[index].text = newText;
      tiddlers[index].modified = nowStr;
    } else {
      tiddlers.push({
        title,
        text: newText,
        created: nowStr,
        modified: nowStr,
        tags: 'UserNote'
      });
    }

    storeScript.textContent = JSON.stringify(tiddlers, null, 2);
    markDirty();
  }

  function markDirty() {
    isDirty = true;
    const badge = document.getElementById('dirty-badge');
    if (badge) badge.style.display = 'inline-block';
  }

  function clearDirty() {
    isDirty = false;
    const badge = document.getElementById('dirty-badge');
    if (badge) badge.style.display = 'none';
  }

  function showToast(msg, duration = 3000) {
    const toast = document.getElementById('chamber-toast');
    if (!toast) return;
    toast.innerText = msg;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, duration);
  }

  // 2. Dual Perspective Switcher
  function switchPerspective(mode) {
    activePerspective = mode;
    const btnCards = document.getElementById('btn-mode-cards');
    const btnPlaint = document.getElementById('btn-mode-plaint');
    const cardsView = document.getElementById('cards-view');
    const plaintView = document.getElementById('plaint-view');

    if (mode === 'cards') {
      btnCards.classList.add('active');
      btnPlaint.classList.remove('active');
      cardsView.style.display = 'block';
      plaintView.style.display = 'none';
      renderCardsView();
    } else {
      btnPlaint.classList.add('active');
      btnCards.classList.remove('active');
      cardsView.style.display = 'none';
      plaintView.style.display = 'block';
      renderPlaintView();
    }
  }

  // 3. Markdown Parser with Visual Table Recognition
  function parseMarkdownToHtml(markdownText, cardTitle) {
    if (!markdownText) return '';
    let text = markdownText;

    // Detect and render Markdown Tables
    const lines = text.split('\\n');
    const processedLines = [];
    let inTable = false;
    let tableLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const isTableRow = line.startsWith('|') && line.endsWith('|');

      if (isTableRow) {
        inTable = true;
        tableLines.push(line);
      } else {
        if (inTable) {
          processedLines.push(renderHtmlTable(tableLines, cardTitle));
          inTable = false;
          tableLines = [];
        }
        processedLines.push(line);
      }
    }
    if (inTable) {
      processedLines.push(renderHtmlTable(tableLines, cardTitle));
    }

    let html = processedLines.join('\\n');

    // Headings
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold & Italics
    html = html.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
    html = html.replace(/\\*(.*?)\\*/g, '<em>$1</em>');

    // Wiki Links [[Link Title]]
    html = html.replace(/\\[\\[([^\\]]+)\\]\\]/g, (match, p1) => {
      return \`<a class="wiki-link" onclick="handleWikiLinkClick('\${p1.replace(/'/g, "\\\\'")}')">🔗 \${p1}</a>\`;
    });

    // Exhibit Tags (e.g. Ex P-8, E-16, Annexure A)
    html = html.replace(/\\b(Ex(?:hibit)?\\s+[A-Z0-9\\-]+|Annexure\\s+[A-Z0-9\\-]+|E\\-[0-9]+)\\b/gi, '<span class="exhibit-chip">🏷️ $1</span>');

    // Paragraph wrapping for non-tagged blocks
    const blocks = html.split(/\\n{2,}/);
    html = blocks.map(block => {
      block = block.trim();
      if (!block) return '';
      if (block.startsWith('<h') || block.startsWith('<div') || block.startsWith('<table')) {
        return block;
      }
      return \`<p>\${block.replace(/\\n/g, '<br/>')}</p>\`;
    }).join('\\n');

    return html;
  }

  // 4. Render Editable HTML Table
  function renderHtmlTable(lines, cardTitle) {
    if (!lines || lines.length === 0) return '';

    // Filter out separator lines like | --- | --- |
    const cleanRows = [];

    lines.forEach(line => {
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (cells.length === 0) return;
      // Check if it is a separator row (e.g. ---, :---:, etc.)
      const isSep = cells.every(c => /^:?-{2,}:?$/.test(c));
      if (!isSep) {
        cleanRows.push(cells);
      }
    });

    if (cleanRows.length === 0) return '';

    const headerCells = cleanRows[0];
    const dataRows = cleanRows.slice(1);

    const safeTitle = cardTitle.replace(/"/g, '&quot;');
    let html = \`<div class="legal-table-wrapper" data-card="\${safeTitle}">
      <div class="table-toolbar">
        <span>📊 Visual Table Editor (Click any cell to edit)</span>
        <div class="table-toolbar-actions">
          <button class="table-mini-btn" onclick="addTableRow(this)">➕ Add Row</button>
          <button class="table-mini-btn" onclick="removeTableRow(this)">🗑️ Del Row</button>
        </div>
      </div>
      <table class="court-table" data-card="\${safeTitle}">
        <thead><tr>\`;

    headerCells.forEach(cell => {
      const isNum = isNumericString(cell);
      html += \`<th contenteditable="true" spellcheck="false" class="\${isNum ? 'numeric' : ''}" oninput="onTableCellInput(this)">\${cell}</th>\`;
    });
    html += \`</tr></thead><tbody>\`;

    dataRows.forEach(row => {
      const isTotalRow = row.some(c => c.toLowerCase().includes('total') || c.toLowerCase().includes('due'));
      html += \`<tr class="\${isTotalRow ? 'total-row' : ''}">\`;
      row.forEach(cell => {
        const isNum = isNumericString(cell);
        html += \`<td contenteditable="true" spellcheck="false" class="\${isNum ? 'numeric' : ''}" oninput="onTableCellInput(this)">\${cell}</td>\`;
      });
      html += \`</tr>\`;
    });

    html += \`</tbody></table></div>\`;
    return html;
  }

  function isNumericString(str) {
    if (!str) return false;
    const clean = str.replace(/[\\s,₹$]/g, '');
    return !isNaN(clean) && clean.length > 0;
  }

  // 5. Table Cell Input & Serialization Back to Markdown
  function onTableCellInput(cellEl) {
    const tableEl = cellEl.closest('table');
    if (!tableEl) return;
    const cardTitle = tableEl.getAttribute('data-card');
    if (!cardTitle) return;

    // Convert HTML Table back to Markdown
    const markdownTable = serializeTableToMarkdown(tableEl);

    // Update tiddler text
    const tiddlers = getTiddlersStore();
    const tiddler = tiddlers.find(t => t.title === cardTitle);
    if (tiddler) {
      // Replace table section in text
      const originalLines = (tiddler.text || '').split('\\n');
      const startIdx = originalLines.findIndex(l => l.trim().startsWith('|') && l.trim().endsWith('|'));
      if (startIdx !== -1) {
        let endIdx = startIdx;
        while (endIdx < originalLines.length && originalLines[endIdx].trim().startsWith('|') && originalLines[endIdx].trim().endsWith('|')) {
          endIdx++;
        }
        const updatedText = [
          ...originalLines.slice(0, startIdx),
          markdownTable,
          ...originalLines.slice(endIdx)
        ].join('\\n');
        updateTiddlerText(cardTitle, updatedText);
      }
    }
  }

  function serializeTableToMarkdown(tableEl) {
    const rows = Array.from(tableEl.querySelectorAll('tr'));
    const mdLines = [];

    rows.forEach((row, idx) => {
      const cells = Array.from(row.querySelectorAll('th, td')).map(c => c.innerText.trim());
      mdLines.push('| ' + cells.join(' | ') + ' |');
      if (idx === 0) {
        // Separator
        mdLines.push('| ' + cells.map(() => '---').join(' | ') + ' |');
      }
    });

    return mdLines.join('\\n');
  }

  function addTableRow(btn) {
    const wrapper = btn.closest('.legal-table-wrapper');
    const table = wrapper.querySelector('table');
    const tbody = table.querySelector('tbody');
    const colCount = table.querySelectorAll('thead th').length;

    const tr = document.createElement('tr');
    for (let i = 0; i < colCount; i++) {
      const td = document.createElement('td');
      td.contentEditable = "true";
      td.spellcheck = false;
      td.oninput = () => onTableCellInput(td);
      td.innerText = i === 0 ? 'New Row' : '-';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
    onTableCellInput(tr.firstElementChild);
  }

  function removeTableRow(btn) {
    const wrapper = btn.closest('.legal-table-wrapper');
    const tbody = wrapper.querySelector('tbody');
    if (tbody.children.length > 0) {
      tbody.removeChild(tbody.lastElementChild);
      if (tbody.firstElementChild) {
        onTableCellInput(tbody.firstElementChild.firstElementChild);
      }
    }
  }

  // 6. Render Atomic Fact Cards View
  function renderCardsView() {
    const container = document.getElementById('cards-view');
    if (!container) return;
    const tiddlers = getTiddlersStore().filter(t => t.title && !t.title.startsWith('$:/'));
    container.innerHTML = '';

    tiddlers.forEach(t => {
      currentOpenCards.add(t.title);
      const card = document.createElement('div');
      card.className = 'legal-card';
      card.id = 'card-' + encodeURIComponent(t.title);
      card.setAttribute('data-card-title', t.title);

      // Card Header
      const topBar = document.createElement('div');
      topBar.className = 'card-topbar';

      const titleGroup = document.createElement('div');
      titleGroup.className = 'card-title-group';
      const h3 = document.createElement('h3');
      h3.innerText = '📌 ' + t.title;
      titleGroup.appendChild(h3);

      const tagsDiv = document.createElement('div');
      tagsDiv.className = 'card-tags';
      const tagList = Array.isArray(t.tags) ? t.tags : (t.tags ? t.tags.split(' ') : []);
      tagList.forEach(tg => {
        if (!tg) return;
        const badge = document.createElement('span');
        const isEx = tg.toLowerCase().includes('exhibit') || tg.toLowerCase().includes('order');
        badge.className = 'tag-badge' + (isEx ? ' exhibit' : '');
        badge.innerText = '#' + tg;
        tagsDiv.appendChild(badge);
      });
      titleGroup.appendChild(tagsDiv);
      topBar.appendChild(titleGroup);

      // Card Tools
      const tools = document.createElement('div');
      tools.className = 'card-tools';

      const editBtn = document.createElement('button');
      editBtn.className = 'card-tool-btn';
      editBtn.innerText = '✏️ Edit';
      editBtn.onclick = () => toggleRawEditor(card, t);

      const codeBtn = document.createElement('button');
      codeBtn.className = 'card-tool-btn';
      codeBtn.innerText = '💻 Code';
      codeBtn.onclick = () => openCardInMonaco(t.title);

      const copyBtn = document.createElement('button');
      copyBtn.className = 'card-tool-btn';
      copyBtn.innerText = '📋 Copy';
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(t.text || '');
        showToast('Copied card content to clipboard');
      };

      tools.appendChild(editBtn);
      tools.appendChild(codeBtn);
      tools.appendChild(copyBtn);
      topBar.appendChild(tools);
      card.appendChild(topBar);

      // Formatted Body
      const body = document.createElement('div');
      body.className = 'card-body';
      body.innerHTML = parseMarkdownToHtml(t.text || '', t.title);
      card.appendChild(body);

      // Raw Markdown Editor (Hidden by default)
      const rawEditor = document.createElement('textarea');
      rawEditor.className = 'card-raw-editor';
      rawEditor.value = t.text || '';
      card.appendChild(rawEditor);

      const rawActions = document.createElement('div');
      rawActions.className = 'raw-editor-actions';
      const saveRawBtn = document.createElement('button');
      saveRawBtn.className = 'action-btn btn-save';
      saveRawBtn.innerText = '✅ Apply';
      saveRawBtn.onclick = () => {
        updateTiddlerText(t.title, rawEditor.value);
        body.innerHTML = parseMarkdownToHtml(rawEditor.value, t.title);
        rawEditor.style.display = 'none';
        rawActions.style.display = 'none';
        body.style.display = 'block';
        showToast('Card updated');
      };

      const cancelRawBtn = document.createElement('button');
      cancelRawBtn.className = 'action-btn';
      cancelRawBtn.innerText = '❌ Cancel';
      cancelRawBtn.onclick = () => {
        rawEditor.style.display = 'none';
        rawActions.style.display = 'none';
        body.style.display = 'block';
      };

      rawActions.appendChild(cancelRawBtn);
      rawActions.appendChild(saveRawBtn);
      card.appendChild(rawActions);

      container.appendChild(card);
    });

    renderSidebar();
  }

  function toggleRawEditor(cardEl, tiddler) {
    const body = cardEl.querySelector('.card-body');
    const editor = cardEl.querySelector('.card-raw-editor');
    const actions = cardEl.querySelector('.raw-editor-actions');

    if (editor.style.display === 'block') {
      editor.style.display = 'none';
      actions.style.display = 'none';
      body.style.display = 'block';
    } else {
      editor.value = tiddler.text || '';
      editor.style.display = 'block';
      actions.style.display = 'flex';
      body.style.display = 'none';
      editor.focus();
    }
  }

  function openCardInMonaco(title) {
    // Notify host Theia workspace to open card in Monaco
    try {
      window.parent.postMessage({
        type: 'open_in_monaco',
        action: 'hayagriva:open_card_in_monaco',
        title: title,
        caseName: CASE_NAME,
        fileName: FILE_NAME
      }, '*');
      showToast('Opening ' + title + ' in Monaco editor...');
    } catch(e) {
      console.warn('Parent postMessage failed:', e);
    }
  }

  // 7. Render Continuous Plaint Perspective
  function renderPlaintView() {
    const container = document.getElementById('plaint-view');
    if (!container) return;
    const tiddlers = getTiddlersStore().filter(t => t.title && !t.title.startsWith('$:/') && !t.title.includes('Index'));
    container.innerHTML = '';

    // Chamber Court Header
    const courtHeader = document.createElement('div');
    courtHeader.className = 'plaint-header-block';
    courtHeader.innerHTML = \`
      <div class="plaint-court-name">IN THE HON'BLE COMMERCIAL COURT / DISTRICT COURT AT CHANDIGARH</div>
      <div class="plaint-suit-title">COMMERCIAL SUIT NO. ________ OF 2026</div>
      <div class="plaint-parties">
        <div><strong>PLAINTIFFS:</strong> SATISH GROVER & ORS</div>
        <div><strong>VERSUS</strong></div>
        <div><strong>DEFENDANTS:</strong> M/S INVENTIVE INFRASTRUCTURE & ORS</div>
      </div>
      <div style="font-weight: bold; text-decoration: underline; margin-top: 16px;">
        SUIT FOR RECOVERY OF ARREARS OF RENT UNDER COMMERCIAL COURTS ACT, 2015
      </div>
    \`;
    container.appendChild(courtHeader);

    // Sequential Transcluded Paragraphs
    let paraCounter = 1;
    tiddlers.forEach(t => {
      const paraBox = document.createElement('div');
      paraBox.className = 'plaint-para';

      // Check if text already starts with a para number
      let rawText = (t.text || '').trim();
      let matchNum = rawText.match(/^[0-9]+\\.\\s*(.*)/s);

      let content = matchNum ? matchNum[1] : rawText;
      let htmlContent = parseMarkdownToHtml(content, t.title);

      paraBox.innerHTML = \`<span class="plaint-para-num">\${paraCounter}.</span> \${htmlContent}\`;
      container.appendChild(paraBox);
      paraCounter++;
    });

    // Verification Statement Footer
    const prayerBox = document.createElement('div');
    prayerBox.className = 'plaint-prayer-box';
    prayerBox.innerHTML = \`
      <h4>Verification & Statement of Truth (Order VI Rule 15A CPC)</h4>
      <p style="margin: 0; font-size: 14px;">
        Verified at Chandigarh on this ____ day of September, 2026 that the contents of the above paragraphs are true and correct to my knowledge derived from official lease records and bank ledger statements.
      </p>
    \`;
    container.appendChild(prayerBox);
  }

  // 8. Curated Sidebar Management
  function toggleSidebar() {
    const sidebar = document.getElementById('legal-sidebar');
    const floatingBtn = document.getElementById('floating-toc-btn');
    sidebar.classList.toggle('collapsed');

    if (sidebar.classList.contains('collapsed')) {
      floatingBtn.style.display = 'block';
    } else {
      floatingBtn.style.display = 'none';
    }
  }

  function switchSidebarTab(tabName) {
    activeSidebarTab = tabName;
    ['toc', 'open', 'exhibits'].forEach(t => {
      const btn = document.getElementById('tab-btn-' + t);
      if (btn) btn.classList.toggle('active', t === tabName);
    });
    renderSidebar();
  }

  function renderSidebar(searchQuery = '') {
    const content = document.getElementById('sidebar-content');
    if (!content) return;
    content.innerHTML = '';

    const tiddlers = getTiddlersStore().filter(t => t.title && !t.title.startsWith('$:/'));
    const q = searchQuery.toLowerCase();

    if (activeSidebarTab === 'toc') {
      tiddlers.forEach((t, idx) => {
        if (q && !t.title.toLowerCase().includes(q) && !(t.text || '').toLowerCase().includes(q)) return;
        const item = document.createElement('div');
        item.className = 'toc-item';
        item.innerHTML = \`<span>§ \${t.title}</span><span class="toc-item-badge">\${idx + 1}</span>\`;
        item.onclick = () => scrollToCard(t.title);
        content.appendChild(item);
      });
    } else if (activeSidebarTab === 'open') {
      currentOpenCards.forEach(title => {
        if (q && !title.toLowerCase().includes(q)) return;
        const item = document.createElement('div');
        item.className = 'toc-item';
        item.innerHTML = \`<span>📌 \${title}</span>\`;
        item.onclick = () => scrollToCard(title);
        content.appendChild(item);
      });
    } else if (activeSidebarTab === 'exhibits') {
      const exhibitCards = tiddlers.filter(t => {
        const text = (t.text || '') + ' ' + (t.tags || '');
        return /\\b(Ex|Annexure|Order|Deed|Certificate|E\\-[0-9]+)\\b/i.test(text);
      });
      exhibitCards.forEach(t => {
        if (q && !t.title.toLowerCase().includes(q) && !(t.text || '').toLowerCase().includes(q)) return;
        const item = document.createElement('div');
        item.className = 'toc-item';
        item.innerHTML = \`<span>🏷️ \${t.title}</span><span class="tag-badge exhibit">Doc</span>\`;
        item.onclick = () => scrollToCard(t.title);
        content.appendChild(item);
      });
    }
  }

  function filterSidebar(query) {
    renderSidebar(query);
  }

  function scrollToCard(title) {
    if (activePerspective !== 'cards') {
      switchPerspective('cards');
    }
    const cardEl = document.getElementById('card-' + encodeURIComponent(title));
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      cardEl.classList.add('highlighted');
      setTimeout(() => cardEl.classList.remove('highlighted'), 1800);
    }
  }

  function handleWikiLinkClick(title) {
    scrollToCard(title);
  }

  // 9. Case Auto-Save Synchronization
  async function saveWikiToCase() {
    try {
      const storeScript = document.querySelector('script.tiddlywiki-tiddler-store');
      const htmlDoc = '<!doctype html>\\n' + document.documentElement.outerHTML;

      const res = await fetch(\`http://127.0.0.1:\${API_PORT}/api/hayagriva/tiddlywiki/save?case=\${encodeURIComponent(CASE_NAME)}&file=\${encodeURIComponent(FILE_NAME)}\`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/html' },
        body: htmlDoc
      });

      if (res.ok) {
        clearDirty();
        showToast('✅ Saved changes successfully to ' + FILE_NAME);
      } else {
        showToast('❌ Save failed: ' + res.statusText, 4000);
      }
    } catch(e) {
      showToast('❌ Save error: ' + e.message, 4000);
    }
  }

  // 10. Continuous Court DOCX Export Hook
  async function exportCourtDocx() {
    showToast('🏛️ Compiling Court DOCX pleading...', 3000);
    try {
      const res = await fetch(\`http://127.0.0.1:\${API_PORT}/api/hayagriva/tiddlywiki/export-court-docx?case=\${encodeURIComponent(CASE_NAME)}&file=\${encodeURIComponent(FILE_NAME)}\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tiddlers: getTiddlersStore(),
          caseName: CASE_NAME,
          fileName: FILE_NAME
        })
      });

      if (res.ok) {
        const data = await res.json();
        showToast('✅ Exported court pleading: ' + (data.docxPath || 'exports/court_pleading.docx'), 4000);
      } else {
        // Fallback / Host dispatch
        window.parent.postMessage({
          type: 'export_court_docx',
          action: 'hayagriva:export_court_docx',
          caseName: CASE_NAME,
          fileName: FILE_NAME
        }, '*');
        showToast('Export dispatched to Hayagriva Sovereign Stitcher');
      }
    } catch(e) {
      console.warn('DOCX export endpoint trigger:', e.message);
      showToast('Export dispatched to Hayagriva Sovereign Stitcher');
    }
  }

  // Initialize view
  renderCardsView();
</script>
</body>
</html>`;
}

/**
 * Compiles parsed document section chunks into an array of TiddlyWiki tiddler objects.
 * @param {Array<Object>} chunks - List of chunks [{ section_title, content, page_number }]
 * @param {string} docTitle - Source document title
 * @returns {Array<Object>} List of tiddler card objects
 */
function buildTiddlersFromChunks(chunks = [], docTitle = 'Document') {
    const nowStr = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17);
    const tiddlers = [];
    const sectionNames = [];

    chunks.forEach((chunk, index) => {
        const title = chunk.section_title || `Section ${index + 1}`;
        sectionNames.push(title);
        
        tiddlers.push({
            title: title,
            text: chunk.content || '',
            created: nowStr,
            modified: nowStr,
            tags: `${docTitle} Chunk_${index + 1}`
        });
    });

    // Master index tiddler linking all sections
    const indexText = `## Master Index — ${docTitle}\n\nThis Legal Wiki was compiled from **${docTitle}** chunks.\n\n### Document Sections\n` + 
        sectionNames.map(name => `* [[${name}]]`).join('\n');

    tiddlers.unshift({
        title: `Index — ${docTitle}`,
        text: indexText,
        created: nowStr,
        modified: nowStr,
        tags: 'Master_Index Overview'
    });

    return tiddlers;
}

module.exports = { generateTiddlyWikiHtml, buildTiddlersFromChunks };
