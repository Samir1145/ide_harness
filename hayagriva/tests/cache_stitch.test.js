const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { queuePdfTask, startPdfIngestionDaemon } = require('../lib/daemon/lazy_pdf_worker');

// We mock convertPdfBlock to return simple text
const converterMod = require('../lib/core/converter');

async function run() {
    console.log('[Cache-and-Stitch Unit Tests]');

    const tempDir = path.join(__dirname, '../tests/fixtures/mock-stitch-case');
    fs.mkdirSync(tempDir, { recursive: true });

    const pdfPath = path.join(tempDir, 'dummy_doc.pdf');
    const companionPath = path.join(tempDir, 'dummy_doc.md');

    // Create initial page 1-3 companion
    fs.writeFileSync(pdfPath, 'dummy pdf binary data');
    fs.writeFileSync(companionPath, '# Heading 1\nThis is pages 1-3.');

    const originalConvertPdfBlock = converterMod.convertPdfBlock;
    let convertBlockCount = 0;

    converterMod.convertPdfBlock = async (filePath, start, end) => {
        convertBlockCount++;
        return `## Page ${start}\nThis is conversion content for page ${start}.`;
    };

    // Queue task: totalPages = 5 (will trigger 1 batch: page 4 to 5)
    queuePdfTask({
        caseDir: tempDir,
        filePath: pdfPath,
        companionPath: companionPath,
        nextPage: 4,
        totalPages: 5
    });

    try {
        console.log('  -> Initializing lazy PDF daemon loop...');
        startPdfIngestionDaemon();

        // Wait a few seconds for the daemon to run the async block loop
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Assertions:
        // 1. The .cache file should have been cleaned up/deleted
        const cachePath = companionPath + '.cache';
        assert.ok(!fs.existsSync(cachePath), 'Intermediate cache file should be deleted on completion');

        // 2. The companion file should have the original content + consolidated pages
        const finalContent = fs.readFileSync(companionPath, 'utf8');
        console.log('--- Companion Content ---');
        console.log(finalContent.trim());
        console.log('-------------------------');

        assert.ok(finalContent.includes('# Heading 1'), 'Should preserve original contents');
        assert.ok(finalContent.includes('This is conversion content for page 4.'), 'Should append consolidated page 4');

        // Clean up
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        console.log('     ✓ Cache-and-Stitch worker functionality verified successfully.');
    } finally {
        converterMod.convertPdfBlock = originalConvertPdfBlock;
    }

    console.log('  ✓ SUCCESS: Cache-and-Stitch validations passed!');
}

module.exports = { run };
