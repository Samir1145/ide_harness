const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Phase 2 / Task 5 Test: Agent Cockpit Manager & Directory Modal ---');

const managerTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/agent-cockpit-manager.ts');
const modalTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/agent-directory-modal.ts');

assert.strictEqual(fs.existsSync(managerTsPath), true, 'FAIL: agent-cockpit-manager.ts does not exist!');
assert.strictEqual(fs.existsSync(modalTsPath), true, 'FAIL: agent-directory-modal.ts does not exist!');

const mgrContent = fs.readFileSync(managerTsPath, 'utf8');
const modalContent = fs.readFileSync(modalTsPath, 'utf8');

// 1. Verify Coworker IDs in manager
assert.strictEqual(mgrContent.includes("'@Advisor'"), true, "FAIL: @Advisor missing from agent-cockpit-manager.ts!");
assert.strictEqual(mgrContent.includes("'@Document'"), true, "FAIL: @Document missing from agent-cockpit-manager.ts!");
assert.strictEqual(mgrContent.includes("'@Forms'"), true, "FAIL: @Forms missing from agent-cockpit-manager.ts!");
assert.strictEqual(mgrContent.includes("'@Claims'"), true, "FAIL: @Claims missing from agent-cockpit-manager.ts!");
assert.strictEqual(mgrContent.includes("'@BankForensic'"), true, "FAIL: @BankForensic missing from agent-cockpit-manager.ts!");

// 2. Verify categorized groups
assert.strictEqual(mgrContent.includes('Core Associates'), true, "FAIL: Category 'Core Associates' missing!");
assert.strictEqual(mgrContent.includes('Statutory Auditors'), true, "FAIL: Category 'Statutory Auditors' missing!");
assert.strictEqual(mgrContent.includes('Forensic Specialists'), true, "FAIL: Category 'Forensic Specialists' missing!");

// 3. Verify event emitter onActiveCoworkersChanged
assert.strictEqual(mgrContent.includes('onActiveCoworkersChanged'), true, "FAIL: onActiveCoworkersChanged missing from agent-cockpit-manager.ts!");

// 5. Verify bindings in hayagriva-frontend-module.ts
const moduleTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/hayagriva-frontend-module.ts');
const moduleContent = fs.readFileSync(moduleTsPath, 'utf8');
assert.strictEqual(moduleContent.includes('AgentCockpitManager'), true, "FAIL: AgentCockpitManager missing from hayagriva-frontend-module.ts!");
assert.strictEqual(moduleContent.includes('AgentDirectoryModal'), true, "FAIL: AgentDirectoryModal missing from hayagriva-frontend-module.ts!");

// 6. Verify wiring in commands.ts
const commandsTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/commands.ts');
const commandsContent = fs.readFileSync(commandsTsPath, 'utf8');
assert.strictEqual(commandsContent.includes('agentDirectoryModal'), true, "FAIL: agentDirectoryModal not injected or referenced in commands.ts!");

console.log('✅ Agent Cockpit Manager & Directory Modal test PASSED.');
