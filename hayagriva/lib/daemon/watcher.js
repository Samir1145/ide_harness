const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const { convertPdfBlock } = require('../core/converter');
const { readIndex, writeIndex, upsertDocument } = require('../core/indexer');
const bm25 = require('../core/bm25');
const { getChatResponse } = require('../core/llm-client');
const { ingestWiki, ingestWikiCard, ingestPdf, ingestDocx, ingestXlsx, ingestText } = require('../pipeline');
const { extractFileKV } = require('../pipeline/common/extract');

const DOC_EXTENSIONS = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.csv', '.md', '.txt'];
const { pendingPdfQueue, completedPdfSet, queuePdfTask, startPdfIngestionDaemon } = require('./lazy_pdf_worker');
const { getDb } = require('../core/sqlite-store');
const { parseMarkdownWithFrontmatter, formatMarkdownWithFrontmatter } = require('../utils/okf');

function findOriginalFilePath(caseDir, mdRelativePath) {
    const base = mdRelativePath.replace(/\.md$/, '');
    const exts = ['.docx', '.pdf', '.xlsx', '.doc', '.xls'];
    for (const ext of exts) {
        const orig = base + ext;
        if (fs.existsSync(path.join(caseDir, orig))) {
            return orig;
        }
    }
    return mdRelativePath;
}

function getSafeFilename(title) {
    let safe = title.replace(/[^a-zA-Z0-9\s-_]/g, '').trim().replace(/\s+/g, '_') || 'untitled';
    if (safe.length > 60) {
        let hash = 0;
        for (let i = 0; i < title.length; i++) {
            hash = (hash << 5) - hash + title.charCodeAt(i);
            hash |= 0;
        }
        safe = safe.substring(0, 60) + '_' + Math.abs(hash);
    }
    return safe;
}

function updateStatus(caseDir, relativePath, status, errorMsg = '') {
    try {
        let statusKey = relativePath;
        if (relativePath.endsWith('.md')) {
            statusKey = findOriginalFilePath(caseDir, relativePath);
        }
        
        const db = getDb(caseDir);
        
        let size_bytes = 0;
        try {
            const fullPath = path.join(caseDir, statusKey);
            if (fs.existsSync(fullPath)) {
                size_bytes = fs.statSync(fullPath).size;
            }
        } catch (_) {}

        const isExtracted = ['companion_ready', 'reviewed', 'ingesting', 'indexed', 'failed_ingest', 'enriching', 'enriched', 'failed_enrich'].includes(status);
        const isIndexed = ['indexed', 'enriching', 'enriched'].includes(status);
        const extracted_at = isExtracted ? new Date().toISOString() : null;
        const indexed_at = isIndexed ? new Date().toISOString() : null;

        const upsertDoc = db.prepare(`
            INSERT INTO documents (filename, title, status, size_bytes, extracted_at, indexed_at)
            VALUES (?, ?, ?, ?, COALESCE(?, (SELECT extracted_at FROM documents WHERE filename = ?)), COALESCE(?, (SELECT indexed_at FROM documents WHERE filename = ?)))
            ON CONFLICT(filename) DO UPDATE SET
                status = excluded.status,
                size_bytes = excluded.size_bytes,
                extracted_at = COALESCE(excluded.extracted_at, documents.extracted_at),
                indexed_at = COALESCE(excluded.indexed_at, documents.indexed_at)
        `);
        
        const ext = path.extname(statusKey).toLowerCase();
        const basename = path.basename(statusKey, ext);

        upsertDoc.run(statusKey, basename, status, size_bytes, extracted_at, statusKey, indexed_at, statusKey);
        console.log(`[Status SQLite] Updated status of "${statusKey}" to "${status}"`);

        // Sync with conversions/*.status sidecar file
        const base = statusKey.replace(/\.[a-zA-Z0-9]+$/, '');
        const subfolder = path.dirname(statusKey);
        const conversionsDir = path.join(caseDir, 'conversions');
        const destDir = subfolder === '.' ? conversionsDir : path.join(conversionsDir, subfolder);
        fs.mkdirSync(destDir, { recursive: true });
        const sidecarPath = path.join(destDir, `${path.basename(base)}.status`);
        fs.writeFileSync(sidecarPath, status, 'utf8');

        // Sync with conversions/*.error sidecar file
        const errorPath = path.join(destDir, `${path.basename(base)}.error`);
        if (errorMsg) {
            fs.writeFileSync(errorPath, errorMsg, 'utf8');
        } else {
            if (fs.existsSync(errorPath)) {
                try {
                    fs.unlinkSync(errorPath);
                } catch (_) {}
            }
        }

        // Automatically regenerate case audit md index
        generateCaseAudit(caseDir);
    } catch (e) {
        console.error(`[Status SQLite Error] Error updating status for ${relativePath}:`, e.message);
    }
}

function chunkText(text, maxChars = 3000, overlapParas = 1) {
    const paras = text.split(/\n\s*\n/).filter(p => p.trim());
    const chunks = [];
    let currentChunk = [];
    let currentLen = 0;
    
    for (let i = 0; i < paras.length; i++) {
        const p = paras[i];
        currentChunk.push(p);
        currentLen += p.length;
        
        if (currentLen >= maxChars || i === paras.length - 1) {
            chunks.push(currentChunk.join('\n\n'));
            if (overlapParas > 0 && i < paras.length - 1) {
                currentChunk = currentChunk.slice(-overlapParas);
                currentLen = currentChunk.reduce((acc, c) => acc + c.length, 0);
            } else {
                currentChunk = [];
                currentLen = 0;
            }
        }
    }
    return chunks;
}

