const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Phase 5 / Task 11 Test: Sovereign Legal Word View First & Monaco Toggle ---');

const previewMgrTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/preview-manager.ts');
const commandsTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/commands.ts');
const extensionTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/extension.ts');

assert.strictEqual(fs.existsSync(previewMgrTsPath), true, 'FAIL: preview-manager.ts does not exist!');
assert.strictEqual(fs.existsSync(commandsTsPath), true, 'FAIL: commands.ts does not exist!');

const previewContent = fs.readFileSync(previewMgrTsPath, 'utf8');
const commandsContent = fs.readFileSync(commandsTsPath, 'utf8');
const extContent = fs.readFileSync(extensionTsPath, 'utf8');

// 1. Verify default .md open routing to Milkdown Word View
assert.strictEqual(extContent.includes("endsWith('.md')") && extContent.includes('openMilkdownEditor'), true, "FAIL: .md files do not route to openMilkdownEditor in extension.ts!");

// 2. Verify Raw Monaco Markdown toggle in preview-manager.ts
assert.strictEqual(previewContent.includes('Raw Monaco Markdown'), true, "FAIL: 'Raw Monaco Markdown' toggle button missing in preview-manager.ts!");
assert.strictEqual(previewContent.includes('hayagriva-monaco-toggle-btn'), true, "FAIL: 'hayagriva-monaco-toggle-btn' class missing in preview-manager.ts!");

// 3. Verify openMonacoMarkdown command registration in commands.ts
assert.strictEqual(commandsContent.includes('openMonacoMarkdown'), true, "FAIL: 'openMonacoMarkdown' command missing in commands.ts!");

console.log('✅ Sovereign Legal Word View First & Monaco Toggle test PASSED.');
