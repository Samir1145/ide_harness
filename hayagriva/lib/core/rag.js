const fs = require('fs');
const path = require('path');
const { readIndex } = require('./indexer');
const { parseMarkdownWithFrontmatter } = require('../utils/okf');
const bm25 = require('./bm25');
const { streamChat, getChatResponse } = require('./llm-client');

const GLOSSARY_MAP = {
    're': 'Regulated Entity',
    'res': 'Regulated Entities',
    'scb': 'Scheduled Commercial Bank',
    'scbs': 'Scheduled Commercial Banks',
    'nbfc': 'Non-Banking Financial Company',
    'nbfcs': 'Non-Banking Financial Companies',
    'nbfc-nd-si': 'Non-Banking Financial Company Non-Deposit taking Systemically Important',
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
    
    const treePath = path.join(caseDir, 'concepts', docName, 'pageindex_tree.json');
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

function buildPrompt(query, contexts) {
    const contextText = contexts.map(c => {
        return `--- [Source: ${c.docName} | Section/Page: ${c.title}] ---\nTags: ${c.tags.join(', ')}\n\n${c.content}`;
    }).join('\n\n');

    return `You are a research/legal assistant. Answer the user's question using ONLY the provided case concepts and sources below.
If you cannot find the answer, explain what parts of the document sources you checked.
If the sources contain conflicting information, explicitly note the conflict and cite both sources with their dates.

Context:
${contextText}

Question: ${query}

Answer:`;
}

async function retrieveContexts(caseDir, queryText) {
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
            
            const hydeAnswer = await getChatResponse([{ role: 'user', content: prompt }], { timeout: 25000 });
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
    let rows = [];
    try {
        const db = getDb(caseDir);
        const ftsQuery = db.prepare(`
            SELECT filename, section_title, page_number, chunk_index, content, bm25(fts_chunks) AS ftsScore
            FROM fts_chunks
            WHERE fts_chunks MATCH ?
            ORDER BY ftsScore ASC
            LIMIT 12
        `);
        rows = ftsQuery.all(searchTerms);
    } catch (err) {
        console.warn('[SQLite Search] FTS search query failed, using empty results:', err.message);
    }

    const hits = rows.map(r => {
        const isWiki = r.filename.startsWith('wiki/');
        const ext = path.extname(r.filename).toLowerCase();
        const docName = isWiki ? 'Wiki' : path.basename(r.filename, ext);
        const docId = isWiki ? `wiki::${r.section_title}` : `${docName}::${r.section_title}::${r.chunk_index}`;
        return {
            docId,
            score: -r.ftsScore, // Convert negative SQLite BM25 rank to positive score for boosting
            filename: r.filename,
            section_title: r.section_title,
            page_number: r.page_number,
            content: r.content
        };
    });

    // Apply score boosting based on case wiki overrides and document priority settings
    let caseIndex = { documents: [] };
    try {
        caseIndex = readIndex(caseDir);
    } catch (_) {}

    for (const hit of hits) {
        let score = hit.score;
        if (hit.docId.startsWith('wiki::')) {
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
        hit.score = score;
    }
    
    // Sort again by boosted relevance
    hits.sort((a, b) => b.score - a.score);
    
    // 2. Fetch snippets for LLM Reranking
    const candidateSnippets = [];
    for (const hit of hits) {
        const parts = hit.docId.split('::');
        const docName = parts[0];
        const isWiki = docName === 'Wiki';
        candidateSnippets.push({
            hit,
            title: isWiki ? hit.section_title : (parts.length === 3 ? `${parts[1]} [Part ${parseInt(parts[2], 10) + 1}]` : parts[1]),
            docName,
            body: hit.content,
            tags: [docName, isWiki ? 'wiki' : 'section'],
            links: []
        });
    }
    
    // 3. LLM Reranking (Optional: defaults to off on CPU setups)
    let topCandidates = candidateSnippets.slice(0, 5); // default fallback
    const enableRerank = process.env.ENABLE_RAG_RERANK === 'true' || process.env.ENABLE_RAG_RERANK === '1';
    if (enableRerank && candidateSnippets.length > 1) {
        try {
            console.log(`[RAG] Reranking ${candidateSnippets.length} candidates using LLM...`);
            const candidatesListText = candidateSnippets.map((c, idx) => {
                const cleanSnippet = c.body.replace(/\s+/g, ' ').substring(0, 250);
                return `[Index: ${idx}] Title: ${c.docName} / ${c.title}\nSnippet: ${cleanSnippet}`;
            }).join('\n\n');
            
            const prompt = `You are a search reranker. Below is a list of candidate documents with their indices (0 to ${candidateSnippets.length - 1}).
Identify the top 5 most relevant documents to answer the query: "${queryText}".
Return their indices as a comma-separated list of numbers in order of relevance (highest relevance first). Do not write any other explanation or words.

Candidates:
${candidatesListText}

Indices list (e.g. 2,0,4,1,3):`;
            
            const rerankResponse = await getChatResponse([{ role: 'user', content: prompt }], { timeout: 35000 });
            console.log(`[RAG] Reranker response: "${rerankResponse.trim()}"`);
            
            const rankedIndices = rerankResponse.split(',')
                .map(idxStr => parseInt(idxStr.trim(), 10))
                .filter(idx => !isNaN(idx) && idx >= 0 && idx < candidateSnippets.length);
                
            if (rankedIndices.length > 0) {
                const mapped = [];
                for (const idx of rankedIndices) {
                    if (!mapped.includes(candidateSnippets[idx])) {
                        mapped.push(candidateSnippets[idx]);
                    }
                }
                for (const cand of candidateSnippets) {
                    if (!mapped.includes(cand)) {
                        mapped.push(cand);
                    }
                }
                topCandidates = mapped.slice(0, 5);
                console.log(`[RAG] Successful LLM reranking of candidates: ${topCandidates.map(c => `${c.docName}::${c.title}`).join(', ')}`);
            }
        } catch (e) {
            console.log('[RAG] Skipping LLM reranking:', e.message);
        }
    } else {
        console.log('[RAG] direct BM25 candidates returned (LLM Reranker bypassed to increase response speed)');
    }
    
    return topCandidates.map(c => ({
        title: c.title,
        docName: c.docName,
        content: expandContextUsingTree(caseDir, c.docName, c.title, c.body),
        tags: c.tags,
        links: c.links
    }));
}

async function query(caseDir, queryText, opts = {}) {
    try {
        const contexts = await retrieveContexts(caseDir, queryText);
        if (contexts.length === 0) {
            return { answer: 'I could not find matching concepts in the case files.', sources: [] };
        }
        
        const prompt = buildPrompt(queryText, contexts);
        const messages = [{ role: 'user', content: prompt }];
        
        let answer = '';
        const iterator = streamChat(messages, opts);
        for await (const chunk of iterator) {
            answer += chunk;
        }
        const sources = Array.from(new Set(contexts.map(c => c.docName)));
        return { answer, sources };
    } catch (e) {
        console.error('[RAG Agent Error]', e.message);
        return { answer: `Error calling LLM: ${e.message}`, sources: [] };
    }
}

module.exports = { query, buildPrompt, retrieveContexts, getSafeFilename };
