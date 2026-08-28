/**
 * lsp-server-process.js
 *
 * Hayagriva Standalone LSP Server Process
 * =========================================
 * Runs as a child process spawned by api-server.js.
 * Communicates ONLY via stdio (JSON-RPC over stdin/stdout).
 * Never opens ports. Never blocks the parent HTTP event loop.
 */

'use strict';

const {
    createConnection,
    ProposedFeatures,
    TextDocuments,
    DiagnosticSeverity
} = require('vscode-languageserver/node');
const { TextDocument } = require('vscode-languageserver-textdocument');
const { createLanguageService } = require('vscode-markdown-languageservice');
const { URI } = require('vscode-uri');
const MarkdownIt = require('markdown-it');
const fs = require('fs');
const path = require('path');

const mdParser = new MarkdownIt();
const slugifier = {
    fromHeading(text) {
        const val = text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        return { value: val, equals(other) { return val === other.value; } };
    },
    fromFragment(text) {
        const val = text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        return { value: val, equals(other) { return val === other.value; } };
    }
};

class CustomParser {
    constructor() {
        this.slugifier = slugifier;
    }
    slugify(heading) {
        return slugifier.fromHeading(heading);
    }
    tokenize(document) {
        try {
            return mdParser.parse(document.getText(), {});
        } catch (_) {
            return [];
        }
    }
}

// ─── State ────────────────────────────────────────────────────────────────────
let caseDir = null;
let workspace = null;
let lspService = null;
const documents = new TextDocuments(TextDocument);

// ─── CustomWorkspace ──────────────────────────────────────────────────────────
class CustomWorkspace {
    constructor(dir) {
        this.caseDir = dir;
        this.documents = new Map();
        this.folders = [URI.file(dir)];
        this._watcherActive = false;
        this.watcher = null;
        this._setupWatcher();
    }

    _setupWatcher() {
        if (this._watcherActive) return;
        try {
            this.watcher = fs.watch(this.caseDir, { recursive: true }, (eventType, filename) => {
                if (filename && (filename.endsWith('.md') || filename.endsWith('.markdown'))) {
                    const fullPath = path.join(this.caseDir, filename);
                    const uri = URI.file(fullPath).toString();
                    if (fs.existsSync(fullPath)) {
                        try {
                            const content = fs.readFileSync(fullPath, 'utf8');
                            this.documents.set(uri, TextDocument.create(uri, 'markdown', Date.now(), content));
                        } catch (_) {}
                    } else {
                        this.documents.delete(uri);
                    }
                }
            });
            this._watcherActive = true;
        } catch (err) {
            connection.console.error(`[LSP Process] fs.watch failed: ${err.message}`);
        }
    }

    closeWatcher() {
        if (this.watcher) {
            try { this.watcher.close(); } catch (_) {}
            this.watcher = null;
            this._watcherActive = false;
        }
    }

    get workspaceFolders() { return this.folders; }
    onDidChangeMarkdownDocument(listener) { return { dispose: () => {} }; }
    onDidCreateMarkdownDocument(listener) { return { dispose: () => {} }; }
    onDidDeleteMarkdownDocument(listener) { return { dispose: () => {} }; }

    async getAllMarkdownDocuments() {
        const docs = [];
        const scan = (dir) => {
            try {
                if (!fs.existsSync(dir)) return;
                for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
                        scan(fullPath);
                    } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown'))) {
                        const uri = URI.file(fullPath).toString();
                        let doc = this.documents.get(uri);
                        if (!doc) {
                            try {
                                doc = TextDocument.create(uri, 'markdown', 1, fs.readFileSync(fullPath, 'utf8'));
                                this.documents.set(uri, doc);
                            } catch (_) {}
                        }
                        if (doc) docs.push(doc);
                    }
                }
            } catch (_) {}
        };
        scan(this.caseDir);
        return docs;
    }

    hasMarkdownDocument(resource) {
        return this.documents.has(resource.toString()) || (fs.existsSync(resource.fsPath) && resource.fsPath.endsWith('.md'));
    }

    async openMarkdownDocument(resource) {
        const uri = resource.toString();
        let doc = this.documents.get(uri);
        if (!doc && fs.existsSync(resource.fsPath)) {
            doc = TextDocument.create(uri, 'markdown', 1, fs.readFileSync(resource.fsPath, 'utf8'));
            this.documents.set(uri, doc);
        }
        return doc;
    }

    async stat(resource) {
        if (fs.existsSync(resource.fsPath)) {
            const s = fs.statSync(resource.fsPath);
            return { type: s.isDirectory() ? 2 : 1, ctime: s.ctimeMs, mtime: s.mtimeMs, size: s.size };
        }
        return undefined;
    }

    async readDirectory(resource) {
        if (fs.existsSync(resource.fsPath) && fs.statSync(resource.fsPath).isDirectory()) {
            return fs.readdirSync(resource.fsPath, { withFileTypes: true }).map(e => [
                e.name, { type: e.isDirectory() ? 2 : 1, ctime: 0, mtime: 0, size: 0 }
            ]);
        }
        return [];
    }
}

