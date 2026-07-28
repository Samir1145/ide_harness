const fs = require('fs');
const path = require('path');

const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'if', 'because', 'as', 'until', 'while',
    'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in',
    'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here',
    'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don',
    'should', 'now', 'court', 'legal', 'case', 'petition', 'petitioner', 'respondent',
    'corporate', 'debtor', 'section', 'code', 'act', 'order', 'rules', 'herein',
    'hereby', 'hereafter', 'thereof', 'thereto', 'wherein'
]);

function stem(word) {
    if (word.length <= 2) return word;
    let w = word.toLowerCase();
    
    // Suffix rules
    if (w.endsWith('ingly')) w = w.slice(0, -5);
    else if (w.endsWith('ing')) w = w.slice(0, -3);
    else if (w.endsWith('edly')) w = w.slice(0, -4);
    else if (w.endsWith('ed')) w = w.slice(0, -2);
    else if (w.endsWith('ment')) w = w.slice(0, -4);
    else if (w.endsWith('tion')) w = w.slice(0, -4);
    else if (w.endsWith('able')) w = w.slice(0, -4);
    else if (w.endsWith('ness')) w = w.slice(0, -4);
    else if (w.endsWith('al')) w = w.slice(0, -2);
    else if (w.endsWith('ive')) w = w.slice(0, -3);
    else if (w.endsWith('ful')) w = w.slice(0, -3);
    else if (w.endsWith('ly')) w = w.slice(0, -2);
    
    // Plural rules
    if (w.endsWith('sses')) w = w.slice(0, -2);
    else if (w.endsWith('ies')) w = w.slice(0, -3) + 'i';
    else if (w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    
    return w;
}

function tokenize(text) {
    if (!text) return [];
    return text.toLowerCase()
        .replace(/[^a-zA-Z0-9\s-_]/g, '')
        .split(/\s+/)
        .filter(w => w && !STOP_WORDS.has(w))
        .map(stem);
}

function buildIndex(documents) {
    const index = {
        version: 1,
        avgDocLength: 0,
        totalDocs: 0,
        docLengths: {},
        postings: {}
    };

    if (documents.length === 0) return index;

    let totalLength = 0;
    for (const doc of documents) {
        const tokens = tokenize(doc.text);
        const termFreqs = {};
        for (const t of tokens) {
            termFreqs[t] = (termFreqs[t] || 0) + 1;
        }

        index.docLengths[doc.id] = tokens.length;
        totalLength += tokens.length;
        index.totalDocs += 1;

        for (const term in termFreqs) {
            if (!index.postings[term]) {
                index.postings[term] = { df: 0, docs: {} };
            }
            index.postings[term].df += 1;
            index.postings[term].docs[doc.id] = termFreqs[term];
        }
    }

    index.avgDocLength = totalLength / index.totalDocs;
    return index;
}

function search(index, queryText, topK = 5, k1 = 1.5, b = 0.75) {
    const queryTokens = tokenize(queryText);
    const scores = {};

    if (queryTokens.length === 0 || index.totalDocs === 0) return [];

    const N = index.totalDocs;
    const avgLen = index.avgDocLength;

    for (const qTerm of queryTokens) {
        const posting = index.postings[qTerm];
        if (!posting) continue;

        const df = posting.df;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

        for (const docId in posting.docs) {
            const tf = posting.docs[docId];
            const docLen = index.docLengths[docId] || 0;

            const numerator = tf * (k1 + 1);
            const denominator = tf + k1 * (1 - b + b * (docLen / avgLen));
            const termScore = idf * (numerator / denominator);

            scores[docId] = (scores[docId] || 0) + termScore;
        }
    }

    return Object.keys(scores)
        .map(docId => ({ docId, score: scores[docId] }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
}

function addDocument(index, doc) {
    removeDocument(index, doc.id);

    const tokens = tokenize(doc.text);
    const termFreqs = {};
    for (const t of tokens) {
        termFreqs[t] = (termFreqs[t] || 0) + 1;
    }

    index.docLengths[doc.id] = tokens.length;
    index.totalDocs += 1;

    for (const term in termFreqs) {
        if (!index.postings[term]) {
            index.postings[term] = { df: 0, docs: {} };
        }
        index.postings[term].df += 1;
        index.postings[term].docs[doc.id] = termFreqs[term];
    }

    let totalLength = 0;
    for (const id in index.docLengths) {
        totalLength += index.docLengths[id];
    }
    index.avgDocLength = totalLength / index.totalDocs;
}

function removeDocument(index, docId) {
    if (!index.docLengths[docId]) return;

    delete index.docLengths[docId];
    index.totalDocs -= 1;

    for (const term in index.postings) {
        const posting = index.postings[term];
        if (posting.docs[docId] !== undefined) {
            delete posting.docs[docId];
            posting.df -= 1;
            if (posting.df === 0) {
                delete index.postings[term];
            }
        }
    }

    if (index.totalDocs === 0) {
        index.avgDocLength = 0;
    } else {
        let totalLength = 0;
        for (const id in index.docLengths) {
            totalLength += index.docLengths[id];
        }
        index.avgDocLength = totalLength / index.totalDocs;
    }
}

function saveIndex(index, filePath) {
    fs.writeFileSync(filePath, JSON.stringify(index, null, 2), 'utf8');
}

function loadIndex(filePath) {
    if (!fs.existsSync(filePath)) {
        return { version: 1, avgDocLength: 0, totalDocs: 0, docLengths: {}, postings: {} };
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.error(`[BM25] Failed to load index at ${filePath}:`, e.message);
        return { version: 1, avgDocLength: 0, totalDocs: 0, docLengths: {}, postings: {} };
    }
}

module.exports = { tokenize, stem, buildIndex, search, addDocument, removeDocument, saveIndex, loadIndex };
