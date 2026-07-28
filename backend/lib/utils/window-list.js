class WindowList {
    constructor() {
        this.webviews = new Map();
    }

    key(caseDir, docName) {
        return `${caseDir}::${docName || '__case__'}`;
    }

    openOrFocus(createPanelFn, caseDir, docName) {
        const key = this.key(caseDir, docName);
        const existing = this.webviews.get(key);
        if (existing) {
            existing.panel.reveal();
            return existing.panel;
        }
        const panel = createPanelFn(caseDir, docName);
        this.webviews.set(key, { panel, caseDir, docName });
        panel.onDidDispose(() => this.webviews.delete(key));
        return panel;
    }
}

module.exports = { WindowList };
