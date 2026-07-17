const fs = require('fs');
const path = require('path');
const { loadLlmConfig, streamChat, getEmbedding } = require('../lib/core/llm-client');
const { query } = require('../lib/core/rag');
const { draftDocument } = require('../lib/core/drafting');
const { populateFormInstance } = require('../lib/pipeline/forms/mapper');
const { extractChronology } = require('../lib/utils/chronology');
const { buildTopicOverlap } = require('../lib/utils/topic-overlap');
const { indexVectorsToSqlite } = require('../lib/daemon/watcher');

async function run() {
    console.log('[Settings, Modes & Stage 5 Integration Tests]');
    
    // Test Case 1: Default configuration load
    console.log('  -> Testing DEFAULT_SETTINGS load...');
    const defaultConfig = loadLlmConfig({});
    if (defaultConfig.activeMode !== 'lite') {
        throw new Error(`Expected default activeMode to be 'lite', got '${defaultConfig.activeMode}'`);
    }
    console.log('     ✓ Default configuration defaults to activeMode: "lite".');

    // Setup temporary case folder
    const tempCaseDir = path.join(__dirname, 'fixtures', 'temp_test_case');
    if (!fs.existsSync(tempCaseDir)) {
        fs.mkdirSync(tempCaseDir, { recursive: true });
    }
    const settingsPath = path.join(tempCaseDir, 'hayagriva_settings.json');

    // Test Case 2: Config saving and derivation helper
    console.log('  -> Testing settings/save derivation and settings/get values...');
    const testCases = [
        { saveMode: 'lite', expectedProfile: 'lite' },
        { saveMode: 'local', expectedProfile: 'standard' },
        { saveMode: 'cloud', expectedProfile: 'standard' }
    ];

    for (const tc of testCases) {
        const activeMode = tc.saveMode;
        const savedConfig = {
            processingProfile: activeMode === 'lite' ? 'lite' : 'standard',
            activeMode: activeMode,
            localRunner: 'ollama',
            localEndpoint: 'http://127.0.0.1:11434',
            localChatModel: 'qwen2.5-coder:1.5b',
            localEmbedModel: 'nomic-embed-text',
            cloudProvider: 'gemini',
            cloudModel: 'gemini-1.5-flash',
            remindLibreOffice: true
        };
        fs.writeFileSync(settingsPath, JSON.stringify(savedConfig, null, 2), 'utf8');

        const loadedConfig = loadLlmConfig({ caseDir: tempCaseDir });
        if (loadedConfig.activeMode !== tc.saveMode) {
            throw new Error(`Expected activeMode to be '${tc.saveMode}', got '${loadedConfig.activeMode}'`);
        }
        if (loadedConfig.processingProfile !== tc.expectedProfile) {
            throw new Error(`Expected derived processingProfile to be '${tc.expectedProfile}', got '${loadedConfig.processingProfile}'`);
        }
        console.log(`     ✓ Correctly saved and derived activeMode: "${tc.saveMode}" -> processingProfile: "${tc.expectedProfile}".`);
    }

    // Set settings back to Lite Mode for subsequent Stage 2 tests
    fs.writeFileSync(settingsPath, JSON.stringify({
        activeMode: 'lite',
        processingProfile: 'lite'
    }, null, 2), 'utf8');

    // Test Case 3: streamChat LITE_MODE guard
    console.log('  -> Testing streamChat LITE_MODE guard throw...');
    try {
        const generator = streamChat([{ role: 'user', content: 'test message' }], { activeMode: 'lite' });
        await generator.next();
        throw new Error('Expected streamChat to throw a LITE_MODE error, but it succeeded.');
    } catch (err) {
        if (err.code !== 'LITE_MODE') {
            throw new Error(`Expected error code 'LITE_MODE', got '${err.code || err.message}'`);
        }
        console.log('     ✓ streamChat correctly threw LITE_MODE error: "' + err.message + '"');
    }

    // Test Case 4: RAG query short-circuit in Lite Mode
    console.log('  -> Testing RAG query short-circuit in Lite Mode...');
    // Create dummy concepts index
    const conceptsDir = path.join(tempCaseDir, 'concepts');
    fs.mkdirSync(conceptsDir, { recursive: true });
    
    const indexJson = {
        documents: [
            {
                title: 'doc_a',
                filename: 'doc_a.pdf',
                conceptsDir: 'concepts/doc_a',
                type: 'pdf',
                tags: ['tag1'],
                sections: 1,
                sectionTitles: ['Section A']
            }
        ]
    };
    fs.writeFileSync(path.join(conceptsDir, 'index.json'), JSON.stringify(indexJson, null, 2), 'utf8');

    // Create dummy companion md file
    const docADir = path.join(conceptsDir, 'doc_a');
    fs.mkdirSync(docADir, { recursive: true });
    const contentText = 'This is the core content snippet containing financial numbers for reserves and capital.';
    fs.writeFileSync(
        path.join(docADir, 'Section_A.md'),
        `---
title: Section A
docName: doc_a
pageIndex: 2
---
# Section A
${contentText}`,
        'utf8'
    );

    // Populate FTS5 table in case_vault.db
    const { getDb } = require('../lib/core/sqlite-store');
    const db = getDb(tempCaseDir);
    db.prepare(`
        INSERT INTO fts_chunks (filename, section_title, page_number, chunk_index, content)
        VALUES (?, ?, ?, ?, ?)
    `).run('doc_a.pdf', 'Section A', 2, 0, contentText);

    const ragResult = await query(tempCaseDir, 'financial numbers', { caseDir: tempCaseDir });
    if (!ragResult.liteMode) {
        throw new Error(`Expected query result to indicate liteMode, got '${JSON.stringify(ragResult)}'`);
    }
    if (!ragResult.answer.includes('Lite Mode — Semantic Passage Search')) {
        throw new Error(`Expected answer to contain Lite Mode banner, got: ${ragResult.answer}`);
    }
    if (!ragResult.answer.includes('This is the core content snippet')) {
        throw new Error(`Expected answer to contain the snippet excerpt, got: ${ragResult.answer}`);
    }
    console.log('     ✓ RAG query successfully bypassed LLM and returned formatted passage cards.');

    // Test Case 5: draftDocument Lite Mode Guard
    console.log('  -> Testing draftDocument Lite Mode skeleton fallback...');
    const draftResult = await draftDocument(tempCaseDir, 'directors-report');
    if (!draftResult.liteMode) {
        throw new Error(`Expected draftDocument to return liteMode: true, got '${JSON.stringify(draftResult)}'`);
    }
    if (draftResult.draftPath !== null) {
        throw new Error(`Expected draftPath to be null in Lite Mode, got '${draftResult.draftPath}'`);
    }
    if (!draftResult.skeleton || !draftResult.skeleton.includes('DIRECTOR’S REPORT')) {
        throw new Error(`Expected skeleton draft content to be returned, got: ${draftResult.skeleton}`);
    }
    console.log('     ✓ draftDocument successfully returned template skeleton without LLM call.');

    // Test Case 6: populateFormInstance Lite Mode Guard (Forms partial fill)
    console.log('  -> Testing populateFormInstance Lite Mode partial pre-fill...');
    const reviewsDir = path.join(tempCaseDir, 'reviews');
    fs.mkdirSync(reviewsDir, { recursive: true });
    
    // Write manually edited/synced case facts to case_kv_dictionary.json
    const kvDictJson = {
        nameOfCompany: {
            value: 'Acme Legal Corp',
            source: 'case_facts.md (Manual Edit)',
            confidence: 'high'
        }
    };
    fs.writeFileSync(path.join(reviewsDir, 'case_kv_dictionary.json'), JSON.stringify(kvDictJson, null, 2), 'utf8');

    const formResult = await populateFormInstance(tempCaseDir, 'aoc-4');
    
    // Verify nameOfCompany is mapped from our mock dictionary
    if (!formResult.nameOfCompany || formResult.nameOfCompany.value !== 'Acme Legal Corp') {
        throw new Error(`Expected nameOfCompany to be mapped to 'Acme Legal Corp', got: ${JSON.stringify(formResult.nameOfCompany)}`);
    }
    // Verify missing fields (like CINofCompany) are set to 'XXXX' rather than calling LLM
    if (!formResult.CINofCompany || formResult.CINofCompany.value !== 'XXXX') {
        throw new Error(`Expected missing field 'CINofCompany' to fallback to 'XXXX', got: ${JSON.stringify(formResult.CINofCompany)}`);
    }
    console.log('     ✓ Forms Agent populated manually edited case facts and bypassed LLM fallback.');

    // Test Case 7: Case Chronology extraction (Stage 3)
    console.log('  -> Testing extractChronology timeline parsing...');
    const conversionsDir = path.join(tempCaseDir, 'conversions');
    fs.mkdirSync(conversionsDir, { recursive: true });
    fs.writeFileSync(
        path.join(conversionsDir, 'doc_a.md'),
        `## Page 1
Some random context lines.
On 12-08-2021, NCLT approved the scheme of arrangement.
## Page 2
The board held a meeting on 15 March 2022 to approve accounts.`,
        'utf8'
    );

    const chronoEvents = extractChronology(tempCaseDir);
    if (chronoEvents.length !== 2) {
        throw new Error(`Expected exactly 2 timeline events, got ${chronoEvents.length}: ${JSON.stringify(chronoEvents)}`);
    }
    if (chronoEvents[0].isoDate !== '2021-08-12' || chronoEvents[0].page !== 1) {
        throw new Error(`Event 0 mismatched: ${JSON.stringify(chronoEvents[0])}`);
    }
    if (chronoEvents[1].isoDate !== '2022-03-15' || chronoEvents[1].page !== 2) {
        throw new Error(`Event 1 mismatched: ${JSON.stringify(chronoEvents[1])}`);
    }
    console.log('     ✓ extractChronology parsed dates, associated page numbers, and sorted events.');

    // Test Case 8: Topic Overlap Map grouping (Stage 3)
    console.log('  -> Testing buildTopicOverlap concept scan...');
    // Create doc_b concepts folder
    const docBDir = path.join(conceptsDir, 'doc_b');
    fs.mkdirSync(docBDir, { recursive: true });
    
    // Write overlapping card to doc_a and doc_b
    fs.writeFileSync(
        path.join(docADir, 'Reserves.md'),
        `---
title: Reserves & Surplus
doc: doc_a.pdf
---
Reserves content`,
        'utf8'
    );
    fs.writeFileSync(
        path.join(docBDir, 'Reserves.md'),
        `---
title: Reserves & Surplus
doc: doc_b.pdf
---
Reserves content 2`,
        'utf8'
    );

    const overlaps = buildTopicOverlap(tempCaseDir);
    if (overlaps.length !== 1) {
        throw new Error(`Expected exactly 1 overlapping topic, got ${overlaps.length}: ${JSON.stringify(overlaps)}`);
    }
    if (overlaps[0].title !== 'Reserves & Surplus' || overlaps[0].count !== 2) {
        throw new Error(`Overlapping topic mismatch: ${JSON.stringify(overlaps[0])}`);
    }
    console.log('     ✓ buildTopicOverlap successfully grouped overlapping concepts across documents.');

    // Test Case 9: parseModelSize utility (Stage 4)
    console.log('  -> Testing parseModelSize utility...');
    const { parseModelSize } = require('../lib/utils/model-info');
    const cases = [
        { model: 'qwen2.5-coder:1.5b', expectedSize: 1.5, expectedTier: 'small' },
        { model: 'llama3:8b', expectedSize: 8, expectedTier: 'medium' },
        { model: 'mixtral:47b', expectedSize: 47, expectedTier: 'large' },
        { model: 'custom_model', expectedSize: null, expectedTier: 'unknown' }
    ];
    for (const c of cases) {
        const info = parseModelSize(c.model);
        if (info.sizeB !== c.expectedSize || info.tier !== c.expectedTier) {
            throw new Error(`Model size parsing failed for '${c.model}': got ${JSON.stringify(info)}`);
        }
    }
    console.log('     ✓ parseModelSize successfully classified model size and quality tier.');

    // Test Case 10: Model Info endpoint mock call (Stage 4)
    console.log('  -> Testing /api/hayagriva/llm/model-info endpoint...');
    
    // 10a. Save as standard local mode with small model
    fs.writeFileSync(settingsPath, JSON.stringify({
        activeMode: 'local',
        localChatModel: 'qwen2.5-coder:1.5b',
        cloudModel: 'gemini-1.5-flash'
    }, null, 2), 'utf8');
    
    let modelInfoRes = null;
    const reqMock = {};
    const resMock = {
        writeHead: (code, headers) => {},
        end: (data) => {
            modelInfoRes = JSON.parse(data);
        }
    };
    
    const router = require('../lib/routes');
    const routeHandler = router.GET['/api/hayagriva/llm/model-info'];
    
    routeHandler(reqMock, resMock, { query: { case: 'fixtures/temp_test_case' } }, __dirname);
    
    if (modelInfoRes.activeMode !== 'local' || modelInfoRes.tier !== 'small' || modelInfoRes.sizeB !== 1.5) {
        throw new Error(`Expected model info to be local small 1.5B, got: ${JSON.stringify(modelInfoRes)}`);
    }
    
    // 10b. Save as cloud mode
    fs.writeFileSync(settingsPath, JSON.stringify({
        activeMode: 'cloud',
        localChatModel: 'qwen2.5-coder:1.5b',
        cloudModel: 'gemini-1.5-flash'
    }, null, 2), 'utf8');
    
    routeHandler(reqMock, resMock, { query: { case: 'fixtures/temp_test_case' } }, __dirname);
    if (modelInfoRes.activeMode !== 'cloud' || modelInfoRes.tier !== 'cloud') {
        throw new Error(`Expected model info to be cloud, got: ${JSON.stringify(modelInfoRes)}`);
    }
    console.log('     ✓ model-info endpoint successfully returned tier specifications under different modes.');

    // Test Case 11: 100% Local ONNX Embeddings under Cloud config (Stage 5)
    console.log('  -> Testing 100% Local ONNX Embeddings under Cloud config...');
    const vecCloud = await getEmbedding('test text chunk', tempCaseDir);
    if (!vecCloud || vecCloud.length !== 384) {
        throw new Error(`Expected getEmbedding to return local ONNX 384-dimension vector under cloud mode, got: ${vecCloud ? vecCloud.length : 'null'}`);
    }
    console.log('     ✓ getEmbedding successfully enforced local ONNX embedding even under Cloud config.');

    // Test Case 12: Promoting ONNX Indexing to Lite Mode (Stage 5)
    console.log('  -> Testing ONNX Vector Indexing in Lite Mode...');
    // Write Lite settings
    fs.writeFileSync(settingsPath, JSON.stringify({
        activeMode: 'lite',
        processingProfile: 'lite'
    }, null, 2), 'utf8');

    const resultMock = {
        relative: 'doc_a.pdf',
        basename: 'doc_a',
        sections: [
            {
                title: 'Section A',
                level: 2,
                pageIndex: 2,
                content: 'This is some test content to index.'
            }
        ]
    };

    // Setup documents table entry to satisfy SQLite FOREIGN KEY reference in document_vectors
    const dbTest = getDb(tempCaseDir);
    dbTest.prepare(`
        INSERT INTO documents (filename, title, status, size_bytes)
        VALUES (?, ?, ?, ?)
    `).run('doc_a.pdf', 'doc_a', 'ingested', 100);

    // Run indexVectorsToSqlite in Lite mode
    await indexVectorsToSqlite(tempCaseDir, resultMock, 'lite');

    // Retrieve database rows to check if vectors were inserted
    const vectorRows = dbTest.prepare('SELECT * FROM document_vectors WHERE filename = ?').all('doc_a.pdf');
    if (vectorRows.length !== 1) {
        throw new Error(`Expected exactly 1 vector row to be indexed in Lite Mode, got: ${vectorRows.length}`);
    }
    if (vectorRows[0].section_title !== 'Section A') {
        throw new Error(`Mismatched indexed section title: ${vectorRows[0].section_title}`);
    }
    console.log('     ✓ indexVectorsToSqlite successfully indexed vector mappings under Lite Mode.');

    // Clean up all temporary files and folders
    try {
        fs.rmSync(tempCaseDir, { recursive: true, force: true });
    } catch (_) {}

    console.log('  ✓ SUCCESS: All Settings, Modes & Stage 5 Integration Tests passed!\n');
}

module.exports = { run };
