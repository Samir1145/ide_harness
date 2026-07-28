const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
// Set up require cache mock for pdfexcavator to intercept native loading
const pdfexcavatorPath = require.resolve('pdfexcavator');
const uploadPath = require.resolve('../lib/pipeline/pdf/upload');
delete require.cache[uploadPath];
delete require.cache[pdfexcavatorPath];

const mockOpen = async (filePath) => {
    return {
        pages: [
            {
                extractTextRaw: async () => 'Short text', // Less than 30 chars
                extractTables: async () => [],
                images: []
            }
        ],
        close: async () => {}
    };
};

require.cache[pdfexcavatorPath] = {
    id: pdfexcavatorPath,
    filename: pdfexcavatorPath,
    loaded: true,
    exports: {
        open: mockOpen,
        default: {
            open: mockOpen
        }
    }
};

const pdfexcavator = require('pdfexcavator');
const { convertPdf } = require('../lib/pipeline/pdf/upload');
const { convertXlsxSheets } = require('../lib/pipeline/xls/upload');
const { ingestXlsx } = require('../lib/pipeline/xls/ingest');
const { getDb } = require('../lib/core/sqlite-store');
const { createWatcher } = require('../lib/daemon/watcher');

async function run() {
    console.log('[Stage 1 Ingestion & Indexing Enhancements Tests]');

    const tempCaseDir = path.join(__dirname, 'fixtures', 'stage1_test_case');
    if (!fs.existsSync(tempCaseDir)) {
        fs.mkdirSync(tempCaseDir, { recursive: true });
    }
    const conceptsDir = path.join(tempCaseDir, 'concepts');
    if (!fs.existsSync(conceptsDir)) {
        fs.mkdirSync(conceptsDir, { recursive: true });
    }

    // Initialize database
    const db = getDb(tempCaseDir);
    db.prepare(`
        CREATE TABLE IF NOT EXISTS documents (
            filename TEXT PRIMARY KEY,
            title TEXT,
            status TEXT,
            size_bytes INTEGER,
            extracted_at TEXT,
            indexed_at TEXT,
            hash TEXT
        )
    `).run();

    // 1. Test Case: Scanned PDF Rejection
    console.log('  -> Testing Scanned PDF Rejection...');
    const scannedPath = path.join(tempCaseDir, 'scanned.pdf');
    fs.writeFileSync(scannedPath, 'dummy pdf body content', 'utf8');

    try {
        await convertPdf(scannedPath);
        throw new Error('Expected scanned PDF to be rejected, but it succeeded.');
    } catch (err) {
        if (err.code !== 'SCANNED_PDF_REJECTED') {
            throw new Error(`Expected error code SCANNED_PDF_REJECTED, got: ${err.code} (${err.message})`);
        }
        console.log('     ✓ Scanned PDF successfully detected and rejected with SCANNED_PDF_REJECTED code.');
    }

    // 2. Test Case: Excel Multi-Sheet Separation
    console.log('  -> Testing Excel Multi-Sheet Separation...');
    const tempExcelPath = path.join(tempCaseDir, 'mock_financials.xlsx');
    
    // Create workbook with two sheets
    const wb = xlsx.utils.book_new();
    const ws1 = xlsx.utils.aoa_to_sheet([
        ['Assets', 'Value'],
        ['Cash', 1000],
        ['Equipment', 5000]
    ]);
    xlsx.utils.book_append_sheet(wb, ws1, 'BalanceSheet');
    
    const ws2 = xlsx.utils.aoa_to_sheet([
        ['Revenue', 'Expenses'],
        [15000, 8000]
    ]);
    xlsx.utils.book_append_sheet(wb, ws2, 'ProfitLoss');
    xlsx.writeFile(wb, tempExcelPath);

    // Run sheet splitting conversion
    const sheets = convertXlsxSheets(tempExcelPath);
    if (sheets.length !== 2) {
        throw new Error(`Expected 2 sheets, got: ${sheets.length}`);
    }
    if (sheets[0].sheetName !== 'BalanceSheet' || !sheets[0].markdown.includes('Cash')) {
        throw new Error(`Sheet 0 mismatch: ${JSON.stringify(sheets[0])}`);
    }
    if (sheets[1].sheetName !== 'ProfitLoss' || !sheets[1].markdown.includes('Revenue')) {
        throw new Error(`Sheet 1 mismatch: ${JSON.stringify(sheets[1])}`);
    }
    console.log('     ✓ convertXlsxSheets successfully isolated multiple sheets into separate Markdown tables.');

    // Run Excel ingestion to verify separate files creation
    const ingestResult = await ingestXlsx(tempCaseDir, tempExcelPath);
    if (!ingestResult.companionPaths || ingestResult.companionPaths.length !== 2) {
        throw new Error(`Expected 2 companion paths, got: ${JSON.stringify(ingestResult)}`);
    }
    
    const path1 = ingestResult.companionPaths[0];
    const path2 = ingestResult.companionPaths[1];
    if (!fs.existsSync(path1) || !fs.existsSync(path2)) {
        throw new Error(`Companion files not written to disk: ${path1}, ${path2}`);
    }
    if (!path1.includes('mock_financials_BalanceSheet.md') || !path2.includes('mock_financials_ProfitLoss.md')) {
        throw new Error(`Mismatched companion paths names: ${path1}, ${path2}`);
    }
    console.log('     ✓ ingestXlsx successfully generated separate sheet files on disk.');

    // 3. Test Case: Watcher Hash-Deduplication
    console.log('  -> Testing Watcher Hash-Deduplication...');
    // Seed document in DB with status 'indexed' and same hash
    const testDocPath = path.join(tempCaseDir, 'test_doc.md');
    fs.writeFileSync(testDocPath, 'Test file contents', 'utf8');

    const { calculateFileHashSync } = require('../lib/utils/hashing');
    const docHash = calculateFileHashSync(testDocPath);

    db.prepare('DELETE FROM documents').run();
    db.prepare(`
        INSERT INTO documents (filename, title, status, size_bytes, hash)
        VALUES (?, ?, ?, ?, ?)
    `).run('test_doc.md', 'test_doc', 'indexed', fs.statSync(testDocPath).size, docHash);

    // Initialize watcher with a mock onChange handler
    let changeTriggeredCount = 0;
    const watcher = createWatcher(tempCaseDir, {
        onFileChange(filePath) {
            if (filePath.endsWith('test_doc.md')) {
                changeTriggeredCount++;
            }
        }
    });

    try {
        // Emit change event directly via watcher inner event stream
        const relativePath = 'test_doc.md';
        watcher.emit('all', 'change', testDocPath);

        // Wait for debounce timer (1200ms)
        await new Promise(resolve => setTimeout(resolve, 1200));

        if (changeTriggeredCount !== 0) {
            throw new Error(`Expected change event to be ignored due to identical hash, but onChange ran ${changeTriggeredCount} times.`);
        }
        console.log('     ✓ Watcher successfully skipped ingest event for unchanged file hash.');
    } finally {
        watcher.close();
    }

    // Clean up temporary files
    try {
        fs.rmSync(tempCaseDir, { recursive: true, force: true });
    } catch (_) {}

    console.log('  ✓ SUCCESS: All Stage 1 Enhancement Tests passed!\n');
}

module.exports = { run };
if (require.main === module) {
    run().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