function indexToSqlite(caseDir, result) {
    try {
        const db = getDb(caseDir);
        const relative = findOriginalFilePath(caseDir, result.relative);
        
        // 1. Clear old entries
        const deleteSections = db.prepare('DELETE FROM document_sections WHERE filename = ?');
        deleteSections.run(relative);
        
        const deleteFts = db.prepare('DELETE FROM fts_chunks WHERE filename = ?');
        deleteFts.run(relative);

        // 2. Insert sections & 3. Insert FTS chunks
        const insertSection = db.prepare(`
            INSERT INTO document_sections (filename, title, page_start, page_end, parent_title, hierarchy_level, content)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const insertFts = db.prepare(`
            INSERT INTO fts_chunks (filename, section_title, page_number, chunk_index, content)
            VALUES (?, ?, ?, ?, ?)
        `);

        const pathStack = [{ title: result.basename, level: 0 }];
        
        for (const sec of result.sections) {
            const level = sec.level || 2;
            while (pathStack.length > 1 && pathStack[pathStack.length - 1].level >= level) {
                pathStack.pop();
            }
            const parent = pathStack[pathStack.length - 1];
            pathStack.push({ title: sec.title, level });
            
            const parentPath = pathStack.slice(0, -1).map(p => p.title).join(' > ');

            insertSection.run(
                relative,
                sec.title,
                sec.pageIndex || 1,
                sec.pageEnd || 1,
                parent ? parent.title : null,
                level,
                sec.content
            );

            // Chunk and insert for search
            const body = sec.content;
            const pageNum = sec.pageIndex || 1;
            const textToIndex = `[Section: ${parentPath ? parentPath + ' > ' : ''}${sec.title}]\n\n${body}`;

            if (body.length > 3000) {
                const subChunks = chunkText(textToIndex, 3000, 1);
                subChunks.forEach((chunk, k) => {
                    insertFts.run(relative, sec.title, pageNum, k, chunk);
                });
            } else {
                insertFts.run(relative, sec.title, pageNum, 0, textToIndex);
            }
        }
        
        console.log(`[SQLite Index] Successfully structured and indexed "${relative}" in case_vault.db`);
    } catch (e) {
        console.error(`[SQLite Index Error] Failed to index "${result.relative}" into SQLite:`, e.message);
    }
}

function createWatcher(caseDir, onChange) {
    const ignore = (p) => {
        const base = path.basename(p);
        if (base === 'index.md' || base === 'index.json' || base === 'timeline.md') return true;
        if (base.startsWith('.') && base !== '.gitignore') return true;
        if (p.includes('concepts' + path.sep) || p.endsWith(path.sep + 'concepts')) return true;
        if (p.includes('reviews' + path.sep) || p.endsWith(path.sep + 'reviews')) return true;
        if (p.includes('drafts' + path.sep) || p.endsWith(path.sep + 'drafts')) return true;
        if (p.includes('exports' + path.sep) || p.endsWith(path.sep + 'exports')) return true;
        if (p.includes('wiki' + path.sep + 'qna') || p.endsWith(path.sep + 'wiki' + path.sep + 'qna')) return true;
        if (p.endsWith(path.sep + 'wiki')) return true;
        if (p.includes('conversions' + path.sep) || p.endsWith(path.sep + 'conversions')) return true;
        if (p.includes('.git' + path.sep)) return true;
        if (p.endsWith('.DS_Store')) return true;
        return false;
    };

    startPdfIngestionDaemon();

    const watcher = chokidar.watch(caseDir, {
        ignored: ignore,
        persistent: true,
        ignoreInitial: true,
        depth: 10
    });

    watcher.on('all', (event, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (!DOC_EXTENSIONS.includes(ext) && !filePath.toLowerCase().endsWith('.wiki.html')) return;
        
        if (event === 'add' || event === 'change') {
            if (typeof onChange === 'function') {
                onChange(filePath);
            } else if (onChange && typeof onChange.onFileChange === 'function') {
                onChange.onFileChange(filePath);
            }
        } else if (event === 'unlink') {
            console.log(`[Watcher] File deleted: ${filePath}. Running self-healing cleanup...`);
            const relative = path.relative(caseDir, filePath);
            const isWikiHtml = filePath.toLowerCase().endsWith('.wiki.html');
            const basename = isWikiHtml ? path.basename(filePath, '.wiki.html') : path.basename(filePath, ext);
            
            // 1. Wipe concepts directory
            const conceptsDir = path.join(caseDir, 'concepts', basename);
            if (fs.existsSync(conceptsDir)) {
                try {
                    fs.rmSync(conceptsDir, { recursive: true, force: true });
                    console.log(`[Watcher] Cleaned up concept folder: ${conceptsDir}`);
                } catch (e) {
                    console.error('[Watcher] Failed to delete concepts folder:', e.message);
                }
            }

            // 2. Remove from BM25 index
            try {
                const bm25IndexFile = path.join(caseDir, 'concepts', 'bm25_index.json');
                const bm25Index = bm25.loadIndex(bm25IndexFile);
                let changed = false;
                for (const id in bm25Index.docLengths) {
                    if (id.startsWith(`${basename}::`) || id === `wiki::${basename}`) {
                        bm25.removeDocument(bm25Index, id);
                        changed = true;
                    }
                }
                if (changed) {
                    bm25.saveIndex(bm25Index, bm25IndexFile);
                    console.log(`[Watcher] Cleaned up BM25 index postings for: ${basename}`);
                }
            } catch (e) {
                console.error('[Watcher] Failed to clean up BM25 postings:', e.message);
            }

            // 3. Remove from index.json
            try {
                const index = readIndex(caseDir);
                const idx = index.documents.findIndex(d => d.filename === relative);
                if (idx >= 0) {
                    index.documents.splice(idx, 1);
                    writeIndex(caseDir, index);
                    console.log(`[Watcher] Removed document metadata from index.json: ${relative}`);
                }
            } catch (e) {
                console.error('[Watcher] Failed to update index.json metadata:', e.message);
            }

            // 4. Remove from SQLite Database
            try {
                const db = getDb(caseDir);
                
                // Clear sections & chunks (even though documents delete has ON DELETE CASCADE, let's clean them explicitly)
                const deleteSections = db.prepare('DELETE FROM document_sections WHERE filename = ?');
                deleteSections.run(relative);

                const deleteFts = db.prepare('DELETE FROM fts_chunks WHERE filename = ?');
                deleteFts.run(relative);

                const deleteDoc = db.prepare('DELETE FROM documents WHERE filename = ?');
                deleteDoc.run(relative);

                console.log(`[SQLite Watcher] Cleaned up database entries for deleted file: ${relative}`);
            } catch (e) {
                console.error('[SQLite Watcher] Failed to remove deleted document from DB:', e.message);
            }
        }
    });

    return watcher;
}




async function ingestFile(caseDir, filePath, opts = {}) {
    // opts.conversionOnly — Phase 1: PDF→.md only, zero index/BM25 writes
    // opts.disableDoc2Query — skip wiki Q&A card generation in Phase 2
    const conversionOnly = opts === true ? false : (opts.conversionOnly === true); // back-compat: bool arg
    const disableDoc2Query = opts === true ? true : (opts.disableDoc2Query === true);

    const isWikiHtml = filePath.toLowerCase().endsWith('.wiki.html');
    const ext = isWikiHtml ? '.wiki.html' : path.extname(filePath).toLowerCase();
    const relative = path.relative(caseDir, filePath);
    const basename = isWikiHtml ? path.basename(filePath, '.wiki.html') : path.basename(filePath, ext);
    const subfolder = path.dirname(relative);
    const safeSubfolder = subfolder === '.' ? '' : subfolder.replace(/^conversions[\\/]?/, '');

    const isWiki = relative.startsWith('wiki' + path.sep);

    try {
        if (isWiki) {
            // Wiki cards are always Phase 2 — skip in conversion-only mode
            if (conversionOnly) return null;
            const bm25IndexFile = path.join(caseDir, 'concepts', 'bm25_index.json');
            const bm25Index = bm25.loadIndex(bm25IndexFile);
            const res = await ingestWikiCard(caseDir, filePath, bm25Index, bm25IndexFile);
            try {
                const { syncMarkdownToWiki } = require('../pipeline/wiki/ingest');
                await syncMarkdownToWiki(caseDir, filePath);
            } catch (err) {
                console.error(`[Watcher] Failed to sync wiki card back to HTML: ${err.message}`);
            }

            // Sync card contents to SQLite FTS index
            try {
                const db = getDb(caseDir);
                const mdContent = fs.readFileSync(filePath, 'utf8');
                const relativeFile = path.relative(caseDir, filePath).replace(/\\/g, '/');
                const cardName = path.basename(filePath, '.md');
                
                // Clear old
                const deleteFts = db.prepare("DELETE FROM fts_chunks WHERE filename = ?");
                deleteFts.run(relativeFile);

                // Insert
                const insertFts = db.prepare(`
                    INSERT INTO fts_chunks (filename, section_title, page_number, chunk_index, content)
                    VALUES (?, ?, ?, ?, ?)
                `);
                insertFts.run(relativeFile, cardName, 1, 0, mdContent);
                console.log(`[SQLite Watcher] Indexed wiki card "${cardName}" in case_vault.db`);
            } catch (e) {
                console.error('[SQLite Watcher] Failed to index wiki card in DB:', e.message);
            }

            return res;
        }

        if (isWikiHtml) {
            if (conversionOnly) return null;
            const bm25IndexFile = path.join(caseDir, 'concepts', 'bm25_index.json');
            const bm25Index = bm25.loadIndex(bm25IndexFile);
            const result = await ingestWiki(caseDir, filePath, bm25Index, bm25IndexFile);
            const index = readIndex(caseDir);
            upsertDocument(index, {
                title: basename,
                filename: relative,
                conceptsDir: result.conceptsDir,
                type: 'wiki.html',
                tags: [safeSubfolder, basename].filter(Boolean),
                sections: result.sections,
                sectionTitles: result.sectionTitles,
                ingestedAt: new Date().toISOString(),
                sizeBytes: fs.statSync(filePath).size,
                priority: 5,
                documentDate: null,
                status: 'indexed'
            });
            writeIndex(caseDir, index);
            return result;
        }

        if (ext === '.md' || ext === '.txt') {
            // Phase 1: companion .md files modified by the daemon are skipped entirely.
            // The daemon calls with conversionOnly:true — nothing touches BM25 or index.json.
            if (conversionOnly) {
                console.log(`[Watcher] Skipping Phase 2 ingestion for companion (conversion-only): ${path.basename(filePath)}`);
                return null;
            }

            // Phase 2: full pipeline — reads the (user-edited) .md from disk
            console.log(`[Watcher] Phase 2 ingestion: BM25 + concepts + wiki for ${path.basename(filePath)}`);
            const bm25IndexFile = path.join(caseDir, 'concepts', 'bm25_index.json');
            const bm25Index = bm25.loadIndex(bm25IndexFile);
            const result = await ingestText(caseDir, filePath, bm25Index, bm25IndexFile);

            // Build the PageIndex Tree JSON and save it
            const tree = buildPageIndexTree(result.basename, result.sections, result.markdown);
            const treePath = path.join(result.conceptsDir, 'pageindex_tree.json');
            fs.mkdirSync(result.conceptsDir, { recursive: true });
            fs.writeFileSync(treePath, JSON.stringify(tree, null, 4), 'utf8');
            console.log(`[Watcher] Generated pageindex_tree.json: ${treePath}`);

            // Read case-specific ingestion settings
            const caseSettings = loadCaseSettings(caseDir);
            const profile = caseSettings.processingProfile || 'standard';

            // Queue the document for background processing (summaries and Doc2Query questions)
            if (!disableDoc2Query && profile !== 'lite') {
                queueForLazyProcessing(caseDir, result.basename, result.sections, result.relative);
            } else if (profile === 'lite') {
                console.log(`[Watcher] Ingestion Profile is 'lite' - skipping background summarization/Q&A`);
            }

            const index = readIndex(caseDir);
            upsertDocument(index, {
                title: result.basename,
                filename: result.relative,
                conceptsDir: result.conceptsDir,
                type: result.ext.replace('.', ''),
                tags: [result.safeSubfolder, result.basename].filter(Boolean),
                sections: result.sections.length,
                sectionTitles: result.sectionTitles,
                ingestedAt: new Date().toISOString(),
                sizeBytes: fs.statSync(filePath).size,
                priority: result.priority,
                documentDate: result.documentDate,
                status: 'indexed'
            });
            writeIndex(caseDir, index);

            // Index sections and search chunks in SQLite database
            indexToSqlite(caseDir, result);

            // Asynchronously run dynamic vector indexing
            indexVectorsToSqlite(caseDir, result, profile).catch(err => {
                console.error(`[Watcher] Vector indexing failed:`, err.message);
            });

            // Update statuses.json index
            updateStatus(caseDir, relative, 'indexed');

            // Trigger schema-less fact extraction asynchronously in the background
            extractFileKV(caseDir, filePath, result.markdown).catch(e => {
                console.error(`[extract-file error] Failed for ${path.basename(filePath)}:`, e.message);
            });

            return {
                sections: result.sections.length,
                conceptsDir: result.conceptsDir,
                shadowDocuments: result.shadowDocuments
            };
        }

        // ── Binary files: PDF, DOCX, XLSX ────────────────────────────────────
        let result;
        let fileType = ext.replace('.', '');
        if (ext === '.pdf') {
            result = await ingestPdf(caseDir, filePath, { multimodal: opts.multimodal === true });
            fileType = 'pdf';
        } else if (ext === '.docx') {
            result = await ingestDocx(caseDir, filePath);
            fileType = 'docx';
        } else if (ext === '.xlsx' || ext === '.xls') {
            result = await ingestXlsx(caseDir, filePath);
            fileType = ext.replace('.', '');
        } else {
            throw new Error(`Unsupported binary format: ${ext}`);
        }

        // Handle partial PDF pagination
        if (ext === '.pdf' && result.isPartial) {
            if (completedPdfSet.has(filePath)) {
                console.log(`[Lazy PDF Ingest] Skipping re-queue for already-completed PDF: ${basename}`);
            } else {
                queuePdfTask({
                    caseDir,
                    filePath,
                    companionPath: result.companionPath,
                    nextPage: 4,
                    totalPages: result.totalPages
                });
                console.log(`[Lazy PDF Ingest] Queued ${basename} for background page ingestion (Pages 4 to ${result.totalPages})`);
            }
        }

        // Phase 1 (conversionOnly): write statuses.json index, skip index.json
        if (conversionOnly) {
            const targetStatus = (ext === '.pdf' && result.isPartial) ? 'processing' : 'companion_ready';
            updateStatus(caseDir, relative, targetStatus);
            console.log(`[Watcher] Phase 1 complete — status: ${targetStatus} for ${basename}`);
            return { sections: 0, companionPath: result.companionPath, status: targetStatus };
        }

        // Phase 2 (or non-PDF binary): write index.json
        const index = readIndex(caseDir);
        upsertDocument(index, {
            title: basename,
            filename: relative,
            conceptsDir: path.join('concepts', basename),
            type: fileType,
            tags: [safeSubfolder, basename].filter(Boolean),
            sections: 0,
            sectionTitles: [],
            ingestedAt: new Date().toISOString(),
            sizeBytes: fs.statSync(filePath).size,
            priority: 5,
            documentDate: null,
            status: 'companion_ready'
        });
        writeIndex(caseDir, index);

        return { sections: 0, companionPath: result.companionPath };

    } catch (err) {
        console.error(`[Watcher] Failed to ingest ${relative}:`, err.message);
        try {
            const ext = path.extname(relative);
            const isWikiHtml = relative.endsWith('.wiki.html');
            const basename = isWikiHtml ? path.basename(relative, '.wiki.html') : path.basename(relative, ext);
            const subfolder = path.dirname(relative);
            const conversionsDir = path.join(caseDir, 'conversions');
            const destDir = subfolder === '.' ? conversionsDir : path.join(conversionsDir, subfolder);
            fs.mkdirSync(destDir, { recursive: true });
            const errorPath = path.join(destDir, `${basename}.error`);
            fs.writeFileSync(errorPath, err.message, 'utf8');
            updateStatus(caseDir, relative, 'failed_convert');
        } catch (e) {
            console.error('[Watcher] Failed to write sidecar error file:', e.message);
        }
        return null;
    }
}

// =========================================================================
// LAZY BACKGROUND WORKER & TREE GENERATOR
// =========================================================================

const lazyQueue = [];
let isWorkerRunning = false;

function buildPageIndexTree(docName, sections, rawText) {
    let nodeCounter = 0;
    const getId = () => `node-${++nodeCounter}`;

    const rootNode = {
        id: getId(),
        level: 0,
        title: docName,
        summary: "",
        content: rawText || "",
        pageStart: 1,
        pageEnd: 1,
        children: [],
        parentId: null,
        metadata: {
            type: "document",
            totalPages: 1,
            totalChars: (rawText || "").length
        }
    };

    let maxPage = 1;
    for (const sec of sections) {
        if (sec.pageIndex && sec.pageIndex > maxPage) {
            maxPage = sec.pageIndex;
        }
    }
    rootNode.metadata.totalPages = maxPage;
    rootNode.pageEnd = maxPage;

    const stack = [rootNode];

    for (const sec of sections) {
        const level = sec.level || 2;

        while (stack.length > 1 && stack[stack.length - 1].level >= level) {
            stack.pop();
        }

        const parentNode = stack[stack.length - 1];
        const summary = generateFallbackSummary(sec.content);

        const childNode = {
            id: getId(),
            level: level,
            title: sec.title,
            summary: summary,
            content: sec.content || "",
            pageStart: sec.pageIndex || parentNode.pageStart,
            pageEnd: sec.pageIndex || parentNode.pageStart,
            children: [],
            parentId: parentNode.id,
            metadata: {
                type: "section",
                headingLevel: level
            }
        };

        parentNode.children.push(childNode);
        stack.push(childNode);
    }

    finalizeTree(rootNode);

    return {
        success: true,
        tree: rootNode,
        nodeCount: nodeCounter,
        summariesGenerated: 0
    };
}

function generateFallbackSummary(content) {
    if (!content || !content.trim()) return "";
    const clean = content.replace(/[#*`]/g, '').trim();
    const sentences = clean.split(/(?<=[.!?])\s+/);
    const summary = sentences.slice(0, 2).join(" ");
    return summary.length > 200 ? summary.substring(0, 197) + "..." : summary;
}

