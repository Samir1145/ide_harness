# Ingestion Pipeline Technologies (Step 1)

This reference outlines the exact libraries, binaries, and API endpoints utilized for document text extraction and Markdown conversion (Ingestion Step 1).

---

## Supported Formats & Parsers

### 1. PDF Documents (`.pdf`)
* **[pdfexcavator](https://www.npmjs.com/package/pdfexcavator):** A compiled Node.js native binding addon used to open PDFs, extract raw character blocks (`extractTextRaw`), and extract tables (`extractTables`).
* **Visual OCR Fallbacks:**
  * **OpenRouter Vision Prompting:** Invokes Qwen/Gemini vision models via the OpenRouter API for scanned/low-contrast page OCR.
  * **Google Gemini Multimodal API:** Direct HTTPS POST calls upload base64-encoded PDF binaries directly to `generativelanguage.googleapis.com` under `/v1beta/models/gemini-1.5-flash:generateContent`. Preserves complex structures and layouts directly in Markdown.

### 2. Word Documents (`.docx`)
* **Pandoc CLI:** Platform-specific pre-compiled binaries (`bin/pandoc-arm64` and `bin/pandoc-x64`) executed via Node's `child_process.execFile` with arguments `-f docx -t gfm`. Translates DOCX formatting into clean GitHub Flavored Markdown (GFM).
* **[mammoth](https://www.npmjs.com/package/mammoth):** An npm dependency used as a fallback parser if Pandoc binaries are missing or fail to execute.

### 3. Excel Spreadsheets (`.xlsx` / `.xls`)
* **[xlsx](https://www.npmjs.com/package/xlsx) (SheetJS):** The core Excel parser npm library used to read binary workbooks (`xlsx.readFile`) and convert worksheets into JSON row matrices.
* **Layout Adjustments:**
  * Custom row/column cleanup scripts.
  * Cell value propagation over range merges (`!merges` object).

### 4. TiddlyWiki Single-File Wikis (`.wiki.html`)
* **HTML Script Extractor:** Native Node.js file system APIs locate and extract the `<script class="tiddlywiki-tiddler-store" type="application/json">` script tag containing the JSON tiddler array.
