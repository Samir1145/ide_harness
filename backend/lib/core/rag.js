const fs = require('fs');
const path = require('path');
const { readIndex } = require('./indexer');
const { parseMarkdownWithFrontmatter } = require('../utils/okf');
const bm25 = require('./bm25');
const { streamChat, getChatResponse } = require('./llm-client');
const { getConceptsDir } = require('../pipeline/common/helper');

function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

const GLOSSARY_MAP = {
    're': 'Regulated Entity',
    'res': 'Regulated Entities',
    'scb': 'Scheduled Commercial Bank',
    'scbs': 'Scheduled Commercial Banks',
    'nbfc': 'Non-Banking Financial Company',
    'nbfcs': 'Non-Banking Financial Companies',
    'nbfc-nd-si': 'Non-Banking Financial Company Non-Deposit taking Systemically Important',
    'ibc': 'Insolvency and Bankruptcy Code',
    'cirp': 'Corporate Insolvency Resolution Process',
    'coc': 'Committee of Creditors',
    'irp': 'Interim Resolution Professional',
    'rp': 'Resolution Professional',
    'nclt': 'National Company Law Tribunal',
    'nclat': 'National Company Law Appellate Tribunal',
    'sarfaesi': 'Securitisation and Reconstruction of Financial Assets and Enforcement of Security Interest',
    'sica': 'Sick Industrial Companies Act',
    'drt': 'Debt Recovery Tribunal',
    'drat': 'Debt Recovery Appellate Tribunal',
    'hc': 'High Court',
    'sc': 'Supreme Court of India',
    'rag': 'Retrieval Augmented Generation',
    'llm': 'Large Language Model',
    'llms': 'Large Language Models',
    'ml': 'Machine Learning',
    'ai': 'Artificial Intelligence',
    'cyber': 'cybersecurity',
    'mrm': 'Model Risk Management',
    'sutra': 'Sutras principles'
};

function preprocessQuery(queryText) {
    if (!queryText) return '';
    let processed = queryText;
    
    // Split query by words and find abbreviations
    const words = queryText.toLowerCase().replace(/[^a-z0-9-]/g, ' ').split(/\s+/);
    const expansions = [];
    
    for (const w of words) {
        if (GLOSSARY_MAP[w]) {
            expansions.push(GLOSSARY_MAP[w]);
        }
    }
    
    if (expansions.length > 0) {
        processed = `${queryText} (${expansions.join(' ')})`;
    }
    
    return processed;
}

