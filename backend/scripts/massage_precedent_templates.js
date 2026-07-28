const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const PRECEDENTS_DIR = path.join(REPO_ROOT, 'hayagriva', 'lib', 'pipeline', 'forms', 'skeletons', 'ibc_precedents');

function getAllMdFiles(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            results = results.concat(getAllMdFiles(fullPath));
        } else if (item.name.endsWith('.md')) {
            results.push(fullPath);
        }
    }
    return results;
}

function massagePrecedentText(text) {
    let cleaned = text;

    // 1. Unescape markdown backslashes for clean reading
    cleaned = cleaned.replace(/\\([._\-\(\)\[\]])/g, '$1');

    // 2. Standardize common legal placeholders to {{ UPPER_CASE_TOKENS }}
    const tokenMap = [
        { rx: /\[?\s*Corporate Debtor\s*\]?/gi, token: '{{ CORPORATE_DEBTOR_NAME }}' },
        { rx: /\[?\s*Name of Resolution Professional\s*\]?/gi, token: '{{ RESOLUTION_PROFESSIONAL_NAME }}' },
        { rx: /\[?\s*Name of IRP\s*\/?\s*RP\s*\]?/gi, token: '{{ RESOLUTION_PROFESSIONAL_NAME }}' },
        { rx: /\[?\s*Name of Liquidator\s*\]?/gi, token: '{{ LIQUIDATOR_NAME }}' },
        { rx: /\[?\s*Name of Claimant\s*\]?/gi, token: '{{ CLAIMANT_NAME }}' },
        { rx: /\[?\s*Name of Financial Creditor\s*\]?/gi, token: '{{ FINANCIAL_CREDITOR_NAME }}' },
        { rx: /\[?\s*Name of Operational Creditor\s*\]?/gi, token: '{{ OPERATIONAL_CREDITOR_NAME }}' },
        { rx: /\[?\s*Name of Personal Guarantor\s*\]?/gi, token: '{{ PERSONAL_GUARANTOR_NAME }}' },
        { rx: /\[?\s*Transaction\s*\/\s*Forensic Auditor\s*\]?/gi, token: '{{ FORENSIC_AUDITOR_NAME }}' },
        { rx: /\[?\s*__\.__\.20__\s*\]?/gi, token: '{{ DATE }}' },
        { rx: /\[?\s*00,00,000\s*\]?/gi, token: '{{ TRANSACTION_AMOUNT }}' },
        { rx: /\[?\s*insert amount\s*\]?/gi, token: '{{ AMOUNT_CLAIMED }}' },
    ];

    tokenMap.forEach(({ rx, token }) => {
        cleaned = cleaned.replace(rx, token);
    });

    // 3. Catch-all for remaining [bracketed text]
    cleaned = cleaned.replace(/\[\s*(?:insert|name of|please list|state|details of)?\s*([a-z0-9_\s\-\/]{3,70})\s*\]/gi, (match, inner) => {
        if (match.startsWith('[source:') || match.startsWith('[Law ') || match.startsWith('[Reference')) return match;
        const slug = inner.trim().toUpperCase()
            .replace(/[^A-Z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');
        return slug.length > 2 ? `{{ ${slug} }}` : match;
    });

    // 4. Replace court petition number underscores
    cleaned = cleaned.replace(/COURT NO\.\s*_{2,}/gi, 'COURT NO. {{ COURT_NUMBER }}');
    cleaned = cleaned.replace(/I\.A\.\s*\(IB\)\s*NO\.\s*_{2,}/gi, 'I.A. (IB) NO. {{ IA_NUMBER }}');
    cleaned = cleaned.replace(/COMPANY PETITION\s*\(IB\)\s*NO\.\s*_{2,}/gi, 'COMPANY PETITION (IB) NO. {{ CP_NUMBER }}');
    cleaned = cleaned.replace(/OF 20_{2,}/gi, 'OF {{ YEAR }}');

    return cleaned;
}

function processPrecedentFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const cleaned = massagePrecedentText(raw);
    fs.writeFileSync(filePath, cleaned, 'utf8');
}

console.log('Massaging all precedent templates in ibc_precedents...');
const files = getAllMdFiles(PRECEDENTS_DIR);
files.forEach(f => {
    processPrecedentFile(f);
    console.log(`[Precedent Massager] Processed: ${path.relative(PRECEDENTS_DIR, f)}`);
});
console.log(`✓ ${files.length} precedent templates massaged with {{ STANDARDIZED_TOKENS }}!`);
