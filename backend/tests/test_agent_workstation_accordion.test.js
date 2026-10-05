const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Phase 4 / Task 10 Test: Agent Workstation 3-Tier Accordion Widget ---');

const widgetTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/agent-workstation-widget.ts');
const moduleTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/hayagriva-frontend-module.ts');

assert.strictEqual(fs.existsSync(widgetTsPath), true, 'FAIL: agent-workstation-widget.ts does not exist!');

const widgetContent = fs.readFileSync(widgetTsPath, 'utf8');

// 1. Verify Option 2 Accordion Nomenclature
assert.strictEqual(widgetContent.includes('Case Documents'), true, "FAIL: 'Case Documents' section title missing!");
assert.strictEqual(widgetContent.includes('Instructions'), true, "FAIL: 'Instructions' section title missing!");
assert.strictEqual(widgetContent.includes('Relationship Chart'), true, "FAIL: 'Relationship Chart' section title missing!");

// 2. Verify Section Accordion IDs / classes
assert.strictEqual(widgetContent.includes('hayagriva-accordion-docs'), true, "FAIL: hayagriva-accordion-docs section ID missing!");
assert.strictEqual(widgetContent.includes('hayagriva-accordion-instructions'), true, "FAIL: hayagriva-accordion-instructions section ID missing!");
assert.strictEqual(widgetContent.includes('hayagriva-accordion-chart'), true, "FAIL: hayagriva-accordion-chart section ID missing!");

// 3. Verify Document chips & Action chips
assert.strictEqual(widgetContent.includes('doc-chip'), true, "FAIL: Document chip class 'doc-chip' missing!");
assert.strictEqual(widgetContent.includes('action-chip'), true, "FAIL: Action chip class 'action-chip' missing!");

// 4. Verify binding in hayagriva-frontend-module.ts
const moduleContent = fs.readFileSync(moduleTsPath, 'utf8');
assert.strictEqual(moduleContent.includes('AgentWorkstationWidget'), true, "FAIL: AgentWorkstationWidget missing from hayagriva-frontend-module.ts!");

console.log('✅ Agent Workstation 3-Tier Accordion test PASSED.');