function expandContextUsingTree(caseDir, docName, title, matchedContent) {
    if (docName === 'Wiki') return matchedContent;
    
    const treePath = path.join(getConceptsDir(caseDir), docName, 'pageindex_tree.json');
    if (!fs.existsSync(treePath)) return matchedContent;
    
    try {
        const treeData = JSON.parse(fs.readFileSync(treePath, 'utf8'));
        const flatNodes = [];
        
        function flatten(node) {
            flatNodes.push(node);
            if (node.children) {
                for (const child of node.children) {
                    flatten(child);
                }
            }
        }
        flatten(treeData.tree);
        
        const idx = flatNodes.findIndex(n => n.title === title);
        if (idx === -1) return matchedContent;
        
        const targetNode = flatNodes[idx];
        let expanded = '';
        
        // Find parent title
        let parentTitle = '';
        if (targetNode.parentId) {
            const parentNode = flatNodes.find(n => n.id === targetNode.parentId);
            if (parentNode && parentNode.level > 0) {
                parentTitle = parentNode.title;
            }
        }
        
        if (parentTitle) {
            expanded += `[Sub-section of: ${parentTitle}]\n`;
        }
        
        // Sibling context window (1 previous, 1 next)
        const prevNode = idx > 0 ? flatNodes[idx - 1] : null;
        const nextNode = idx < flatNodes.length - 1 ? flatNodes[idx + 1] : null;
        
        if (prevNode && prevNode.metadata && prevNode.metadata.type === 'section' && prevNode.content.trim()) {
            expanded += `... ${prevNode.content.trim().substring(Math.max(0, prevNode.content.trim().length - 400))}\n[Current Section: ${title}]\n`;
        }
        
        expanded += matchedContent;
        
        if (nextNode && nextNode.metadata && nextNode.metadata.type === 'section' && nextNode.content.trim()) {
            expanded += `\n[Next Section: ${nextNode.title}]\n${nextNode.content.trim().substring(0, 400)} ...`;
        }
        
        return expanded;
    } catch (e) {
        console.error(`[RAG] Failed to expand context for ${docName}::${title}:`, e.message);
        return matchedContent;
    }
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
function buildPrompt(query, contexts, options = {}) {
    let graphContextBlock = options.graphContext || '';
    if (!graphContextBlock && options.caseDir) {
        try {
            const { getGraphRAGContext } = require('./entity-graph');
            graphContextBlock = getGraphRAGContext(options.caseDir, query) || '';
        } catch (_) {}
    }

    const contextText = contexts.map((c, idx) => {
        return `--- [Source: [source:${idx}] | Name: ${c.docName} | Section: ${c.title}] ---\nTags: ${c.tags.join(', ')}\n\n${c.content}`;
    }).join('\n\n');

    return `You are a research/legal assistant. Answer the user's question using ONLY the provided case concepts and sources below.
You must cite your sources using the exact placeholder [source:N] (e.g. [source:0], [source:1]) when referencing information from that source block. Place these inline (e.g., "...as declared in the resolution plan [source:0].").
If you cannot find the answer, explain what parts of the document sources you checked.
If the sources contain conflicting information, explicitly note the conflict and cite both sources with their dates.

${graphContextBlock ? graphContextBlock + '\n' : ''}Context:
${contextText}

Question: ${query}

Answer:`;
}

async function retrieveContexts(caseDir, queryText) {
    let activeFiles = null;
    const activeDocsPath = path.join(getConceptsDir(caseDir), 'active_rag_docs.json');
    if (fs.existsSync(activeDocsPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(activeDocsPath, 'utf8'));
            if (data && Array.isArray(data.activeFiles)) {
                activeFiles = new Set(data.activeFiles);
            }
        } catch (_) {}
    }

    const cleanQuery = preprocessQuery(queryText);
    let searchTerms = cleanQuery;
    
    // 1. HyDE Query Expansion (Optional: defaults to off on CPU setups)
    const enableHyde = process.env.ENABLE_RAG_HYDE === 'true' || process.env.ENABLE_RAG_HYDE === '1';
    if (enableHyde) {
        try {
            console.log(`[RAG] Running HyDE query expansion for: "${queryText}"`);
            const prompt = `You are a legal research assistant. Write a short, single-paragraph hypothetical answer to the question below. Focus on typical industry terminology, names, and keywords. Do not write any metadata, introductions, or extra explanations.

Question: ${queryText}

Hypothetical Answer:`;
            
            const hydeAnswer = await getChatResponse([{ role: 'user', content: prompt }], { timeout: 25000, caseDir: caseDir });
            if (hydeAnswer && hydeAnswer.trim()) {
                searchTerms = queryText + ' ' + hydeAnswer.trim();
                console.log(`[RAG] HyDE Answer generated: "${hydeAnswer.trim().substring(0, 100)}..."`);
            }
        } catch (e) {
            console.log('[RAG] Skipping HyDE query expansion:', e.message);
        }
    } else {
        console.log('[RAG] Direct keyword search (HyDE bypassed to increase response speed)');
    }

    const { getDb } = require('./sqlite-store');
    let ftsRows = [];
    try {
        const db = getDb(caseDir);
        const ftsQuery = db.prepare(`
            SELECT filename, section_title, page_number, chunk_index, content, bm25(fts_chunks) AS ftsScore
            FROM fts_chunks
            WHERE fts_chunks MATCH ?
            ORDER BY ftsScore ASC
            LIMIT 12
        `);
        const STOP_WORDS = new Set([
            'what', 'who', 'whom', 'whose', 'which', 'where', 'when', 'why', 'how',
            'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did',
            'a', 'an', 'the', 'and', 'but', 'or', 'as', 'if', 'of', 'at', 'by', 'for', 'with', 'about', 'against',
            'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down',
            'in', 'on', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
            'here', 'there', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
            'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'should'
        ]);

        const rawWords = searchTerms
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        let cleanWords = rawWords.filter(w => !STOP_WORDS.has(w));
        if (cleanWords.length === 0) {
            cleanWords = rawWords;
        }

        const sanitizedSearch = cleanWords.map(w => `${w}*`).join(' OR ');
        ftsRows = ftsQuery.all(sanitizedSearch || '');
    } catch (err) {
        console.warn('[SQLite Search] FTS search query failed, using empty results:', err.message);
    }

    // Convert FTS rows to standard hits
    let ftsHits = ftsRows.map(r => {
        const isWiki = r.filename.startsWith('wiki/');
        const isInsight = r.filename.startsWith('wiki/insights/');
        const isCatalog = r.filename === 'wiki/INDEX.md';
        const ext = path.extname(r.filename).toLowerCase();
        const docName = isWiki ? (isInsight ? 'Wiki Insight' : (isCatalog ? 'Wiki Catalog' : 'Wiki')) : path.basename(r.filename, ext);
        const docId = isInsight ? `wiki::insights::${r.section_title}` : (isWiki ? `wiki::${r.section_title}` : `${docName}::${r.section_title}::${r.chunk_index}`);
        return {
            docId,
            score: -r.ftsScore,
            filename: r.filename,
            section_title: r.section_title,
            page_number: r.page_number,
            content: r.content
        };
    });

    if (activeFiles) {
        ftsHits = ftsHits.filter(hit => activeFiles.has(hit.filename));
    }

    // ── Vector Search (Dual-Query Generation for Content-Type Routing) ──
    const { getEmbedding } = require('./llm-client');
    let legalQueryVec = null;
    let financeQueryVec = null;
    try {
        legalQueryVec = await getEmbedding(queryText, { vectorType: 'legal', isQuery: true });
        financeQueryVec = await getEmbedding(queryText, { vectorType: 'finance', isQuery: true });
    } catch (e) {
        console.warn('[RAG] Failed to generate dual query embeddings:', e.message);
    }



    let vectorHits = [];
    const hasQueryVec = (legalQueryVec && legalQueryVec.some(v => v !== 0)) || (financeQueryVec && financeQueryVec.some(v => v !== 0));
    if (hasQueryVec) {
        try {
            const db = getDb(caseDir);
            if (db.vssEnabled) {
                // Query using native sqlite-vss!
                try {
                    const primaryQueryVec = legalQueryVec || financeQueryVec;
                    const vssQuery = db.prepare(`
                        SELECT rowid, distance FROM vss_document_vectors
                        WHERE vss_search(vector_blob, ?)
                        ORDER BY distance ASC
                        LIMIT 12
                    `);
                    const queryBuffer = Buffer.from(new Float32Array(primaryQueryVec).buffer);
                    const vssRows = vssQuery.all(queryBuffer);
                    
                    const resolveQuery = db.prepare(`
                        SELECT filename, section_title, page_number, chunk_index, content
                        FROM document_vectors WHERE id = ?
                    `);
                    for (const row of vssRows) {
                        const docRow = resolveQuery.get(row.rowid);
                        if (docRow) {
                            const isWiki = docRow.filename.startsWith('wiki/');
                            const ext = path.extname(docRow.filename).toLowerCase();
                            const docName = isWiki ? 'Wiki' : path.basename(docRow.filename, ext);
                            const docId = isWiki ? `wiki::${docRow.section_title}` : `${docName}::${docRow.section_title}::${docRow.chunk_index}`;
                            vectorHits.push({
                                docId,
                                score: 1 / (1 + row.distance),
                                filename: docRow.filename,
                                section_title: docRow.section_title,
                                page_number: docRow.page_number,
                                content: docRow.content
                            });
                        }
                    }
                    console.log(`[RAG] Native sqlite-vss search retrieved ${vectorHits.length} context matches.`);
                } catch (vssErr) {
                    console.warn('[RAG] Native sqlite-vss search failed, falling back:', vssErr.message);
                }
            }
            
            // Fallback: JS-based hybrid keyword-filtering + type-matched cosine similarity
            if (vectorHits.length === 0) {
                let candidateKeys = [];
                try {
                    // Extract alphanumeric keyword search tokens from queryText
                    const words = queryText.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/).filter(Boolean);
                    if (words.length > 0) {
                        const matchExpr = words.map(w => `${w}*`).join(' OR ');
                        const ftsQuery = db.prepare('SELECT filename, section_title, chunk_index FROM fts_chunks WHERE content MATCH ? LIMIT 100');
                        const ftsRows = ftsQuery.all(matchExpr);
                        candidateKeys = ftsRows;
                        console.log(`[RAG] FTS5 pre-filter selected ${candidateKeys.length} similarity candidates.`);
                    }
                } catch (ftsErr) {
                    console.warn('[RAG] FTS5 pre-filtering failed:', ftsErr.message);
                }

                let candidateVectors = [];
                if (candidateKeys.length > 0) {
                    // Fetch matching candidate rows with vector_type
                    const placeholders = candidateKeys.map(() => '(filename = ? AND section_title = ? AND chunk_index = ?)').join(' OR ');
                    const params = [];
                    candidateKeys.forEach(k => {
                        params.push(k.filename, k.section_title, k.chunk_index);
                    });
                    const candidateQuery = db.prepare(`
                        SELECT id, filename, section_title, page_number, chunk_index, content, vector_blob, vector_type 
                        FROM document_vectors WHERE ${placeholders}
                    `);
                    candidateVectors = candidateQuery.all(...params);
                } else {
                    // Fallback scan: first 150 chunks
                    candidateVectors = db.prepare('SELECT id, filename, section_title, page_number, chunk_index, content, vector_blob, vector_type FROM document_vectors LIMIT 150').all();
                }

                const scored = [];
                for (const row of candidateVectors) {
                    if (row.vector_blob) {
                        const floatArray = new Float32Array(row.vector_blob.buffer, row.vector_blob.byteOffset, row.vector_blob.byteLength / 4);
                        const vType = row.vector_type || 'legal';
                        const targetQueryVec = (vType === 'finance') ? (financeQueryVec || legalQueryVec) : (legalQueryVec || financeQueryVec);
                        const sim = targetQueryVec ? cosineSimilarity(targetQueryVec, Array.from(floatArray)) : 0;
                        const isWiki = row.filename.startsWith('wiki/');
                        const ext = path.extname(row.filename).toLowerCase();
                        const docName = isWiki ? 'Wiki' : path.basename(row.filename, ext);
                        const docId = isWiki ? `wiki::${row.section_title}` : `${docName}::${row.section_title}::${row.chunk_index}`;
                        scored.push({
                            docId,
                            score: sim,
                            filename: row.filename,
                            section_title: row.section_title,
                            page_number: row.page_number,
                            content: row.content,
                            vector_type: vType
                        });
                    }
                }
                scored.sort((a, b) => b.score - a.score);
                vectorHits = scored.slice(0, 12);
                console.log(`[RAG] Hybrid JS search completed. Evaluated dual similarity on ${candidateVectors.length} candidates, returning top ${vectorHits.length}.`);
            }
        } catch (vectorErr) {
            console.warn('[RAG] Vector semantic search failed completely:', vectorErr.message);
        }
    }

    if (activeFiles) {
        vectorHits = vectorHits.filter(hit => activeFiles.has(hit.filename));
    }

    // ── Reciprocal Rank Fusion (RRF) ──────────────────────────────────
    const mergedMap = new Map();
    
    // Add FTS ranks
    ftsHits.forEach((hit, idx) => {
        const key = hit.docId;
        mergedMap.set(key, {
            hit,
            ftsRank: idx + 1,
            vectorRank: 100 // default worst rank if not present
        });
    });

    // Add Vector ranks
    vectorHits.forEach((hit, idx) => {
        const key = hit.docId;
        const existing = mergedMap.get(key);
        if (existing) {
            existing.vectorRank = idx + 1;
        } else {
            mergedMap.set(key, {
                hit,
                ftsRank: 100,
                vectorRank: idx + 1
            });
        }
    });

    // Compute RRF scores (constant = 60)
    const hits = Array.from(mergedMap.values()).map(item => {
        const hit = item.hit;
        const scoreFts = 1 / (item.ftsRank + 60);
        const scoreVec = 1 / (item.vectorRank + 60);
        hit.score = scoreFts + scoreVec; // fused score
        return hit;
    });

    // Apply score boosting based on case wiki overrides and document priority settings
    let caseIndex = { documents: [] };
    try {
        caseIndex = readIndex(caseDir);
    } catch (_) {}

    // Plan 18: Interactive Emphasis Mode scoring boost
    let activeFocus = 'general';
    try {
        const caseSession = require('./case-session');
        const session = caseSession.loadCaseSession(caseDir);
        activeFocus = (session && session.active_focus) || 'general';
    } catch (_) {}

    const EMPHASIS_PATTERNS = {
        waterfall: /waterfall|section\s*53|regulation\s*38|secured\s*creditor|unsecured\s*creditor|operational\s*creditor|liquidation\s*value|fair\s*value|payout|distribution/i,
        s29a: /section\s*29a|disqualification|connected\s*person|promoter|willful\s*defaulter|npa\s*account|director\s*identification|din\b|ineligible/i,
        avoidance: /section\s*43|section\s*45|section\s*50|section\s*66|preferential|undervalued|extortionate|fraudulent|look-back|contra-sweep|suspicious/i
    };
    const focusPattern = EMPHASIS_PATTERNS[activeFocus];
    let boostedCount = 0;

    for (const hit of hits) {
        let score = hit.score;
        if (hit.docId.startsWith('wiki::insights') || (hit.filename && (hit.filename.startsWith('wiki/insights/') || hit.filename === 'wiki/INDEX.md'))) {
            score *= 2.0; // Compiled Insight / Central Catalog Priority Boost (Karpathy LLM-Wiki)
        } else if (hit.docId.startsWith('wiki::') || (hit.filename && hit.filename.startsWith('wiki/'))) {
            score *= 1.5; // Curated Case Wiki override boost
        } else {
            const parts = hit.docId.split('::');
            const docName = parts[0];
            const docMeta = caseIndex.documents.find(d => d.title === docName);
            if (docMeta) {
                const priority = docMeta.priority || 5;
                const priorityBoost = (6 - priority) * 0.1; // priority 1 gets +0.5 score
                score += priorityBoost;
            }
        }

        // Plan 18: Apply 2.0x emphasis boost for chunks matching active intake priority
        if (focusPattern) {
            const hay = `${hit.section_title || ''} ${hit.content || ''}`;
            if (focusPattern.test(hay)) {
                score *= 2.0;
                hit.emphasisMatch = true;
                boostedCount++;
            }
        }

        hit.score = score;
    }
    if (boostedCount > 0) {
        console.log(`[RAG] Applied 2.0x emphasis boost (focus: ${activeFocus}) to ${boostedCount} candidate chunks.`);
    }
    
    // Sort again by boosted relevance
    hits.sort((a, b) => b.score - a.score);
    
    // 2. Fetch snippets for LLM Reranking
    const candidateSnippets = [];
    for (const hit of hits) {
        const parts = hit.docId.split('::');
        const isInsight = hit.docId.startsWith('wiki::insights') || (hit.filename && hit.filename.startsWith('wiki/insights/'));
        const isCatalog = hit.filename === 'wiki/INDEX.md';
        const isWiki = hit.docId.startsWith('wiki::') || (hit.filename && hit.filename.startsWith('wiki/'));
        const docName = isInsight ? 'Wiki Insight' : (isCatalog ? 'Wiki Catalog' : (isWiki ? 'Wiki' : parts[0]));
        const title = isWiki ? hit.section_title : (parts.length === 3 && !isNaN(parseInt(parts[2], 10)) ? `${parts[1]} [Part ${parseInt(parts[2], 10) + 1}]` : (parts[1] || hit.section_title || docName));
        candidateSnippets.push({
            hit,
            title,
            docName,
            body: hit.content,
            tags: [docName, isWiki ? 'wiki' : 'section', isInsight ? 'insight' : 'general'],
            links: []
        });
    }
    
    // 3. High-Precision ONNX Cross-Encoder Reranking (ms-marco-MiniLM-L-6-v2, ~22MB)
    let topCandidates = candidateSnippets.slice(0, 5); // default fallback
    const disableRerank = process.env.DISABLE_RAG_RERANK === 'true' || process.env.DISABLE_RAG_RERANK === '1';
    if (!disableRerank && candidateSnippets.length > 1) {
        try {
            const { rerankCandidates } = require('./reranker');
            // Take top 16 candidates from hybrid RRF and re-rank with joint attention
            const candidatesToScore = candidateSnippets.slice(0, 16);
            topCandidates = await rerankCandidates(queryText, candidatesToScore, { topK: 5 });
            console.log(`[RAG] Native ONNX cross-encoder reranking completed: ${topCandidates.map(c => `${c.docName}::${c.title} (score: ${c.rerankerScore ? c.rerankerScore.toFixed(3) : 'n/a'})`).join(', ')}`);
        } catch (rerankErr) {
            console.warn('[RAG] Native ONNX reranker failed, falling back to RRF rank order:', rerankErr.message);
            topCandidates = candidateSnippets.slice(0, 5);
        }
    } else {
        console.log('[RAG] Direct RRF candidates returned (Reranker bypassed via DISABLE_RAG_RERANK)');
    }

    // Record local semantic search & rerank telemetry
    try {
        const { logSpan } = require('./local-telemetry');
        const { synthesizeSearchTitle } = require('./task-namer');
        const searchTitle = synthesizeSearchTitle({
            query: queryText,
            domain: (legalQueryVec && financeQueryVec) ? 'hybrid' : 'statutory',
            topSection: topCandidates.length > 0 ? topCandidates[0].title : null
        });
        const queryTokens = Math.ceil(queryText.length / 4);
        const candidateTokens = candidateSnippets.reduce((sum, c) => sum + Math.ceil((c.body ? c.body.length : 0) / 4), 0);
        logSpan(caseDir, {
            caseId: path.basename(caseDir),
            taskName: searchTitle,
            category: 'SEMANTIC_SEARCH',
            targetSubject: queryText.substring(0, 50),
            tokensInput: queryTokens + candidateTokens,
            totalTokens: queryTokens + candidateTokens,
            modelName: 'hybrid-rrf-minilm',
            metadata: { candidatesEvaluated: candidateSnippets.length, returnedCount: topCandidates.length }
        });
    } catch (telemetryErr) {
        // Non-blocking telemetry fallback
    }
    
    return topCandidates.map(c => ({
        title: c.title,
        docName: c.docName,
        page_number: c.hit ? c.hit.page_number : 1,
        content: expandContextUsingTree(caseDir, c.docName, c.title, c.body),
        tags: c.tags,
        links: c.links,
        score: c.rerankerScore !== undefined ? c.rerankerScore : (c.hit ? c.hit.score : 0),
        emphasisMatch: c.hit ? !!c.hit.emphasisMatch : false
    }));
}

