const fs = require('fs');

/**
 * Normalizes user-facing Markdown column headers to match database field keys.
 */
function normalizeKey(header) {
    const clean = header.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    if (clean.includes('creditor')) return 'creditor';
    if (clean.includes('claimed')) return 'claimed_amount';
    if (clean.includes('admitted_amount') || clean === 'admitted') return 'admitted_amount';
    if (clean.includes('interest')) return 'admitted_interest';
    if (clean.includes('rejected')) return 'rejected_amount';
    if (clean.includes('reason')) return 'rejection_reason';
    if (clean.includes('date')) return 'claim_date';
    if (clean.includes('status')) return 'status';
    
    // Avoidance Transaction Keys
    if (clean.includes('debited')) return 'debited_account';
    if (clean.includes('credited')) return 'credited_party';
    if (clean.includes('relation') || clean.includes('related')) return 'related_party_status';
    if (clean.includes('section')) return 'applicable_section';
    if (clean.includes('notes') || clean.includes('forensic')) return 'forensic_notes';
    return clean;
}

/**
 * Parses a single Markdown table string into an array of objects.
 */
function parseMarkdownTable(tableString) {
    if (!tableString) return [];
    
    const lines = tableString.split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('|') && l.endsWith('|'));
    
    if (lines.length < 3) return []; // Must have header, divider, and at least one row

    // 1. Parse Headers
    const rawHeaders = lines[0].split('|').map(s => s.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
    const keys = rawHeaders.map(normalizeKey);

    const rows = [];
    // 2. Parse Rows (skipping headers at index 0 and divider at index 1)
    for (let i = 2; i < lines.length; i++) {
        const cells = lines[i].split('|').map(s => s.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        const row = {};
        keys.forEach((key, idx) => {
            let val = cells[idx] || '';
            
            // Clean numeric values if possible
            if (key.includes('amount') || key.includes('interest')) {
                const numeric = val.replace(/,/g, '');
                if (!isNaN(numeric) && numeric !== '') {
                    val = parseFloat(numeric);
                }
            }
            row[key] = val;
        });
        rows.push(row);
    }
    return rows;
}

/**
 * Generates a formatted Markdown table string from headers and row objects.
 */
function generateMarkdownTable(headers, rows) {
    if (!headers || headers.length === 0) return '';
    
    let table = `| ${headers.join(' | ')} |\n`;
    table += `| ${headers.map(() => '---').join(' | ')} |\n`;
    
    rows.forEach(row => {
        const line = headers.map(h => {
            const key = normalizeKey(h);
            const val = row[key] !== undefined ? row[key] : '';
            return String(val).replace(/\|/g, '\\|'); // Escape inner pipes
        });
        table += `| ${line.join(' | ')} |\n`;
    });
    
    return table;
}

module.exports = {
    normalizeKey,
    parseMarkdownTable,
    generateMarkdownTable
};
