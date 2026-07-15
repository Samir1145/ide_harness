# HAYAGRIVA Ingestion & AI Enrichment User Guide

This guide describes how the three-stage file ingestion pipeline works, documents common failure modes (Gatekeeper blocks, memory exhaustion, scanned PDFs, offline cache misses), and provides clear step-by-step resolution paths to keep the system operational.

---

## 1. The 3-Stage Ingestion Pipeline
When you upload documents into a Case Workspace, they progress through three sequential, color-coded stages:

1.  **Dot 1 (Companion Markdown Extraction):** Converts files (PDFs, Word documents, Excel sheets) into editable companion Markdown (`.md`) files on disk.
2.  **Dot 2 (Search Vector Generation):** Tokenizes document pages, runs a local neural embedding pass in RAM, and indexes the vectors into the SQLite database.
3.  **Dot 3 (AI Enrichment & Facts Curation):** Spawns background AI tasks to summarize document sections and generate hypothetical questions for the RAG search database.

---

## 2. Ingestion Failure Modes & Resolutions

### 🔴 Step 1 Failure: Companion Extraction Fails (Dot 1 Red)

#### A. Scanned PDFs (Flat Images)
*   **The Cause:** If a PDF contains only scanned images and no selectable text bytes, the extraction engine falls back to layout OCR. This requires an active internet connection and a cloud API key (Google Gemini/OpenRouter).
*   **The Resolution:** 
    *   **Cloud Option:** Provide an `OPENROUTER_API_KEY` (Gemini Flash) or `GEMINI_API_KEY` in the **Case Settings panel** (gear icon in Monaco top-right toolbar) and connect to the internet.
    *   **Offline Fallback:** If you have no internet, HAYAGRIVA automatically creates a **Skeleton Companion MD** file containing placeholder page blocks. You can open it in the Monaco editor and manually paste or type transcribed case facts.

#### B. macOS Gatekeeper Restrictions (EACCES / Permission Denied)
*   **The Cause:** macOS blocks execution of downloaded binary conversion tools (e.g., `pandoc-arm64`).
*   **The Resolution:** Run the following permission-quarantine clearance command in your system Terminal:
    ```bash
    chmod +x "/Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/bin/pandoc-arm64" && xattr -d com.apple.quarantine "/Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/bin/pandoc-arm64"
    ```

#### C. Legacy Document Formats (.doc, .xls)
*   **The Cause:** Binary files (pre-2007 format structures) cannot be parsed natively by XML-based converters.
*   **The Resolution:** Open the file in Microsoft Word or Excel, choose **Save As**, select modern `.docx` or `.xlsx` format, and upload it. Alternatively, install **LibreOffice** (see Section 3 below) to enable automatic background conversion.

---

### 🔴 Step 2 Failure: Search Vector Indexing Fails (Dot 2 Red)

#### A. Offline First-Run (ONNX Cache Model Download)
*   **The Cause:** HAYAGRIVA calculates document vectors in-process using ONNX Runtime. The first time the system runs, it must download the `all-MiniLM-L6-v2` transformer model (~25MB) from Hugging Face. If the system is offline on this first run, it fails.
*   **The Resolution:** Connect to the internet **once** and restart the app. The system will pre-fetch the model assets and cache them. After this, you can run vector calculations completely offline.

#### B. Event Loop Freezes on Large Files (OOM)
*   **The Cause:** Sequentially executing neural networks on hundreds of pages in a single loop freezes the Node event loop and exceeds heap memory boundaries.
*   **The Resolution:** HAYAGRIVA automatically throttles processing by yielding control back to the V8 event loop after every 30 pages. If system lag persists, switch to **Cloud Active Mode** in Case Settings to delegate vector generation to cloud APIs in under 2 seconds.

---

### 🔴 Step 3 Failure: AI Enrichment Fails (Dot 3 Red)

#### A. Out-of-Memory Blocks on 8GB-16GB RAM Systems
*   **The Cause:** Running large offline LLM models (via local Ollama) on consumer laptops alongside a browser and an IDE will exhaust memory, freeze system execution, and cause query timeouts.
*   **The Resolution:** **HAYAGRIVA actively blocks local Ollama enrichment on machines with less than 24GB of RAM** to protect system stability. 
    *   To enrich documents on a 16GB RAM system, you must switch your router to **Cloud Active Mode** in the Settings panel (utilizing Gemini Flash via OpenRouter/Gemini API). 
    *   Otherwise, configure your workspace profile to **Lite Mode** which bypasses the background LLM queue entirely.

#### B. Ollama Daemon Offline
*   **The Cause:** The Ollama background service is not running or the model has not been pulled.
*   **The Resolution:** Run `ollama serve` in a terminal window, run `ollama pull qwen2.5-coder:1.5b` to fetch the model, and then restart the launcher script.

---

## 3. Installing LibreOffice for Silent Ingestion

HAYAGRIVA integrates headless **LibreOffice** as a background format converter. 

*   **100% Offline Privacy:** Document formatting is handled strictly in your local RAM/disk.
*   **Zero Distractions:** LibreOffice runs programmatically. No graphical Word or Excel windows will pop up or take focus while you are drafting.

### macOS Setup
1.  Open your Terminal application.
2.  Install via Homebrew cask:
    ```bash
    brew install --cask libreoffice
    ```

### Windows Setup
1.  Download the MSI Installer from the official [LibreOffice Download Portal](https://www.libreoffice.org/download/).
2.  Run the typical installation setup.
3.  Restart the HAYAGRIVA launcher server once installation completes.

*Once installed, the backend will auto-detect the installation path. No settings configurations are needed.*
