# Chapter 6: Side-by-Side Comparison & Outline Navigation

This step details how users audit document differences and query RAG topics directly from document section outlines.

---

## 1. User Perspective

### Side-by-Side Document Comparison
Users can compare draft revisions or related contract files:
1. Right-click inside any active Markdown document.
2. Select **Compare with... (Diff)** from the editor context menu.
3. Choose the document to compare against in the text input popup.
4. The IDE opens a side-by-side split screen showing highlighted additions (green) and deletions (red).

### Smart Outline Queries
In the **Outline Panel** displaying the headings hierarchy:
* Right-click any section heading node to reveal legal tools:
  - **Ask about this section**: Pre-fills the RAG Chat input with a summarization query for that section.
  - **Find related pages**: Performs an instant database search, showing match locations in a Quick Pick selector.
  - **Add to Wiki**: Pre-fills a RAG query to generate a case wiki card for this section.

---

## 2. Admin & Developer Perspective

### Diff View Command
The `commands.ts` class handles the comparison action by calling the IDE's built-in `vscode.diff` command:
```typescript
registry.executeCommand('vscode.diff', leftUri, rightUri, `Comparison: ${leftName} vs ${rightName}`);
```

### Outline Context Contributions
Smart Outline commands are registered in [menus.ts](file:///Users/atulgrover/Desktop/TWILLM-OKF-PAGED/ide/theia-extensions/twillm/src/browser/menus.ts) under the `outline/context` menu group:
```typescript
registry.registerMenuAction(['outline.context'], {
  commandId: 'twillm:outlineAskRag',
  label: 'Ask about this section'
});
```

### Monaco Highlight Decorations
The `TwillmEditorDecorator` in [highlight-decorator.ts](file:///Users/atulgrover/Desktop/TWILLM-OKF-PAGED/ide/theia-extensions/twillm/src/browser/highlight-decorator.ts) applies custom CSS border-left markings over the cited line range:
```typescript
const newDecorations = monacoEditor.deltaDecorations([], [{
  range: { startLineNumber, startColumn: 1, endLineNumber, endColumn: 1 },
  options: { isWholeLine: true, className: 'twillm-citation-highlight' }
}]);
```
The style rules are injected directly into the document frame header:
```css
.twillm-citation-highlight {
  background-color: rgba(255, 200, 0, 0.18) !important;
  border-left: 4px solid #eab308 !important;
}
```
An internal timer cleans up the decoration instance after 5000ms.
