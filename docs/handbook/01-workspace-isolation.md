# Chapter 1: Workspace & Case Isolation

This step establishes the logical boundary for a legal case. The system isolates client documents and search indices per case workspace.

---

## 1. User Perspective

### Operating Case Workspaces
To work on a specific case, the user opens its case folder in Eclipse Theia. For example, opening `/Documents/Case_Alpha/` loads the files, wiki, and search context for that client.

* **Workspace Directory Layout**:
  - `concepts/` — Contains automatically generated page markdown chunks.
  - `wiki/` — Holds curated question-and-answer cards.
  - `timeline.md` — The compiled chronology table of case dates.
  - `index.md` / `index.json` — System metadata indices.
* **Switching Cases**:
  - When the user switches active editor tabs between documents in different cases, the left upload sidebar and Case Wiki Explorer automatically sync their context to match the case parent folder.

---

## 2. Admin & Developer Perspective

### File System Structure
The backend stores files outside the main application bundle to ensure data persistence:
```
/Documents/
├── Case_Alpha/
│   ├── contract_draft.pdf      <-- Source Document
│   ├── index.md                <-- User-readable case index
│   ├── timeline.md             <-- Chronological case dates
│   └── concepts/
│       ├── index.json          <-- Document profile metadata
│       ├── bm25_index.json     <-- Inverted search index
│       └── contract_draft/     <-- Page-split chunks
│           ├── page_1.md
│           └── page_2.md
└── Case_Beta/
```

### Noob-Proof Case Resolution
To prevent path resolution bugs when deep subfolders exist, the Case Name is resolved strictly relative to the root URI of the active workspace session:
```typescript
// In extension.ts:
const relativePath = this.workspaceService.getRelativePath(filePath);
const caseName = relativePath.split(/[\\/]/)[0]; // Locks case context to first-level directory
```

### Backend API Handlers
* **`GET /api/hayagriva/cases`**: Returns an array of case names found in the `/Documents/` folder.
* **`POST /api/hayagriva/switch-context`**: Sets the active case directory payload context for Webviews.

### Automatic File Explorer Exclusions
To prevent database directories (`wiki/` and `concepts/`) and system intermediate assets from cluttering the standard File Explorer tab, the backend automatically sets up exclusions and layout configurations per workspace.
* **Dynamic Exclusions Logic:** In addition to startup scanning, the backend dynamically enforces exclusions inside [routes.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/routes.js) via `ensureCaseSettings(caseDir)` on every key API call (such as fetching file statuses, uploading, or starting conversions). This ensures folders located anywhere (such as Desktop case directories) automatically get configured.
* **Injected Exclusions & Layout Settings:** It creates or updates `settings.json` inside both `caseDir/.theia/` and `caseDir/.vscode/` dynamically to inject:
  ```json
  "files.exclude": {
    "**/wiki": true,
    "**/concepts": true,
    "**/conversions": true,
    "wiki": true,
    "concepts": true,
    "conversions": true,
    "**/wiki/**": true,
    "**/concepts/**": true,
    "**/conversions/**": true,
    "wiki/": true,
    "concepts/": true,
    "conversions/": true,
    "**/*.md": true,
    "**/*.status": true,
    "**/*.footer": true,
    "**/*.cache": true
  },
  "explorer.openEditors.visible": 0
  ```
  This ensures:
  1. The **Open Editors** pane is hidden by default to maximize the case tree height.
  2. All intermediate files (`.md`, `.status`, `.footer`, `.cache`) and internal subdirectories (`conversions/`) are hidden, cleanly routing interactions to the custom **Concepts** panels and right-click actions.

### Upstream Theia Upgrades — Correct Procedure

The `hayagriva-extension/` folder at the repo root is now a **fully decoupled, standalone TypeScript package**. It is linked into `ide/applications/electron/package.json` via:
```json
"hayagriva-theia-extension": "link:../../hayagriva-extension"
```

> [!WARNING]
> Do NOT `git pull` from `eclipse-theia/theia-ide` upstream. That would overwrite your customized `package.json`, splash screen, and branding config.

> [!TIP]
> **To upgrade Theia to a newer version**, follow this safe procedure:

```bash
# Step 1: Edit @theia/* version numbers in ide/applications/electron/package.json
#         Change e.g. "1.73.1" → "1.75.0" for all @theia/* packages

# Step 2: Re-install with the existing lockfile resolution
cd ide/applications/electron
PUPPETEER_SKIP_DOWNLOAD=true yarn install

# Step 3: Rebuild the Electron application
yarn build

# Step 4: If TypeScript errors appear in hayagriva-extension/,
#         fix API changes in hayagriva-extension/src/ and rebuild
cd ../../hayagriva-extension
yarn build
```

Your custom sidebar, commands, and menus live entirely in `hayagriva-extension/` and are never touched by the upgrade. Only the underlying Theia shell upgrades.

