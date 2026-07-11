# How to Build Hayagriva

## Folder Overview

```
HAYAGRIVA/
├── hayagriva/            ← Backend Node.js server  →  edit this for features
├── hayagriva-extension/  ← IDE sidebar extension   →  edit this for UI panels
├── ide/                  ← THEIA BUILD HARNESS      →  do not edit directly
├── resources/            ← Branding (icons, splash) →  edit for visual design
├── forms/                ← MCA HTML form templates  →  edit to add new forms
└── templates/            ← Document output formats  →  edit to add new formats
```

---

## Running the Backend (Day-to-Day)

Double-click **`start.command`** in this folder.  
Or from terminal:

```bash
cd hayagriva
npm start
```

The server starts on `http://127.0.0.1:3210`. The Electron IDE connects to it automatically.

---

## Running the Electron IDE

```bash
cd ide/applications/electron
yarn start
```

---

## Upgrading Eclipse Theia (IDE Shell)

> **Never run `git pull` from `eclipse-theia/theia-ide` upstream** — it would overwrite branding.

Safe upgrade procedure:
```bash
# 1. Edit @theia/* version numbers in ide/applications/electron/package.json
# 2. Re-install
cd ide/applications/electron
PUPPETEER_SKIP_DOWNLOAD=true yarn install
yarn build
# 3. If build errors appear in hayagriva-extension/, fix those files and rebuild:
cd ../../hayagriva-extension
yarn build
```

---

## The `ide/` Folder

`ide/` is a **frozen build harness** — do not develop inside it.  
Your custom code lives only in `hayagriva/` and `hayagriva-extension/`.  
The extension is linked via `ide/applications/electron/package.json`:
```json
"hayagriva-theia-extension": "link:../../hayagriva-extension"
```
