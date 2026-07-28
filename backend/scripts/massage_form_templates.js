const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const IBC_FORMS_DIR = path.join(REPO_ROOT, 'hayagriva', 'lib', 'pipeline', 'forms', 'skeletons', 'ibc_forms');

function getAllMdFiles(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            results = results.concat(getAllMdFiles(fullPath));
        } else if (item.name.endsWith('.md') && !item.name.includes('master-handbook')) {
            results.push(fullPath);
        }
    }
    return results;
}

function cleanMarkdownFormat(text) {
    // 1. Standardize bracketed placeholders to {{ TOKEN }}
    let cleaned = text.replace(/\[\s*(?:insert|name of|please list|state|details of)?\s*([a-z0-9_\s\-\/]{3,70})\s*\]/gi, (match, inner) => {
        if (match.startsWith('[source:') || match.startsWith('[Law ') || match.startsWith('[Reference')) return match;
        const slug = inner.trim().toUpperCase()
            .replace(/[^A-Z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');
        return slug.length > 2 ? `{{ ${slug} }}` : match;
    });

    // 2. Replace signature underscores
    cleaned = cleaned.replace(/:\s*_{3,}/g, ': {{ SIGNATURE }}');
    cleaned = cleaned.replace(/Date:\s*_{3,}/gi, 'Date: {{ DATE }}');
    cleaned = cleaned.replace(/Place:\s*_{3,}/gi, 'Place: {{ PLACE }}');

    // 3. Clean escaped markdown slashes
    cleaned = cleaned.replace(/\\([._\-\(\)])/g, '$1');

    return cleaned;
}

function convertParticularsSectionToTable(content) {
    const lines = content.split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.includes('RELEVANT PARTICULARS') || line.includes('Particulars') && lines[i+1]?.includes('Details')) {
            out.push('\n### RELEVANT PARTICULARS\n');
            out.push('| Sl. | Particulars | Details |');
            out.push('|---|---|---|');

            i++; // skip header line
            while (i < lines.length && (lines[i].includes('Sl.') || lines[i].includes('Particulars') || lines[i].includes('Details') || !lines[i].trim())) {
                i++; // skip raw table headers and blank lines
            }

            // Parse numbered items
            while (i < lines.length) {
                const cur = lines[i].trim();
                const numMatch = cur.match(/^(\d+)[\.\)]?\s*(.*)/);

                if (numMatch) {
                    const sl = numMatch[1];
                    let text = numMatch[2].trim();

                    // If text was on the next line
                    if (!text && i + 1 < lines.length) {
                        i++;
                        text = lines[i].trim();
                    }

                    // Collect multi-line item text until next number or section header
                    while (i + 1 < lines.length && lines[i + 1].trim() && !lines[i + 1].trim().match(/^(\d+)[\.\)]?\s*/) && !lines[i + 1].includes('__') && !lines[i + 1].includes('Notice is') && !lines[i + 1].includes('DECLARATION')) {
                        i++;
                        text += ' ' + lines[i].trim();
                    }

                    const tokenSlug = text.toUpperCase()
                        .replace(/[^A-Z0-9]/g, '_')
                        .replace(/_+/g, '_')
                        .replace(/^_+|_+$/g, '')
                        .substring(0, 40);

                    const token = `{{ ${tokenSlug || 'DETAILS'} }}`;
                    out.push(`| ${sl}. | ${text} | ${token} |`);
                } else if (cur.includes('Notice is') || cur.includes('DECLARATION') || cur.includes('Signature') || cur.startsWith('__')) {
                    break; // End of particulars table section
                }
                i++;
            }
            out.push('\n');
        } else {
            out.push(line);
            i++;
        }
    }

    return out.join('\n');
}

function processFormFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    let cleaned = cleanMarkdownFormat(raw);
    cleaned = convertParticularsSectionToTable(cleaned);
    fs.writeFileSync(filePath, cleaned, 'utf8');
}

console.log('Running enhanced form template massager...');
const files = getAllMdFiles(IBC_FORMS_DIR);
files.forEach(file => {
    processFormFile(file);
});
console.log(`✓ ${files.length} form templates transformed into clean markdown tables with {{ TOKENS }}!`);