// ─── Connection ───────────────────────────────────────────────────────────────
const connection = createConnection(ProposedFeatures.all, process.stdin, process.stdout);

connection.onInitialize((params) => {
    caseDir = params.initializationOptions?.caseDir || process.env.HAYAGRIVA_CASE_DIR || '';
    connection.console.log(`[LSP Process] Initialized caseDir=${caseDir}`);

    const logger = { level: 1, log: (level, m) => connection.console.log(`[mdls] ${m || level}`) };
    workspace = new CustomWorkspace(caseDir || process.cwd());
    lspService = createLanguageService({
        workspace,
        parser: new CustomParser(),
        logger
    }, logger);

    process.on('exit', () => workspace.closeWatcher());
    process.on('SIGINT', () => { workspace.closeWatcher(); process.exit(0); });
    process.on('SIGTERM', () => { workspace.closeWatcher(); process.exit(0); });

    return {
        capabilities: {
            textDocumentSync: { openClose: true, change: 1 },
            hoverProvider: true,
            completionProvider: { triggerCharacters: ['/'], resolveProvider: false }
        }
    };
});

// ─── Diagnostics ──────────────────────────────────────────────────────────────
async function computeAndPublish(textDoc) {
    if (!lspService || !workspace) return;
    workspace.documents.set(textDoc.uri, textDoc);

    try {
        const [lspDiags, customDiags] = await Promise.all([
            lspService.computeDiagnostics(textDoc, { validate: true }, { isCancellationRequested: false }),
            computeCustomDiagnostics(textDoc)
        ]);
        connection.sendDiagnostics({ uri: textDoc.uri, diagnostics: [...(lspDiags || []), ...(customDiags || [])] });
    } catch (err) {
        connection.console.error(`[LSP Process] Diagnostics error: ${err.message}`);
    }

    // Deferred DB sync — runs after diagnostics are pushed
    if (caseDir) {
        setImmediate(() => syncToDb(caseDir, textDoc.uri, textDoc.getText()));
    }
}

async function computeCustomDiagnostics(textDoc) {
    const diags = [];
    const docUri = textDoc.uri;
    const docContent = textDoc.getText();
    const docPath = URI.parse(docUri).fsPath;

    // 1. @@ statutory citation linter
    try {
        const { getLawText } = require('../utils/vault-loader');
        const re = /@@([\w-]+)\/([\w/.-]+)/g;
        let m;
        while ((m = re.exec(docContent)) !== null) {
            try {
                if (!getLawText(`${m[1]}/${m[2]}`)) {
                    diags.push({ range: { start: textDoc.positionAt(m.index), end: textDoc.positionAt(m.index + m[0].length) }, severity: DiagnosticSeverity.Warning, message: `Statute "${m[0]}" could not be verified in the active Law Vault.`, source: 'hayagriva-lsp' });
                }
            } catch (_) {}
        }
    } catch (_) {}

    // 2. Relative Markdown link checker
    try {
        await workspace.getAllMarkdownDocuments();
        const re = /\[([^\]]*)\]\(([^)]+)\)/g;
        let m;
        while ((m = re.exec(docContent)) !== null) {
            let target = m[2].trim();
            if (/^(https?:\/\/|mailto:|@@|#)/i.test(target)) continue;
            const hashIdx = target.indexOf('#');
            const targetPath = hashIdx !== -1 ? target.substring(0, hashIdx) : target;
            if (!targetPath || !/\.(md|markdown)$/i.test(targetPath)) continue;
            const resolved = path.resolve(path.dirname(docPath), targetPath);
            if (!fs.existsSync(resolved)) {
                const basename = path.basename(targetPath);
                let found = null;
                for (const d of workspace.documents.values()) {
                    if (path.basename(URI.parse(d.uri).fsPath) === basename) { found = URI.parse(d.uri).fsPath; break; }
                }
                const range = { start: textDoc.positionAt(m.index), end: textDoc.positionAt(m.index + m[0].length) };
                diags.push({ range, severity: DiagnosticSeverity.Warning, source: 'hayagriva-lsp',
                    message: found ? `Link target "${targetPath}" is at: "${path.relative(path.dirname(docPath), found)}".` : `Link target "${targetPath}" not found in case folder.` });
            }
        }
    } catch (_) {}

    // 3. Companion heading check
    const docName = path.basename(docPath);
    const SKIP = ['CASE_AUDIT.md', 'case_facts.md', 'claims_registry.md', 'avoidance_ledger.md', 'index.md'];
    if (docPath.endsWith('.md') && !docPath.includes('/wiki/') && !docPath.includes('/conversions/') && !SKIP.includes(docName) && !/^#[\s#]/m.test(docContent)) {
        diags.push({ range: { start: { line: 0, character: 0 }, end: { line: 0, character: (docContent.split('\n')[0] || '').length } }, severity: DiagnosticSeverity.Warning, message: 'Companion markdown lacks structural headings. Right-click the source file → "2. Enhance Markdown".', source: 'hayagriva-lsp' });
    }

    return diags;
}

