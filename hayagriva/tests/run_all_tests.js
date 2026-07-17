const bm25Tests = require('./bm25_search.test');
const splitterTests = require('./document_splitter.test');
const treeTests = require('./pageindex_tree.test');
const validatorTests = require('./form_rules_validator.test');
const agentsTests = require('./agents_coordinator.test');
// const mergeTests = require('./multimodal_merge.test');

async function runAll() {
    console.log('==================================================');
    console.log('         RUNNING ALL HAYAGRIVA BACKEND TESTS         ');
    console.log('==================================================\n');

    try {
        bm25Tests.run();
        console.log('');
        
        await splitterTests.run();
        console.log('');
        
        treeTests.runTests();
        console.log('');

        validatorTests.run();
        console.log('');

        agentsTests.run();
        console.log('');

        // mergeTests.run();
        // console.log('');

        const docxTests = require('./docx_conversion.test');
        await docxTests.run();
        console.log('');

        // const toggleTests = require('./multimodal_toggle.test');
        // await toggleTests.run();
        // console.log('');

        const xlsTests = require('./xls_conversion.test');
        xlsTests.run();
        console.log('');

        const cacheStitchTests = require('./cache_stitch.test');
        await cacheStitchTests.run();
        console.log('');

        const parentChildTests = require('./parent_child_split.test');
        await parentChildTests.run();
        console.log('');

        const enrichmentTests = require('./concept_enrichment.test');
        await enrichmentTests.run();
        console.log('');

        const hoverTests = require('./monaco_hover.test');
        await hoverTests.run();
        console.log('');

        const snippetTests = require('./monaco_snippets.test');
        await snippetTests.run();
        console.log('');

        const overlayTests = require('./monaco_overlays.test');
        await overlayTests.run();
        console.log('');

        const slashCommandTests = require('./monaco_slash_commands.test');
        await slashCommandTests.run();
        console.log('');

        const graphTests = require('./monaco_graph.test');
        await graphTests.run();
        console.log('');

        const settingsModeTests = require('./settings_modes.test');
        await settingsModeTests.run();
        console.log('');

        const sanityTests = require('./comprehensive_sanity.test');
        sanityTests.run();
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
