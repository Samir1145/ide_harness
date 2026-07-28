const assert = require('assert');
const path = require('path');
const xlsx = require('xlsx');
const { convertXlsx } = require('../lib/pipeline/xls/upload');

function run() {
    console.log('[Excel Refinements Unit Tests]');
    
    // Backup original functions
    const originalReadFile = xlsx.readFile;
    const originalSheetToJson = xlsx.utils.sheet_to_json;
    
    xlsx.readFile = (filePath) => {
        return {
            SheetNames: ['TestSheet'],
            Sheets: {
                'TestSheet': {
                    '!merges': [
                        // Merge row 0, col 0 (A1) down to row 1, col 0 (A2)
                        { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }
                    ]
                }
            }
        };
    };
    
    xlsx.utils.sheet_to_json = (sheet, options) => {
        // Return 2D array representing raw values from SheetJS (header: 1)
        // Row 2 is completely empty. Column 2 (C) is completely empty.
        return [
            ['Header1', 'Header2', ''],
            [undefined, 'Data2', ''],
            [undefined, undefined, undefined],
            ['FooterValue', undefined, undefined]
        ];
    };
    
    try {
        console.log('  -> Converting mock worksheet with merged cells and empty rows/cols...');
        const result = convertXlsx('mock_excel_file.xlsx');
        
        console.log('--- Mock Conversion Output ---');
        console.log(result.trim());
        console.log('------------------------------');
        
        // Assertions:
        // 1. Cleaned table lines check
        const lines = result.trim().split('\n').filter(line => line.startsWith('|'));
        
        // Expected layout:
        // Line 1: | Header1 | Header2 |
        // Line 2: | --- | --- |
        // Line 3: | Header1 | Data2 |
        // Line 4: | FooterValue |  |
        assert.strictEqual(lines.length, 4, 'Empty rows should be filtered out from the final table grid');
        
        // 2. Column count check (should be exactly 2 columns, split by | results in 4 parts: "", col1, col2, "")
        for (const row of lines) {
            const parts = row.split('|');
            assert.strictEqual(parts.length, 4, 'Each row should have exactly 2 columns (3rd column stripped)');
        }
        
        // 3. Merged cell check
        assert.ok(result.includes('| Header1 | Data2 |'), 'Merged cells should replicate top-left value');
        
        console.log('     ✓ Excel merges and empty cell filters verified successfully.');
    } finally {
        // Restore original functions
        xlsx.readFile = originalReadFile;
        xlsx.utils.sheet_to_json = originalSheetToJson;
    }
    
    console.log('  ✓ SUCCESS: Excel refinements validations passed!');
}

module.exports = { run };
