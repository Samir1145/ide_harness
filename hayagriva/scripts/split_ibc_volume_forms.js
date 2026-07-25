const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const IBC_FORMS_DIR = path.join(REPO_ROOT, 'hayagriva', 'lib', 'pipeline', 'forms', 'skeletons', 'ibc_forms');

const VOLUMES = [
    {
        file: 'ibc-2026-volume-1-forms.md',
        prefix: 'cirp-form',
        folder: 'cirp'
    },
    {
        file: 'ibc-2026-volume-2-forms.md',
        prefix: 'liq-form',
        folder: 'liquidation'
    },
    {
        file: 'ibc-2026-volume-3-forms.md',
        prefix: 'vl-form',
        folder: 'voluntary_liquidation'
    },
    {
        file: 'ibc-2026-volume-4-forms.md',
        prefix: 'ppirp-form',
        folder: 'ppirp'
    },
    {
        file: 'ibc-2026-volume-5-forms.md',
        prefix: 'pg-form',
        folder: 'personal_guarantor'
    }
];

function splitVolume(volConfig) {
    const volPath = path.join(IBC_FORMS_DIR, volConfig.file);
    if (!fs.existsSync(volPath)) {
        console.warn(`[Splitter] Volume file not found: ${volPath}`);
        return;
    }

    const content = fs.readFileSync(volPath, 'utf8');
    const targetDir = path.join(IBC_FORMS_DIR, volConfig.folder);
    fs.mkdirSync(targetDir, { recursive: true });

    // Split by __FORM <NAME>__ headers
    const parts = content.split(/(?=__FORM\s+[A-Z0-9]+__)/gi);

    let extractedCount = 0;
    parts.forEach(part => {
        const match = part.match(/^__FORM\s+([A-Z0-9]+)__/i);
        if (!match) return; // Skip intro/index section

        const formCode = match[1].trim().toLowerCase();
        const fileName = `${volConfig.prefix}-${formCode}.md`;
        const filePath = path.join(targetDir, fileName);

        // Also write a copy in root ibc_forms for flat lookup
        const flatPath = path.join(IBC_FORMS_DIR, fileName);

        const formContent = `# ${volConfig.prefix.toUpperCase()}-${formCode.toUpperCase()}\n\n${part.trim()}`;

        fs.writeFileSync(filePath, formContent, 'utf8');
        fs.writeFileSync(flatPath, formContent, 'utf8');
        extractedCount++;
        console.log(`[Splitter] Extracted ${fileName} → ${volConfig.folder}/`);
    });

    console.log(`✓ ${extractedCount} forms extracted from ${volConfig.file}`);
}

console.log('Splitting Volume files into standalone .md forms...');
VOLUMES.forEach(vol => splitVolume(vol));

// Remove unsplit volume files to prevent duplicate RAG loading
VOLUMES.forEach(vol => {
    const p = path.join(IBC_FORMS_DIR, vol.file);
    if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        console.log(`[Splitter] Removed raw volume file: ${vol.file}`);
    }
});

console.log('✓ Volume Form Extraction Complete!');
