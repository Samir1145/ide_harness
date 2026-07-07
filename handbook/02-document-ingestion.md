# Chapter 2: Document Ingestion & Specialized Parsing

This step processes incoming PDF, Word, and Excel files, layout-analyzes their structure, and slices them into clean, page-indexed Markdown concept chunks.

---

## 1. User Perspective

### Uploading Documents
The user uploads files using the **Left Activity Bar Upload Sidebar**:
1. Select a **Document Profile** (e.g. NCLT Orders, Resolution Plans) to apply tailored heading extraction.
2. Select a **Regex Option** (such as Numbered Headings or CAPS lines) to control section splits.
3. Drag and drop a file into the designated stacked target box (**PDF** with red border, **Word** with blue border, or **Excel** with green border).
4. If uploading a scanned PDF, checking the **"Scanned PDF (Run OCR)"** box tells the system to run optical character recognition.

### Layout Preview & Split Commit
Upon drop, the **Split Preview** tab opens in the main area:
* **Digital Files**: Converts instantly, loading the Markdown text on the left and a outline of headers on the right.
* **Scanned Files**: Shows an OCR status status panel. Once text extraction finishes, the preview loads automatically.
* **Review & Modify**: The user can edit the Markdown text inline in the text area. The outline on the right dynamically updates.
* **Action Buttons**:
  - **Confirm & Split**: Commits changes and writes the page chunks to disk.
  - **Split Again**: Discards manual edits and re-runs conversion with modified settings.
  - **Cancel**: Kills any active OCR threads and closes the preview.

---

## 2. Admin & Developer Perspective

### Specialized Parser Routines
The converter routes files by extension to avoid generic parser layout loss:
1. **Word (.docx)**: Uses `mammoth` to extract clean HTML, then splits by headings or fallbacks to 8-paragraph blocks with synthetic page tags.
2. **Excel (.xlsx)**: Uses SheetJS (`xlsx`) to extract tabular grids, slicing large tables into 100-row chunks, replicating column headers at the top of each block.
3. **PDF (.pdf)**: Spawns the python script `scripts/docling_convert.py` utilizing Docling's pipeline to extract structural elements aligned to their page provenance indices.

### Ingestion Flow & OCR Status
* **Scanned Check**: The system calls `pypdf` via shell to read document length. If character count is < 150, the backend returns `{ status: "ocr_processing" }` and starts `ocrmypdf` in the background. The client polls the status until completed.
* **PID Safety (Orphan Protection)**: Spawning background converters (especially OCR) can cause CPU leaks if cancelled. The backend maps file paths to process objects and terminates the entire process group if cancelled:
  ```javascript
  // In converter.js:
  process.kill(-proc.pid, 'SIGKILL'); // Detached process group cleanup
  ```

### API Endpoints
* **`POST /api/twillm/upload`**: Writes raw binary base64 file payloads to disk.
* **`POST /api/twillm/analyze-file`**: Performs layout analysis and returns text/outline structures.
* **`POST /api/twillm/commit-split`**: Commits custom text revisions to concepts/ folders.
* **`POST /api/twillm/cancel-ocr`**: Halts running background OCR conversion processes.
