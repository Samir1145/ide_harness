const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('./llm-client');

/**
 * Compiles case variables, loads formatting skeletons, and prompts the LLM to
 * generate a customized compliance/legal draft, archiving previous iterations for diffing.
 * 
 * @param {string} caseDir - Absolute path to the case directory
 * @param {string} formatId - Identifier of the document format (e.g. 'directors-report')
 * @returns {Promise<Object>} Path of generated draft, placeholders, and version info
 */
async function draftDocument(caseDir, formatId) {
    console.log(`[Drafting Engine] Generating draft for format "${formatId}"...`);

    // 1. Resolve paths
    const formatsRoot = path.join(__dirname, '../../..', 'templates');
    const formatPath = path.join(formatsRoot, formatId, 'format.md');
    const promptPath = path.join(formatsRoot, formatId, 'prompt.txt');

    if (!fs.existsSync(formatPath) || !fs.existsSync(promptPath)) {
        throw new Error(`Drafting template or guidelines not found for format "${formatId}"`);
    }

    const formatSkeleton = fs.readFileSync(formatPath, 'utf8');
    const draftingPrompt = fs.readFileSync(promptPath, 'utf8');

    const reviewsDir = path.join(caseDir, 'reviews');
    const dictPath = path.join(reviewsDir, 'case_kv_dictionary.json');
    let kvDict = {};
    if (fs.existsSync(dictPath)) {
        try {
            kvDict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
        } catch (_) {}
    }

    // Flatten dictionary for LLM context (key -> value)
    const flatKV = {};
    for (const k in kvDict) {
        flatKV[k] = kvDict[k].value;
    }

    // 2. Draft using LLM
    const userPrompt = `DRAFTING INSTRUCTIONS & RULES:
${draftingPrompt}

TEMPLATE LAYOUT (format.md):
${formatSkeleton}

CASE VARIABLE DEFINITIONS:
${JSON.stringify(flatKV, null, 2)}`;

    let responseDraft = '';
    try {
        const result = await getChatResponse([
            { role: 'system', content: 'You are a precise corporate compliance officer and legal draftsman.' },
            { role: 'user', content: userPrompt }
        ], { timeout: 90000 });

        responseDraft = (result || '').trim();
        // Remove code block ticks if LLM returned markdown wrapped
        if (responseDraft.startsWith('```')) {
            responseDraft = responseDraft.replace(/^```(markdown)?/, '').replace(/```$/, '').trim();
        }
    } catch (err) {
        console.error(`[Drafting Engine] LLM draft generation failed:`, err.message);
        throw err;
    }

    // 3. Backup/versioning of existing draft
    const draftsDir = path.join(caseDir, 'drafts');
    if (!fs.existsSync(draftsDir)) {
        fs.mkdirSync(draftsDir, { recursive: true });
    }

    const draftName = `draft_${formatId}.md`;
    const draftPath = path.join(draftsDir, draftName);
    let nextVersion = 1;

    if (fs.existsSync(draftPath)) {
        // Scan for existing backups to determine next version number
        const files = fs.readdirSync(draftsDir);
        const backupRegex = new RegExp(`^draft_${formatId}\\.v(\\d+)\\.md$`);
        for (const file of files) {
            const m = file.match(backupRegex);
            if (m) {
                const verNum = parseInt(m[1], 10);
                if (verNum >= nextVersion) {
                    nextVersion = verNum + 1;
                }
            }
        }
        
        // Backup existing file
        const backupPath = path.join(draftsDir, `draft_${formatId}.v${nextVersion}.md`);
        fs.renameSync(draftPath, backupPath);
        console.log(`[Drafting Engine] Archived existing draft to: ${path.basename(backupPath)}`);
    }

    // 4. Write new draft
    fs.writeFileSync(draftPath, responseDraft, 'utf8');
    console.log(`[Drafting Engine] ✓ Written new draft to: ${path.basename(draftPath)}`);

    // 5. Scan for unresolved placeholders (e.g. [INSERT OFFICE ADDRESS] or [MISSING: name])
    const placeholders = [];
    const lines = responseDraft.split('\n');
    const placeholderRegex = /\[(?:INSERT|MISSING|PLACEHOLDER|TODO|[^\]]+)\]/gi;

    for (let i = 0; i < lines.length; i++) {
        let match;
        // Use regex search to locate brackets in the line
        const line = lines[i];
        
        // Match simple brackets like [something]
        const simpleBracketsRegex = /\[([^\]]+)\]/g;
        while ((match = simpleBracketsRegex.exec(line)) !== null) {
            const text = match[0];
            const inner = match[1].trim();

            // Exclude links like [Page 36](file.md) or tables like [---]
            const isLink = line.includes(`](${inner}`) || line.includes(`](${match[1]}`);
            const isTableDivider = /^[:\s\-]+$/.test(inner);

            if (!isLink && !isTableDivider && inner.length > 1) {
                placeholders.push({
                    text,
                    line: i + 1,
                    content: inner
                });
            }
        }
    }

    // Save placeholders checklist alongside draft
    const plistPath = path.join(reviewsDir, `draft_${formatId}_placeholders.json`);
    fs.writeFileSync(plistPath, JSON.stringify(placeholders, null, 2), 'utf8');

    return {
        draftPath,
        draftName: `drafts/${draftName}`,
        version: nextVersion,
        placeholders
    };
}

module.exports = { draftDocument };
