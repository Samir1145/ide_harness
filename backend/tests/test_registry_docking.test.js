const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Phase 3 / Task 7 Test: Master Case Intake (@Registry) Pinned at Rank 100 ---');

const extensionTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/extension.ts');
const moduleTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/hayagriva-frontend-module.ts');

assert.strictEqual(fs.existsSync(extensionTsPath), true, 'FAIL: extension.ts does not exist!');

const extContent = fs.readFileSync(extensionTsPath, 'utf8');

// 1. Verify label '@Registry' at rank 100
assert.strictEqual(extContent.includes("explorerWidget.title.label = '@Registry'"), true, "FAIL: explorerWidget label '@Registry' missing in extension.ts!");
assert.strictEqual(extContent.includes("explorerWidget.title.caption = 'Master Case Intake & Docket'"), true, "FAIL: explorerWidget caption 'Master Case Intake & Docket' missing in extension.ts!");
assert.strictEqual(extContent.includes("explorerWidget.title.iconClass = 'hayagriva-registry-icon'"), true, "FAIL: iconClass 'hayagriva-registry-icon' missing in extension.ts!");

// 2. Verify CSS rules for hayagriva-registry-icon
assert.strictEqual(extContent.includes('.hayagriva-registry-icon'), true, "FAIL: CSS rule for '.hayagriva-registry-icon' missing in extension.ts!");

// 3. Verify HayagrivaNavigatorWidgetFactory title options
const moduleContent = fs.readFileSync(moduleTsPath, 'utf8');
assert.strictEqual(moduleContent.includes("label: '@Registry'"), true, "FAIL: HayagrivaNavigatorWidgetFactory does not configure '@Registry' label!");

console.log('✅ Master Case Intake (@Registry) docking test PASSED.');
