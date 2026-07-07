# Chapter 5: Chronological Timeline Generation

This step describes how the system automatically extracts chronological event dates from documents and compiles them into a unified case timeline.

---

## 1. User Perspective

### The timeline.md File
A central case timeline is maintained under `/Documents/<Case_Name>/timeline.md`.
* Opening this file displays a clean, date-sorted table:
  | Date | Event Description | Source |
  | --- | --- | --- |
  | 15.03.2023 | Insolvency began on 15.03.2023. | [handbook.md Page 12](handbook.md#Page_12) |
* Users can click any source link in the table to open the exact file and line where that date event was cited.

### Automatic Updates
Users do not need to compile the timeline manually. When a new file is ingested, or when a page/wiki card markdown file is edited and saved, the timeline re-compiles itself in the background.

---

## 2. Admin & Developer Perspective

### Date Recognition Engine
The `lib/timeline.js` module scans file contents using regexes matching five distinct formats:
1. `DD.MM.YYYY` / `DD/MM/YYYY` / `DD-MM-YYYY`
2. `DD Month YYYY` (e.g. 15 March 2023)
3. `Month DD, YYYY` (e.g. March 15, 2023)
4. ISO `YYYY-MM-DD`

### Chronological Sorting
To sort dates accurately regardless of their format, the compiler parses matches into a sortable `YYYY-MM-DD` string:
* Example: `March 15, 2023` -> `2023-03-15`.
* Strings are compared lexicographically via `localeCompare`.

### Event Context Extraction
* **Sentence Boundary Detection**: Splitting text into sentences (`split(/[.?!]\s+/)`) isolates the specific event description.
* **Timeline Rendering**: The watcher (`watcher.js`) triggers `compileTimeline(caseDir)` on document ingestion or wiki card saves:
  1. Scans `/wiki/` and `/concepts/` page markdown.
  2. Runs date patterns match.
  3. Sorts all matches chronologically.
  4. Writes the compiled markdown table to `/Documents/<Case_Name>/timeline.md`.
