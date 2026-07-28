const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const PRECEDENTS_DIR = path.join(REPO_ROOT, 'hayagriva', 'lib', 'pipeline', 'forms', 'skeletons', 'ibc_precedents');

const APPS_DIR = path.join(PRECEDENTS_DIR, 'applications');
const RP_REPORTS_DIR = path.join(PRECEDENTS_DIR, 'rp_reports');
const PG_DIR = path.join(PRECEDENTS_DIR, 'personal_guarantor');
const LIQ_DIR = path.join(PRECEDENTS_DIR, 'liquidation');

[APPS_DIR, RP_REPORTS_DIR, PG_DIR, LIQ_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

console.log('Splitting & Categorizing IBC Precedent Compendiums...');

// Helper: Standardize [bracketed placeholders] to {{ UPPER_CASE_TOKENS }}
function convertPlaceholders(text) {
    return text.replace(/\[\s*(?:insert|name of|please list|state|details of)?\s*([a-z0-9_\s\-\/]{3,70})\s*\]/gi, (match, inner) => {
        if (match.startsWith('[source:') || match.startsWith('[Law ') || match.startsWith('[Reference')) return match;
        const slug = inner.trim().toUpperCase()
            .replace(/[^A-Z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');
        return slug.length > 2 ? `{{ ${slug} }}` : match;
    });
}

// 1. Move Single Court Applications into applications/
const appFiles = [
    'avoidance-application-sec43-45-50-66.md',
    'b3-time-exclusion-application.md',
    'b5-residuary-application-sec60-5.md',
    'b6-plan-approval-application.md',
    'b7-liquidation-application-sec33.md',
    'b8-withdrawal-application-sec12a.md',
    'time-exclusion-application.md',
    'plan-approval-application.md',
    'liquidation-application-sec33.md',
    'withdrawal-application-sec12a.md',
    'residuary-application-sec60-5.md'
];

appFiles.forEach(f => {
    const src = path.join(PRECEDENTS_DIR, f);
    if (fs.existsSync(src)) {
        const text = convertPlaceholders(fs.readFileSync(src, 'utf8'));
        fs.writeFileSync(path.join(APPS_DIR, f), text, 'utf8');
        console.log(`[Categorized] ${f} → applications/`);
    }
});

// 2. Move RP Reports into rp_reports/
const rpFiles = [
    'a1-coc-constitution-report.md',
    'a3-resolution-plan-examination-report.md',
    'a4-pufe-opinion-reg35a.md',
    'a5-transaction-audit-comments.md',
    'a6-development-rights-report.md',
    'a7-coc-progress-report.md',
    'coc-constitution-report.md',
    'resolution-plan-examination-report.md',
    'pufe-opinion-reg35a.md',
    'transaction-audit-comments.md',
    'development-rights-report.md',
    'coc-progress-report.md',
    'rp-reports-index-cirp.md',
    'directors-report.md'
];

rpFiles.forEach(f => {
    const src = path.join(PRECEDENTS_DIR, f);
    if (fs.existsSync(src)) {
        const text = convertPlaceholders(fs.readFileSync(src, 'utf8'));
        fs.writeFileSync(path.join(RP_REPORTS_DIR, f), text, 'utf8');
        console.log(`[Categorized] ${f} → rp_reports/`);
    }
});

// 3. Move/Split PG Files into personal_guarantor/
const pgFiles = [
    'sec99-report-blank.md',
    'sec99-report-sec94-debtor.md',
    'sec99-report-sec95-creditor.md'
];

pgFiles.forEach(f => {
    const src = path.join(PRECEDENTS_DIR, f);
    if (fs.existsSync(src)) {
        const text = convertPlaceholders(fs.readFileSync(src, 'utf8'));
        fs.writeFileSync(path.join(PG_DIR, f), text, 'utf8');
        console.log(`[Categorized] ${f} → personal_guarantor/`);
    }
});

// Split PG Compendiums into individual precedents
const pgCompendiums = [
    'pg-part3-postadmission-precedents.md',
    'pg-part3-preadmission-precedents.md',
    'pg-part3-bankruptcy-precedents.md'
];

pgCompendiums.forEach(file => {
    const srcPath = path.join(PRECEDENTS_DIR, file);
    if (!fs.existsSync(srcPath)) return;

    const content = fs.readFileSync(srcPath, 'utf8');
    const parts = content.split(/(?=__Precedent\s+[A-Z]\.|\n#\s*__Precedent\s+[A-Z]\.)/gi);

    let count = 0;
    parts.forEach((part, idx) => {
        const match = part.match(/Precedent\s+([A-Z])[\.\s\-]/i);
        if (!match) return; // skip header index

        const letter = match[1].toLowerCase();
        const slug = `${file.replace('.md', '')}-precedent-${letter}.md`;
        const text = convertPlaceholders(part.trim());

        fs.writeFileSync(path.join(PG_DIR, slug), text, 'utf8');
        fs.writeFileSync(path.join(PRECEDENTS_DIR, slug), text, 'utf8');
        count++;
        console.log(`[Split PG] Extracted ${slug} → personal_guarantor/`);
    });
    console.log(`✓ Extracted ${count} precedents from ${file}`);
});

// 4. Move/Split Liquidation Files into liquidation/
const liqFiles = [
    'creditors-approval-voluntary-liquidation.md',
    'im-confidentiality-undertaking.md',
    'letter-appointment-voluntary-liquidator.md',
    'liquidation-continuation-reg44-2.md',
    'scc-proforma-reg31a.md',
    'vl-termination-complete-kit.md',
    'vl-termination-reg42-precedent-pack.md',
    'vl-termination-sec59-pack.md',
    'voluntary-liquidation-commencement-pack.md'
];

liqFiles.forEach(f => {
    const src = path.join(PRECEDENTS_DIR, f);
    if (fs.existsSync(src)) {
        const text = convertPlaceholders(fs.readFileSync(src, 'utf8'));
        fs.writeFileSync(path.join(LIQ_DIR, f), text, 'utf8');
        console.log(`[Categorized] ${f} → liquidation/`);
    }
});

// Split Liquidation Phase Packs into individual instruments
for (let phase = 1; phase <= 9; phase++) {
    const fileName = `liquidation-phase-${phase}-*.md`;
    const files = fs.readdirSync(PRECEDENTS_DIR).filter(f => f.startsWith(`liquidation-phase-${phase}`));

    files.forEach(file => {
        const srcPath = path.join(PRECEDENTS_DIR, file);
        const content = fs.readFileSync(srcPath, 'utf8');
        const text = convertPlaceholders(content);

        // Save into liquidation subfolder
        fs.writeFileSync(path.join(LIQ_DIR, file), text, 'utf8');

        // Split by Instrument headers if multi-instrument
        const instruments = text.split(/(?=__Instrument\s+\d+\s+—)/gi);
        instruments.forEach((inst, idx) => {
            const m = inst.match(/Instrument\s+(\d+)\s+—\s*(.*)/i);
            if (!m) return;
            const instNum = m[1];
            const instSlug = `${file.replace('.md', '')}-inst-${instNum}.md`;
            fs.writeFileSync(path.join(LIQ_DIR, instSlug), inst.trim(), 'utf8');
            fs.writeFileSync(path.join(PRECEDENTS_DIR, instSlug), inst.trim(), 'utf8');
            console.log(`[Split Liquidation] Extracted ${instSlug} → liquidation/`);
        });
    });
}

console.log('✓ All Precedent Compendiums Split & Categorized!');
