# Chapter 7: Ingestion Sandbox Playground

The Ingestion Sandbox Playground provides a clean, isolated directory structure to test and verify document uploads and splits (`.pdf`, `.docx`, `.xlsx`) without running the full front-end IDE workspace or backend proxy servers.

---

## 1. Directory Structure

The sandbox is located at the root of the workspace under `sandbox/`:
*   `sandbox/input/` — Directory where you place raw source files to test (exhibits, contracts, sheets).
*   `sandbox/output/` — Directory where compiled companions and page markdown chunks are generated.
*   `sandbox/run_sandbox.js` — Standalone Node.js execution script.

---

## 2. Step-by-Step Testing Guide

If an ingestion or PDF upload appears to fail, you can isolate the error using these steps:

1.  **Isolate the File:** Copy the target document (e.g. `rbi_guidelines.pdf`) into the [sandbox/input/](file:///Users/atulgrover/Desktop/TWILLM-OKF-PAGED/sandbox/input) folder.
2.  **Execute the Script:** Open your terminal, navigate to the workspace root, and run:
    ```bash
    node sandbox/run_sandbox.js
    ```
3.  **Inspect Chunks:** 
    *   The script runs the ingestion engine locally (disabling OpenAI/Gemini extraction to run fast offline).
    *   Check [sandbox/output/](file:///Users/atulgrover/Desktop/TWILLM-OKF-PAGED/sandbox/output) for the resulting files:
        *   `sandbox/output/<filename>.md` (the compiled companion file).
        *   `sandbox/output/concepts/<filename>/page_*.md` (the split page chunks).
    *   Verify that text, headings, and tables are converted correctly.

---

## 3. Benefits of the Sandbox

*   **Zero-Lag Profiling:** Ignores LLM API calls and background queue syncs, completing PDF layout parsing in a few seconds.
*   **Error Visibility:** If a file has broken encoding or corrupt formatting, the Node execution stack trace is printed directly to stdout in your terminal.
*   **Case Safety:** Prevents corrupting index profiles (`index.json`) inside active case directories.