function finalizeTree(node) {
    if (!node.children || node.children.length === 0) {
        return;
    }

    for (const child of node.children) {
        finalizeTree(child);
    }

    let minPage = node.pageStart;
    let maxPage = node.pageEnd;
    for (const child of node.children) {
        if (child.pageStart < minPage) minPage = child.pageStart;
        if (child.pageEnd > maxPage) maxPage = child.pageEnd;
    }

    node.pageStart = minPage;
    node.pageEnd = maxPage;
}

function queueForLazyProcessing(caseDir, basename, sections, relative) {
    // Clear any existing queue items for this document to avoid duplicates
    for (let i = lazyQueue.length - 1; i >= 0; i--) {
        if (lazyQueue[i].basename === basename && lazyQueue[i].caseDir === caseDir) {
            lazyQueue.splice(i, 1);
        }
    }
    lazyQueue.push({ caseDir, basename, sections, relative });
    console.log(`[Lazy Queue] Queued document: ${basename} (sections: ${sections.length}, relative: ${relative})`);
    
    if (!isWorkerRunning) {
        startLazyWorker();
    }
}

async function startLazyWorker() {
    isWorkerRunning = true;
    console.log("[Lazy Worker] Background worker started.");
    let processedBatchCount = 0;

    while (lazyQueue.length > 0) {
        const item = lazyQueue[0];
        const { caseDir, basename } = item;
        const conceptsDir = path.join(caseDir, 'concepts', basename);
        const treePath = path.join(conceptsDir, 'pageindex_tree.json');

        if (!fs.existsSync(treePath)) {
            console.log(`[Lazy Worker] Tree file not found, skipping: ${treePath}`);
            lazyQueue.shift();
            continue;
        }

        let treeData;
        try {
            treeData = JSON.parse(fs.readFileSync(treePath, 'utf8'));
        } catch (e) {
            console.error(`[Lazy Worker] Failed to parse tree: ${treePath}`, e.message);
            lazyQueue.shift();
            continue;
        }

        // Find the first node that hasn't been processed by the LLM
        let targetNode = null;
        
        function findTarget(node) {
            if (node.metadata && node.metadata.type === 'section' && node.content && (!node.metadata.llmSummary)) {
                targetNode = node;
                return true;
            }
            if (node.children) {
                for (const child of node.children) {
                    if (findTarget(child)) return true;
                }
            }
            return false;
        }

        findTarget(treeData.tree);

        if (!targetNode) {
            console.log(`[Lazy Worker] Document completed: ${basename}`);
            if (item.relative) {
                updateStatus(caseDir, item.relative, 'enriched');
            } else {
                updateStatus(caseDir, `${basename}.md`, 'enriched');
            }
            lazyQueue.shift();
            continue;
        }

        console.log(`[Lazy Worker] Processing node "${targetNode.title}" for document "${basename}"`);
        processedBatchCount++;

        const os = require('os');
        const { loadLlmConfig } = require('../core/llm-client');
        const config = loadLlmConfig({ caseDir });
        const totalMemoryGB = os.totalmem() / (1024 * 1024 * 1024);

        if (config.activeMode === 'local' && totalMemoryGB < 24) {
            const errorMsg = `Local AI enrichment blocked: System has only ${totalMemoryGB.toFixed(1)}GB RAM (32GB required for offline models). Connect to internet and add an API key in Settings, or use Lite profile.`;
            console.error(`[Lazy Worker] ${errorMsg}`);
            
            if (item.relative) {
                updateStatus(caseDir, item.relative, 'failed_enrich', errorMsg);
            } else {
                updateStatus(caseDir, `${basename}.md`, 'failed_enrich', errorMsg);
            }
            lazyQueue.shift();
            continue;
        }

        try {
            console.log(`[Lazy Worker] [Step 1] Starting LLM Summary for node "${targetNode.title}"...`);
            // 1. Generate LLM Summary
            const summaryPrompt = `You are a legal document indexing assistant. Summarise the following text in exactly one concise sentence (maximum 40 words). Do not write any intro or explanation.
 
Text:
${targetNode.content}`;
            const summaryText = await getChatResponse([{ role: 'user', content: summaryPrompt }], { timeout: 240000 });
            console.log(`[Lazy Worker] [Step 1] Summary complete: "${summaryText.trim().substring(0, 60)}..."`);

            console.log(`[Lazy Worker] [Step 2] Starting Doc2Query questions generation...`);
            // 2. Generate Doc2Query Questions
            const qPrompt = `You are a document indexing assistant. Read the document text below and generate 4 diverse hypothetical questions that this text answers. Format them as a list of bullet points starting with "- ". Do not write any introduction, metadata, or extra explanation.
 
Text:
${targetNode.content}`;
            const questionsText = await getChatResponse([{ role: 'user', content: qPrompt }], { timeout: 240000 });
            console.log(`[Lazy Worker] [Step 2] Questions generated.`);

            // 3. Update the Tree JSON node
            console.log(`[Lazy Worker] [Step 3] Updating pageindex_tree.json summariesGenerated counter...`);
            targetNode.summary = summaryText.trim();
            targetNode.metadata.llmSummary = true;
            treeData.summariesGenerated++;
            fs.writeFileSync(treePath, JSON.stringify(treeData, null, 4), 'utf8');

            // 4. Update the Markdown card
            console.log(`[Lazy Worker] [Step 4] Reading and updating companion markdown card...`);
            const safeTitle = getSafeFilename(targetNode.title);
            const mdPath = path.join(conceptsDir, `${safeTitle}.md`);
            if (fs.existsSync(mdPath)) {
                let cardContent = fs.readFileSync(mdPath, 'utf8');
                console.log(`[Lazy Worker] [Step 4] Card file exists at ${mdPath}. Parsing frontmatter...`);
                const parsed = parseMarkdownWithFrontmatter(cardContent);
                
                // Update frontmatter summary
                parsed.frontmatter.summary = targetNode.summary;
                
                // Append questions to card body
                let cleanBody = parsed.body.split(/\n\n### Hypothetical Questions \(Auto-Generated\):/)[0];
                let body = cleanBody.trim();
                if (questionsText && questionsText.trim()) {
                    body += `\n\n### Hypothetical Questions (Auto-Generated):\n${questionsText.trim()}`;
                }

                const updatedMd = formatMarkdownWithFrontmatter({
                    title: parsed.frontmatter.title || targetNode.title,
                    docName: parsed.frontmatter.doc || basename,
                    tags: parsed.frontmatter.tags || [],
                    links: parsed.frontmatter.links || [],
                    content: body,
                    pageIndex: parsed.frontmatter.pageIndex || null,
                    pageEnd: parsed.frontmatter.pageEnd || null,
                    sourceDocument: parsed.frontmatter.sourceDocument || null
                });
                fs.writeFileSync(mdPath, updatedMd, 'utf8');
                console.log(`[Lazy Worker] [Step 4] Companion markdown card updated.`);

                // 5. Update BM25 Search Index
                console.log(`[Lazy Worker] [Step 5] Adding to BM25 search index...`);
                const bm25IndexFile = path.join(caseDir, 'concepts', 'bm25_index.json');
                if (fs.existsSync(bm25IndexFile)) {
                    const bm25Index = bm25.loadIndex(bm25IndexFile);
                    bm25.addDocument(bm25Index, {
                        id: `${basename}::${targetNode.title}`,
                        text: body
                     });
                    bm25.saveIndex(bm25Index, bm25IndexFile);
                }
                console.log(`[Lazy Worker] [Step 5] BM25 search index updated.`);
            } else {
                console.warn(`[Lazy Worker] [Step 4 Warning] Companion markdown card NOT found at ${mdPath}`);
            }

            // 6. Write Q&A Wiki Cards
            console.log(`[Lazy Worker] [Step 6] Writing Q&A wiki cards...`);
            const qnaDir = path.join(caseDir, 'wiki', 'qna');
            if (!fs.existsSync(qnaDir)) {
                fs.mkdirSync(qnaDir, { recursive: true });
            }

            const questions = questionsText.split('\n').map(q => q.replace(/^-\s*/, '').trim()).filter(Boolean);
            console.log(`[Lazy Worker] [Step 6] Found ${questions.length} questions to write...`);
            for (const q of questions) {
                const safeQTitle = getSafeFilename(q);
                const qPath = path.join(qnaDir, `${safeQTitle}.md`);
                
                const pageStart = targetNode.pageStart || 1;
                const pageEnd = targetNode.pageEnd || pageStart;
                const citationText = `[[concepts/${basename}/${safeTitle}]] (Page ${pageStart}${pageEnd !== pageStart ? '-' + pageEnd : ''})`;

                const qnaContent = formatMarkdownWithFrontmatter({
                    title: q,
                    type: "qna",
                    sourceDocument: basename,
                    sourceChunk: targetNode.title,
                    pageIndex: pageStart,
                    pageEnd: pageEnd,
                    tags: ["qna", basename, safeTitle].filter(Boolean),
                    links: [`concepts/${basename}/${safeTitle}`],
                    content: `# ${q}\n\n**Source Citation**: ${citationText}\n\n### Answer (Auto-Drafted):\n${targetNode.summary}\n`
                });

                fs.writeFileSync(qPath, qnaContent, 'utf8');
            }
            console.log(`[Lazy Worker] [Step 6] Q&A cards written successfully.`);

            console.log(`[Lazy Worker] Node "${targetNode.title}" processed successfully.`);

        } catch (err) {
            console.error(`[Lazy Worker] Failed to process node "${targetNode.title}":`, err.message);
            console.error(`[Lazy Worker Error Stack]:`, err.stack);
            try {
                const relative = item.relative;
                updateStatus(caseDir, relative, 'failed_enrich', err.message);
            } catch (e) {
                console.error('[Lazy Worker] Failed to update status in catch block:', e.message);
            }
            lazyQueue.shift();
            continue;
        }

        // Auto-Sleep Batching logic: only apply 6-minute Ollama RAM cooldown in local mode!
        if (processedBatchCount >= 5 && config.activeMode === 'local') {
            console.log(`[Lazy Worker] Batch limit (5 cards) reached. Pausing for 6 minutes (360s) to allow Ollama models to auto-unload from memory and free up RAM.`);
            processedBatchCount = 0;
            await new Promise(resolve => setTimeout(resolve, 360000));
        } else {
            const delay = config.activeMode === 'local' ? 15000 : 2000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    isWorkerRunning = false;
    console.log("[Lazy Worker] Background worker finished / went idle.");
}

function generateCaseAudit(caseDir) {
    try {
        const docExts = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.wiki.html'];
        const docFiles = [];
        
        const scan = (dir) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);
                const lower = file.toLowerCase();
                if (stat.isDirectory()) {
                    if (!file.startsWith('.') && 
                        lower !== 'concepts' && 
                        lower !== 'wiki' && 
                        lower !== 'conversions' && 
                        lower !== 'reviews' && 
                        lower !== 'drafts' && 
                        lower !== 'exports' &&
                        lower !== 'node_modules' &&
                        lower !== 'bower_components' &&
                        lower !== 'dist' &&
                        lower !== 'build' &&
                        lower !== 'out' &&
                        lower !== '.git' &&
                        lower !== '.github' &&
                        lower !== '.theia' &&
                        lower !== '.vscode') {
                        scan(filePath);
                    }
                } else {
                    const isWikiHtml = file.endsWith('.wiki.html');
                    const ext = isWikiHtml ? '.wiki.html' : path.extname(file).toLowerCase();
                    if (docExts.includes(ext)) {
                        docFiles.push({
                            filePath,
                            relative: path.relative(caseDir, filePath),
                            basename: isWikiHtml ? path.basename(file, '.wiki.html') : path.basename(file, ext),
                            ext,
                            isWikiHtml
                        });
                    }
                }
            }
        };

        if (fs.existsSync(caseDir)) {
            scan(caseDir);
        }

        // Build markdown content
        let md = `# HAYAGRIVA Case Audit & Data Index\n\n`;
        md += `This file provides a clear, human-readable index of all documents loaded in this case, their processing status, and links to their extracted text and AI-generated knowledge logs. This enables direct data compliance and verification audits.\n\n`;
        
        md += `| File Name | Companion MD | Search Index Status | AI Summaries | AI Compliance Alerts |\n`;
        md += `| :--- | :--- | :--- | :--- | :--- |\n`;

        for (const doc of docFiles) {
            const relative = doc.relative;
            const subfolder = path.dirname(relative);
            const conversionsDir = path.join(caseDir, 'conversions');
            const destDir = subfolder === '.' ? conversionsDir : path.join(conversionsDir, subfolder);
            const statusPath = path.join(destDir, `${doc.basename}.status`);
            
            let sidecarStatus = '';
            if (fs.existsSync(statusPath)) {
                try {
                    sidecarStatus = fs.readFileSync(statusPath, 'utf8').trim();
                } catch (_) {}
            }

            // Companion MD status and file link
            let companionCol = '❌ Not Extracted';
            const companionRelPath = relative.replace(/\.[a-zA-Z0-9]+$/, '.md').replace(/\\/g, '/');
            const companionPath = path.join(caseDir, companionRelPath);
            if (fs.existsSync(companionPath)) {
                companionCol = `✓ [View Extracted Text](${encodeURI(companionRelPath)})`;
            } else if (sidecarStatus === 'converting' || sidecarStatus === 'processing') {
                companionCol = '⏳ Extracting...';
            }

            // Search Index status
            let indexCol = '❌ Not Indexed';
            const pageIndexTreePath = path.join(caseDir, 'concepts', subfolder, doc.basename, 'pageindex_tree.json');
            let hasIndex = fs.existsSync(pageIndexTreePath);
            if (hasIndex) {
                indexCol = '✓ Ready (Indexed)';
            } else if (sidecarStatus === 'ingesting') {
                indexCol = '⏳ Indexing...';
            }

            // AI Q&A Card folder link
            let qnaCol = '❌ Not Generated';
            const qnaRelPath = path.join('wiki', 'qna').replace(/\\/g, '/');
            const qnaPath = path.join(caseDir, qnaRelPath);
            if (fs.existsSync(qnaPath) && hasIndex) {
                qnaCol = `[View Q&A Cards](${encodeURI(qnaRelPath)})`;
            } else if (sidecarStatus === 'enriching') {
                qnaCol = '⏳ Generating...';
            }

            // AI alerts folder link
            let alertsCol = '❌ Not Generated';
            const alertsRelPath = path.join('wiki', 'alerts').replace(/\\/g, '/');
            const alertsPath = path.join(caseDir, alertsRelPath);
            if (fs.existsSync(alertsPath) && hasIndex) {
                alertsCol = `[View Alerts](${encodeURI(alertsRelPath)})`;
            } else if (sidecarStatus === 'enriching') {
                alertsCol = '⏳ Generating...';
            }

            md += `| **${doc.basename}${doc.ext}** | ${companionCol} | ${indexCol} | ${qnaCol} | ${alertsCol} |\n`;
        }

        // ── Case Relationship Graph & Connection Audit ───────────────────────
        md += `\n## 2. Case Relationship Graph & Connection Audit\n\n`;
        md += `This section monitors the logical links and hierarchies of the case concepts and wiki pages. Correct relationships ensure that background AI agents can navigate the case context files accurately.\n\n`;

        const conceptsDir = path.join(caseDir, 'concepts');
        const activeTitles = new Set();
        const filesToAudit = [];
        const { parseMarkdownWithFrontmatter } = require('../utils/okf');

        // 1. Scan concepts directory for valid cards
        if (fs.existsSync(conceptsDir)) {
            const docs = fs.readdirSync(conceptsDir).filter(f => {
                return fs.statSync(path.join(conceptsDir, f)).isDirectory() && !f.startsWith('.');
            });
            for (const doc of docs) {
                const docDir = path.join(conceptsDir, doc);
                const files = fs.readdirSync(docDir).filter(f => f.endsWith('.md') && f !== 'index.md');
                for (const f of files) {
                    try {
                        const filePath = path.join(docDir, f);
                        const content = fs.readFileSync(filePath, 'utf8');
                        const { frontmatter } = parseMarkdownWithFrontmatter(content);
                        const title = frontmatter.title || f.replace('.md', '');
                        const relPath = `concepts/${doc}/${f}`.replace(/\\/g, '/');
                        activeTitles.add(title.toLowerCase().trim());
                        filesToAudit.push({ 
                            type: 'concept',
                            file: f, 
                            title, 
                            relPath, 
                            links: frontmatter.links || [],
                            ancestors: frontmatter.ancestors || []
                        });
                    } catch (_) {}
                }
            }
        }

        // 2. Scan wiki directory for wiki cards
        const wikiDir = path.join(caseDir, 'wiki');
        if (fs.existsSync(wikiDir)) {
            const files = fs.readdirSync(wikiDir).filter(f => f.endsWith('.md'));
            for (const f of files) {
                try {
                    const filePath = path.join(wikiDir, f);
                    const content = fs.readFileSync(filePath, 'utf8');
                    const { frontmatter } = parseMarkdownWithFrontmatter(content);
                    const title = frontmatter.title || f.replace('.md', '');
                    const relPath = `wiki/${f}`.replace(/\\/g, '/');
                    activeTitles.add(title.toLowerCase().trim());
                    filesToAudit.push({ 
                        type: 'wiki',
                        file: f, 
                        title, 
                        relPath, 
                        links: frontmatter.links || [],
                        ancestors: []
                    });
                } catch (_) {}
            }
        }

        // 3. Render connections and audit warnings
        if (filesToAudit.length === 0) {
            md += `*No concepts or wiki cards have been compiled yet.*\n`;
        } else {
            md += `| Node Name | Category | Parents / Ancestors | Dynamic Outgoing Links | Audit Status |\n`;
            md += `| :--- | :--- | :--- | :--- | :--- |\n`;

            for (const item of filesToAudit) {
                const ancestorsText = item.ancestors.length > 0 ? item.ancestors.join(' → ') : '*None*';
                
                let linksText = '*None*';
                let statusText = '✓ Clean';

                if (item.links.length > 0) {
                    const resolvedLinks = [];
                    const brokenLinks = [];
                    for (const linkTitle of item.links) {
                        const cleanLink = linkTitle.toLowerCase().trim();
                        if (activeTitles.has(cleanLink)) {
                            resolvedLinks.push(linkTitle);
                        } else {
                            brokenLinks.push(linkTitle);
                        }
                    }

                    const parts = [];
                    if (resolvedLinks.length > 0) {
                        parts.push(resolvedLinks.join(', '));
                    }
                    if (brokenLinks.length > 0) {
                        parts.push(`**Missing:** ~${brokenLinks.join(', ')}~`);
                        statusText = `⚠️ Broken Reference to "${brokenLinks.join(', ')}"`;
                    }
                    linksText = parts.join(' | ');
                }

                md += `| [**${item.title}**](${encodeURI(item.relPath)}) | \`${item.type}\` | ${ancestorsText} | ${linksText} | ${statusText} |\n`;
            }
        }

        md += `\n---\n*Last updated: ${new Date().toLocaleString()}*\n`;

        fs.writeFileSync(path.join(caseDir, 'CASE_AUDIT.md'), md, 'utf8');
        console.log(`[Audit Index] Updated CASE_AUDIT.md for ${caseDir}`);
    } catch (e) {
        console.error('[Audit Index] Failed to generate case audit:', e.message);
    }
}

