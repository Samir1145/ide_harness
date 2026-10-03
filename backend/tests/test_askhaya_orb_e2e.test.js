'use strict';

/**
 * test_askhaya_orb_e2e.test.js
 * Comprehensive End-to-End Test Suite for AskHaya Ambient Amber Voice Orb:
 * 
 * 1. 4-State Machine Lifecycle & Transitions (idle -> listening -> processing -> speaking -> idle / barge-in)
 * 2. Drag Physics, Boundary Clamping (8px viewport margin, 32px statusbar) & LocalStorage Persistence
 * 3. Voice Inquest API Endpoint (POST /api/hayagriva/voice/inquest) with LightRAG & Sarvam Voice Payloads
 * 4. Monaco Editor Dossier Injection with Legal Citations & Scratchpad Fallback
 * 5. Global Hotkey Registration (Alt+Space) & Toggle Behavior
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const routes = require('../lib/routes');

let ts;
try {
  ts = require(path.join(__dirname, '..', '..', 'frontend', 'node_modules', 'typescript'));
} catch (_) {
  try {
    ts = require('typescript');
  } catch (e) {
    throw new Error('TypeScript compiler required to transpile TypeScript sources: ' + e.message);
  }
}

// ── Mock DOM & Browser Environment ──────────────────────────────────────────
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

  click() {
    this.dispatchEvent({
      type: 'click',
      target: this,
      currentTarget: this,
      preventDefault: () => {},
      stopPropagation: () => {}
    });
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

function transpileTsFile(relPath) {
  const fullPath = path.join(__dirname, '..', '..', relPath);
  assert(fs.existsSync(fullPath), `File not found at ${fullPath}`);
  const tsContent = fs.readFileSync(fullPath, 'utf8');
  return ts.transpileModule(tsContent, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      experimentalDecorators: true
    }
  }).outputText;
}

function createDOMEnvironment(options = {}) {
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
    querySelectorAll: (sel) => [...documentHead.querySelectorAll(sel), ...documentBody.querySelectorAll(sel)],
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const mockWindow = {
    innerWidth: options.innerWidth || 1920,
    innerHeight: options.innerHeight || 1080,
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
    speechSynthesis: {
      speak: (utterance) => {
        if (options.onSpeak) options.onSpeak(utterance);
        setTimeout(() => {
          if (utterance && utterance.onend) utterance.onend();
        }, 10);
      },
      cancel: () => {
        if (options.onSpeechCancel) options.onSpeechCancel();
      }
    },
    Audio: class MockAudio {
      constructor(src) {
        this.src = src;
        this.paused = true;
      }
      play() {
        this.paused = false;
        if (options.onAudioPlay) options.onAudioPlay(this.src);
        return Promise.resolve();
      }
      pause() {
        this.paused = true;
        if (options.onAudioPause) options.onAudioPause();
      }
    },
    fetch: options.fetch || (() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }))
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
    if (mod.startsWith('@theia/core/shared/inversify')) {
      return { injectable: () => (t) => t, inject: () => () => {}, optional: () => () => {} };
    }
    if (mod === '@theia/core/lib/common/uri') {
      function URI(str) {
        return {
          toString: () => str,
          path: { toString: () => str.replace(/^file:\/\//, '') }
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
    window: domEnv.mockWindow,
    document: domEnv.mockDocument,
    localStorage: domEnv.mockLocalStorage,
    Audio: domEnv.mockWindow.Audio,
    SpeechSynthesisUtterance: function(text) { this.text = text; },
    fetch: domEnv.mockWindow.fetch,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval
  });

  vm.runInContext(transpiled, context);
  return { AskHayaVoiceOrb: mockModule.exports.AskHayaVoiceOrb, rawContent: tsContent };
}

function createOrbInstance(AskHayaVoiceOrb, options = {}) {
  const mockWorkspaceService = {
    getWorkspaceRootUri: () => ({ toString: () => 'file:///Users/atulgrover/Desktop/HAYAGRIVA/harness/test_matter' })
  };
  const mockPrefService = {
    get: (key, def) => (options.apiPort && key === 'hayagriva.apiPort') ? options.apiPort : def
  };
  const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
  };
  const mockShell = {
    activeWidget: null,
    getWidgets: () => [],
    activateWidget: () => {},
    expandPanel: () => {}
  };
  const mockCommandRegistry = {
    executeCommand: async () => {},
    registerCommand: () => ({ dispose: () => {} })
  };
  const mockEditorManager = options.editorManager || {
    activeEditor: null,
    currentEditor: null,
    open: async () => ({})
  };

  return new AskHayaVoiceOrb(
    mockWorkspaceService,
    mockPrefService,
    mockLogger,
    mockShell,
    mockCommandRegistry,
    mockEditorManager
  );
}

// ── Helper for backend route dispatching ───────────────────────────────────
function dispatchRoute(urlPath, method, payload = null, queryParams = {}) {
  return new Promise((resolve, reject) => {
    const methodKey = String(method || 'GET').toUpperCase();
    const handler = (routes[methodKey] && routes[methodKey][urlPath]) || (routes.GET && routes.GET[urlPath]) || (routes.POST && routes.POST[urlPath]);
    if (!handler) {
      return reject(new Error(`Route ${urlPath} [${methodKey}] not registered in routes.js`));
    }

    const req = new http.IncomingMessage();
    req.method = method;
    req.url = urlPath;

    let resData = '';
    let resStatusCode = 200;
    let resHeaders = {};

    const res = {
      writeHead: (status, headers) => {
        resStatusCode = status;
        resHeaders = headers;
      },
      end: (data) => {
        if (data) resData += data;
        let parsed = null;
        try {
          parsed = JSON.parse(resData);
        } catch (_) {
          parsed = resData;
        }
        resolve({
          status: resStatusCode,
          headers: resHeaders,
          body: parsed
        });
      }
    };

    const parsedUrl = {
      pathname: urlPath,
      query: queryParams
    };

    const docsRoot = process.env.HOME || '/tmp';

    try {
      handler(req, res, parsedUrl, docsRoot);
      if (payload != null) {
        req.emit('data', Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)));
      }
      req.emit('end');
    } catch (err) {
      reject(err);
    }
  });
}

async function run() {
  console.log('======================================================================');
  console.log('       ASKHAYA AMBIENT AMBER VOICE ORB - END-TO-END TEST SUITE        ');
  console.log('======================================================================\n');

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 1: 4-State Machine Lifecycle & Transitions
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[Phase 1: 4-State Machine Lifecycle & Transitions]');
  {
    const domEnv = createDOMEnvironment();
    const { AskHayaVoiceOrb } = loadOrbClass(domEnv);
    const orb = createOrbInstance(AskHayaVoiceOrb);

    orb.initialize();

    assert.strictEqual(orb.getState(), 'idle', 'Initial state must be idle');
    const root = domEnv.mockDocument.getElementById('hayagriva-askhaya-orb-root');
    assert.ok(root, 'Orb DOM root must exist in DOM');
    assert.ok(root.classList.contains('orb-idle'), 'DOM must reflect orb-idle');

    const stateHistory = [];
    const subscription = orb.onStateChanged((newState) => {
      stateHistory.push(newState);
    });

    // 1. idle -> listening
    orb.setState('listening');
    assert.strictEqual(orb.getState(), 'listening', 'State must transition to listening');
    assert.ok(root.classList.contains('orb-listening'), 'DOM must reflect orb-listening');

    // 2. listening -> processing
    orb.setState('processing');
    assert.strictEqual(orb.getState(), 'processing', 'State must transition to processing');
    assert.ok(root.classList.contains('orb-processing'), 'DOM must reflect orb-processing');

    // 3. processing -> speaking
    orb.setLastResult({
      query: 'What is the CIRP admission date?',
      spokenText: 'The CIRP admission order was passed on 15th January 2024.',
      fullDossier: '# CIRP Admission\n\nOrder passed on 15th Jan 2024 under Section 7 IBC.'
    });
    orb.setState('speaking');
    assert.strictEqual(orb.getState(), 'speaking', 'State must transition to speaking');
    assert.ok(root.classList.contains('orb-speaking'), 'DOM must reflect orb-speaking');

    // 4. speaking -> idle
    orb.stopSpeaking();
    assert.strictEqual(orb.getState(), 'idle', 'State must return to idle');
    assert.ok(root.classList.contains('orb-idle'), 'DOM must return to orb-idle');

    // 5. Barge-in test: speaking -> listening
    orb.setState('speaking');
    assert.strictEqual(orb.getState(), 'speaking');
    orb.setState('listening'); // User begins speaking over the orb (direct barge-in)
    assert.strictEqual(orb.getState(), 'listening', 'Barge-in must transition speaking immediately to listening');

    subscription.dispose();
    assert.deepStrictEqual(
      stateHistory,
      ['listening', 'processing', 'speaking', 'idle', 'speaking', 'listening'],
      'State transition order must match exact expected sequence'
    );
    console.log('  ✓ Verified all 4 Orb states, transitions, event notifications, and barge-in interruption.');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 2: Drag Physics, Boundary Clamping & LocalStorage Persistence
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[Phase 2: Drag Physics, Boundary Clamping & LocalStorage Persistence]');
  {
    const storageKey = 'haya_voice_orb_pos';
    const domEnv = createDOMEnvironment({ innerWidth: 1920, innerHeight: 1080 });
    const { AskHayaVoiceOrb } = loadOrbClass(domEnv);
    const orb = createOrbInstance(AskHayaVoiceOrb);

    orb.initialize();
    const root = domEnv.mockDocument.getElementById('hayagriva-askhaya-orb-root');
    assert.ok(root, 'Orb DOM root must exist');

    // Simulate drag start at (100, 100)
    root.dispatchEvent({
      type: 'mousedown',
      clientX: 100,
      clientY: 100,
      button: 0,
      preventDefault: () => {},
      stopPropagation: () => {}
    });

    // Simulate drag move to far top-left offscreen (-200, -200) -> should clamp to min 8px
    domEnv.mockWindow.dispatchEvent({
      type: 'mousemove',
      clientX: -200,
      clientY: -200
    });
    domEnv.mockWindow.dispatchEvent({ type: 'mouseup' });

    let left = parseInt(root.style.left, 10);
    let top = parseInt(root.style.top, 10);
    assert.ok(left >= 8, `Left coordinate must clamp >= 8px, got ${left}`);
    assert.ok(top >= 8, `Top coordinate must clamp >= 8px, got ${top}`);

    // Verify localStorage updated
    let savedPos = JSON.parse(domEnv.mockLocalStorage.getItem(storageKey));
    assert.strictEqual(savedPos.x, left);
    assert.strictEqual(savedPos.y, top);

    // Simulate drag move to far bottom-right (3000, 3000) -> should clamp within innerWidth - 8, innerHeight - 32
    root.dispatchEvent({
      type: 'mousedown',
      clientX: left,
      clientY: top,
      button: 0,
      preventDefault: () => {},
      stopPropagation: () => {}
    });
    domEnv.mockWindow.dispatchEvent({
      type: 'mousemove',
      clientX: 3000,
      clientY: 3000
    });
    domEnv.mockWindow.dispatchEvent({ type: 'mouseup' });

    left = parseInt(root.style.left, 10);
    top = parseInt(root.style.top, 10);
    assert.ok(left <= 1920 - 8 - 44, `Left coordinate must not exceed viewport width bounds, got ${left}`);
    assert.ok(top <= 1080 - 32 - 44, `Top coordinate must respect 32px status bar clearance, got ${top}`);

    // Unmount and remount with cached coordinates
    root.parentNode.removeChild(root);
    assert.strictEqual(domEnv.mockDocument.getElementById('hayagriva-askhaya-orb-root'), null);

    // Create fresh instance with same localStorage
    const domEnv2 = createDOMEnvironment({ innerWidth: 1920, innerHeight: 1080 });
    domEnv2.mockLocalStorage.setItem(storageKey, JSON.stringify({ x: 450, y: 350 }));
    const { AskHayaVoiceOrb: AskHayaVoiceOrb2 } = loadOrbClass(domEnv2);
    const orb2 = createOrbInstance(AskHayaVoiceOrb2);
    orb2.initialize();
    const root2 = domEnv2.mockDocument.getElementById('hayagriva-askhaya-orb-root');
    assert.strictEqual(root2.style.left, '450px', 'Mounted Orb must restore persisted X position');
    assert.strictEqual(root2.style.top, '350px', 'Mounted Orb must restore persisted Y position');

    console.log('  ✓ Verified 8px margin boundaries, 32px statusbar clearance, and localStorage persistence.');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 3: Voice Inquest API Integration (LightRAG & Sarvam Voice)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[Phase 3: Voice Inquest API Integration]');
  {
    // 1. Submit Voice Inquest Request to Backend Route
    const inquestRes = await dispatchRoute('/api/hayagriva/voice/inquest', 'POST', {
      query: 'What are the voting threshold requirements for Section 30(4) plan approval under IBC?',
      case: '/Users/atulgrover/Desktop/HAYAGRIVA/harness/test_matter',
      voice: 'sarvam_ananya'
    });

    assert.strictEqual(inquestRes.status, 200, 'Endpoint should return 200 OK');
    const response = inquestRes.body;
    assert.strictEqual(response.success, true, 'Response must be success: true');
    assert.ok(response.spokenText && typeof response.spokenText === 'string', 'Response must include spokenText');
    assert.ok(response.fullDossier && typeof response.fullDossier === 'string', 'Response must include fullDossier');
    assert.ok(response.spokenText.length > 0, 'Spoken text summary must not be empty');

    // 2. Orb submitVoiceQuery end-to-end simulation with mock fetch
    let mockFetchCalled = false;
    const domEnv = createDOMEnvironment({
      fetch: async (url, opts) => {
        if (url.includes('/api/hayagriva/voice/inquest')) {
          mockFetchCalled = true;
          return {
            ok: true,
            status: 200,
            json: async () => response
          };
        }
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }
    });

    const { AskHayaVoiceOrb } = loadOrbClass(domEnv);
    const orb = createOrbInstance(AskHayaVoiceOrb);

    orb.initialize();

    // Submit voice query and verify transition to speaking with legal dossier
    await orb.submitVoiceQuery('What are the voting threshold requirements for Section 30(4) plan approval under IBC?');

    assert.ok(mockFetchCalled, 'submitVoiceQuery must invoke the /api/hayagriva/voice/inquest API endpoint');
    assert.strictEqual(orb.getState(), 'speaking', 'Orb should transition to speaking on API response');
    const lastRes = orb.getLastResult();
    assert.ok(lastRes, 'Orb must store lastResult');
    assert.ok(lastRes.spokenText.length > 0, 'lastResult.spokenText must be populated');
    assert.ok(lastRes.fullDossier.length > 0, 'lastResult.fullDossier must be populated');

    console.log('  ✓ Inquest endpoint executed successfully, returned synthesized voice summary and statutory dossier.');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 4: Monaco Editor Dossier Injection with Legal Citations & Scratchpad
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[Phase 4: Monaco Editor Dossier Injection & Scratchpad Fallback]');
  {
    const sampleDossier = `# AskHaya Sovereign Legal Dossier
## Query: Voting Share Thresholds (§ 30(4) IBC)
**Date:** 2026-10-03

### Statutory Mandate
Under Section 30(4) of the Insolvency and Bankruptcy Code, 2016, the Committee of Creditors may approve a resolution plan by a vote of not less than sixty-six per cent (66%) of voting share of the financial creditors.

### Landmark Precedents
1. *Committee of Creditors of Essar Steel India Ltd. v. Satish Kumar Gupta & Ors.* (2019) 8 SCC 531
2. *K. Sashidhar v. Indian Overseas Bank & Ors.* (2019) 12 SCC 150
`;

    // Case A: Active Monaco Editor is open
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

    const domEnvActive = createDOMEnvironment();
    const { AskHayaVoiceOrb: AskHayaVoiceOrbActive } = loadOrbClass(domEnvActive);
    const orbActive = createOrbInstance(AskHayaVoiceOrbActive, {
      editorManager: {
        activeEditor: mockActiveEditor,
        currentEditor: mockActiveEditor,
        open: async () => {}
      }
    });

    orbActive.initialize();
    orbActive.setLastResult({
      query: 'Voting thresholds under 30(4)',
      spokenText: 'Summary of voting thresholds under 30(4)',
      fullDossier: sampleDossier
    });
    orbActive.setState('speaking');

    // Click [Insert into Editor] DOM button
    const root = domEnvActive.mockDocument.getElementById('hayagriva-askhaya-orb-root');
    const insertBtn = root.querySelector('#askhaya-action-insert');
    assert.ok(insertBtn, 'Insert into editor button (#askhaya-action-insert) must exist in DOM');

    insertBtn.click();

    assert.ok(executedEdits, 'executeEdits must be called on the active Monaco editor');
    assert.ok(executedEdits[0].newText.includes('AskHaya Sovereign Legal Dossier'));
    assert.ok(executedEdits[0].newText.includes('Section 30(4)'));
    assert.ok(executedEdits[0].newText.includes('Essar Steel'));

    // Case B: No editor is open -> Scratchpad Note fallback
    let openedUri = null;
    const domEnvScratch = createDOMEnvironment();
    const { AskHayaVoiceOrb: AskHayaVoiceOrbScratch } = loadOrbClass(domEnvScratch);
    const orbScratch = createOrbInstance(AskHayaVoiceOrbScratch, {
      editorManager: {
        activeEditor: null,
        currentEditor: null,
        open: async (uri) => {
          openedUri = uri;
          return {};
        }
      }
    });

    orbScratch.initialize();
    orbScratch.setLastResult({
      query: 'Voting thresholds under 30(4)',
      spokenText: 'Summary of voting thresholds under 30(4)',
      fullDossier: sampleDossier
    });
    orbScratch.setState('speaking');

    const rootScratch = domEnvScratch.mockDocument.getElementById('hayagriva-askhaya-orb-root');
    const insertBtnScratch = rootScratch.querySelector('#askhaya-action-insert');
    assert.ok(insertBtnScratch, 'Insert button must exist');

    insertBtnScratch.click();

    assert.ok(openedUri, 'EditorManager.open must be called to open scratchpad note when no editor is active');
    console.log('  ✓ Verified 1-Click Monaco dossier injection with legal citations and automatic scratchpad fallback.');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 5: Global Hotkey Registration (Alt+Space) & Toggle Behavior
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[Phase 5: Global Hotkey Registration (Alt+Space) & Toggle Behavior]');
  {
    const domEnv = createDOMEnvironment();
    const { AskHayaVoiceOrb } = loadOrbClass(domEnv);
    const orb = createOrbInstance(AskHayaVoiceOrb);

    orb.initialize();

    assert.strictEqual(orb.getState(), 'idle');

    // 1. First toggle: idle -> listening
    orb.toggleVoiceOrb();
    assert.strictEqual(orb.getState(), 'listening', 'First Alt+Space toggle must activate listening');

    // 2. Second toggle: listening -> idle
    orb.toggleVoiceOrb();
    assert.strictEqual(orb.getState(), 'idle', 'Second Alt+Space toggle while listening must cancel to idle');

    // 3. Third toggle: speaking -> idle
    orb.setLastResult({
      query: 'Test query',
      spokenText: 'Speaking advice',
      fullDossier: 'Dossier text'
    });
    orb.setState('speaking');
    assert.strictEqual(orb.getState(), 'speaking');
    orb.toggleVoiceOrb();
    assert.strictEqual(orb.getState(), 'idle', 'Alt+Space toggle while speaking must stop speech and return to idle');

    // Verify HayagrivaKeybindingContribution and CommandContribution static contracts
    const commandsCode = transpileTsFile('frontend/theia-extensions/hayagriva/src/browser/commands.ts');
    assert.ok(
      commandsCode.includes('toggleVoiceOrb') && /alt\s+space/i.test(commandsCode),
      'commands.ts must register Alt+Space keybinding for toggleVoiceOrb'
    );

    console.log('  ✓ Verified Alt+Space hotkey registration and interactive state toggle behavior.');
  }

  console.log('\n======================================================================');
  console.log('   ✓ SUCCESS: All AskHaya Amber Voice Orb End-to-End Tests Passed!   ');
  console.log('======================================================================\n');
}

if (require.main === module) {
  run().catch(err => {
    console.error('\n❌ E2E TEST FAILED:', err);
    process.exit(1);
  });
}

module.exports = { run };
