const bm25Tests = require('./bm25_search.test');
const splitterTests = require('./document_splitter.test');
const treeTests = require('./pageindex_tree.test');

async function runAll() {
    console.log('==================================================');
    console.log('         RUNNING ALL TWILLM BACKEND TESTS         ');
    console.log('==================================================\n');

    try {
        bm25Tests.run();
        console.log('');
        
        await splitterTests.run();
        console.log('');
        
        treeTests.runTests();
        console.log('');

        console.log('==================================================');
        console.log('      ✓ SUCCESS: All Unit Tests Passed!           ');
        console.log('==================================================');
    } catch (error) {
        console.error('\n==================================================');
        console.error('      ❌ FAILURE: One or More Tests Failed!      ');
        console.error('==================================================');
        console.error(error.stack);
        process.exit(1);
    }
}

runAll();