function replaceCitations(text, contexts) {
    if (!text || !contexts || contexts.length === 0) return text;
    
    const citedIndices = new Set();

    const getContextInfo = (ctx, idx) => {
        const docName = ctx.docName || ctx.filename || 'Document';
        const page = ctx.page_number || (ctx.metadata && (ctx.metadata.page || ctx.metadata.page_number)) || ctx.page || 1;
        const title = ctx.title || (ctx.metadata && (ctx.metadata.section_title || ctx.metadata.title)) || ctx.section_title || '';
        const chunk = ctx.chunk !== undefined ? ctx.chunk : (ctx.metadata && ctx.metadata.chunk !== undefined ? ctx.metadata.chunk : idx);
        return { docName, page, title, chunk };
    };

    // Replaces [source:N] with custom hayagriva-citation links
    let replaced = text.replace(/\[source:(\d+)\]/g, (match, idxStr) => {
        const idx = parseInt(idxStr, 10);
        if (idx >= 0 && idx < contexts.length) {
            citedIndices.add(idx);
            const { docName, page, title, chunk } = getContextInfo(contexts[idx], idx);
            const titleParam = encodeURIComponent(title);
            return `[${idx + 1}](hayagriva-citation://${encodeURIComponent(docName)}?page=${page}&chunk=${chunk}&title=${titleParam})`;
        }
        return match;
    });

    // Replaces [Reference N] with custom hayagriva-citation links as LLM fallback
    replaced = replaced.replace(/\[Reference\s*(\d+)\]/gi, (match, idxStr) => {
        const idx = parseInt(idxStr, 10) - 1;
        if (idx >= 0 && idx < contexts.length) {
            citedIndices.add(idx);
            const { docName, page, title, chunk } = getContextInfo(contexts[idx], idx);
            const titleParam = encodeURIComponent(title);
            return `[${idx + 1}](hayagriva-citation://${encodeURIComponent(docName)}?page=${page}&chunk=${chunk}&title=${titleParam})`;
        }
        return match;
    });

    // If citations were cited and no "Sources Cited" footer is present, append bibliography
    if (citedIndices.size > 0 && !replaced.includes('**Sources Cited:**') && !replaced.includes('**Sources Cited**')) {
        const sortedIndices = Array.from(citedIndices).sort((a, b) => a - b);
        const bibliography = sortedIndices.map(idx => {
            const { docName, page, title, chunk } = getContextInfo(contexts[idx], idx);
            const titleStr = title ? ` — *${title}*` : '';
            const titleParam = encodeURIComponent(title);
            return `- [${idx + 1}] [**${docName}** (p. ${page})${titleStr}](hayagriva-citation://${encodeURIComponent(docName)}?page=${page}&chunk=${chunk}&title=${titleParam})`;
        }).join('\n');
        replaced += `\n\n---\n**Sources Cited:**\n${bibliography}`;
    }

    return replaced;
}

