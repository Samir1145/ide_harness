'use strict';

/**
 * test_askhaya_monaco_bridge.test.js
 * Verification of AskHaya Monaco 1-Click Dossier Insertion & Global Alt+Space Hotkey:
 * 1. Static Contract & Interface Verification (insertDossierIntoEditor, toggleVoiceOrb, Alt+Space keybinding)
 * 2. Active Monaco Editor Insertion via executeEdits()
 * 3. Fallback Scratch Note opening when no editor is open
 * 4. DOM [Insert into Editor] button click integration
 * 5. HayagrivaCommandContribution command registration & state-aware execution
 * 6. KeybindingRegistry Alt+Space registration
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
    throw new Error('TypeScript compiler required: ' + e.message);
  }
}

class MockDOMElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this._classes = new Set();
    this.classList = {
      _classes: this._classes,
      add: (...cls) => {
        cls.forEach(c => this._classes.add(c));
      },
      remove: (...cls) => {
        cls.forEach(c => this._classes.delete(c));
      },
      contains: (c) => this._classes.has(c),
      toggle: (c, force) => {
        if (force === true) {
          this._classes.add(c);
        } else if (force === false) {
          this._classes.delete(c);
        } else if (this._classes.has(c)) {
          this._classes.delete(c);
        } else {
          this._classes.add(c);
        }
      }
    };
    this.style = {};
    this.children = [];
    this.childNodes = [];
    this.parentNode = null;
    this._innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.attributes = {};
    this.eventListeners = {};
  }

  get className() {
    return Array.from(this._classes).join(' ');
  }

  set className(val) {
    this._classes.clear();
    if (val) {
      val.split(/\s+/).filter(Boolean).forEach(c => this._classes.add(c));
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    this.childNodes = [];

    const stack = [this];
    const tokenRegex = /<(\/)?([a-zA-Z0-9\-]+)([^>]*)(\/?)>|([^<]+)/g;
    let token;
    while ((token = tokenRegex.exec(html)) !== null) {
      const isClosing = Boolean(token[1]);
      const tagName = token[2];
      const attrsStr = token[3] || '';
      const isSelfClosing = Boolean(token[4]) || ['input', 'img', 'br', 'hr'].includes((tagName || '').toLowerCase());
      const textContent = token[5];

      if (textContent) {
        const trimmed = textContent.trim();
        if (trimmed && stack.length > 0) {
          const current = stack[stack.length - 1];
          current.textContent = (current.textContent ? current.textContent + ' ' : '') + trimmed;
        }
      } else if (isClosing) {
        if (stack.length > 1 && stack[stack.length - 1].tagName.toLowerCase() === tagName.toLowerCase()) {
          stack.pop();
        }
      } else if (tagName) {
        const child = new MockDOMElement(tagName);
        const idMatch = attrsStr.match(/id=["']([^"']+)["']/);
        if (idMatch) {
          child.id = idMatch[1];
          child.setAttribute('id', idMatch[1]);
        }
        const classMatch = attrsStr.match(/class=["']([^"']+)["']/);
        if (classMatch) {
          child.className = classMatch[1];
          child.setAttribute('class', classMatch[1]);
        }
        const current = stack[stack.length - 1];
        if (current) {
          current.appendChild(child);
        }
        if (!isSelfClosing) {
          stack.push(child);
        }
      }
    }
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
    }
    const nodeIdx = this.childNodes.indexOf(child);
    if (nodeIdx !== -1) {
      this.childNodes.splice(nodeIdx, 1);
    }
    child.parentNode = null;
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = value;
    if (name === 'class') {
      this._classes.clear();
      value.split(/\s+/).filter(Boolean).forEach(c => this._classes.add(c));
    }
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  addEventListener(event, handler) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }

  removeEventListener(event, handler) {
    if (!this.eventListeners[event]) return;
    this.eventListeners[event] = this.eventListeners[event].filter(h => h !== handler);
  }

  dispatchEvent(event) {
    const listeners = this.eventListeners[event.type || event] || [];
    listeners.forEach(fn => fn(event));
  }

  querySelector(selector) {
    return this._findChild(this, selector);
  }

  querySelectorAll(selector) {
    const results = [];
    this._findAllChildren(this, selector, results);
    return results;
  }

  _findChild(node, selector) {
    for (const child of node.children) {
      if (this._matchesSelector(child, selector)) {
        return child;
      }
      const found = this._findChild(child, selector);
      if (found) return found;
    }
    return null;
  }

  _findAllChildren(node, selector, results) {
    for (const child of node.children) {
      if (this._matchesSelector(child, selector)) {
        results.push(child);
      }
      this._findAllChildren(child, selector, results);
    }
  }

  _matchesSelector(el, selector) {
    if (selector.startsWith('#')) {
      return el.id === selector.slice(1);
    }
    if (selector.startsWith('.')) {
      return el.classList.contains(selector.slice(1));
    }
    return el.tagName.toLowerCase() === selector.toLowerCase();
  }

  getBoundingClientRect() {
    return { left: 100, top: 100, width: 320, height: 110, right: 420, bottom: 210 };
  }
}

function loadOrbClass() {
  const tsPath = path.join(__dirname, '..', '..', 'frontend', 'theia-extensions', 'hayagriva', 'src', 'browser', 'askhaya-orb.ts');
  assert(fs.existsSync(tsPath), `askhaya-orb.ts not found at ${tsPath}`);
  const tsContent = fs.readFileSync(tsPath, 'utf8');

  // Verify static requirements
  assert(tsContent.includes('insertDossierIntoEditor'), "AskHayaVoiceOrb must implement 'insertDossierIntoEditor'");

  const transpiled = ts.transpileModule(tsContent, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      experimentalDecorators: true
    }
  }).outputText;

  const mockWindow = {
    innerWidth: 1920,
    innerHeight: 1080,
    addEventListener: () => {},
    removeEventListener: () => {},
    speechSynthesis: {
      speak: () => {},
      cancel: () => {}
    },
    Audio: class MockAudio {
      constructor(src) { this.src = src; }
      play() { return Promise.resolve(); }
      pause() {}
    }
  };

  const documentBody = new MockDOMElement('body');
  const documentHead = new MockDOMElement('head');

  const mockDocument = {
    createElement: (tag) => new MockDOMElement(tag),
    getElementById: (id) => {
      const fromBody = documentBody.querySelector(`#${id}`);
      if (fromBody) return fromBody;
      const fromHead = documentHead.querySelector(`#${id}`);
      if (fromHead) return fromHead;
      return null;
    },
    querySelector: (sel) => {
      const fromBody = documentBody.querySelector(sel);
      if (fromBody) return fromBody;
      const fromHead = documentHead.querySelector(sel);
      if (fromHead) return fromHead;
      return null;
    },
    head: documentHead,
    body: documentBody
  };

  const mockExports = {};
  const mockModule = { exports: mockExports };

  const mockRequire = (mod) => {
    if (mod === '@theia/core/shared/inversify') {
      return { injectable: () => () => {}, inject: () => () => {}, optional: () => () => {} };
    }
    if (mod === '@theia/core/lib/common/uri') {
      function URI(str) {
        return {
          toString: () => str,
          path: { toString: () => str }
        };
      }
      URI.default = URI;
      return { default: URI, __esModule: true, URI };
    }
    return {};
  };

  const context = vm.createContext({
    exports: mockExports,
    module: mockModule,
    require: mockRequire,
    window: mockWindow,
    document: mockDocument,
    Audio: mockWindow.Audio,
    SpeechSynthesisUtterance: function(text) { this.text = text; },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval
  });

  vm.runInContext(transpiled, context);
  return {
    AskHayaVoiceOrb: mockModule.exports.AskHayaVoiceOrb,
    rawContent: tsContent,
    mockDocument
  };
}

function loadCommandsContribution() {
  const tsPath = path.join(__dirname, '..', '..', 'frontend', 'theia-extensions', 'hayagriva', 'src', 'browser', 'commands.ts');
  assert(fs.existsSync(tsPath), `commands.ts not found at ${tsPath}`);
  const tsContent = fs.readFileSync(tsPath, 'utf8');

  assert(tsContent.includes('toggleVoiceOrb'), "commands.ts must register 'toggleVoiceOrb' command");
  assert(tsContent.includes('registerKeybindings'), "commands.ts must implement 'registerKeybindings'");
  assert(/alt\s+space/i.test(tsContent), "commands.ts must bind 'alt space' keybinding");

  const transpiled = ts.transpileModule(tsContent, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      experimentalDecorators: true
    }
  }).outputText;

  const mockExports = {};
  const mockModule = { exports: mockExports };

  const mockRequire = (mod) => {
    if (mod === '@theia/core/shared/inversify') {
      return { injectable: () => () => {}, inject: () => () => {}, optional: () => () => {} };
    }
    if (mod === '@theia/core/lib/common/uri') {
      function URI(str) {
        return {
          toString: () => str,
          path: { toString: () => str }
        };
      }
      URI.default = URI;
      return { default: URI, __esModule: true, URI };
    }
    if (mod === '@theia/core/lib/common/selection-service' || mod === '@theia/core/lib/common/selection') {
      return { UriSelection: { getUri: () => null } };
    }
    if (mod === './tree-decorator') {
      return { safeDecodeURI: (s) => s };
    }
    return {};
  };

  const context = vm.createContext({
    exports: mockExports,
    module: mockModule,
    require: mockRequire,
    window: { prompt: () => '', confirm: () => true },
    document: {},
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
  });

  vm.runInContext(transpiled, context);
  return {
    HayagrivaCommandContribution: mockModule.exports.HayagrivaCommandContribution,
    rawContent: tsContent
  };
}

async function runTests() {
  console.log('=== Task 4: AskHaya Monaco Bridge & Alt+Space Test Suite ===\n');

  // Test 1: Static Contract Verification
  console.log('1. Verifying TypeScript contracts for Monaco Bridge & Alt+Space...');
  const { AskHayaVoiceOrb, rawContent: orbTsContent, mockDocument } = loadOrbClass();
  const { HayagrivaCommandContribution, rawContent: cmdTsContent } = loadCommandsContribution();

  assert(orbTsContent.includes('insertDossierIntoEditor'), "AskHayaVoiceOrb must implement 'insertDossierIntoEditor'");
  assert(orbTsContent.includes('askhaya-action-insert'), "askhaya-orb.ts template must include '#askhaya-action-insert'");
  assert(cmdTsContent.includes('toggleVoiceOrb'), "commands.ts must include 'toggleVoiceOrb'");
  assert(cmdTsContent.includes('registerKeybindings'), "commands.ts must include 'registerKeybindings'");
  console.log('✓ TypeScript static contract signatures verified.\n');

  // Test 2: Active Monaco Editor Insertion via executeEdits()
  console.log('2. Testing active Monaco editor insertion via executeEdits()...');
  let executedEdits = null;
  const mockActiveEditor = {
    editor: {
      selection: { start: { line: 12, character: 0 }, end: { line: 12, character: 0 } },
      executeEdits: (edits) => {
        executedEdits = edits;
      },
      document: {
        uri: 'file:///mock/workspace/drafts/Resolution_Plan_Audit.md'
      }
    }
  };

  const mockEditorManager = {
    currentEditor: mockActiveEditor,
    activeEditor: mockActiveEditor,
    open: () => Promise.resolve()
  };

  const mockWorkspaceService = { getWorkspaceRootUri: () => 'file:///mock/workspace' };
  const mockPreferenceService = { get: (k, def) => def };
  const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  const mockShell = { getWidgets: () => [], activateWidget: () => {}, expandPanel: () => {} };
  const mockCommandRegistry = { registerCommand: () => ({ dispose: () => {} }) };

  const orb = new AskHayaVoiceOrb(
    mockWorkspaceService,
    mockPreferenceService,
    mockLogger,
    mockShell,
    mockCommandRegistry,
    mockEditorManager
  );

  const testDossier = `## ⚖️ Precedent Voice Counsel Dossier\n\n### Ratio Decidendi\nSection 240A IBC grants statutory exemption to MSME promoters from Section 29A(c) and (h) disqualifications.\n\n*References:* [Saroj Sharma v. Indian Bank (NCLAT 2024)]`;

  orb.setLastResult({
    query: 'Section 240A MSME promoter eligibility',
    spokenText: 'Under Section 240A, MSME promoters are exempt from Section 29A clauses c and h.',
    fullDossier: testDossier
  });

  const insertSuccess = await orb.insertDossierIntoEditor();
  assert.strictEqual(insertSuccess, true, 'insertDossierIntoEditor returns true on active editor');
  assert(executedEdits, 'executeEdits was invoked on active editor');
  assert.strictEqual(Array.isArray(executedEdits), true, 'Edits passed as array');
  assert.strictEqual(executedEdits.length, 1, 'Exactly one edit operation dispatched');
  assert(executedEdits[0].newText.includes('Precedent Voice Counsel Dossier'), 'Edit text contains dossier markdown');
  assert(executedEdits[0].newText.includes('Section 240A'), 'Edit text contains statutory ratio');
  console.log('✓ Markdown dossier injected into active Monaco editor at cursor position.\n');

  // Test 3: Fallback Scratch Note Opening when no editor is active
  console.log('3. Testing scratch note fallback when no active editor is open...');
  let openedUri = null;
  const mockEmptyEditorManager = {
    currentEditor: null,
    activeEditor: null,
    open: (uri) => {
      openedUri = uri;
      return Promise.resolve({
        editor: {
          executeEdits: () => {}
        }
      });
    }
  };

  const orbWithoutEditor = new AskHayaVoiceOrb(
    mockWorkspaceService,
    mockPreferenceService,
    mockLogger,
    mockShell,
    mockCommandRegistry,
    mockEmptyEditorManager
  );

  orbWithoutEditor.setLastResult({
    query: 'Section 14 moratorium',
    spokenText: 'Section 14 imposes an immediate moratorium upon CIRP admission.',
    fullDossier: '## Section 14 Moratorium Analysis\n\nAll recovery proceedings stayed.'
  });

  const fallbackSuccess = await orbWithoutEditor.insertDossierIntoEditor();
  assert.strictEqual(fallbackSuccess, true, 'insertDossierIntoEditor handles no active editor gracefully');
  assert(openedUri, 'editorManager.open was called with scratch URI');
  assert(openedUri.toString().includes('scratch_voice_dossier.md') || openedUri.toString().includes('drafts'), 'Opened scratch note URI');
  console.log('✓ Scratch note automatically created and opened when no editor is active.\n');

  // Test 4: DOM [📋 Insert] button click integration
  console.log('4. Testing DOM [Insert] button click event binding...');
  orb.mountDom();
  const insertBtn = mockDocument.getElementById('askhaya-action-insert');
  assert(insertBtn, '#askhaya-action-insert button exists in DOM');

  let btnInserted = false;
  executedEdits = null;
  insertBtn.dispatchEvent({ type: 'click', stopPropagation: () => {} });
  // Give async handler a moment
  await new Promise(r => setTimeout(r, 50));
  assert(executedEdits, 'Clicking #askhaya-action-insert executed edits into active editor');
  console.log('✓ DOM [Insert] button successfully triggered Monaco insertion.\n');

  // Test 5: Command Contribution & State-Aware Execution
  console.log('5. Testing hayagriva:toggleVoiceOrb command registration and state-aware execution...');
  const registeredCommands = new Map();
  const testCommandRegistry = {
    registerCommand: (desc, handler) => {
      registeredCommands.set(desc.id, { desc, handler });
      return { dispose: () => registeredCommands.delete(desc.id) };
    }
  };

  const registeredKeybindings = [];
  const testKeybindingRegistry = {
    registerKeybinding: (kb) => {
      registeredKeybindings.push(kb);
      return { dispose: () => {} };
    }
  };

  let orbActionTriggered = '';
  const mockVoiceOrbForCmd = {
    state: 'idle',
    getState: function() { return this.state; },
    startListening: function() { orbActionTriggered = 'startListening'; this.state = 'listening'; },
    stopListening: function() { orbActionTriggered = 'stopListening'; this.state = 'processing'; },
    stopSpeaking: function() { orbActionTriggered = 'stopSpeaking'; this.state = 'idle'; },
    cancel: function() { orbActionTriggered = 'cancel'; this.state = 'idle'; }
  };

  const mockContrib = { getCaseName: () => 'case1', getApiPort: () => 3210 };
  const mockTreeDec = {};
  const mockSelectionService = { selection: null };
  const mockMessageService = { info: () => {}, warn: () => {}, error: () => {} };

  const cmdContribution = new HayagrivaCommandContribution(
    mockWorkspaceService,
    mockEditorManager,
    mockContrib,
    mockTreeDec,
    mockSelectionService,
    mockMessageService,
    mockLogger,
    mockVoiceOrbForCmd
  );

  cmdContribution.registerCommands(testCommandRegistry);
  assert(registeredCommands.has('hayagriva:toggleVoiceOrb'), 'hayagriva:toggleVoiceOrb registered in CommandRegistry');
  assert(registeredCommands.has('hayagriva.toggleVoiceOrb'), 'hayagriva.toggleVoiceOrb alias registered');

  // State 1: When idle -> startListening
  mockVoiceOrbForCmd.state = 'idle';
  const toggleCmd = registeredCommands.get('hayagriva:toggleVoiceOrb').handler;
  toggleCmd.execute();
  assert.strictEqual(orbActionTriggered, 'startListening', 'When idle, toggleVoiceOrb triggers startListening');

  // State 2: When listening -> stopListening
  mockVoiceOrbForCmd.state = 'listening';
  toggleCmd.execute();
  assert.strictEqual(orbActionTriggered, 'stopListening', 'When listening, toggleVoiceOrb triggers stopListening');

  // State 3: When speaking -> stopSpeaking (instant barge-in / mute)
  mockVoiceOrbForCmd.state = 'speaking';
  toggleCmd.execute();
  assert.strictEqual(orbActionTriggered, 'stopSpeaking', 'When speaking, toggleVoiceOrb triggers stopSpeaking');

  // State 4: When processing -> cancel
  mockVoiceOrbForCmd.state = 'processing';
  toggleCmd.execute();
  assert.strictEqual(orbActionTriggered, 'cancel', 'When processing, toggleVoiceOrb triggers cancel');
  console.log('✓ Command hayagriva:toggleVoiceOrb is state-aware across all 4 lifecycle states.\n');

  // Test 6: Global Alt+Space Keybinding Registration
  console.log('6. Testing KeybindingRegistry Alt+Space registration...');
  assert(typeof cmdContribution.registerKeybindings === 'function', 'HayagrivaCommandContribution implements registerKeybindings');
  cmdContribution.registerKeybindings(testKeybindingRegistry);

  const altSpaceBinding = registeredKeybindings.find(k => k.command === 'hayagriva:toggleVoiceOrb');
  assert(altSpaceBinding, 'Keybinding registered for hayagriva:toggleVoiceOrb');
  assert.strictEqual(altSpaceBinding.keybinding.toLowerCase(), 'alt space', "Keybinding is 'alt space'");
  console.log('✓ Alt+Space keybinding registered with KeybindingRegistry.\n');

  // Test 7: Orb toggleVoiceOrb() helper
  console.log('7. Verifying AskHayaVoiceOrb.toggleVoiceOrb() method...');
  assert(typeof orb.toggleVoiceOrb === 'function', 'AskHayaVoiceOrb.toggleVoiceOrb is a function');
  orb.cancel();
  assert.strictEqual(orb.getState(), 'idle');
  orb.toggleVoiceOrb();
  assert.strictEqual(orb.getState(), 'listening', 'toggleVoiceOrb() starts listening when idle');
  orb.cancel();
  console.log('✓ AskHayaVoiceOrb.toggleVoiceOrb() operational.\n');

  console.log('=== ALL TASK 4 MONACO BRIDGE & ALT+SPACE TESTS PASSED! ===');
}

if (require.main === module) {
  runTests().catch(err => {
    console.error('\n❌ Task 4 Test Failed:', err);
    process.exit(1);
  });
}

module.exports = { run: runTests, runTests };
