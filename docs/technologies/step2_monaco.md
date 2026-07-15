# Monaco Editor & Language Server Protocol (LSP) Technologies (Step 2)

This reference outlines the libraries and protocols used to power code editor features (autocomplete, hover lookup, and diagnostics check).

---

## Editor & LSP Integration

### 1. Monaco Editor (Eclipse Theia Integration)
* **Theia Editor Wrapper:** Integrates with Monaco editor instances via `@theia/editor` and `@theia/monaco` packages.
* **Diagnostics Markers:** Uses `monaco.editor.setModelMarkers` to paint squiggly lines under unverified citations and syntax issues.
* **Dropdown Autocomplete:** Registered using `monaco.languages.registerCompletionItemProvider` to handle triggers for `@` and `/` characters.
* **Inline Definitions (Hover):** Registered using `monaco.languages.registerHoverProvider` to query definition blocks based on cursor position offsets.

### 2. Markdown Language Service
* **[vscode-markdown-languageservice](https://www.npmjs.com/package/vscode-markdown-languageservice):** The language service used in the backend to calculate completions, parse links, compile diagnostics, and resolve hover contents.
* **[vscode-languageserver-textdocument](https://www.npmjs.com/package/vscode-languageserver-textdocument):** Used to construct document instances in memory (`TextDocument.create`) representing active Markdown files.
* **[markdown-it](https://www.npmjs.com/package/markdown-it):** Utilized by the custom LSP parser to tokenize the Markdown contents into structured node syntax trees.

### 3. API Communication
The frontend extension communicates with the backend proxy server via HTTP POST endpoints:
* `/api/lsp/diagnostics`: Requests verified warnings/errors.
* `/api/lsp/hover`: Requests hover content details.
* `/api/lsp/completions`: Requests list of auto-completion items.
