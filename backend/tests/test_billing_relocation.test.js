const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Phase 1 / Task 3 Test: Billing Relocation from Left Bar ---');

const extensionTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/extension.ts');
const menusTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/menus.ts');

const extContent = fs.readFileSync(extensionTsPath, 'utf8');
const menusContent = fs.readFileSync(menusTsPath, 'utf8');

// 1. Verify billing explorer is omitted from left activity bar dock
assert.strictEqual(
  extContent.includes("this.shell.addWidget(this.billingWidget, { area: 'left'"),
  false,
  'FAIL: Billing explorer is still docked in left activity bar (billingWidget)!'
);

assert.strictEqual(
  extContent.includes("this.shell.addWidget(billingExplorer, { area: 'left'"),
  false,
  'FAIL: Billing explorer is still docked in left activity bar (billingExplorer)!'
);

// 2. Verify onStart does not dock Pillar 5 billing explorer
assert.strictEqual(
  extContent.includes('// Pillar 5: Billing Center'),
  false,
  'FAIL: Pillar 5 Billing Center is still present in onStart!'
);

// 3. Verify billing / estate accounts action is present in menus.ts
assert.strictEqual(
  menusContent.includes('Estate Accounts & Reg 34B Fee Ledger'),
  true,
  'FAIL: Estate Accounts & Reg 34B Fee Ledger is missing from menus.ts!'
);

console.log('✅ Billing Relocation test PASSED.');
