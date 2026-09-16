const { createLanguageService } = require('vscode-markdown-languageservice');
const { TextDocument } = require('vscode-languageserver-textdocument');
const { URI } = require('vscode-uri');
const path = require('path');
const fs = require('fs');
const MarkdownIt = require('markdown-it');

const mdParser = new MarkdownIt();

const slugifier = {
    fromHeading(text) {
        const val = text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        return {
            value: val,
            equals(other) { return val === other.value; }
        };
    },
    fromFragment(text) {
        const val = text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        return {
            value: val,
            equals(other) { return val === other.value; }
        };
    }
};

class CustomParser {
    constructor() {
        this.slugifier = slugifier;
    }

    async tokenize(document) {
        const text = document.getText();
        const rawTokens = mdParser.parse(text, {});
        
        const mapToken = (tok) => {
            return {
                type: tok.type,
                markup: tok.markup || '',
                content: tok.content || '',
                map: tok.map || null,
                children: tok.children ? tok.children.map(mapToken) : null
            };
        };

        return rawTokens.map(mapToken);
    }
}

class CustomWorkspace {
    constructor(caseDir) {
        this.caseDir = caseDir;
        this.documents = new Map();
        this.folders = [URI.file(caseDir)];
        this.setupWatcher();
    }

    setupWatcher() {
        if (this._watcherActive) return;
        try {
            this.watcher = fs.watch(this.caseDir, { recursive: true }, (eventType, filename) => {
                if (filename && (filename.endsWith('.md') || filename.endsWith('.markdown'))) {
                    const fullPath = path.join(this.caseDir, filename);
                    const uri = URI.file(fullPath).toString();
                    if (eventType === 'rename' || eventType === 'change') {
                        if (fs.existsSync(fullPath)) {
                            try {
                                const content = fs.readFileSync(fullPath, 'utf8');
                                const doc = TextDocument.create(uri, 'markdown', Date.now(), content);
                                this.documents.set(uri, doc);
                            } catch (_) {}
                        } else {
                            this.documents.delete(uri);
                        }
                    }
                }
            });
            this._watcherActive = true;
        } catch (err) {
            console.error(`[LSP Workspace] Failed to setup fs.watch for ${this.caseDir}:`, err.message);
        }
    }

    closeWatcher() {
        if (this.watcher) {
            try { this.watcher.close(); } catch (_) {}
            this.watcher = null;
            this._watcherActive = false;
            console.log(`[LSP Workspace] fs.watch closed for ${this.caseDir}`);
        }
    }

    get workspaceFolders() {
        return this.folders;
    }

    onDidChangeMarkdownDocument(listener) {
        return { dispose: () => {} };
    }
    onDidCreateMarkdownDocument(listener) {
        return { dispose: () => {} };
    }
    onDidDeleteMarkdownDocument(listener) {
        return { dispose: () => {} };
    }

    async getAllMarkdownDocuments() {
        const docs = [];
        const scan = (dir) => {
            if (!fs.existsSync(dir)) return;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name !== 'node_modules' && entry.name !== '.git') {
                        scan(fullPath);
                    }
                } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown'))) {
                    const uri = URI.file(fullPath).toString();
                    let doc = this.documents.get(uri);
                    if (!doc) {
                        const content = fs.readFileSync(fullPath, 'utf8');
                        doc = TextDocument.create(uri, 'markdown', 1, content);
                        this.documents.set(uri, doc);
                    }
                    docs.push(doc);
                }
            }
        };
        scan(this.caseDir);
        return docs;
    }

    hasMarkdownDocument(resource) {
        const uri = resource.toString();
        return this.documents.has(uri) || (fs.existsSync(resource.fsPath) && resource.fsPath.endsWith('.md'));
    }

    async openMarkdownDocument(resource) {
        const uri = resource.toString();
        let doc = this.documents.get(uri);
        if (!doc) {
            if (fs.existsSync(resource.fsPath)) {
                const content = fs.readFileSync(resource.fsPath, 'utf8');
                doc = TextDocument.create(uri, 'markdown', 1, content);
                this.documents.set(uri, doc);
            }
        }
        return doc;
    }

    async stat(resource) {
        if (fs.existsSync(resource.fsPath)) {
            const s = fs.statSync(resource.fsPath);
            return {
                type: s.isDirectory() ? 2 : 1,
                ctime: s.ctimeMs,
                mtime: s.mtimeMs,
                size: s.size
            };
        }
        return undefined;
    }

    async readDirectory(resource) {
        if (fs.existsSync(resource.fsPath) && fs.statSync(resource.fsPath).isDirectory()) {
            const entries = fs.readdirSync(resource.fsPath, { withFileTypes: true });
            return entries.map(e => {
                const type = e.isDirectory() ? 2 : 1;
                return [e.name, { type, ctime: 0, mtime: 0, size: 0 }];
            });
        }
        return [];
    }
}

