# Hayagriva Branding & Logo Management Guide

> **Note for Developers & AI Agents**: When replacing or updating the Hayagriva logo or branding assets, follow this exact guide to ensure smooth compilation across macOS Dock icons, Electron window icons, and light/dark theme UI panels.

---

## 📁 1. Master Logo Location

- **Master File Path**: `branding/hayagriva_logo.png`
- **Format Requirements**: High-resolution PNG (e.g. 1024x504 or larger).

---

## ⚡ 2. How to Change the Logo (Step-by-Step)

### Step 1: Replace Master Logo
Copy your new logo file into:
```bash
cp /path/to/new_logo.png branding/hayagriva_logo.png
```

### Step 2: Run Automated Branding Processor
Run the Node.js branding processor script:
```bash
node backend/scripts/process_branding.js
```
*What this script does automatically:*
1. Generates 512x512 solid-white square icons for window & macOS Dock launcher targets.
2. Converts white background pixels to **transparent** PNGs (`TheiaIDE.png` for light themes, `TheiaIDE-next.png` with white line-art for dark themes) so UI panels (like AI Chat) do not display white rectangular boxes.
3. Automatically compiles macOS `.icns` icons using native `iconutil`.

### Step 3: Clear Stale Build Caches & Rebuild Extensions
Clear TypeScript build cache and compile the product extension and Electron application:
```bash
find frontend/theia-extensions -name "*.tsbuildinfo" -delete
yarn --cwd frontend/theia-extensions/hayagriva build
yarn --cwd frontend/theia-extensions/product build
yarn --cwd frontend/applications/electron build
```

### Step 4: Restart the Application
Restart the application:
```bash
./launchers/start.command
```


---

## 🛠️ 3. Technical Architecture & Architecture Pitfalls

- **UI Panel Backgrounds**: In `frontend/theia-extensions/hayagriva/src/browser/extension.ts`, `svg.theia-WelcomeMessage-Logo` uses `background-image: var(--theia-branding-logo) !important;`. **NEVER hardcode base64 strings** in `extension.ts`, as doing so will override the theme CSS and prevent updated branding from rendering.
- **Cache Invalidation**: `tsc -b` caches build state in `*.tsbuildinfo`. Always delete `*.tsbuildinfo` if `lib/` files appear out of sync.