function syncToDb(caseDir, docUri, docContent) {
    try {
        const isClaims = docUri.endsWith('claims_registry.md') || docUri.endsWith('claims_registry.markdown');
        const isAvoidance = docUri.endsWith('avoidance_ledger.md') || docUri.endsWith('avoidance_ledger.markdown');
        const isCaseFacts = docUri.endsWith('case_facts.md') || docUri.endsWith('case_facts.markdown');

        if (isClaims || isAvoidance) {
            const { parseMarkdownTable } = require('../utils/table-sync');
            const { getDb } = require('./sqlite-store');
            const db = getDb(caseDir);
            if (isClaims) {
                const rows = parseMarkdownTable(docContent);
                if (rows && rows.length > 0) {
                    db.exec('DELETE FROM claims;');
                    const s = db.prepare('INSERT INTO claims (creditor, claimed_amount, admitted_amount, admitted_interest, rejected_amount, rejection_reason, claim_date, status, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                    rows.forEach(r => s.run(r.creditor||'', r.claimed_amount||0, r.admitted_amount||0, r.admitted_interest||0, r.rejected_amount||0, r.rejection_reason||'', r.claim_date||'', r.status||'admitted', new Date().toISOString()));
                }
            } else {
                const rows = parseMarkdownTable(docContent);
                if (rows && rows.length > 0) {
                    db.exec('DELETE FROM avoidance_transactions;');
                    const s = db.prepare('INSERT INTO avoidance_transactions (transaction_date, amount, debited_account, credited_party, related_party_status, applicable_section, forensic_notes, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
                    rows.forEach(r => s.run(r.transaction_date||'', r.amount||0, r.debited_account||'', r.credited_party||'', r.related_party_status||'', r.applicable_section||'', r.forensic_notes||'', new Date().toISOString()));
                }
            }
        }

        if (isCaseFacts) {
            const parsedKV = {};
            const listRe = /^\s*[-*]\s*\*\*([a-zA-Z0-9_-]+)\*\*:\s*(.*)$/;
            const tableRe = /^\|\s*([a-zA-Z0-9_-]+)\s*\|\s*([^|]+)\s*\|$/;
            for (let line of docContent.split('\n')) {
                line = line.trim();
                let m = listRe.exec(line);
                if (m) { parsedKV[m[1].trim()] = m[2].trim(); continue; }
                m = tableRe.exec(line);
                if (m && !['parameter','key'].includes(m[1].trim().toLowerCase()) && !m[1].startsWith('---')) parsedKV[m[1].trim()] = m[2].trim();
            }
            const keys = Object.keys(parsedKV);
            if (keys.length > 0) {
                const reviewsDir = path.join(caseDir, 'reviews');
                const dictPath = path.join(reviewsDir, 'case_kv_dictionary.json');
                let dict = {};
                if (fs.existsSync(dictPath)) { try { dict = JSON.parse(fs.readFileSync(dictPath, 'utf8')); } catch (_) {} }
                let changed = false;
                const now = new Date().toISOString();
                for (const k of keys) {
                    if (!dict[k] || dict[k].value !== parsedKV[k]) {
                        dict[k] = { value: parsedKV[k], originalExtractedValue: dict[k]?.originalExtractedValue || parsedKV[k], modifiedBy: 'user', lastUpdated: now, source: 'case_facts.md (Manual Edit)', confidence: 'high', explanation: 'Manually edited by user in case_facts.md.' };
                        changed = true;
                    }
                }
                if (changed) {
                    if (!fs.existsSync(reviewsDir)) fs.mkdirSync(reviewsDir, { recursive: true });
                    fs.writeFileSync(dictPath, JSON.stringify(dict, null, 2), 'utf8');
                    try {
                        const { getDb } = require('./sqlite-store');
                        const db = getDb(caseDir);
                        const relFile = path.relative(caseDir, URI.parse(docUri).fsPath).replace(/\\/g, '/');
                        const s = db.prepare('INSERT INTO case_facts (key, filename, value, source_clause, verified_by_user, last_updated) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(key) DO UPDATE SET filename=excluded.filename, value=excluded.value, source_clause=excluded.source_clause, verified_by_user=1, last_updated=excluded.last_updated');
                        for (const k of keys) s.run(k, relFile, parsedKV[k], 'case_facts.md (Manual Edit)', now);
                    } catch (e) { connection.console.error(`[LSP Sync] DB: ${e.message}`); }
                }
            }
        }
    } catch (err) {
        connection.console.error(`[LSP Sync] Error: ${err.message}`);
    }
}

// ─── Document events ──────────────────────────────────────────────────────────
documents.onDidOpen(async (e) => computeAndPublish(e.document));
documents.onDidChangeContent(async (e) => computeAndPublish(e.document));
documents.onDidClose((e) => connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] }));

