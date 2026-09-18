# Building and Running HAYAGRIVA

## 📂 Repository Structure

```text
ide_harness/
├── backend/            ← Core Node.js daemon (IPC API, SQLite FTS5/Vector, RAG pipeline)
├── frontend/           ← Eclipse Theia monorepo (Lerna/Yarn workspaces)
│   ├── theia-extensions/
│   │   ├── hayagriva/  ← Custom Monaco providers, status bars, slash commands, UI panels
│   │   └── product/    ← Application branding & splash screen contributions
│   └── applications/
│       └── electron/   ← Electron desktop application shell & packager
├── branding/           ← App logos, SVG/PNG icons, and splash assets
├── docs/               ← Architectural specs, guidelines, and documentation
└── launchers/          ← Cross-platform start and stop scripts
    ├── start.command / stop.command   (macOS)
    ├── start.bat / stop.bat           (Windows)
    └── start.sh / stop.sh             (Linux)
```

---

## 🚀 Running the Application (Day-to-Day)

### macOS 🍏
Double-click **`launchers/start.command`** in Finder, or run from Terminal:
```bash
./launchers/start.command
```
To stop all services:
```bash
./launchers/stop.command
```

### Windows 🪟
Double-click **`launchers\start.bat`**, or run in Command Prompt:
```cmd
launchers\start.bat
```
To stop all services:
```cmd
launchers\stop.bat
```

### Linux 🐧
Run from Terminal:
```bash
./launchers/start.sh
```
To stop all services:
```bash
./launchers/stop.sh
```

---

## 🛠️ Rebuilding Frontend Extensions & Electron Bundle

When you modify frontend code in `frontend/theia-extensions/`:

```bash
# 1. Compile the custom product extension
yarn --cwd frontend/theia-extensions/product build

# 2. Compile the Hayagriva Theia extension
yarn --cwd frontend/theia-extensions/hayagriva build

# 3. Package the Electron application
yarn --cwd frontend/applications/electron build
```

The launcher scripts automatically detect hash changes across extensions and dependency locks, performing incremental builds only when necessary.

---

## 🔄 Upgrading Eclipse Theia Upstream

Hayagriva preserves a breakproof boundary with upstream Eclipse Theia:
1. All custom UI widgets, language providers, and commands live strictly within `frontend/theia-extensions/` and consume public Theia extension APIs (`@theia/core`, `@theia/editor`, `@theia/monaco`).
2. To upgrade Eclipse Theia packages, update the `@theia/*` package versions in `frontend/applications/electron/package.json` and run:
   ```bash
   yarn --cwd frontend/applications/electron install
   yarn --cwd frontend/theia-extensions/hayagriva build
   yarn --cwd frontend/theia-extensions/product build
   yarn --cwd frontend/applications/electron build
   ```
