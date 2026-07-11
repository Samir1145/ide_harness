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
To prevent database directories (`wiki/` and `concepts/`) from cluttering the standard File Explorer tab, the backend automatically sets up exclusions per workspace.
* **Logic:** When `bootstrapCase(caseDir)` in [cli.js](file:///Users/atulgrover/Desktop/HAYAGRIVA-OKF-PAGED/hayagriva/cli.js) scans a case, it creates or updates `settings.json` inside both `caseDir/.theia/` and `caseDir/.vscode/` dynamically to inject:
  ```json
  "files.exclude": {
    "**/wiki": true,
    "**/concepts": true
  }
  ```
  This ensures that system-generated markdown page chunks and Q&A card files are hidden from the file listing, cleanly funneling them to the custom **Concepts** and **Case Wiki** panels.

### WARNING: Upstream Git Pulls from Eclipse Theia

The `ide/` folder represents a custom-branded, frozen fork of `eclipse-theia/theia-ide`. 

> [!WARNING]
> Do NOT add the public `eclipse-theia/theia-ide` repository as a remote or attempt to `git pull` from upstream Theia into this workspace. 

Running an upstream git pull will break the following:
1. **Product Overwrite**: Upstream `package.json` will overwrite product names, splash screen configurations (`Hayagriva` vs `Theia IDE`), and custom plugin inclusions.
2. **API Mismatches**: Our custom extension `theia-extensions/hayagriva` is compiled against `@theia/core` version `1.73.1`. Upstream changes will throw TypeScript compile errors (`tsc -b`) due to changes in core command, menu, or webview interfaces.
3. **Electron Incompatibility**: Upstream Electron version upgrades may conflict with the local Node version on your system, preventing the IDE client from booting.

