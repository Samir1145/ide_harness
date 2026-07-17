const fs = require('fs');
const path = require('path');

// Regex patterns to match dates
const DATE_PATTERNS = [
    // ISO: YYYY-MM-DD
    /\b(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g,
    // Indian/EU: DD/MM/YYYY or DD-MM-YYYY
    /\b(0?[1-9]|[12]\d|3[01])[\/-](0?[1-9]|1[0-2])[\/-](\d{4})\b/g,
    // Worded: 15 March 2021, March 15, 2021, etc.
    /\b(0?[1-9]|[12]\d|3[01])\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/gi,
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(0?[1-9]|[12]\d|3[01]),?\s+(\d{4})\b/gi
];

const MONTH_MAP = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

function normalizeToISO(matchStr) {
    matchStr = matchStr.trim().toLowerCase().replace(/,/g, '');
    
    // Check Case 1: YYYY-MM-DD
    let parts = matchStr.match(/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
    if (parts) {
        return `${parts[1]}-${parts[2]}-${parts[3]}`;
    }

    // Check Case 2: DD/MM/YYYY or DD-MM-YYYY
    parts = matchStr.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (parts) {
        const d = parts[1].padStart(2, '0');
        const m = parts[2].padStart(2, '0');
        const y = parts[3];
        return `${y}-${m}-${d}`;
    }

    // Check Case 3: DD Month YYYY (e.g. 15 March 2021)
    parts = matchStr.match(/^(\d{1,2})\s+([a-z]{3,10})\s+(\d{4})$/);
    if (parts) {
        const d = parts[1].padStart(2, '0');
        const mKey = parts[2].substring(0, 3);
        const m = MONTH_MAP[mKey] || '01';
        const y = parts[3];
        return `${y}-${m}-${d}`;
    }

    // Check Case 4: Month DD YYYY (e.g. March 15 2021)
    parts = matchStr.match(/^([a-z]{3,10})\s+(\d{1,2})\s+(\d{4})$/);
    if (parts) {
        const d = parts[2].padStart(2, '0');
        const mKey = parts[1].substring(0, 3);
        const m = MONTH_MAP[mKey] || '01';
        const y = parts[3];
        return `${y}-${m}-${d}`;
    }

    return null;
}

function recursiveWalk(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(recursiveWalk(fullPath));
        } else if (file.endsWith('.md') && file !== 'README.md') {
            results.push(fullPath);
        }
    }
    return results;
}

function extractSentenceAround(text, index, dateLen) {
    // Find boundaries around the index
    let start = index;
    while (start > 0 && text[start] !== '.' && text[start] !== '\n' && text[start] !== '?' && text[start] !== '!') {
        start--;
    }
    if (start > 0) start++; // move past boundary char

    let end = index + dateLen;
    while (end < text.length && text[end] !== '.' && text[end] !== '\n' && text[end] !== '?' && text[end] !== '!') {
        end++;
    }

    let sentence = text.substring(start, end).replace(/\s+/g, ' ').trim();
    if (sentence.length < 15) {
        // Grab slightly wider context if very short
        const prevText = text.substring(Math.max(0, index - 80), index);
        const postText = text.substring(index + dateLen, Math.min(text.length, index + dateLen + 80));
        sentence = (prevText + text.substring(index, index + dateLen) + postText).replace(/\s+/g, ' ').trim();
    }
    
    if (sentence.length > 250) {
        sentence = sentence.substring(0, 247) + '...';
    }
    return sentence;
}

function extractChronology(caseDir) {
    const conversionsDir = path.join(caseDir, 'conversions');
    const events = [];
    
    if (!fs.existsSync(conversionsDir)) {
        return events;
    }

    // Build filename map from index.json
    const indexPath = path.join(caseDir, 'concepts', 'index.json');
    const docMap = new Map(); // title (basename) -> original filename
    if (fs.existsSync(indexPath)) {
        try {
            const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
            for (const doc of (idx.documents || [])) {
                docMap.set(doc.title, doc.filename);
            }
        } catch (_) {}
    }

    const files = recursiveWalk(conversionsDir);
    const seen = new Set();

    for (const file of files) {
        const text = fs.readFileSync(file, 'utf8');
        const fileBasename = path.basename(file, '.md');
        const originalName = docMap.get(fileBasename) || `${fileBasename}.pdf`;

        // Split text by lines to keep page context trackable
        const lines = text.split(/\r?\n/);
        let currentPage = 1;

        for (const line of lines) {
            // Track page number: e.g. "## Page 4"
            const pageMatch = line.match(/^##\s+Page\s+(\d+)/i);
            if (pageMatch) {
                currentPage = parseInt(pageMatch[1], 10);
                continue;
            }

            for (const pattern of DATE_PATTERNS) {
                pattern.lastIndex = 0;
                let match;
                while ((match = pattern.exec(line)) !== null) {
                    const dateStr = match[0];
                    const isoDate = normalizeToISO(dateStr);
                    if (!isoDate) continue;

                    // Validate year bounds (e.g. 1950 - 2050)
                    const year = parseInt(isoDate.substring(0, 4), 10);
                    if (year < 1950 || year > 2050) continue;

                    const context = extractSentenceAround(line, match.index, dateStr.length);
                    const uniqKey = `${isoDate}::${originalName}::${currentPage}::${context.substring(0, 30)}`;

                    if (!seen.has(uniqKey)) {
                        seen.add(uniqKey);
                        events.push({
                            isoDate,
                            displayDate: dateStr,
                            context,
                            source: originalName,
                            page: currentPage
                        });
                    }
                }
            }
        }
    }

    // Sort chronologically ascending
    return events.sort((a, b) => a.isoDate.localeCompare(b.isoDate));
}

module.exports = { extractChronology };
