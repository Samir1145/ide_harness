const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Phase 2 / Task 4 Test: Top Agents Menubar Menu ---');

const menusTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/menus.ts');
const commandsTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/commands.ts');

const menusContent = fs.readFileSync(menusTsPath, 'utf8');
const commandsContent = fs.readFileSync(commandsTsPath, 'utf8');

// 1. Verify AGENTS_MAIN_MENU is defined
assert.strictEqual(
  menusContent.includes('AGENTS_MAIN_MENU'),
  true,
  'FAIL: AGENTS_MAIN_MENU constant is missing from menus.ts!'
);

// 2. Verify registered submenu with label 'Agents'
assert.strictEqual(
  menusContent.includes("registerSubmenu(AGENTS_MAIN_MENU, 'Agents'"),
  true,
  "FAIL: Submenu 'Agents' registration missing from menus.ts!"
);

// 3. Verify Manage Agents menu action
assert.strictEqual(
  menusContent.includes('hayagriva.manageAgents'),
  true,
  'FAIL: hayagriva.manageAgents menu action missing from menus.ts!'
);

// 4. Verify Task Queue menu action
assert.strictEqual(
  menusContent.includes('hayagriva.openTaskQueue'),
  true,
  'FAIL: hayagriva.openTaskQueue menu action missing from menus.ts!'
);

// 5. Verify command registrations in commands.ts
assert.strictEqual(
  commandsContent.includes('hayagriva.manageAgents'),
  true,
  'FAIL: hayagriva.manageAgents command registration missing from commands.ts!'
);

assert.strictEqual(
  commandsContent.includes('hayagriva.openTaskQueue'),
  true,
  'FAIL: hayagriva.openTaskQueue command registration missing from commands.ts!'
);

console.log('✅ Top Agents Menu test PASSED.');
