const bm25 = require('../lib/bm25');
const rag = require('../lib/rag');
const path = require('path');

const caseDir = '/Users/atulgrover/Documents/Atty1';
const bm25IndexFile = path.join(caseDir, 'concepts', 'bm25_index.json');

async function test() {
    console.log('--- Loading BM25 Index ---');
    const index = bm25.loadIndex(bm25IndexFile);
    console.log(`Document count in index: ${Object.keys(index.docLengths).length}`);

    const query1 = 'RBI';
    console.log(`\n--- Searching BM25 for: "${query1}" ---`);
    const hits1 = bm25.search(index, query1, 5);
    console.log('BM25 Hits:', hits1);

    const query2 = 'what is the full form of RBI';
    console.log(`\n--- Searching BM25 for: "${query2}" ---`);
    const hits2 = bm25.search(index, query2, 5);
    console.log('BM25 Hits:', hits2);

    console.log('\n--- Running RAG query directly ---');
    try {
        const res = await rag.query(caseDir, query2);
        console.log('RAG Response:', res);
    } catch (e) {
        console.error('RAG Query Failed:', e.message);
    }
}

test();
