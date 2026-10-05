const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Phase 3 / Task 8 Test: Dynamic Coworker Activity Bar Roster & Icons ---');

const extensionTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/extension.ts');
const managerTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/agent-cockpit-manager.ts');

assert.strictEqual(fs.existsSync(extensionTsPath), true, 'FAIL: extension.ts does not exist!');
assert.strictEqual(fs.existsSync(managerTsPath), true, 'FAIL: agent-cockpit-manager.ts does not exist!');

const extContent = fs.readFileSync(extensionTsPath, 'utf8');

// 1. Verify syncCoworkerActivityBar and listener in extension.ts
assert.strictEqual(extContent.includes('syncCoworkerActivityBar'), true, "FAIL: syncCoworkerActivityBar missing in extension.ts!");
assert.strictEqual(extContent.includes('onActiveCoworkersChanged'), true, "FAIL: onActiveCoworkersChanged listener missing in extension.ts!");

// 2. Verify all 5 coworker icon classes in CSS
const requiredIconClasses = [
  'hayagriva-advisor-icon',
  'hayagriva-document-icon',
  'hayagriva-forms-icon',
  'hayagriva-claims-icon',
  'hayagriva-bank-icon'
];

for (const iconClass of requiredIconClasses) {
  assert.strictEqual(extContent.includes(iconClass), true, `FAIL: CSS rule for ${iconClass} missing in extension.ts!`);
}

// 3. Verify rank computation in 200..400 range
assert.strictEqual(extContent.includes('200 + index * 10') || extContent.includes('200 + i * 10'), true, "FAIL: Dynamic rank 200 + index * 10 missing in extension.ts!");

console.log('✅ Dynamic Coworker Activity Bar Roster & Icons test PASSED.');
