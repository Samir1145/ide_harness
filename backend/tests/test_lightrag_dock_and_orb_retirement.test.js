const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Phase 3 / Task 9 Test: Permanently Dock LightRAG & Retire Floating Orb ---');

const profileWidgetTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/profile-widget.ts');
const orbTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/askhaya-orb.ts');
const extensionTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/extension.ts');

assert.strictEqual(fs.existsSync(profileWidgetTsPath), true, 'FAIL: profile-widget.ts does not exist!');
assert.strictEqual(fs.existsSync(orbTsPath), true, 'FAIL: askhaya-orb.ts does not exist!');

const profileContent = fs.readFileSync(profileWidgetTsPath, 'utf8');
const orbContent = fs.readFileSync(orbTsPath, 'utf8');
const extContent = fs.readFileSync(extensionTsPath, 'utf8');

// 1. Verify LightRAG anchor CSS: bottom: 74px, left: 6px
assert.strictEqual(profileContent.includes('#hayagriva-lightrag-anchor'), true, "FAIL: #hayagriva-lightrag-anchor missing from profile-widget.ts!");
assert.strictEqual(profileContent.includes('74px'), true, "FAIL: '74px' anchor offset missing from profile-widget.ts!");
assert.strictEqual(profileContent.includes('⚡'), true, "FAIL: '⚡' LightRAG symbol missing from profile-widget.ts!");

// 2. Verify Slide-Over Precedent / Inquest drawer
assert.strictEqual(profileContent.includes('hayagriva-inquest-drawer'), true, "FAIL: #hayagriva-inquest-drawer missing from profile-widget.ts!");

// 3. Verify Floating Orb retirement
// In askhaya-orb.ts, floating DOM mount should be suppressed or gated
assert.strictEqual(orbContent.includes('isRetired') || orbContent.includes('display: none') || extContent.includes('// Retired floating AskHayaVoiceOrb') || !extContent.includes('this.voiceOrb.initialize()'), true, "FAIL: Floating orb retirement logic not detected!");

console.log('✅ LightRAG docking & Orb retirement test PASSED.');
