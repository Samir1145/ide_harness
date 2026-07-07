import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class TwillmEditorDecorator {
  private decorationType: any = null;

  applyHighlight(editor: any, lineIndex: number): void {
    const monacoEditor = editor.getControl ? editor.getControl() : null;
    if (!monacoEditor) return;

    this.injectStyles();

    if (this.decorationType) {
      monacoEditor.deltaDecorations(this.decorationType, []);
      this.decorationType = null;
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
          className: 'twillm-citation-highlight'
        }
      }
    ]);

    this.decorationType = newDecorations;

    // Fades decoration after 5 seconds
    setTimeout(() => {
      if (this.decorationType) {
        monacoEditor.deltaDecorations(this.decorationType, []);
        this.decorationType = null;
      }
    }, 5000);
  }

  private injectStyles(): void {
    if (document.getElementById('twillm-editor-styles')) return;
    const style = document.createElement('style');
    style.id = 'twillm-editor-styles';
    style.textContent = `
      .twillm-citation-highlight {
        background-color: rgba(255, 200, 0, 0.18) !important;
        border-left: 4px solid #eab308 !important;
      }
    `;
    document.head.appendChild(style);
  }
}
