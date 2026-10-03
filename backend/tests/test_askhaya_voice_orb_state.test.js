'use strict';

/**
 * test_askhaya_voice_orb_state.test.js
 * Verification of AskHayaVoiceOrb state machine architecture:
 * 1. Typed State Definitions ('idle' | 'listening' | 'processing' | 'speaking')
 * 2. State Transitions:
 *    - idle -> listening
 *    - listening -> processing
 *    - processing -> speaking
 *    - speaking -> idle
 * 3. Barge-in Interrupt:
 *    - speaking -> listening
 * 4. Event Listener Registry & Disposal (onStateChanged)
 * 5. Last Spoken Result Storage & Retrieval (getLastResult / setLastResult)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ts;
try {
  ts = require(path.join(__dirname, '..', '..', 'frontend', 'node_modules', 'typescript'));
} catch (_) {
  try {
    ts = require('typescript');
  } catch (e) {
    throw new Error('TypeScript compiler required to transpile askhaya-orb.ts: ' + e.message);
  }
}

function loadOrbClass() {
  const tsPath = path.join(__dirname, '..', '..', 'frontend', 'theia-extensions', 'hayagriva', 'src', 'browser', 'askhaya-orb.ts');
  assert(fs.existsSync(tsPath), `askhaya-orb.ts not found at ${tsPath}`);
  const tsContent = fs.readFileSync(tsPath, 'utf8');

  // Verify static TypeScript definitions
  assert(
    tsContent.includes("'idle'") &&
    tsContent.includes("'listening'") &&
    tsContent.includes("'processing'") &&
    tsContent.includes("'speaking'"),
    "OrbState must include 'idle', 'listening', 'processing', and 'speaking'"
  );

  const transpiled = ts.transpileModule(tsContent, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      experimentalDecorators: true
    }
  }).outputText;

  const mockWindow = {
    addEventListener: () => {},
    removeEventListener: () => {},
    speechSynthesis: { speak: () => {}, cancel: () => {} }
  };
  const mockDocument = {
    getElementById: () => null,
    querySelector: () => null
  };

  const mockExports = {};
  const mockModule = { exports: mockExports };

  const mockRequire = (mod) => {
    if (mod === '@theia/core/shared/inversify') {
      return { injectable: () => () => {}, inject: () => () => {}, optional: () => () => {} };
    }
    if (mod === '@theia/core/lib/common/uri') {
      return function URI(str) { return { toString: () => str, path: { toString: () => str } }; };
    }
    return {};
  };

  const context = vm.createContext({
    exports: mockExports,
    module: mockModule,
    require: mockRequire,
    window: mockWindow,
    document: mockDocument,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval
  });

  vm.runInContext(transpiled, context);
  return { AskHayaVoiceOrb: mockModule.exports.AskHayaVoiceOrb, rawContent: tsContent };
}

function createOrbInstance(AskHayaVoiceOrb) {
  const mockWorkspaceService = { getWorkspaceRootUri: () => 'file:///mock/workspace' };
  const mockPreferenceService = { get: (k, def) => def };
  const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  const mockShell = { getWidgets: () => [], activateWidget: () => {}, expandPanel: () => {} };
  const mockCommandRegistry = {};
  const mockEditorManager = { open: () => {} };

  return new AskHayaVoiceOrb(
    mockWorkspaceService,
    mockPreferenceService,
    mockLogger,
    mockShell,
    mockCommandRegistry,
    mockEditorManager
  );
}

async function runTests() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🧪 AskHaya Ambient Amber Voice Orb - State Machine Tests');
  console.log('════════════════════════════════════════════════════════════════\n');

  const { AskHayaVoiceOrb, rawContent } = loadOrbClass();

  // ─────────────────────────────────────────────────────────────────
  // 1. Static Method & Interface Verification
  // ─────────────────────────────────────────────────────────────────
  console.log('[Phase 1: Interface & Method Definitions]');
  const orb = createOrbInstance(AskHayaVoiceOrb);

  assert.strictEqual(typeof orb.getState, 'function', 'AskHayaVoiceOrb must implement getState()');
  assert.strictEqual(typeof orb.setState, 'function', 'AskHayaVoiceOrb must implement setState()');
  assert.strictEqual(typeof orb.onStateChanged, 'function', 'AskHayaVoiceOrb must implement onStateChanged()');
  assert.strictEqual(typeof orb.getLastResult, 'function', 'AskHayaVoiceOrb must implement getLastResult()');
  assert.strictEqual(typeof orb.setLastResult, 'function', 'AskHayaVoiceOrb must implement setLastResult()');
  console.log('  ✓ All required methods (getState, setState, onStateChanged, getLastResult, setLastResult) defined');

  // ─────────────────────────────────────────────────────────────────
  // 2. Initial State & Basic Transitions
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[Phase 2: Standard State Machine Transitions]');
  assert.strictEqual(orb.getState(), 'idle', 'Initial state must be idle');
  console.log('  ✓ Initial state is "idle"');

  const recordedStates = [];
  const listenerDisposer = orb.onStateChanged((newState) => {
    recordedStates.push(newState);
  });

  // idle -> listening
  orb.setState('listening');
  assert.strictEqual(orb.getState(), 'listening', 'State must be listening');

  // listening -> processing
  orb.setState('processing');
  assert.strictEqual(orb.getState(), 'processing', 'State must be processing');

  // processing -> speaking
  orb.setState('speaking');
  assert.strictEqual(orb.getState(), 'speaking', 'State must be speaking');

  // speaking -> idle
  orb.setState('idle');
  assert.strictEqual(orb.getState(), 'idle', 'State must return to idle');

  assert.deepStrictEqual(
    recordedStates,
    ['listening', 'processing', 'speaking', 'idle'],
    'State changes must be emitted in sequential order'
  );
  console.log('  ✓ Sequential transitions (idle -> listening -> processing -> speaking -> idle) verified');

  // ─────────────────────────────────────────────────────────────────
  // 3. Barge-In Interrupt Transition (speaking -> listening)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[Phase 3: Barge-In Interrupt Transition]');
  orb.setState('speaking');
  assert.strictEqual(orb.getState(), 'speaking', 'State set to speaking');

  // User speaks or clicks mic while speaking -> instant barge-in to listening
  orb.setState('listening');
  assert.strictEqual(orb.getState(), 'listening', 'State must transition directly from speaking to listening (barge-in)');
  console.log('  ✓ Barge-in transition (speaking -> listening) successfully triggered');

  // Return to idle
  orb.setState('idle');
  assert.strictEqual(orb.getState(), 'idle', 'State returned to idle');

  // ─────────────────────────────────────────────────────────────────
  // 4. Multiple Listeners & Listener Disposal
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[Phase 4: Multiple Listeners & Disposal]');
  let listenerAEvents = [];
  let listenerBEvents = [];

  const subA = orb.onStateChanged((s) => listenerAEvents.push(s));
  const subB = orb.onStateChanged((s) => listenerBEvents.push(s));

  orb.setState('listening');
  assert.deepStrictEqual(listenerAEvents, ['listening']);
  assert.deepStrictEqual(listenerBEvents, ['listening']);
  console.log('  ✓ Multiple concurrent listeners receive events');

  // Dispose subA, only subB should receive next state
  subA.dispose();
  orb.setState('processing');
  assert.deepStrictEqual(listenerAEvents, ['listening'], 'Disposed listener A must not receive further events');
  assert.deepStrictEqual(listenerBEvents, ['listening', 'processing'], 'Active listener B must receive processing event');
  console.log('  ✓ Listener disposal (.dispose()) stops notifications');

  subB.dispose();
  listenerDisposer.dispose();

  // ─────────────────────────────────────────────────────────────────
  // 5. Last Spoken Result Storage & Retrieval
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[Phase 5: Last Spoken Result Storage & Retrieval]');
  const freshOrb = createOrbInstance(AskHayaVoiceOrb);
  assert.strictEqual(freshOrb.getLastResult(), null, 'Initial lastResult must be null');

  const testResult = {
    spokenText: 'Section 7 CIRP admission requires debt above INR 1 Crore and default.',
    fullDossier: '### Section 7 Analysis\n\nFull legal analysis with precedents...',
    query: '@AskHaya what are the Section 7 requirements?'
  };

  freshOrb.setLastResult(testResult);
  assert.deepStrictEqual(
    freshOrb.getLastResult(),
    testResult,
    'getLastResult() must return the object stored via setLastResult()'
  );
  console.log('  ✓ Last result set & retrieved accurately');

  console.log('\n✅ ALL AskHaya Voice Orb State Machine Tests Passed (100% GREEN)!\n');
}

if (require.main === module) {
  runTests().catch(err => {
    console.error('\n❌ Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
}

module.exports = { run: runTests, runTests };