connection.onNotification('textDocument/didOpen', async (params) => {
    if (params?.textDocument) {
        const textDoc = TextDocument.create(params.textDocument.uri, params.textDocument.languageId || 'markdown', params.textDocument.version || 1, params.textDocument.text || '');
        await computeAndPublish(textDoc);
    }
});

connection.onNotification('textDocument/didChange', async (params) => {
    if (params?.textDocument && params.contentChanges?.[0]) {
        let textDoc = documents.get(params.textDocument.uri);
        if (!textDoc || params.contentChanges[0].text) {
            textDoc = TextDocument.create(params.textDocument.uri, 'markdown', params.textDocument.version || 1, params.contentChanges[0].text || '');
        }
        await computeAndPublish(textDoc);
    }
});

// ─── Hover ────────────────────────────────────────────────────────────────────
connection.onHover(async (params) => {
    if (!lspService || !workspace) return null;
    const textDoc = documents.get(params.textDocument.uri);
    if (!textDoc) return null;
    const content = textDoc.getText();
    const offset = textDoc.offsetAt(params.position);

    try {
        const { getLawText } = require('../utils/vault-loader');
        const re = /@@([\w-]+)\/([\w/.-]+)/g;
        let m;
        while ((m = re.exec(content)) !== null) {
            if (offset >= m.index && offset <= m.index + m[0].length) {
                try {
                    const resolved = getLawText(`${m[1]}/${m[2]}`);
                    if (resolved) {
                        const clean = resolved.replace(/^---[\s\S]*?---\r?\n?/, '').trimStart();
                        return { contents: { kind: 'markdown', value: `**Law Reference:** \`${m[1]}/${m[2]}\`\n\n${clean}` }, range: { start: textDoc.positionAt(m.index), end: textDoc.positionAt(m.index + m[0].length) } };
                    }
                } catch (_) {}
            }
        }
    } catch (_) {}

    try {
        workspace.documents.set(textDoc.uri, textDoc);
        return await lspService.getHover(textDoc, params.position);
    } catch (_) { return null; }
});

// ─── Completions ──────────────────────────────────────────────────────────────
connection.onCompletion(async (params) => {
    if (!lspService || !workspace) return { isIncomplete: false, items: [] };
    const textDoc = documents.get(params.textDocument.uri);
    if (!textDoc) return { isIncomplete: false, items: [] };
    try {
        workspace.documents.set(textDoc.uri, textDoc);
        const items = await lspService.getCompletionItems(textDoc, params.position, { triggerCharacter: '/' });
        return { isIncomplete: false, items: items || [] };
    } catch (_) { return { isIncomplete: false, items: [] }; }
});

connection.onShutdown(() => {
    try { workspace?.closeWatcher?.(); } catch (_) {}
});

documents.listen(connection);
connection.listen();
