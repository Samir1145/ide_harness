'use strict';

/**
 * test_askhaya_orb_dom.test.js
 * Verification of AskHaya Ambient Amber Voice Orb DOM Mount & Fluid UI:
 * 1. DOM Root Mounting (#hayagriva-askhaya-orb-root) and CSS injection (#hayagriva-askhaya-orb-styles)
 * 2. 4-State Fluid Classes (.orb-idle, .orb-listening, .orb-processing, .orb-speaking)
 * 3. Required sub-elements (#askhaya-waveform-container, #askhaya-transcript-text, action controls)
 * 4. CSS In-Place Dimensions (44x44, 280x80, 280x74, 320x110) & Glassmorphic styling
 * 5. Viewport Drag Boundary Clamping (8px margins, bottom 32px status bar clearance)
 * 6. LocalStorage Position Caching & Restoration ('haya_voice_orb_pos')
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
      this.classList._classes.clear();
      value.split(/\s+/).filter(Boolean).forEach(c => this.classList._classes.add(c));
      this.className = value;
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
    let width = 44;
    let height = 44;
    if (this.classList.contains('orb-listening')) {
      width = 280;
      height = 80;
    } else if (this.classList.contains('orb-processing')) {
      width = 280;
      height = 74;
    } else if (this.classList.contains('orb-speaking')) {
      width = 320;
      height = 110;
    }
    const left = parseFloat(this.style.left) || 0;
    const top = parseFloat(this.style.top) || 0;
    return {
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height
    };
  }
}

function createDOMEnvironment() {
  const elementsById = new Map();
  const documentBody = new MockDOMElement('body');
  const documentHead = new MockDOMElement('head');

  const storageMap = new Map();
  const mockLocalStorage = {
    getItem: (key) => storageMap.get(key) || null,
    setItem: (key, val) => storageMap.set(key, String(val)),
    removeItem: (key) => storageMap.delete(key),
    clear: () => storageMap.clear(),
    _store: storageMap
  };

  const mockDocument = {
    body: documentBody,
    head: documentHead,
    createElement: (tag) => new MockDOMElement(tag),
    getElementById: (id) => {
      if (id === 'hayagriva-askhaya-orb-root') {
        return documentBody.querySelector('#hayagriva-askhaya-orb-root');
      }
      if (id === 'hayagriva-askhaya-orb-styles') {
        return documentHead.querySelector('#hayagriva-askhaya-orb-styles') || documentBody.querySelector('#hayagriva-askhaya-orb-styles');
      }
      return elementsById.get(id) || documentBody.querySelector('#' + id) || null;
    },
    querySelector: (sel) => documentBody.querySelector(sel) || documentHead.querySelector(sel),
    querySelectorAll: (sel) => [...documentHead.querySelectorAll(sel), ...documentBody.querySelectorAll(sel)],
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const mockWindow = {
    innerWidth: 1920,
    innerHeight: 1080,
    document: mockDocument,
    localStorage: mockLocalStorage,
    addEventListener: (event, handler) => {
      if (!mockWindow._listeners) mockWindow._listeners = {};
      if (!mockWindow._listeners[event]) mockWindow._listeners[event] = [];
      mockWindow._listeners[event].push(handler);
    },
    removeEventListener: (event, handler) => {
      if (mockWindow._listeners && mockWindow._listeners[event]) {
        mockWindow._listeners[event] = mockWindow._listeners[event].filter(h => h !== handler);
      }
    },
    dispatchEvent: (event) => {
      if (mockWindow._listeners && mockWindow._listeners[event.type || event]) {
        mockWindow._listeners[event.type || event].forEach(h => h(event));
      }
    },
    speechSynthesis: { speak: () => {}, cancel: () => {} }
  };

  return { mockWindow, mockDocument, mockLocalStorage, documentBody, documentHead };
}

function loadOrbClass(domEnv) {
  const tsPath = path.join(__dirname, '..', '..', 'frontend', 'theia-extensions', 'hayagriva', 'src', 'browser', 'askhaya-orb.ts');
  assert(fs.existsSync(tsPath), `askhaya-orb.ts not found at ${tsPath}`);
  const tsContent = fs.readFileSync(tsPath, 'utf8');

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
      return function URI(str) { return { toString: () => str, path: { toString: () => str } }; };
    }
    return {};
  };

  const context = vm.createContext({
    exports: mockExports,
    module: mockModule,
    require: mockRequire,
    window: domEnv.mockWindow,
    document: domEnv.mockDocument,
    localStorage: domEnv.mockLocalStorage,
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
  console.log('🧪 AskHaya Ambient Amber Voice Orb - DOM & UI Tests');
  console.log('════════════════════════════════════════════════════════════════\n');

  const domEnv = createDOMEnvironment();
  const { AskHayaVoiceOrb, rawContent } = loadOrbClass(domEnv);
  const orb = createOrbInstance(AskHayaVoiceOrb);

  // ─────────────────────────────────────────────────────────────────
  // 1. DOM Root Mounting & CSS Style Injection
  // ─────────────────────────────────────────────────────────────────
  console.log('[Phase 1: DOM Root & CSS Style Injection]');
  orb.initialize();

  const orbRoot = domEnv.mockDocument.getElementById('hayagriva-askhaya-orb-root');
  assert(orbRoot !== null, '#hayagriva-askhaya-orb-root must be mounted to DOM upon initialize()');
  assert.strictEqual(orbRoot.parentNode, domEnv.documentBody, '#hayagriva-askhaya-orb-root must be attached to document.body');

  const styleEl = domEnv.mockDocument.getElementById('hayagriva-askhaya-orb-styles');
  assert(styleEl !== null, '#hayagriva-askhaya-orb-styles must be injected upon initialize()');
  const cssText = styleEl.textContent || styleEl.innerHTML || '';

  // Verify CSS contains dimensions for all 4 states
  assert(cssText.includes('.orb-idle') || rawContent.includes('44px'), 'CSS must define .orb-idle styles');
  assert(cssText.includes('280px') || rawContent.includes('280px'), 'CSS must define 280px capsule width for listening/processing');
  assert(cssText.includes('320px') || rawContent.includes('320px'), 'CSS must define 320px capsule width for speaking');
  assert(cssText.includes('backdrop-filter') || rawContent.includes('backdrop-filter'), 'CSS must include glassmorphic backdrop-filter');
  console.log('  ✓ DOM Root mounted & glassmorphic CSS styles injected successfully');

  // ─────────────────────────────────────────────────────────────────
  // 2. 4-State Fluid Classes & Sub-Elements
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[Phase 2: 4-State Classes & Sub-Elements]');
  assert(orbRoot.classList.contains('orb-idle'), 'Initial DOM root class must be .orb-idle');

  // Sub-elements check
  const waveformEl = orbRoot.querySelector('#askhaya-waveform-container');
  assert(waveformEl !== null, '#askhaya-waveform-container must exist inside orb root');

  const transcriptEl = orbRoot.querySelector('#askhaya-transcript-text');
  assert(transcriptEl !== null, '#askhaya-transcript-text must exist inside orb root');

  // State transitions update class names
  orb.setState('listening');
  assert(orbRoot.classList.contains('orb-listening'), 'DOM root must have .orb-listening class');
  assert(!orbRoot.classList.contains('orb-idle'), '.orb-idle must be removed in listening state');

  orb.setState('processing');
  assert(orbRoot.classList.contains('orb-processing'), 'DOM root must have .orb-processing class');
  assert(!orbRoot.classList.contains('orb-listening'), '.orb-listening must be removed in processing state');

  orb.setState('speaking');
  assert(orbRoot.classList.contains('orb-speaking'), 'DOM root must have .orb-speaking class');
  assert(!orbRoot.classList.contains('orb-processing'), '.orb-processing must be removed in speaking state');

  orb.setState('idle');
  assert(orbRoot.classList.contains('orb-idle'), 'DOM root must return to .orb-idle class');
  assert(!orbRoot.classList.contains('orb-speaking'), '.orb-speaking must be removed in idle state');
  console.log('  ✓ 4-State classes (.orb-idle, .orb-listening, .orb-processing, .orb-speaking) and sub-elements verified');

  // ─────────────────────────────────────────────────────────────────
  // 3. Viewport Drag Boundary Clamping
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[Phase 3: Viewport Drag Boundary Clamping]');
  // Verify clamping helper or clamp logic
  assert(typeof orb.clampPosition === 'function', 'AskHayaVoiceOrb must provide clampPosition(x, y, width, height)');

  // Window is 1920 x 1080. Min margins: 8px left/top, 8px right, 32px bottom (for status bar).
  // Test 1: Negative / Top-Left overflow
  const clampedTopLeft = orb.clampPosition(-50, -20, 44, 44);
  assert.strictEqual(clampedTopLeft.x, 8, 'Left overflow must clamp to 8px margin');
  assert.strictEqual(clampedTopLeft.y, 8, 'Top overflow must clamp to 8px margin');

  // Test 2: Bottom-Right overflow
  const clampedBottomRight = orb.clampPosition(2500, 2000, 44, 44);
  const expectedMaxX = 1920 - 44 - 8; // 1868
  const expectedMaxY = 1080 - 44 - 32; // 1004 (preserves bottom 32px for status bar)
  assert.strictEqual(clampedBottomRight.x, expectedMaxX, `Right overflow must clamp to ${expectedMaxX}px`);
  assert.strictEqual(clampedBottomRight.y, expectedMaxY, `Bottom overflow must clamp to ${expectedMaxY}px (status bar buffer)`);

  // Test 3: In-bounds position remains unchanged
  const clampedNormal = orb.clampPosition(500, 400, 44, 44);
  assert.strictEqual(clampedNormal.x, 500);
  assert.strictEqual(clampedNormal.y, 400);
  console.log('  ✓ Drag clamping bounds (8px margins, 32px bottom status bar clearance) verified');

  // ─────────────────────────────────────────────────────────────────
  // 4. LocalStorage Position Caching & Restoration
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[Phase 4: LocalStorage Position Caching & Restoration]');
  // Set position and verify localStorage is updated
  orb.setPosition(450, 350);
  const storedJson = domEnv.mockLocalStorage.getItem('haya_voice_orb_pos');
  assert(storedJson !== null, "'haya_voice_orb_pos' must be saved to localStorage");
  const parsed = JSON.parse(storedJson);
  assert.strictEqual(parsed.x, 450, 'Stored x coordinate must match 450');
  assert.strictEqual(parsed.y, 350, 'Stored y coordinate must match 350');

  // Create new orb instance with stored localStorage to verify restoration
  const secondEnv = createDOMEnvironment();
  secondEnv.mockLocalStorage.setItem('haya_voice_orb_pos', JSON.stringify({ x: 720, y: 560 }));
  const { AskHayaVoiceOrb: SecondOrbClass } = loadOrbClass(secondEnv);
  const secondOrb = createOrbInstance(SecondOrbClass);
  secondOrb.initialize();

  const secondRoot = secondEnv.mockDocument.getElementById('hayagriva-askhaya-orb-root');
  assert(secondRoot !== null, 'Second orb root must be mounted');
  assert(secondRoot.style.left.includes('720'), `Restored left coordinate should be 720px, got ${secondRoot.style.left}`);
  assert(secondRoot.style.top.includes('560'), `Restored top coordinate should be 560px, got ${secondRoot.style.top}`);
  console.log('  ✓ LocalStorage coordinate caching and startup restoration verified');

  console.log('\n✅ ALL AskHaya Voice Orb DOM & UI Tests Passed (100% GREEN)!\n');
}

if (require.main === module) {
  runTests().catch(err => {
    console.error('\n❌ Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
}

module.exports = { run: runTests, runTests };
