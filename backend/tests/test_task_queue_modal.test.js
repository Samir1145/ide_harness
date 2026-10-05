const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Phase 2 / Task 6 Test: Task Queue & Reg 34B Fee Ledger Modal ---');

const modalTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/task-queue-modal.ts');
const moduleTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/hayagriva-frontend-module.ts');
const commandsTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/commands.ts');

// 1. Verify existence of task-queue-modal.ts
assert.strictEqual(fs.existsSync(modalTsPath), true, 'FAIL: task-queue-modal.ts does not exist!');

const modalContent = fs.readFileSync(modalTsPath, 'utf8');

// 2. Verify modal structure & ID
assert.strictEqual(modalContent.includes('hayagriva-task-queue-modal'), true, "FAIL: Modal ID 'hayagriva-task-queue-modal' missing!");
assert.strictEqual(modalContent.includes('Reg 34B'), true, "FAIL: Reg 34B statutory reference missing!");
assert.strictEqual(modalContent.includes('TaskQueueModal'), true, "FAIL: TaskQueueModal class missing!");

// 3. Verify table columns and currency formatting
assert.strictEqual(modalContent.includes('Assigned Coworker'), true, "FAIL: 'Assigned Coworker' column missing!");
assert.strictEqual(modalContent.includes('Status'), true, "FAIL: 'Status' column missing!");
assert.strictEqual(modalContent.includes('₹'), true, "FAIL: INR currency symbol '₹' missing!");

// 4. Verify binding in hayagriva-frontend-module.ts
const moduleContent = fs.readFileSync(moduleTsPath, 'utf8');
assert.strictEqual(moduleContent.includes('TaskQueueModal'), true, "FAIL: TaskQueueModal missing from hayagriva-frontend-module.ts!");

// 5. Verify wiring in commands.ts
const commandsContent = fs.readFileSync(commandsTsPath, 'utf8');
assert.strictEqual(commandsContent.includes('taskQueueModal'), true, "FAIL: taskQueueModal not injected or referenced in commands.ts!");

console.log('✅ Task Queue & Reg 34B Ledger Modal test PASSED.');