function buildLiteResponse(queryText, contexts) {
    const cards = contexts.map((ctx, i) => {
        const excerpt = ctx.content.replace(/\s+/g, ' ').trim().substring(0, 600);
        return `### [${i + 1}] ${ctx.docName} — ${ctx.title} (p.${ctx.page_number || '?'})\n\n${excerpt}${ctx.content.length > 600 ? '…' : ''}`;
    });

    const answer = [
        `> ⚡ **Lite Mode — Verbatim Semantic Passage Search:** *"${queryText}"*`,
        `> Showing top ${contexts.length} ranked excerpts with 100% factual fidelity.`,
        '',
        ...cards,
        '',
        `---`,
        `> 💡 **Tip:** To synthesize these excerpts into an argument brief or legal memo, click **Start Engine** in Settings.`
    ].join('\n\n');

    return { answer, sources: Array.from(new Set(contexts.map(c => c.docName))), liteMode: true };
}

function estimateTokenCount(text) {
    if (!text) return 0;
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.ceil(wordCount * 1.35); // Safe BPE token estimator
}

async function query(caseDir, queryText, opts = {}) {
    try {
        const { loadLlmConfig } = require('./llm-client');
        const config = loadLlmConfig({ caseDir });
        const contexts = await retrieveContexts(caseDir, queryText);
        if (contexts.length === 0) {
            // Check if query is asking to list / view available document templates
            const isListQuery = /\b(list|show\s+me|available|what|find|search|inventory|templates|formats)\b/i.test(queryText) &&
                                /\b(document|documents|file|files|template|templates|format|formats|report|reports|petition|petitions|issues)\b/i.test(queryText);

            if (isListQuery) {
                try {
                    const { listSkeletons } = require('../agents/skills/skeleton-load');
                    const REPO_ROOT = require('path').join(__dirname, '..', '..', '..');
                    const available = listSkeletons(REPO_ROOT);
                    const q = queryText.toLowerCase();
                    const topicTokens = q.replace(/show|me|list|all|the|documents|avaibale|available|for|issues|templates|formats|what|are|in|with|of|drafts/gi, '').trim().split(/\s+/).filter(t => t.length > 2);

                    let matches = available;
                    if (topicTokens.length > 0) {
                        matches = available.filter(s => {
                            const name = s.toLowerCase();
                            return topicTokens.some(t => name.includes(t) || (t === 'coc' && (name.includes('coc') || name.includes('creditor'))));
                        });
                    }
                    if (matches.length === 0) matches = available;

                    let responseMarkdown = `> ℹ️ **Note: List Query Recognized. Available Document Templates Below:**\n\n`;
                    responseMarkdown += `### 📋 Available Templates (${matches.length} Found)\n\n`;
                    responseMarkdown += `| Sl. | Template Name | Category / Purpose | How to Request |\n`;
                    responseMarkdown += `|---|---|---|---|\n`;
                    matches.forEach((m, idx) => {
                        const cleanName = m.replace(/[\-_]/g, ' ').toUpperCase();
                        responseMarkdown += `| ${idx + 1}. | **${m}** | ${cleanName} | \`@Document draft ${m}\` |\n`;
                    });
                    responseMarkdown += `\n> 💡 **Tip:** Type \`@Document draft <template-name>\` to generate any format above with active case data.`;

                    return { answer: responseMarkdown, sources: [] };
                } catch (_) {}
            }

            let skeletonName = null;
            try {
                const docAgent = require('../agents/document-agent/agent');
                if (docAgent && docAgent.detectSkeleton) {
                    skeletonName = docAgent.detectSkeleton(queryText);
                }
            } catch (_) {}

            if (skeletonName) {
                try {
                    const { loadSkeleton } = require('../agents/skills/skeleton-load');
                    const REPO_ROOT = require('path').join(__dirname, '..', '..', '..');
                    const loaded = loadSkeleton(skeletonName, REPO_ROOT);
                    if (loaded && loaded.content) {
                        return {
                            answer: `> ℹ️ **Note: No specific matching case files found in RAG context. Loaded standard template skeleton below:**\n\n${loaded.content}`,
                            sources: []
                        };
                    }
                } catch (_) {}
            }

            return {
                answer: `> ℹ️ **Note: No specific matching case files found in RAG context for your query.**\n\n` +
                        `Here is the standard legal format outline for **"${queryText}"**:\n\n` +
                        `### 1. Parties & Jurisdiction\n` +
                        `- **Applicant / Financial Creditor:** \`{{ FINANCIAL_CREDITOR_NAME }}\`\n` +
                        `- **Corporate Debtor:** \`{{ CORPORATE_DEBTOR_NAME }}\`\n` +
                        `- **Adjudicating Authority:** NCLT Bench \`{{ NCLT_BENCH_LOCATION }}\`\n\n` +
                        `### 2. Particulars of Debt & Default\n` +
                        `| Sl. | Particulars | Details |\n` +
                        `|---|---|---|\n` +
                        `| 1. | Total Amount of Debt | \`{{ TOTAL_DEBT_AMOUNT }}\` |\n` +
                        `| 2. | Date of Default | \`{{ DEFAULT_DATE }}\` |\n` +
                        `| 3. | Financial Contract Reference | \`{{ LOAN_AGREEMENT_REF }}\` |\n\n` +
                        `### 3. Reliefs & Prayers Sought\n` +
                        `1. Admit the application under Section 7 / Section 9 of the Insolvency & Bankruptcy Code, 2016.\n` +
                        `2. Declare a moratorium under Section 14 of the Code.\n` +
                        `3. Appoint \`{{ PROPOSED_IRP_NAME }}\` as the Interim Resolution Professional.`,
                sources: []
            };
        }
        
        let graphContext = null;
        try {
            const { getGraphRAGContext } = require('./entity-graph');
            graphContext = getGraphRAGContext(caseDir, queryText);
        } catch (_) {}

        if (config.activeMode === 'lite') {
            const liteRes = buildLiteResponse(queryText, contexts);
            if (graphContext) {
                liteRes.answer = `${graphContext}\n\n${liteRes.answer}`;
            }
            return liteRes;
        }
        
        let prompt = buildPrompt(queryText, contexts, { graphContext, caseDir });
        let tokenCount = estimateTokenCount(prompt);
        
        // Iterative truncation to fit within local model 1,500-token input budget
        while (tokenCount > 1500 && contexts.length > 1) {
            console.warn(`[RAG] Prompt has ${tokenCount} tokens (exceeds 1500 limit). Truncating context chunks from ${contexts.length} down to ${contexts.length - 1}...`);
            contexts.pop();
            prompt = buildPrompt(queryText, contexts, { graphContext, caseDir });
            tokenCount = estimateTokenCount(prompt);
        }
        
        // Final fallback if even a single chunk overflows
        if (tokenCount > 1500) {
            console.error(`[RAG] Prompt still exceeds limit (${tokenCount} tokens) with single snippet.`);
            return {
                answer: "⚠️ **Context Window Exceeded:** The retrieved files or query contains too much text to process. Please select fewer documents in the Active-Context Control Matrix or shorten your question.",
                sources: []
            };
        }
        
        const messages = [{ role: 'user', content: prompt }];
        
        let answer = '';
        const iterator = streamChat(messages, opts);
        for await (const chunk of iterator) {
            answer += chunk;
        }
        const sources = Array.from(new Set(contexts.map(c => c.docName)));
        return { answer: replaceCitations(answer, contexts), sources };
    } catch (e) {
        console.error('[RAG Agent Error]', e.message);
        return { answer: `Error calling LLM: ${e.message}`, sources: [] };
    }
}

module.exports = { query, buildPrompt, retrieveContexts, getSafeFilename, replaceCitations, buildLiteResponse };
