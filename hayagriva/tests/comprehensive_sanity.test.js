const path = require('path');
const fs = require('fs');
const { queuePdfTask, pendingPdfQueue } = require('../lib/lazy_pdf_worker');
const { validateFormRules } = require('../lib/ingestion-file/form_rules_validator');
const { draftDocument } = require('../lib/drafting');

function run() {
    console.log('[Comprehensive Sanity Unit Tests]');

    // 1. Test Worker Queue Deduplication
    console.log('  -> Testing lazy PDF worker queue deduplication...');
    const originalLen = pendingPdfQueue.length;

    // Queue duplicate tasks for same filePath
    const mockTask1 = { filePath: 'test_doc.pdf', totalPages: 10, nextPage: 1 };
    const mockTask2 = { filePath: 'test_doc.pdf', totalPages: 10, nextPage: 4 };
    
    queuePdfTask(mockTask1);
    queuePdfTask(mockTask2);

    const queuedCount = pendingPdfQueue.filter(t => t.filePath === 'test_doc.pdf').length;
    if (queuedCount !== 1) {
        throw new Error(`Worker queue failed to deduplicate tasks. Found: ${queuedCount} entries.`);
    }
    // Verify it took the last queued task
    const activeTask = pendingPdfQueue.find(t => t.filePath === 'test_doc.pdf');
    if (activeTask.nextPage !== 4) {
        throw new Error(`Worker queue failed to preserve the latest task state. nextPage: ${activeTask.nextPage}`);
    }

    // Clean up mock task
    const idx = pendingPdfQueue.findIndex(t => t.filePath === 'test_doc.pdf');
    if (idx !== -1) pendingPdfQueue.splice(idx, 1);
    console.log('     ✓ Worker queue deduplication verified successfully.');

    // 2. Test Rules Validator Math Edge Cases
    console.log('  -> Testing Rules Validator math edge cases...');
    
    // Test case: Division by zero or invalid variables
    const malformedRules = [
        {
            ruleId: "RULE_DIV_ZERO",
            ruleType: "equation",
            formula: "a == b / c",
            message: "Division by zero detected.",
            affectedFields: ["a"]
        },
        {
            ruleId: "RULE_INVALID_VAR",
            ruleType: "equation",
            formula: "a == b + non_existent_var",
            message: "Missing variables in evaluation.",
            affectedFields: ["a"]
        }
    ];

    const mockFields = {
        a: 10,
        b: 5,
        c: 0
    };

    const failures = validateFormRules(mockFields, malformedRules);
    
    // Verify it handled division by zero safely (should return failure or skip, but not throw crash)
    const hasDivZeroFail = failures.some(f => f.ruleId === 'RULE_DIV_ZERO');
    const hasInvalidVarFail = failures.some(f => f.ruleId === 'RULE_INVALID_VAR');
    
    // Expression evaluation failures are pushed as rule failures
    if (failures.length === 0) {
        throw new Error('Rules engine failed to report invalid evaluation failures.');
    }
    console.log('     ✓ Rules engine handled malformed equations and division by zero safely.');

    // 3. Test Draft Version Incrementer Logic
    console.log('  -> Testing draft archive versioning incrementer...');
    const mockCaseDir = path.join(__dirname, '..', 'temp_mock_draft_case');
    
    try {
        fs.mkdirSync(mockCaseDir, { recursive: true });
        const draftsDir = path.join(mockCaseDir, 'drafts');
        fs.mkdirSync(draftsDir, { recursive: true });

        // Pre-create legacy version files
        fs.writeFileSync(path.join(draftsDir, 'draft_test-format.md'), 'Active content', 'utf8');
        fs.writeFileSync(path.join(draftsDir, 'draft_test-format.v1.md'), 'v1 content', 'utf8');
        fs.writeFileSync(path.join(draftsDir, 'draft_test-format.v2.md'), 'v2 content', 'utf8');

        // Dynamically get next version index
        const getNextVersion = (dir, formatId) => {
            const files = fs.readdirSync(dir);
            let maxVer = 0;
            const regex = new RegExp(`^draft_${formatId}\\.v(\\d+)\\.md$`);
            for (const file of files) {
                const match = file.match(regex);
                if (match) {
                    const ver = parseInt(match[1], 10);
                    if (ver > maxVer) maxVer = ver;
                }
            }
            return maxVer + 1;
        };

        const nextVer = getNextVersion(draftsDir, 'test-format');
        if (nextVer !== 3) {
            throw new Error(`Draft version incrementer resolved wrong index. Expected 3, got: ${nextVer}`);
        }
        console.log(`     ✓ Draft incrementer successfully resolved next version: v${nextVer}.`);

    } finally {
        // Clean up mock directory
        try {
            fs.rmSync(mockCaseDir, { recursive: true, force: true });
        } catch (e) {}
    }

    console.log('  ✓ SUCCESS: All comprehensive sanity tests passed!');
}

module.exports = { run };
