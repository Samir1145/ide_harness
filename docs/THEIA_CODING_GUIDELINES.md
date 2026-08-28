# Eclipse Theia Coding Guidelines & Architectural Reference

This document codifies the official coding standards and architectural principles for developing Eclipse Theia extensions within the Hayagriva workspace, based on the [Eclipse Theia Coding Guidelines](https://github.com/eclipse-theia/theia/blob/master/doc/coding-guidelines.md).

---

## 1. General Formatting & Syntax

* **Indentation**: 4 spaces per indentation level.
* **Quotes**: Use `'single quotes'` for strings (except for template literals `` `...` ``).
* **Null vs Undefined**: Always use `undefined`. Do **not** use `null` unless interfacing with third-party CJS libraries or external JSON-RPC wire protocols that require literal `null`.
* **Imports**: Keep imports organized and clean. Import from `@theia/core/lib/browser/...` (or `/common/`) rather than deep unexported paths.

---

## 2. Naming Conventions

* **Types & Interfaces**: `PascalCase` (e.g. `CaseManifest`, `LspDiagnosticEntry`).
* **Enums**: `PascalCase` for both enum name and its enum values (e.g. `DocumentStatus.Reviewed`).
* **Functions & Methods**: `camelCase` (e.g. `openOfficePreview`, `resolveCaseDir`).
* **Properties & Local Variables**: `camelCase` (e.g. `workspaceRoot`, `activeLspCaseDir`).
* **Filenames**: Lowercase, dash-separated matching the primary export (e.g. `tree-decorator.ts`, `lsp-client.ts`).
* **Private Properties**: Do **not** prefix private members with `_` (exceptions: backing fields for getters/setters or JSON serialization attachments).
* **Event Names**: Follow the strict `on[Will|Did]VerbNoun?` pattern (e.g. `onWillSaveDocument`, `onDidInitializeLayout`, `onWorkspaceLocationChanged`).
* **Context Keys**: Always prefix context keys with the extension namespace (`hayagriva...`) to prevent collisions with core Theia or other extensions (e.g. `hayagriva.editor.isMarkdownActive`).

---

## 3. Dependency Injection (DI) & InversifyJS Architecture

### Rule: Interface + Symbol + Default Implementation
For services intended to be extensible, replaceable, or testable:
1. Declare an `interface`.
2. Declare a `Symbol` with the same name.
3. Provide a default class implementation (`...Impl`).
4. Bind both in the DI container module.

```ts
// 1. Symbol & Interface
export const CaseManager = Symbol('CaseManager');
export interface CaseManager {
    getActiveCase(): string;
    refreshCase(): Promise<void>;
}

// 2. Default Implementation
@injectable()
export class CaseManagerImpl implements CaseManager {
    getActiveCase(): string {
        return 'case_1';
    }
    async refreshCase(): Promise<void> {
        // ...
    }
}

// 3. Inversify Container Binding
bind(CaseManagerImpl).toSelf().inSingletonScope();
bind(CaseManager).toService(CaseManagerImpl);
```

> **Why?** A class with private/protected members is nominally typed in TypeScript. Binding only to a class token forces adopters and tests to subclass that concrete implementation. Binding to an `interface + Symbol` allows mock implementations and independent classes.

---

## 4. Modularity & Class Organization

* **One Primary Class Per File**: Avoid large monolithic files containing multiple unrelated classes. Split distinct responsibilities (LSP client, Monaco providers, Preview managers, Sidebar widgets) into dedicated files.
* **Keep Injected Fields Protected**: When creating injectable service classes, mark injected dependencies as `protected readonly` rather than `private` so that extension subclasses can access them.

---

## 5. Type Safety & Guardrails

* **Explicit Return Types**: Always explicitly declare return types on public methods (e.g. `async open(uri: URI): Promise<Widget>`) to avoid unintentional breaking changes when function bodies change.
* **Disposable Lifecycle**: Any event listener, timer, or DOM observer registered inside a widget or contribution **must** be cleaned up on widget disposal using `DisposableCollection` or `widget.disposed.connect(...)`.
* **Standard Theia Editor APIs**: Never call Monaco-internal DOM methods or selection mutations directly on a `TextEditor` instance. Always use standard Theia APIs:
  - Reading selection: `activeEditor.editor.document.getText(activeEditor.editor.selection)`
  - Editing document: `activeEditor.editor.executeEdits([{ range: activeEditor.editor.selection, newText: ... }])`

---

## 6. Internationalization (NLS) & Rich Content

* **Localization**: Use `nls.localize(key, defaultValue, ...args)` for all user-facing strings (commands, menus, notifications, dialogs).
* **Rich Content**: For rendering formatted descriptions or panels, use `MarkdownRenderer` and `MarkdownString` rather than raw HTML strings with `dangerouslySetInnerHTML`.

---

## 7. Code Organization & Multi-Target Layering

Eclipse Theia applications run across multiple runtime targets (Web Browser, Node.js Backend, and Electron Desktop). Source code inside extensions must be partitioned strictly by execution target:

```
my-theia-extension/src/
├── common/           → Environment-agnostic shared code (Interfaces, DTOs, Enums)
├── browser/          → Frontend Web & DOM UI layer (Widgets, Monaco, Decorators)
├── node/             → Backend Node.js services (File access, Child processes, SQLite)
├── electron-main/    → Electron Main process (Native Windows, macOS Dock icon)
└── electron-browser/ → Electron Renderer process (Desktop-specific UI integrations)
```

### Layer Dependency & Boundary Rules

| Layer | Runtime Target | Allowed Imports | Forbidden Imports |
| :--- | :--- | :--- | :--- |
| **`common/`** | Browser + Node + Electron | Basic JS/TS APIs only | **No DOM (`window`, `document`)**, **No Node (`fs`, `child_process`)** |
| **`browser/`** | Frontend Web & DOM | `common/` + Browser DOM / Monaco APIs | **No Node.js core modules (`fs`, `net`, `child_process`)** |
| **`node/`** | Backend Node.js Server | `common/` + Node.js core APIs | **No Browser DOM APIs (`document`, `HTMLElement`)** |
| **`electron-main/`** | Electron Main Process | `common/`, `node/` + Electron Main APIs | **No Browser DOM APIs** |
| **`electron-browser/`**| Electron Renderer | `common/`, `browser/` + Electron Renderer | **No Direct Node OS background locks** |

### Critical Architectural Guardrails

1. **Clean Browser Separation**: Code in `src/browser/` must never import Node core modules like `fs`, `child_process`, or `path`. Any backend filesystem operations must be invoked via WebSocket JSON-RPC or REST API endpoints.
2. **Platform-Agnostic Types**: All data models, interfaces, preference keys, command IDs, and event schemas used by both frontend and backend must live in `src/common/`.
3. **Cross-Process Communication**: Frontend and backend interact exclusively through typed JSON-RPC connections using Inversify-bound proxy services.

---

## 8. Extension Architecture vs. VS Code Plugin (`.vsix`) Interoperability

Eclipse Theia supports two distinct extensibility mechanisms: **Build-Time Theia Extensions** and **Runtime VS Code Plugins (`.vsix`)**.

### Architectural Differences

| Dimension | Native Theia Extension *(Hayagriva Standard)* | VS Code Plugin / Extension (`.vsix`) |
| :--- | :--- | :--- |
| **Loading Phase** | Build-time (packaged into the frontend/backend bundles) | Runtime (installed dynamically from Open VSX or `.vsix`) |
| **Execution Context**| Main Theia process (direct Inversify DI & Lumino shell access) | Sandboxed **Plugin Host Subprocess** (isolated from UI) |
| **UI Freedom** | Direct control over DOM, Monaco internals, Lumino layout | Restricted to Webviews, TreeViews, and standard API |
| **API Contract** | Theia Contribution Interfaces (`FrontendApplicationContribution`, etc.) | Standard VS Code Extension API (`vscode.*`) |

### Core Architectural Best Practices

1. **Out-of-Process Heavy Operations (Zero UI Freezing)**:
   - Always run CPU-heavy workloads (Markdown LSP linting, vector reranking, SQLite indexing, document parsing) in dedicated background processes or daemons (`stdio` / WebSocket JSON-RPC).
   - Never perform synchronous filesystem scans or heavy computations on the frontend UI thread.
2. **Standard Command Delegation**:
   - Reuse standard Theia/VS Code commands whenever possible (e.g. `vscode.diff`, `workbench.action.closeAllEditors`, `editor.action.triggerSuggest`) to ensure full keyboard shortcut and menu consistency.
3. **Runtime Plugin Compatibility**:
   - Because Theia includes `@theia/plugin-ext-vscode`, third-party VS Code plugins (e.g. GitLens, Python, Prettier) can be dropped into the `plugins/` directory and will run seamlessly alongside native Hayagriva extensions without interference.

---

## 9. Consuming Builtin & External VS Code Extensions (`.vsix`)

Refer to the official Theia Wiki on [Consuming Builtin and External VS Code Extensions](https://github.com/eclipse-theia/theia/wiki/Consuming-Builtin-and-External-VS-Code-Extensions).

### 1. Extension Discovery & Local Plugins Directory
* The desktop application passes `--plugins=local-dir:../../plugins` upon launch.
* Any valid `.vsix` archive or unzipped extension directory placed in `plugins/` is automatically discovered, verified for API compatibility, and launched inside the isolated plugin host subprocess.

### 2. Pre-Packaging Default Extensions (`theiaPlugins`)
To ship default extensions with an application build (e.g., Python, C/C++, or custom grammar highlighters), declare them in the application `package.json`:
```json
"theiaPlugins": {
  "vscode-builtin-markdown": "https://open-vsx.org/api/vscode/markdown/1.73.0/file/vscode.markdown-1.73.0.vsix",
  "eclipse-theia-builtin-pack": "https://open-vsx.org/api/eclipse-theia/builtin-extension-pack/0.1.0/file/eclipse-theia.builtin-extension-pack-0.1.0.vsix"
}
```
Run `theia download:plugins` in the build pipeline to pre-fetch these binaries into the distribution artifact.

### 3. Decision Matrix: When to Write an Extension vs. a Plugin
* **Write a Native Theia Extension (`theia-extensions/`)** when you need:
  - Deep customization of the IDE layout, sidebars, title bars, or status bars.
  - Direct Monaco editor provider registrations (e.g., law autocompletions, ghost text, citation links).
  - Custom multi-slot document viewers (PDF, Office, HTML preview iframes).
  - Direct InversifyJS dependency injection and event brokers.
* **Consume a VS Code Plugin (`.vsix`)** when you need:
  - Ready-made community tools (Python language servers, GitLens, Prettier, Docker, Vim).
  - Isolated background tools that communicate strictly through standard VS Code APIs (`vscode.*`).

---

## 10. Language Server Protocol (LSP) & Monaco WebSocket Integration

Refer to the official Theia Wiki on [LSP and Monaco Integration](https://github.com/eclipse-theia/theia/wiki/LSP-and-Monaco-Integration).

### 1. Architecture Overview
To maintain smooth 60 FPS editor performance without freezing the browser UI thread during heavy syntax/semantic parsing, Language Servers run out-of-process and communicate with Monaco over WebSockets:

```
┌────────────────────────────────────────────────────────┐
│ BROWSER / FRONTEND (src/browser/lsp-client.ts)         │
│   • Opens WebSocket connection to /lsp                 │
│   • Bridges JSON-RPC via vscode-ws-jsonrpc             │
│   • Maps diagnostics to Monaco markers (setModelMarkers)│
└────────────────────────▲───────────────────────────────┘
                         │ ws://127.0.0.1:3210/lsp
┌────────────────────────▼───────────────────────────────┐
│ BACKEND / DAEMON (backend/lib/daemon/)                 │
│   • WebSocket server multiplexer                       │
│   • Spawns dedicated child process (lsp-server-process) │
│   • Evaluates diagnostics & syncs SQLite database      │
└────────────────────────────────────────────────────────┘
```

### 2. Standard Protocol Lifecycle
1. **Connection & Initialization**:
   - Browser client connects on startup with a 3-second grace period.
   - Client sends `initialize` request with `rootUri` and `initializationOptions: { caseDir }`.
2. **Document Synchronization**:
   - `textDocument/didOpen` & `textDocument/didChange`: Dispatched when Monaco text models update.
3. **Diagnostics Publishing**:
   - Backend pushes `textDocument/publishDiagnostics` notifications.
   - Client converts LSP severity levels (`1 = Error`, `2 = Warning`) and positions to `monaco.MarkerSeverity` and sets them via `monaco.editor.setModelMarkers()`.
4. **Hover & Code Intelligence**:
   - Hover queries dispatch `textDocument/hover` request to the backend server with fallbacks for local cached lookups.




