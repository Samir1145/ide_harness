const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Phase 1 / Task 1 Test: Top Emblem & Chamber Cockpit ---');

const extensionTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/extension.ts');
const commandsTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/commands.ts');

const extContent = fs.readFileSync(extensionTsPath, 'utf8');
const cmdContent = fs.readFileSync(commandsTsPath, 'utf8');

// 1. Verify Flowing Stallion silhouette mask replaces the deity mask in .theia-icon
const deityMaskSnippet = 'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAWJ0lEQVR4nN1dC7hU1XX';
const stallionMaskSnippet = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAMfUlEQVR4nO1ba6xdRRVe';

assert.strictEqual(
  extContent.includes(deityMaskSnippet),
  false,
  'FAIL: Legacy deity mask (mosquito) is still present in extension.ts!'
);

assert.strictEqual(
  extContent.includes(stallionMaskSnippet),
  true,
  'FAIL: Flowing Stallion silhouette mask is missing from extension.ts!'
);

// 2. Verify amber gold color #fbbf24 is applied to .theia-icon
assert.strictEqual(
  extContent.includes('#fbbf24'),
  true,
  'FAIL: Amber gold #fbbf24 branding is missing from extension.ts!'
);

// 3. Verify hayagriva.openCockpitMenu command declaration in commands.ts
assert.strictEqual(
  cmdContent.includes('hayagriva.openCockpitMenu'),
  true,
  'FAIL: hayagriva.openCockpitMenu command declaration missing from commands.ts!'
);

// 4. Verify top-panel icon click handler wires to openCockpitMenu in extension.ts
assert.strictEqual(
  extContent.includes('openCockpitMenu'),
  true,
  'FAIL: Click handler for openCockpitMenu missing from extension.ts!'
);

console.log('✅ Top Emblem & Chamber Cockpit test PASSED.');
