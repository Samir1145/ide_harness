'use strict';

const fs = require('fs');
const path = require('path');
const { getConceptsDir } = require('../../pipeline/common/helper');

/**
 * Replaces template variables like {{caseName}}, {{memoryDirectory}}, {{activeFile}}, etc.
 */
function resolvePromptVariables(caseDir, template, activeFile = null) {
    if (!template || typeof template !== 'string') return '';
    if (!caseDir) return template;

    const wikiDir = path.join(caseDir, 'wiki');
    const conceptsDir = getConceptsDir(caseDir);
    const caseBasename = path.basename(caseDir);

    let result = template;
    const replacements = {
        'caseName': caseDir,
        'caseBasename': caseBasename,
        'memoryDirectory': wikiDir,
        'wikiDirectory': wikiDir,
        'conceptsDirectory': conceptsDir,
        'activeFile': activeFile || ''
    };

    for (const [key, val] of Object.entries(replacements)) {
        const mustacheRegex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
        const bashRegex = new RegExp(`\\$\\{${key}\\}`, 'gi');
        result = result.replace(mustacheRegex, val).replace(bashRegex, val);
    }

    return result;
}

/**
 * Scans <caseDir>/wiki/ (including wiki/qna/) and <caseDir>/concepts/ for relevant memory notes.
 * Extracts snippets matching keywords in userMessage and returns a clean Markdown memory section.
 */
async function buildMemoryContext(caseDir, userMessage = '', options = {}) {
    if (!caseDir || !fs.existsSync(caseDir)) return '';

    const maxItems = typeof options.maxItems === 'number' ? options.maxItems : 3;
    const wikiDir = path.join(caseDir, 'wiki');
    const qnaDir = path.join(wikiDir, 'qna');
    const conceptsDir = getConceptsDir(caseDir);

    const memoryFiles = [];

    // Scan wiki/
    if (fs.existsSync(wikiDir)) {
        try {
            const wikiEntries = fs.readdirSync(wikiDir, { withFileTypes: true });
            for (const entry of wikiEntries) {
                if (entry.isFile() && entry.name.endsWith('.md')) {
                    memoryFiles.push({ path: path.join(wikiDir, entry.name), type: 'Wiki Note', title: entry.name });
                }
            }
        } catch (_) {}
    }

    // Scan wiki/qna/
    if (fs.existsSync(qnaDir)) {
        try {
            const qnaEntries = fs.readdirSync(qnaDir, { withFileTypes: true });
            for (const entry of qnaEntries) {
                if (entry.isFile() && entry.name.endsWith('.md')) {
                    memoryFiles.push({ path: path.join(qnaDir, entry.name), type: 'Q&A Memory', title: entry.name });
                }
            }
        } catch (_) {}
    }

    // Scan concepts/
    if (fs.existsSync(conceptsDir)) {
        try {
            const conceptEntries = fs.readdirSync(conceptsDir, { withFileTypes: true });
            for (const entry of conceptEntries) {
                if (entry.isFile() && entry.name.endsWith('.md')) {
                    memoryFiles.push({ path: path.join(conceptsDir, entry.name), type: 'Concept Fact', title: entry.name });
                }
            }
        } catch (_) {}
    }

    if (memoryFiles.length === 0) return '';

    // Extract query terms (ignore small stop words)
    const terms = (userMessage || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2);

    const scored = [];

    for (const item of memoryFiles) {
        try {
            const content = fs.readFileSync(item.path, 'utf8');
            const lowerContent = content.toLowerCase();
            const lowerTitle = item.title.toLowerCase();

            let score = 0;
            for (const term of terms) {
                if (lowerTitle.includes(term)) score += 3;
                if (lowerContent.includes(term)) score += 1;
            }

            if (score > 0 || terms.length === 0) {
                scored.push({
                    ...item,
                    content,
                    score
                });
            }
        } catch (_) {}
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    const topItems = scored.slice(0, maxItems);

    if (topItems.length === 0) return '';

    const lines = ['### 🧠 Case Memory & Knowledge Notes:'];
    for (const item of topItems) {
        const cleanBody = item.content.trim().slice(0, 500).replace(/\n+/g, ' ');
        lines.push(`- **[${item.type}: ${item.title.replace(/\.md$/i, '')}]**: ${cleanBody}`);
    }

    return lines.join('\n\n');
}

module.exports = {
    resolvePromptVariables,
    buildMemoryContext
};
