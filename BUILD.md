# Building and Running HAYAGRIVA

## 📂 Repository Structure

```text
ide_harness/
├── backend/            ← Core Node.js daemon (IPC API, SQLite FTS5/Vector, RAG pipeline)
├── frontend/           ← Eclipse Theia monorepo (Theia 1.75.0, Electron 42.8.1)
│   ├── theia-extensions/
│   │   ├── hayagriva/  ← Custom Monaco providers, status bars, slash commands, UI panels
│   │   ├── product/    ← Application branding & splash screen contributions
│   │   ├── launcher/   ← Welcome / launcher screen and recent case management
│   │   └── updater/    ← Automatic update checking & notification UI
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

## 📋 System Prerequisites

* **Node.js:** `v22.x LTS` (Node 22 is required across frontend, backend, and CI runners)
* **Yarn:** `1.22.x` (Classic)
* **Python:** 3.10+ with `setuptools` (required for native module compilation via `node-gyp`)
* **C++ Build Tools:**
  * **macOS:** Xcode Command Line Tools (`xcode-select --install`)
  * **Linux:** `build-essential`, `libsecret-1-dev`, `libx11-dev`, `libxkbfile-dev`, `rpm`
  * **Windows:** Visual Studio 2022 Build Tools (Desktop C++ workload)

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

When you modify frontend code in `frontend/theia-extensions/` or application configurations:

```bash
# 1. Compile all workspace extensions directly (tsc -b)
yarn --cwd frontend/theia-extensions/product build
yarn --cwd frontend/theia-extensions/launcher build
yarn --cwd frontend/theia-extensions/updater build
yarn --cwd frontend/theia-extensions/hayagriva build

# 2. Build the Electron application bundle (esbuild)
yarn --cwd frontend/applications/electron build
```

The launcher scripts automatically detect hash changes across extensions and dependency locks, performing incremental builds only when necessary.

---

## 📦 Packaging Standalone Installers (Local)

To build redistributable standalone desktop packages using `electron-builder`:

### macOS (`.dmg`)
```bash
yarn --cwd frontend/applications/electron rebuild
yarn --cwd frontend/applications/electron electron-builder --mac --arm64 -c.mac.identity=null --publish never
```
Output: `frontend/applications/electron/dist/Hayagriva.dmg`

### Windows (`.exe` NSIS Installer)
```bash
yarn --cwd frontend/applications/electron rebuild
yarn --cwd frontend/applications/electron electron-builder --win --publish never
```
Output: `frontend/applications/electron/dist/HayagrivaSetup.exe`

### Linux (`.AppImage` & `.deb`)
```bash
yarn --cwd frontend/applications/electron rebuild
yarn --cwd frontend/applications/electron electron-builder --linux --publish never
```
Outputs:
* `frontend/applications/electron/dist/Hayagriva.AppImage`
* `frontend/applications/electron/dist/HayagrivaSetup.deb`

---

## 🌐 Automated Cross-Platform CI/CD Pipeline

Hayagriva features an automated GitHub Actions build and release pipeline configured in [`.github/workflows/build-release.yml`](file:///.github/workflows/build-release.yml).

### Runner Matrix

| Platform | Target OS Runner | Architecture | Artifact Output | Package Formats |
| :--- | :--- | :--- | :--- | :--- |
| **macOS** | `macos-14` | Apple Silicon (`arm64`) | `Hayagriva-macOS` | `.dmg` |
| **Windows** | `windows-2022` | x64 (`win32-x64`) | `Hayagriva-Windows` | `Setup.exe` (NSIS) |
| **Linux** | `ubuntu-22.04` | x64 (`linux-x64`) | `Hayagriva-Linux` | `.AppImage`, `.deb` |

### Key CI Architectural Alignments
1. **Lerna / Nx Bypass on Node 22**: To prevent native `nx@22.x` `FileLock` incompatibilities on Node 22 runners, the workflow compiles each workspace extension directly via `yarn build` (`tsc -b`), bypassing the project graph lock completely.
2. **Platform-Specific Optional Dependency Retention**: Prebuilt binaries (`@vscode/ripgrep-*`, `@parcel/watcher-*`, `@vscode/windows-ca-certs`) are installed via Yarn optional dependencies. An automated inline verification script in the workflow confirms presence and falls back to `npm install --no-save` if any platform binary is missing prior to bundle assembly.
3. **Automated Release Publishing**: Tag pushes matching `v*` (e.g., `git tag v1.0.0 && git push origin v1.0.0`) or manual runs with `create_release: true` will bundle all platform artifacts and draft a unified GitHub Release.

To trigger a manual CI build via GitHub CLI:
```bash
gh workflow run "Build & Release Hayagriva (Cross-Platform)" --ref main
```

---

## 🔄 Upgrading Eclipse Theia Upstream

Hayagriva preserves a breakproof boundary with upstream Eclipse Theia (currently on **Eclipse Theia 1.75.0** and **Electron 42.8.1**):
1. All custom UI widgets, language providers, and commands live strictly within `frontend/theia-extensions/` and consume public Theia extension APIs (`@theia/core`, `@theia/editor`, `@theia/monaco`).
2. To upgrade Eclipse Theia packages, update the `@theia/*` package versions in `frontend/applications/electron/package.json` and run:
   ```bash
   yarn --cwd frontend install --ignore-engines
   yarn --cwd frontend/theia-extensions/product build
   yarn --cwd frontend/theia-extensions/launcher build
   yarn --cwd frontend/theia-extensions/updater build
   yarn --cwd frontend/theia-extensions/hayagriva build
   yarn --cwd frontend/applications/electron build
   ```

