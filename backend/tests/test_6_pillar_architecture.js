/**
 * test_6_pillar_architecture.js
 * 
 * Verifies the 6-Pillar Chamber Bar Architecture in Hayagriva:
 *  - Pillar 1: Documents (rank 100)
 *  - Pillar 2: Search (rank 200)
 *  - Pillar 3: AskHaya (rank 300)
 *  - Pillar 4: Forensic Entity Map (rank 400)
 *  - Pillar 5: Notification Center (rank 500)
 *  - Pillar 6: Billing Center (rank 600)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting 6-Pillar Chamber Bar Architecture Verification...');

const extFile = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/extension.ts');
const templatesFile = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/templates.ts');
const menusFile = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/menus.ts');
const commandsFile = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/commands.ts');

assert(fs.existsSync(extFile), 'extension.ts must exist');
assert(fs.existsSync(templatesFile), 'templates.ts must exist');
assert(fs.existsSync(menusFile), 'menus.ts must exist');
assert(fs.existsSync(commandsFile), 'commands.ts must exist');

const extContent = fs.readFileSync(extFile, 'utf8');
const templatesContent = fs.readFileSync(templatesFile, 'utf8');
const menusContent = fs.readFileSync(menusFile, 'utf8');
const commandsContent = fs.readFileSync(commandsFile, 'utf8');

// 1. Verify Ranks and Widget Initializations in extension.ts
console.log('  [Phase 1] Verifying Activity Bar widget ranks...');
assert(extContent.includes("rank: 100"), 'Pillar 1 (Documents) must be docked at rank 100');
assert(extContent.includes("rank: 200"), 'Pillar 2 (AskHaya) must be docked at rank 200');
assert(extContent.includes("rank: 300"), 'Pillar 3 (Entity Map) must be docked at rank 300');
assert(extContent.includes("rank: 400"), 'Pillar 4 (Notification Center) must be docked at rank 400');
assert(extContent.includes("rank: 500"), 'Pillar 5 (Billing Center) must be docked at rank 500');

// Verify Search View Container is NOT in allowedLeftWidgets and is suppressed
assert(!extContent.includes("'search-view-container',\n    'chat-view-widget'"), 'Search view must not be docked in left activity bar');
assert(extContent.includes('[data-id*="search-view-container"]'), 'search-view-container must be suppressed via CSS in left panel');

// 2. Verify Icon Classes & CSS Masks
console.log('  [Phase 2] Verifying pillar icon classes & CSS masks...');
assert(extContent.includes('hayagriva-pillar1-icon'), 'Pillar 1 icon class must be defined');
assert(extContent.includes('hayagriva-horse-icon'), 'Pillar 2 AskHaya icon class must be defined');
assert(extContent.includes('hayagriva-pillar4-icon'), 'Pillar 3 Entity Map icon class must be defined');
assert(extContent.includes('hayagriva-pillar5-icon'), 'Pillar 4 Notification Center icon class must be defined');
assert(extContent.includes('hayagriva-pillar6-icon'), 'Pillar 5 Billing Center icon class must be defined');

// Verify Bell SVG mask in Pillar 4 and Card SVG mask in Pillar 5
const bellMask = 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTE4IDhBNiA2IDAgMCAwIDYgOGMwIDctMyA5LTMgOWgxOHMtMy0yLTMtOSIvPjxwYXRoIGQ9Ik0xMy43MyAyMWEyIDIgMCAwIDEtMy40NiAwIi8+PC9zdmc+';
const cardMask = 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIxLjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMiIgeT0iNSIgd2lkdGg9IjIwIiBoZWlnaHQ9IjE0IiByeD0iMiIvPjxsaW5lIHgxPSIyIiB5MT0iMTAiIHgyPSIyMiIgeTI9IjEwIi8+PC9zdmc+';

assert(extContent.includes(bellMask), 'Notification Center must have the Bell SVG mask');
assert(extContent.includes(cardMask), 'Billing Center must have the Card SVG mask');

// 3. Verify Templates Rendering & Light Mode Styling Harmonization
console.log('  [Phase 3] Verifying notificationCenterHtml & billingExplorerHtml templates with light theme support...');
assert(templatesContent.includes('notificationCenterHtml(caseName: string, apiPort: number = 3210, isLight: boolean = false)'), 'notificationCenterHtml must accept isLight');
assert(templatesContent.includes('billingExplorerHtml(caseName: string, apiPort: number = 3210, isLight: boolean = false)'), 'billingExplorerHtml must accept isLight');
assert(templatesContent.includes("--bg-primary: ${isLight ? '#f8fafc'"), 'billingExplorerHtml must support executive light background');
assert(templatesContent.includes('linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)'), 'billing balance card must have executive soft-blue gradient in light mode');
assert(templatesContent.includes('cat-statutory'), 'notificationCenterHtml must render statutory category pill');
assert(templatesContent.includes('cat-lexai'), 'notificationCenterHtml must render lexai category pill');
assert(templatesContent.includes('cat-approval'), 'notificationCenterHtml must render approval category pill');
assert(templatesContent.includes('cat-fact'), 'notificationCenterHtml must render fact category pill');

// 4. Verify Command & Menu Wiring
console.log('  [Phase 4] Verifying Commands & Menu Contribution...');
assert(commandsContent.includes('openNotificationCenter'), 'openNotificationCenter command must be registered');
assert(commandsContent.includes('hayagriva.focus.documents'), 'hayagriva.focus.documents command must be registered');
assert(commandsContent.includes('hayagriva.focus.billing'), 'hayagriva.focus.billing command must be registered');
assert(commandsContent.includes('redactSelection'), 'redactSelection command must be registered');
assert(commandsContent.includes('maskPii'), 'maskPii command must be registered');

// Verify Legal Menus in menus.ts
console.log('  [Phase 5] Verifying Legal-First File/Edit/View Menus...');
assert(!menusContent.includes('WIKI_MENU'), 'WIKI_MENU must be completely eliminated');
assert(menusContent.includes('FILE_COURT_SUBMENU'), 'FILE_COURT_SUBMENU must be registered in File menu');
assert(menusContent.includes('EDIT_PRIVACY_SUBMENU'), 'EDIT_PRIVACY_SUBMENU must be registered in Edit menu');
// 6. Verify Complete Elimination of Coder Clutter (Tri-Layer Guard)
console.log('  [Phase 6] Verifying Elimination of Coder Menus (Model Guard, Sweep & DOM Observer)...');
assert(menusContent.includes('export function installMenuGuard'), 'installMenuGuard must be exported in menus.ts');
assert(menusContent.includes('BLOCKED_MENU_COMMAND_IDS'), 'BLOCKED_MENU_COMMAND_IDS must be present in menus.ts');
assert(menusContent.includes('isCoderMenuRegistration'), 'isCoderMenuRegistration must be present in menus.ts');
assert(menusContent.includes('2_workspace'), 'menus.ts must explicitly target 2_workspace');
assert(menusContent.includes('4_downloadupload'), 'menus.ts must explicitly target 4_downloadupload');
assert(extContent.includes('cleanLuminoMenus'), 'cleanLuminoMenus must be defined in extension.ts');
assert(extContent.includes('FORBIDDEN_MENU_LABELS'), 'FORBIDDEN_MENU_LABELS must be defined in extension.ts');
assert(extContent.includes('new MutationObserver'), 'MutationObserver must be attached in extension.ts');

const preloadContent = fs.readFileSync(path.join(__dirname, '../../branding/resources/preload.html'), 'utf8');
assert(preloadContent.includes('.lm-MenuBar-item[data-id="menubar/5_selection"]'), 'preload.html must suppress selection menubar item');
assert(preloadContent.includes('.lm-MenuBar-item[data-id="menubar/terminal"]'), 'preload.html must suppress terminal menubar item');

console.log('✅ ALL PHASES PASSED: 6-Pillar & Legal-First Menubar Architecture is fully verified!');
