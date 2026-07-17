const fs = require('fs');
const path = require('path');
const { parseMarkdownWithFrontmatter } = require('./okf');

function buildTopicOverlap(caseDir) {
    const conceptsRoot = path.join(caseDir, 'concepts');
    const topicMap = new Map(); // cleanTitle -> { title, docs: Set }

    if (!fs.existsSync(conceptsRoot)) {
        return [];
    }

    // Build map of folder titles from index.json
    const indexPath = path.join(conceptsRoot, 'index.json');
    const docMap = new Map(); // title (concepts subfolder) -> original filename
    if (fs.existsSync(indexPath)) {
        try {
            const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
            for (const doc of (idx.documents || [])) {
                docMap.set(doc.title, doc.filename);
            }
        } catch (_) {}
    }

    const items = fs.readdirSync(conceptsRoot);
    for (const item of items) {
        const itemPath = path.join(conceptsRoot, item);
        const stat = fs.statSync(itemPath);
        if (!stat.isDirectory()) continue;

        // Scan all .md files in this doc's concepts directory
        const cards = fs.readdirSync(itemPath).filter(f => f.endsWith('.md'));
        for (const card of cards) {
            const cardPath = path.join(itemPath, card);
            try {
                const text = fs.readFileSync(cardPath, 'utf8');
                const parsed = parseMarkdownWithFrontmatter(text);
                const title = parsed.frontmatter.title || path.basename(card, '.md').replace(/_/g, ' ');
                
                const cleanTitle = title.toLowerCase().trim();
                const docName = docMap.get(item) || parsed.frontmatter.doc || item;

                if (!topicMap.has(cleanTitle)) {
                    topicMap.set(cleanTitle, {
                        title: title,
                        docs: new Set()
                    });
                }
                topicMap.get(cleanTitle).docs.add(docName);
            } catch (err) {
                console.warn(`[Topic Overlap] Failed to parse card ${cardPath}:`, err.message);
            }
        }
    }

    return Array.from(topicMap.values())
        .filter(t => t.docs.size > 1)        // only cross-document topics
        .map(t => ({
            title: t.title,
            documents: Array.from(t.docs),
            count: t.docs.size
        }))
        .sort((a, b) => b.count - a.count);  // most shared first
}

module.exports = { buildTopicOverlap };
