import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class HayagrivaEditorDecorator {
  protected decorationIds: string[] | undefined = undefined;

  applyHighlight(editor: any, lineIndex: number): void {
    const monacoEditor = editor && typeof editor.getControl === 'function' ? editor.getControl() : undefined;
    if (!monacoEditor) return;

    this.injectStyles();

    if (this.decorationIds) {
      monacoEditor.deltaDecorations(this.decorationIds, []);
      this.decorationIds = undefined;
    }

    // Monaco line numbers are 1-indexed, highlight next 20 lines
    const startLine = lineIndex + 1;
    const endLine = lineIndex + 20;

    const newDecorations = monacoEditor.deltaDecorations([], [
      {
        range: {
          startLineNumber: startLine,
          startColumn: 1,
          endLineNumber: endLine,
          endColumn: 1
        },
        options: {
          isWholeLine: true,
          className: 'hayagriva-citation-highlight'
        }
      }
    ]);

    this.decorationIds = newDecorations;

    // Fades decoration after 5 seconds
    setTimeout(() => {
      if (this.decorationIds && monacoEditor && !monacoEditor.isDisposed?.()) {
        try {
          monacoEditor.deltaDecorations(this.decorationIds, []);
        } catch (_) {}
        this.decorationIds = undefined;
      }
    }, 5000);
  }

  private injectStyles(): void {
    if (document.getElementById('hayagriva-editor-styles')) return;
    const style = document.createElement('style');
    style.id = 'hayagriva-editor-styles';
    style.textContent = `
      .hayagriva-citation-highlight {
        background-color: rgba(255, 200, 0, 0.18) !important;
        border-left: 4px solid #eab308 !important;
      }
    `;
    document.head.appendChild(style);
  }
}
