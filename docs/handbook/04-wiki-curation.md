# Chapter 4: Curating and Browsing the Case Wiki

This step covers how users curate answers into structured Q&A cards, and how the RAG engine blends Wiki knowledge with source documents.

---

## 1. User Perspective

### Saving Curated Q&A Cards
When the user receives a high-quality answer in the RAG Chat, they can save it to the workspace knowledge base:
1. Click the **💾 Save to Case Wiki** button at the bottom of the streamed response.
2. Enter a title for the wiki card (e.g., "SRA Compliance Timeline").
3. The system automatically creates a markdown card containing the question, answer text, timestamp, and source links.

### Case Wiki Explorer Panel
The user browses saved cards in the **Case Wiki Explorer** (book icon in the left Activity Bar):
* Displays all saved case cards with their titles and tags.
* **Double-clicking** any card opens the raw Markdown file directly in the editor area, allowing users to modify, expand, or add custom annotations.

---

## 2. Admin & Developer Perspective

### Card File Format
Wiki cards are stored under `/wiki/` as markdown files with yaml frontmatter metadata:
```markdown
---
title: "SRA Compliance Timeline"
question: "What is the compliance timeline?"
sources: ["order_2023.md"]
savedAt: "2026-07-07T13:00:00Z"
tags: ["wiki-card", "Case_Alpha"]
---
# SRA Compliance Timeline

The compliance timeline...
```

### Wiki Overrides Priority Boost
In `rag.js`, Wiki cards are prioritized to ensure curated answers take precedence over raw text chunks. If the term matches a wiki card, the BM25 score is multiplied by `1.5`:
```javascript
if (hit.docId.startsWith('wiki::')) {
    score *= 1.5; // Apply Case Wiki override boost
}
```

### Context Synchronization
When a new Wiki card is saved, the webview sends a `refresh-wiki-explorer` message to the parent extension:
* The extension dispatches a `select-case` event to the Wiki Explorer iframe.
* The iframe queries `GET /api/twillm/wiki-cards?case=Case_Alpha` to reload the cards list instantly.