const servicesMap = new Map();
const workspacesMap = new Map();

const NO_CANCEL_TOKEN = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => {} })
};

// Ensure all fs.watch handles are cleanly released on process shutdown
['exit', 'SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, () => {
        for (const [, ws] of workspacesMap) {
            try { ws?.closeWatcher?.(); } catch (_) {}
        }
    });
});

function getLspContext(caseDir) {
    if (servicesMap.has(caseDir)) {
        return {
            service: servicesMap.get(caseDir),
            workspace: workspacesMap.get(caseDir)
        };
    }
    const workspace = new CustomWorkspace(caseDir);
    const parser = new CustomParser();
    const logger = {
        level: 1,
        log(msg) { console.log(`[LSP Service] ${msg}`); }
    };

    const service = createLanguageService({
        workspace,
        parser,
        logger
    });
    servicesMap.set(caseDir, service);
    workspacesMap.set(caseDir, workspace);
    return { service, workspace };
}

async function getDiagnostics(caseDir, docUri, docContent) {
    // ── Table Sync: Deferred — yields to event loop before writing to SQLite ──────────────────
    // This entire block runs AFTER the diagnostics response is sent to the HTTP client.
    setImmediate(() => {
        try {
            const isClaims = docUri.endsWith('claims_registry.md') || docUri.endsWith('claims_registry.markdown');
            const isAvoidance = docUri.endsWith('avoidance_ledger.md') || docUri.endsWith('avoidance_ledger.markdown');

            if (isClaims || isAvoidance) {
                const { parseMarkdownTable } = require('../utils/table-sync');
                const { getDb } = require('./sqlite-store');
                const db = getDb(caseDir);

                if (isClaims) {
                    const rows = parseMarkdownTable(docContent);
                    if (rows && rows.length > 0) {
                        db.exec('DELETE FROM claims;');
                        const insertClaim = db.prepare(`
                            INSERT INTO claims (creditor, claimed_amount, admitted_amount, admitted_interest, rejected_amount, rejection_reason, claim_date, status, last_updated)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `);
                        rows.forEach(r => {
                            insertClaim.run(
                                r.creditor || '',
                                r.claimed_amount || 0,
                                r.admitted_amount || 0,
                                r.admitted_interest || 0,
                                r.rejected_amount || 0,
                                r.rejection_reason || '',
                                r.claim_date || '',
                                r.status || 'admitted',
                                new Date().toISOString()
                            );
                        });
                        console.log(`[LSP Sync] Synced ${rows.length} claims registry rows from Markdown table to SQLite.`);
                    }
                } else if (isAvoidance) {
                    const rows = parseMarkdownTable(docContent);
                    if (rows && rows.length > 0) {
                        db.exec('DELETE FROM avoidance_transactions;');
                        const insertTx = db.prepare(`
                            INSERT INTO avoidance_transactions (transaction_date, amount, debited_account, credited_party, related_party_status, applicable_section, forensic_notes, last_updated)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `);
                        rows.forEach(r => {
                            insertTx.run(
                                r.transaction_date || '',
                                r.amount || 0,
                                r.debited_account || '',
                                r.credited_party || '',
                                r.related_party_status || '',
                                r.applicable_section || '',
                                r.forensic_notes || '',
                                new Date().toISOString()
                            );
                        });
                        console.log(`[LSP Sync] Synced ${rows.length} avoidance transaction rows from Markdown table to SQLite.`);
                    }
                }
            }

            // ── Case Facts Sync ──
            const isCaseFacts = docUri.endsWith('case_facts.md') || docUri.endsWith('case_facts.markdown');
            if (isCaseFacts) {
                const lines = docContent.split('\n');
                const parsedKV = {};

                const listRegex = /^\s*[-*]\s*\*\*([a-zA-Z0-9_-]+)\*\*:\s*(.*)$/;
                const tableRegex = /^\|\s*([a-zA-Z0-9_-]+)\s*\|\s*([^|]+)\s*\|$/;

                for (let line of lines) {
                    line = line.trim();
                    let match = listRegex.exec(line);
                    if (match) {
                        parsedKV[match[1].trim()] = match[2].trim();
                        continue;
                    }
                    match = tableRegex.exec(line);
                    if (match) {
                        const key = match[1].trim();
                        const val = match[2].trim();
                        if (key.toLowerCase() === 'parameter' || key.toLowerCase() === 'key' || key.startsWith('---')) {
                            continue;
                        }
                        parsedKV[key] = val;
                    }
                }

                const keys = Object.keys(parsedKV);
                if (keys.length > 0) {
                    const reviewsDir = path.join(caseDir, 'reviews');
                    const dictPath = path.join(reviewsDir, 'case_kv_dictionary.json');
                    let currentDict = {};
                    if (fs.existsSync(dictPath)) {
                        try {
                            currentDict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
                        } catch (_) {}
                    }

                    let changed = false;
                    const now = new Date().toISOString();
                    for (const key of keys) {
                        const val = parsedKV[key];
                        const existing = currentDict[key];
                        if (!existing || existing.value !== val) {
                            currentDict[key] = {
                                value: val,
                                originalExtractedValue: existing ? existing.originalExtractedValue : val,
                                modifiedBy: 'user',
                                lastUpdated: now,
                                source: 'case_facts.md (Manual Edit)',
                                confidence: 'high',
                                explanation: 'Manually edited by user in case_facts.md.'
                            };
                            changed = true;
                        }
                    }

                    if (changed) {
                        if (!fs.existsSync(reviewsDir)) {
                            fs.mkdirSync(reviewsDir, { recursive: true });
                        }
                        fs.writeFileSync(dictPath, JSON.stringify(currentDict, null, 2), 'utf8');
                        console.log(`[LSP Sync] Synced ${keys.length} case facts to case_kv_dictionary.json.`);

                        try {
                            const { getDb } = require('./sqlite-store');
                            const db = getDb(caseDir);
                            const { URI } = require('vscode-uri');
                            const relativeFile = path.relative(caseDir, URI.parse(docUri).fsPath).replace(/\\/g, '/');
                            const upsertFact = db.prepare(`
                                INSERT INTO case_facts (key, filename, value, source_clause, verified_by_user, last_updated)
                                VALUES (?, ?, ?, ?, 1, ?)
                                ON CONFLICT(key) DO UPDATE SET
                                    filename = excluded.filename,
                                    value = excluded.value,
                                    source_clause = excluded.source_clause,
                                    verified_by_user = 1,
                                    last_updated = excluded.last_updated
                            `);
                            for (const key of keys) {
                                upsertFact.run(
                                    key,
                                    relativeFile,
                                    parsedKV[key],
                                    'case_facts.md (Manual Edit)',
                                    now
                                );
                            }
                            console.log(`[LSP Sync] SQLite case_facts table updated successfully.`);
                        } catch (dbErr) {
                            console.error('[LSP Sync] Failed to sync facts to SQLite database:', dbErr.message);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('[LSP Table Sync] Failed to parse and sync table to DB:', err.message);
        }
    });


    const { service, workspace } = getLspContext(caseDir);
    const doc = TextDocument.create(docUri, 'markdown', Date.now(), docContent);
    workspace.documents.set(docUri, doc);

    const lspDiagnostics = (await service.computeDiagnostics(doc, {}, NO_CANCEL_TOKEN)) || [];
    const customDiagnostics = [];
    
    // Custom linter for @@ statutory references
    const { getLawText } = require('../utils/vault-loader');
    const citationRegex = /@@([\w-]+)\/([\w/.-]+)/g;
    let match;
    while ((match = citationRegex.exec(docContent)) !== null) {
        const fullCitation = match[0];
        const lawCode = match[1];
        const secPath = match[2];
        try {
            const resolved = getLawText(`${lawCode}/${secPath}`);
            if (!resolved) {
                const startPos = doc.positionAt(match.index);
                const endPos = doc.positionAt(match.index + fullCitation.length);
                customDiagnostics.push({
                    range: { start: startPos, end: endPos },
                    severity: 2, // Warning
                    message: `Statute reference "${fullCitation}" could not be verified in the active Law Vault.`
                });
            }
        } catch (_) {}
    }

    // Custom linter for relative Markdown links (Legal Linker)
    const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    let linkMatch;
    const docPath = URI.parse(docUri).fsPath;
    
    // Make sure workspace documents are fully loaded for link checking
    await workspace.getAllMarkdownDocuments();
    
    while ((linkMatch = linkRegex.exec(docContent)) !== null) {
        const fullMatch = linkMatch[0];
        let target = linkMatch[2].trim();
        
        // Skip absolute URLs, statutory refs, and pure local anchors
        if (/^(https?:\/\/|mailto:|@@|#)/i.test(target)) {
            continue;
        }
        
        // Strip anchor hash if present
        const hashIdx = target.indexOf('#');
        const targetPathOnly = hashIdx !== -1 ? target.substring(0, hashIdx) : target;
        
        if (!targetPathOnly) continue;
        
        // Only validate Markdown target links
        if (!/\.(md|markdown)$/i.test(targetPathOnly)) {
            continue;
        }
        
        const resolvedPath = path.resolve(path.dirname(docPath), targetPathOnly);
        if (!fs.existsSync(resolvedPath)) {
            const targetBasename = path.basename(targetPathOnly);
            let foundDoc = null;
            
            for (const docInWorkspace of workspace.documents.values()) {
                const docFsPath = URI.parse(docInWorkspace.uri).fsPath;
                if (path.basename(docFsPath) === targetBasename) {
                    foundDoc = docFsPath;
                    break;
                }
            }
            
            const startPos = doc.positionAt(linkMatch.index);
            const endPos = doc.positionAt(linkMatch.index + fullMatch.length);
            
            if (foundDoc) {
                const suggestedPath = path.relative(path.dirname(docPath), foundDoc);
                customDiagnostics.push({
                    range: { start: startPos, end: endPos },
                    severity: 2, // Warning
                    message: `Link target "${targetPathOnly}" is located at a different path: "${suggestedPath}".`
                });
            } else {
                customDiagnostics.push({
                    range: { start: startPos, end: endPos },
                    severity: 2, // Warning
                    message: `Link target "${targetPathOnly}" does not resolve to any document in the case folder.`
                });
            }
        }
    }
    // Custom check for structural headings in companion Markdown files
    const docFsPath = URI.parse(docUri).fsPath;
    const docName = path.basename(docFsPath);
    const isCompanion = docFsPath.endsWith('.md') &&
                        !docFsPath.includes('/wiki/') &&
                        !docFsPath.includes('/conversions/') &&
                        docName !== 'CASE_AUDIT.md' &&
                        docName !== 'case_facts.md' &&
                        docName !== 'claims_registry.md' &&
                        docName !== 'avoidance_ledger.md';
    if (isCompanion) {
        const hasHeadings = /^#[#\s]/m.test(docContent);
        if (!hasHeadings) {
            const firstLineLength = (docContent.split('\n')[0] || '').length;
            customDiagnostics.push({
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: firstLineLength }
                },
                severity: 2, // Warning
                message: `Companion markdown lacks structural headings (# or ##). Please manually add structure or right-click the source file and select "2. Enhance Markdown".`
            });
        }
    }

    return [...lspDiagnostics, ...customDiagnostics];
}

async function getCompletions(caseDir, docUri, docContent, position) {
    const { service, workspace } = getLspContext(caseDir);
    const doc = TextDocument.create(docUri, 'markdown', Date.now(), docContent);
    workspace.documents.set(docUri, doc);

    const completions = await service.getCompletionItems(doc, position, {
        triggerCharacter: '/'
    }, NO_CANCEL_TOKEN) || { items: [] };

    const items = Array.isArray(completions) ? completions : (completions.items || []);

    // Check if line before position has a trigger like #sec, /sec, or @@
    const lineStartOffset = doc.offsetAt({ line: position.line, character: 0 });
    const currentOffset = doc.offsetAt(position);
    const linePrefix = docContent.substring(lineStartOffset, currentOffset);
    const secTriggerMatch = linePrefix.match(/(?:#|\/|@@)(sec\w*|\d+.*)$/i);
    
    if (secTriggerMatch) {
        let queryTerm = secTriggerMatch[1];
        if (/^sec\d+/i.test(queryTerm)) {
            queryTerm = queryTerm.replace(/^sec/i, 'Section ');
        }
        const { searchLaws, loadVault } = require('../utils/vault-loader');
        loadVault();
        try {
            const lawHits = await searchLaws(queryTerm, 10);
            for (const hit of lawHits) {
                items.push({
                    label: hit.title || hit.section || hit.id,
                    kind: 14, // Keyword / Reference
                    detail: `Bare Act / Precedent (${hit.section || 'Statute'})`,
                    documentation: {
                        kind: 'markdown',
                        value: hit.text ? hit.text.substring(0, 500) : (hit.title || '')
                    },
                    insertText: hit.text ? `\n> **${hit.title}**\n> ${hit.text.replace(/\n/g, '\n> ')}\n` : hit.title
                });
            }
        } catch (_) {}
    }

    return Array.isArray(completions) ? items : { ...completions, items };
}

async function getHover(caseDir, docUri, docContent, position) {
    const doc = TextDocument.create(docUri, 'markdown', Date.now(), docContent);
    const offset = doc.offsetAt(position);
    
    // 1. Check custom statutory reference @@ citations
    const { getLawText, searchLaws, loadVault } = require('../utils/vault-loader');
    const citationRegex = /@@([\w-]+)\/([\w/.-]+)/g;
    let match;
    while ((match = citationRegex.exec(docContent)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (offset >= start && offset <= end) {
            const lawCode = match[1];
            const secPath = match[2];
            try {
                const resolved = getLawText(`${lawCode}/${secPath}`);
                if (resolved) {
                    const cleanText = resolved.replace(/^---[\s\S]*?---\r?\n?/, '').trimStart();
                    return {
                        contents: {
                            kind: 'markdown',
                            value: `**Law Reference:** \`${lawCode}/${secPath}\`\n\n${cleanText}`
                        },
                        range: {
                            start: doc.positionAt(start),
                            end: doc.positionAt(end)
                        }
                    };
                }
            } catch (_) {}
        }
    }

    // 2. Check Section references like "Section 7", "Section 9", "Section 12A", "Section 43", "Section 66"
    const sectionRegex = /\b(?:Section|Sec\.?)\s*(\d+[A-Z]?(?:\(\d+\))?)\b/gi;
    let secMatch;
    while ((secMatch = sectionRegex.exec(docContent)) !== null) {
        const start = secMatch.index;
        const end = start + secMatch[0].length;
        if (offset >= start && offset <= end) {
            const secNum = secMatch[1];
            loadVault();
            try {
                const lawHits = await searchLaws(`Section ${secNum}`, 1);
                if (lawHits && lawHits.length > 0 && lawHits[0].text) {
                    const cleanText = lawHits[0].text.replace(/^---[\s\S]*?---\r?\n?/, '').trimStart();
                    return {
                        contents: {
                            kind: 'markdown',
                            value: `⚖️ **Statutory Bare Act Reference:** \`${lawHits[0].title || secMatch[0]}\`\n\n${cleanText.substring(0, 600)}...`
                        },
                        range: {
                            start: doc.positionAt(start),
                            end: doc.positionAt(end)
                        }
                    };
                }
            } catch (_) {}
        }
    }

    const { service, workspace } = getLspContext(caseDir);
    workspace.documents.set(docUri, doc);
    const hover = await service.getHover(doc, position, NO_CANCEL_TOKEN);
    return hover;
}

module.exports = {
    getDiagnostics,
    getCompletions,
    getHover
};
