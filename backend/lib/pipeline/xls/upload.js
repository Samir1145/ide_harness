const xlsx = require('xlsx');

/**
 * Converts an Excel (.xlsx/.xls) workbook to a Markdown string.
 * @param {string} filePath - Absolute path to the Excel file
 * @returns {string} Markdown text structured in markdown tables per sheet
 */
function convertXlsxSheets(filePath) {
    console.log(`[Excel Importer] Converting Excel sheets: ${filePath}`);
    const workbook = xlsx.readFile(filePath);
    const sheets = [];
    
    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        
        let rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        if (rows.length === 0) continue;
        
        // 1. Overlay merged cell values
        rows = fillMergedCells(rows, sheet['!merges']);
        
        // 2. Clean empty rows and columns
        rows = cleanGrid(rows);
        if (rows.length === 0) continue;
        
        let result = '';
        result += `# ${sheetName}\n\n`;
        const chunkSize = 100;
        const headers = rows[0];
        
        const formatRow = (row) => `| ${row.map(cell => (cell !== undefined && cell !== null) ? String(cell).replace(/\|/g, '\\|') : '').join(' | ')} |`;
        const headerMd = formatRow(headers);
        const separatorMd = `| ${headers.map(() => '---').join(' | ')} |`;
        
        for (let i = 1; i < rows.length; i += chunkSize) {
            const chunkRows = rows.slice(i, i + chunkSize);
            result += `### ${sheetName} (Rows ${i} to ${Math.min(rows.length - 1, i + chunkSize - 1)})\n\n`;
            result += `${headerMd}\n${separatorMd}\n`;
            for (const r of chunkRows) {
                result += `${formatRow(r)}\n`;
            }
            result += '\n';
        }
        
        const cleanSheetName = sheetName.replace(/[^a-zA-Z0-9\s-_]/g, '').trim().replace(/\s+/g, '_');
        sheets.push({
            sheetName: cleanSheetName || 'Sheet',
            markdown: result
        });
    }
    return sheets;
}

function convertXlsx(filePath) {
    const sheets = convertXlsxSheets(filePath);
    return sheets.map(s => s.markdown).join('\n\n');
}

/**
 * Replicates top-left cell value across all merged cells in the range.
 */
function fillMergedCells(rows, merges) {
    if (!merges || !Array.isArray(merges)) return rows;
    
    for (const merge of merges) {
        const startRow = merge.s.r;
        const startCol = merge.s.c;
        const endRow = merge.e.r;
        const endCol = merge.e.c;
        
        const val = (rows[startRow] && rows[startRow][startCol] !== undefined) ? rows[startRow][startCol] : '';
        
        for (let r = startRow; r <= endRow; r++) {
            if (!rows[r]) {
                rows[r] = [];
            }
            for (let c = startCol; c <= endCol; c++) {
                if (rows[r][c] === undefined || rows[r][c] === null || String(rows[r][c]).trim() === '') {
                    rows[r][c] = val;
                }
            }
        }
    }
    return rows;
}

/**
 * Removes completely empty rows and columns to prevent markdown bloat.
 */
function cleanGrid(rows) {
    if (rows.length === 0) return [];

    // Find columns that have at least one populated cell
    const maxCols = Math.max(...rows.map(r => r.length));
    const activeCols = new Set();
    
    for (let c = 0; c < maxCols; c++) {
        let hasData = false;
        for (let r = 0; r < rows.length; r++) {
            const cell = rows[r]?.[c];
            if (cell !== undefined && cell !== null && String(cell).trim() !== '') {
                hasData = true;
                break;
            }
        }
        if (hasData) {
            activeCols.add(c);
        }
    }

    const cleanedRows = [];
    const activeColIndices = Array.from(activeCols).sort((a, b) => a - b);
    if (activeColIndices.length === 0) return [];

    for (const row of rows) {
        // Skip completely empty rows
        const hasRowData = row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== '');
        if (!hasRowData) continue;
        
        // Project only populated column indices
        const newRow = activeColIndices.map(c => row[c] !== undefined ? row[c] : '');
        cleanedRows.push(newRow);
    }
    
    return cleanedRows;
}

module.exports = { convertXlsx, convertXlsxSheets };