function ensureAuditDocs(caseDir) {
    try {
        const conversionsDir = path.join(caseDir, 'conversions');
        const conceptsDir = path.join(caseDir, 'concepts');
        const wikiDir = path.join(caseDir, 'wiki');

        fs.mkdirSync(conversionsDir, { recursive: true });
        fs.mkdirSync(conceptsDir, { recursive: true });
        fs.mkdirSync(wikiDir, { recursive: true });

        fs.writeFileSync(path.join(conversionsDir, 'README.txt'), 
`HAYAGRIVA - Document Conversion Sidecars
=========================================
This folder contains temporary status files (.status) and formatting footers (.footer) 
generated by the parser during document text extraction.

These files help the system monitor the state of each document.
You do not need to modify these files. They are automatically managed.
`, 'utf8');

        fs.writeFileSync(path.join(conceptsDir, 'README.txt'), 
`HAYAGRIVA - AI Search Indices & Page Index Outlines
===================================================
This folder contains the indexing data used by the RAG (Retrieval-Augmented Generation) Q&A Agent.

Files here include:
- statuses.json: Tracker for the dynamic 3-dot visual statuses of case documents.
- bm25_index.json: The search index allowing natural language keyword matches.
- [document_name]/pageindex_tree.json: The outline tree representing the hierarchy of sections.
- [document_name]/index.json: The segmented text chunks of each page.

This is the "source of truth" context data that the AI retrieves when answering queries.
`, 'utf8');

        fs.writeFileSync(path.join(wikiDir, 'README.txt'), 
`HAYAGRIVA - AI Generated Knowledge & Summaries
==============================================
This folder contains the AI-generated facts, warnings, summaries, and Q&A files.

Files are stored as standard Markdown (.md) documents:
- qna/: Section-by-section questions and answers generated automatically by the AI.
- alerts/: Extracted risk flags, regulatory alerts, and compliance gaps.

These markdown files are fully readable and editable. Any changes made here are saved directly
and immediately used by the AI Agent.
`, 'utf8');

        generateCaseAudit(caseDir);
    } catch (e) {
        console.error('[Audit Docs] Failed to write audit docs:', e.message);
    }
}

