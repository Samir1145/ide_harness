const fs = require('fs');
const path = require('path');

function indexPath(caseDir) {
    return path.join(caseDir, 'concepts', 'index.json');
}

function readIndex(caseDir) {
    const file = indexPath(caseDir);
    if (!fs.existsSync(file)) {
        return { okf_version: '0.1', caseName: path.basename(caseDir), updatedAt: new Date().toISOString(), documents: [] };
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        console.error(`[Indexer] Failed to parse index.json at ${file}:`, e.message);
        return { okf_version: '0.1', caseName: path.basename(caseDir), updatedAt: new Date().toISOString(), documents: [] };
    }
}

function writeIndexMd(caseDir, index) {
    let md = `# Case Index: ${index.caseName}\n\n`;
    md += `*Last Updated: ${index.updatedAt}*\n\n`;
    md += `## Documents\n\n`;
    for (const doc of index.documents) {
        md += `### ${doc.title} (${doc.type})\n`;
        md += `* **File**: \`${doc.filename}\`\n`;
        md += `* **Pages/Chunks**: ${doc.sections}\n`;
        md += `* **Priority**: ${doc.priority || 5}\n`;
        if (doc.documentDate) {
            md += `* **Document Date**: ${doc.documentDate}\n`;
        }
        md += `* **Tags**: ${doc.tags ? doc.tags.join(', ') : ''}\n\n`;
        
        if (doc.sectionTitles && doc.sectionTitles.length > 0) {
            md += `#### Concept Chunks:\n`;
            for (const secTitle of doc.sectionTitles) {
                md += `* [[${secTitle}]]\n`;
            }
            md += `\n`;
        }
    const conversionsDir = path.join(caseDir, 'conversions');
    fs.mkdirSync(conversionsDir, { recursive: true });
    const targetIndexMd = path.join(conversionsDir, 'index.md');
    fs.writeFileSync(targetIndexMd, md, 'utf8');

    const legacyIndexMd = path.join(caseDir, 'index.md');
    if (fs.existsSync(legacyIndexMd) && path.resolve(legacyIndexMd) !== path.resolve(targetIndexMd)) {
        try { fs.unlinkSync(legacyIndexMd); } catch (_) {}
    }
}

function writeIndex(caseDir, index) {
    index.updatedAt = new Date().toISOString();
    const file = indexPath(caseDir);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(index, null, 2) + '\n');
    writeIndexMd(caseDir, index);
}

function upsertDocument(index, doc) {
    const idx = index.documents.findIndex(d => d.filename === doc.filename);
    const updatedDoc = {
        priority: doc.priority || 5,
        documentDate: doc.documentDate || null,
        ...doc
    };
    if (idx >= 0) {
        index.documents[idx] = updatedDoc;
    } else {
        index.documents.push(updatedDoc);
    }
    return index;
}

module.exports = { indexPath, readIndex, writeIndex, upsertDocument };