function loadCaseSettings(caseDir) {
    const settingsPath = path.join(caseDir, 'hayagriva_settings.json');
    if (fs.existsSync(settingsPath)) {
        try {
            return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        } catch (_) {}
    }
    return { processingProfile: 'standard' };
}

async function indexVectorsToSqlite(caseDir, result, profile) {
    if (profile === 'lite') return;
    try {
        const db = getDb(caseDir);
        const relative = findOriginalFilePath(caseDir, result.relative);
        
        // Clear old vectors
        if (db.vssEnabled) {
            try {
                db.prepare('DELETE FROM vss_document_vectors WHERE rowid IN (SELECT id FROM document_vectors WHERE filename = ?)').run(relative);
            } catch (_) {}
        }
        const deleteVectors = db.prepare('DELETE FROM document_vectors WHERE filename = ?');
        deleteVectors.run(relative);

        const insertVector = db.prepare(`
            INSERT INTO document_vectors (filename, section_title, page_number, chunk_index, content, vector_blob)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const pathStack = [{ title: result.basename, level: 0 }];
        const chunksToEmbed = [];

        for (const sec of result.sections) {
            const level = sec.level || 2;
            while (pathStack.length > 1 && pathStack[pathStack.length - 1].level >= level) {
                pathStack.pop();
            }
            const parent = pathStack[pathStack.length - 1];
            pathStack.push({ title: sec.title, level });
            
            const parentPath = pathStack.slice(0, -1).map(p => p.title).join(' > ');
            const body = sec.content;
            const pageNum = sec.pageIndex || 1;
            const textToEmbed = `[Section: ${parentPath ? parentPath + ' > ' : ''}${sec.title}]\n\n${body}`;

            if (body.length > 3000) {
                const subChunks = chunkText(textToEmbed, 3000, 1);
                subChunks.forEach((chunk, k) => {
                    chunksToEmbed.push({ sectionTitle: sec.title, pageNum, chunkIndex: k, content: chunk });
                });
            } else {
                chunksToEmbed.push({ sectionTitle: sec.title, pageNum, chunkIndex: 0, content: textToEmbed });
            }
        }

        console.log(`[Vector Index] Starting embedding generation for ${chunksToEmbed.length} chunks of "${relative}"...`);
        const { getEmbedding } = require('../core/llm-client');
        
        let count = 0;
        for (const item of chunksToEmbed) {
            const vec = await getEmbedding(item.content, caseDir);
            if (vec && vec.length > 0) {
                const floatArray = new Float32Array(vec);
                const buffer = Buffer.from(floatArray.buffer);
                const res = insertVector.run(relative, item.sectionTitle, item.pageNum, item.chunkIndex, item.content, buffer);
                if (db.vssEnabled && res && res.lastInsertRowid) {
                    try {
                        db.prepare('INSERT INTO vss_document_vectors (rowid, vector_blob) VALUES (?, ?)').run(res.lastInsertRowid, buffer);
                    } catch (e) {
                        console.error('[Vector Index] Failed to insert into vss_document_vectors:', e.message);
                    }
                }
            }
            count++;
            if (count % 30 === 0) {
                await new Promise(resolve => setTimeout(resolve, 30));
            }
        }
        console.log(`[Vector Index] Successfully stored vector mappings for "${relative}" in case_vault.db`);
    } catch (err) {
        console.error(`[Vector Index Error] Failed to generate vectors for "${result.relative}":`, err.message);
    }
}

module.exports = { 
    createWatcher, 
    ingestFile, 
    startLazyWorker, 
    buildPageIndexTree, 
    generateFallbackSummary,
    updateStatus,
    queueForLazyProcessing,
    ensureAuditDocs,
    generateCaseAudit,
    indexToSqlite,
    indexVectorsToSqlite
};
