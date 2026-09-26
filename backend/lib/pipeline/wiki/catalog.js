const fs = require('fs');
const path = require('path');
const { getWikiDir, getSafeFilename } = require('../common/helper');
const { parseMarkdownWithFrontmatter, formatMarkdownWithFrontmatter } = require('../../utils/okf');
const { getDb } = require('../../core/sqlite-store');

/**
 * Extracts a concise 1-sentence synopsis (max ~140 chars) from markdown content.
 */
function extractSynopsis(content) {
    if (!content) return 'No summary available.';
    const clean = content
        .replace(/^---[\s\S]*?---\r?\n?/, '')  // strip YAML
        .replace(/^#+\s+.*$/gm, '')             // strip headers
        .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1') // unwrap wikilinks
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // unwrap links
        .replace(/`([^`]+)`/g, '$1')            // strip code
        .replace(/\*\*?([^*]+)\*\*?/g, '$1')    // strip bold/italic
        .replace(/\r?\n+/g, ' ')                // collapse lines
        .replace(/\s+/g, ' ')                   // collapse spaces
        .trim();

    if (!clean) return 'Synthesized chamber knowledge.';
    const periodIdx = clean.indexOf('. ');
    if (periodIdx !== -1 && periodIdx <= 160) {
        return clean.substring(0, periodIdx + 1);
    }
    return clean.length > 140 ? clean.substring(0, 140) + '…' : clean;
}

/**
 * Recompiles wiki/INDEX.md catalog file from all insights, sources, and Q&A pages.
 */
function recompileWikiCatalog(caseDir) {
    const wikiDir = getWikiDir(caseDir);
    if (!wikiDir) return { success: false, error: 'Invalid case directory' };

    fs.mkdirSync(wikiDir, { recursive: true });
    const insightsDir = path.join(wikiDir, 'insights');
    const sourcesDir = path.join(wikiDir, 'sources');
    const qnaDir = path.join(wikiDir, 'qna');

    const insights = [];
    if (fs.existsSync(insightsDir)) {
        const files = fs.readdirSync(insightsDir).filter(f => f.endsWith('.md'));
        for (const file of files) {
            const fullPath = path.join(insightsDir, file);
            try {
                const raw = fs.readFileSync(fullPath, 'utf8');
                const { frontmatter, body } = parseMarkdownWithFrontmatter(raw);
                const slug = (frontmatter && frontmatter.slug) || path.parse(file).name;
                const title = (frontmatter && frontmatter.title) || slug.replace(/_/g, ' ');
                const synopsis = extractSynopsis(body);
                insights.push({
                    slug,
                    title,
                    synopsis,
                    filePath: fullPath,
                    relativeSlug: `insights/${slug}`,
                    date: (frontmatter && frontmatter.created_at) || ''
                });
            } catch (_) {}
        }
    }

    const sources = [];
    if (fs.existsSync(sourcesDir)) {
        const files = fs.readdirSync(sourcesDir).filter(f => f.endsWith('.md'));
        for (const file of files) {
            const fullPath = path.join(sourcesDir, file);
            try {
                const raw = fs.readFileSync(fullPath, 'utf8');
                const { frontmatter, body } = parseMarkdownWithFrontmatter(raw);
                const slug = (frontmatter && frontmatter.slug) || path.parse(file).name;
                const title = (frontmatter && frontmatter.title) || slug.replace(/_/g, ' ');
                const synopsis = extractSynopsis(body);
                sources.push({
                    slug,
                    title,
                    synopsis,
                    filePath: fullPath,
                    relativeSlug: `sources/${slug}`
                });
            } catch (_) {}
        }
    }

    const qnas = [];
    if (fs.existsSync(qnaDir)) {
        const files = fs.readdirSync(qnaDir).filter(f => f.endsWith('.md'));
        for (const file of files) {
            const fullPath = path.join(qnaDir, file);
            try {
                const raw = fs.readFileSync(fullPath, 'utf8');
                const { frontmatter, body } = parseMarkdownWithFrontmatter(raw);
                const slug = path.parse(file).name;
                const title = (frontmatter && frontmatter.title) || slug.replace(/_/g, ' ');
                const synopsis = extractSynopsis(body);
                qnas.push({
                    slug,
                    title,
                    synopsis,
                    filePath: fullPath,
                    relativeSlug: `qna/${slug}`
                });
            } catch (_) {}
        }
    }

    // Build INDEX.md Markdown
    const timestamp = new Date().toISOString();
    let indexMd = `# Case Wiki Knowledge Catalog\n\n`;
    indexMd += `*Last compiled: ${timestamp} — ${insights.length} Insights, ${sources.length} Source Summaries, ${qnas.length} Q&A Records*\n\n`;

    if (insights.length > 0) {
        indexMd += `## Synthesized Legal Insights\n`;
        for (const ins of insights) {
            indexMd += `- [[${ins.relativeSlug}]]: **${ins.title}** — ${ins.synopsis}\n`;
        }
        indexMd += `\n`;
    }

    if (sources.length > 0) {
        indexMd += `## Primary Source Summaries\n`;
        for (const src of sources) {
            indexMd += `- [[${src.relativeSlug}]]: **${src.title}** — ${src.synopsis}\n`;
        }
        indexMd += `\n`;
    }

    if (qnas.length > 0) {
        indexMd += `## Q&A Records\n`;
        for (const q of qnas) {
            indexMd += `- [[${q.relativeSlug}]]: **${q.title}** — ${q.synopsis}\n`;
        }
        indexMd += `\n`;
    }

    const indexPath = path.join(wikiDir, 'INDEX.md');
    fs.writeFileSync(indexPath, indexMd, 'utf8');

    // Index INDEX.md into SQLite FTS5 for fast discovery
    try {
        const db = getDb(caseDir);
        const relFilename = 'wiki/INDEX.md';
        db.prepare(`
            INSERT INTO documents (filename, title, status, size_bytes, priority, extracted_at, indexed_at)
            VALUES (?, 'Case Wiki Knowledge Catalog', 'reviewed', ?, 1, datetime('now'), datetime('now'))
            ON CONFLICT(filename) DO UPDATE SET
                size_bytes = excluded.size_bytes,
                indexed_at = datetime('now');
        `).run(relFilename, Buffer.byteLength(indexMd, 'utf8'));

        db.prepare('DELETE FROM fts_chunks WHERE filename = ?').run(relFilename);
        db.prepare(`
            INSERT INTO fts_chunks (filename, section_title, page_number, chunk_index, content)
            VALUES (?, 'Knowledge Catalog', 1, 0, ?)
        `).run(relFilename, indexMd);
    } catch (dbErr) {
        console.warn('[Wiki Catalog] Note on SQLite index update:', dbErr.message);
    }

    return {
        success: true,
        indexPath,
        counts: {
            insights: insights.length,
            sources: sources.length,
            qna: qnas.length
        },
        items: { insights, sources, qnas }
    };
}

/**
 * Files an agent response or legal analysis into wiki/insights/<slug>.md and updates catalog.
 */
async function fileInsight(caseDir, options = {}) {
    const {
        title,
        slug: userSlug,
        query = '',
        answer = '',
        agent = 'AdvisorAgent',
        documentsUsed = [],
        tags = ['insight', 'legal-opinion'],
        verifiedByUser = false
    } = options;

    if (!title || !answer) {
        throw new Error('Both title and answer are required to file a Case Wiki insight.');
    }

    const wikiDir = getWikiDir(caseDir);
    if (!wikiDir) throw new Error('Invalid case directory provided');

    const insightsDir = path.join(wikiDir, 'insights');
    fs.mkdirSync(insightsDir, { recursive: true });

    const rawSlug = userSlug || getSafeFilename(title);
    const slug = rawSlug.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const targetFile = path.join(insightsDir, `${slug}.md`);

    const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;
    const createdAt = new Date().toISOString();

    const frontmatter = {
        title,
        slug,
        source_query: query,
        created_at: createdAt,
        agent,
        documents_used: Array.isArray(documentsUsed) ? documentsUsed : [],
        word_count: wordCount,
        verified_by_user: !!verifiedByUser,
        tags: Array.isArray(tags) ? tags : ['insight']
    };

    let formattedBody = answer.trim();
    if (!formattedBody.startsWith('#')) {
        formattedBody = `# ${title}\n\n${formattedBody}`;
    }

    const fullContent = formatMarkdownWithFrontmatter({
        ...frontmatter,
        content: formattedBody
    });

    fs.writeFileSync(targetFile, fullContent, 'utf8');

    // Index into SQLite FTS5 (fts_chunks) and documents table
    const relativeFilename = `wiki/insights/${slug}.md`;
    try {
        const db = getDb(caseDir);
        db.prepare(`
            INSERT INTO documents (filename, title, status, size_bytes, priority, extracted_at, indexed_at)
            VALUES (?, ?, 'reviewed', ?, 1, datetime('now'), datetime('now'))
            ON CONFLICT(filename) DO UPDATE SET
                title = excluded.title,
                size_bytes = excluded.size_bytes,
                indexed_at = datetime('now');
        `).run(relativeFilename, title, Buffer.byteLength(fullContent, 'utf8'));

        db.prepare('DELETE FROM fts_chunks WHERE filename = ?').run(relativeFilename);
        db.prepare(`
            INSERT INTO fts_chunks (filename, section_title, page_number, chunk_index, content)
            VALUES (?, ?, 1, 0, ?)
        `).run(relativeFilename, title, formattedBody);

        // Optional Vector Embedding
        try {
            const { getEmbedding } = require('../../core/llm-client');
            const vec = await getEmbedding(formattedBody.substring(0, 1500), { vectorType: 'legal', isQuery: false });
            if (vec && Array.isArray(vec) && vec.length > 0) {
                const vecBuffer = Buffer.from(new Float32Array(vec).buffer);
                db.prepare('DELETE FROM document_vectors WHERE filename = ?').run(relativeFilename);
                db.prepare(`
                    INSERT INTO document_vectors (filename, section_title, page_number, chunk_index, content, vector_blob, vector_type)
                    VALUES (?, ?, 1, 0, ?, ?, 'legal')
                `).run(relativeFilename, title, formattedBody.substring(0, 500), vecBuffer);
            }
        } catch (_) {}
    } catch (e) {
        console.warn('[Wiki Catalog] Note on SQLite indexing of insight:', e.message);
    }

    // Recompile the central catalog index
    const catalogResult = recompileWikiCatalog(caseDir);

    return {
        success: true,
        slug,
        title,
        filePath: targetFile,
        relativeFilename,
        wordCount,
        createdAt,
        catalogResult
    };
}

/**
 * Heuristic evaluating whether an AI answer should trigger the "File to Wiki" auto-suggest chip.
 */
function shouldSuggestFiling(answer = '', documentsUsed = []) {
    if (!answer || typeof answer !== 'string') return false;
    const words = answer.trim().split(/\s+/).filter(Boolean).length;
    const numDocs = Array.isArray(documentsUsed) ? documentsUsed.length : 0;

    // Condition A: Dense multi-document synthesis (≥ 250 words and ≥ 3 docs cited)
    if (words >= 250 && numDocs >= 3) return true;

    // Condition B: High-stakes statutory CIRP findings (Section 29A, Avoidance §§ 43/45/50/66, CIRP Admission)
    const statutoryTriggers = /(?:Section 29A|Section 43|Section 45|Section 50|Section 66|Section 30\(2\)|avoidance inquest|contra-sweep|undervalued transaction|fraudulent trading|ineligible resolution applicant)/i;
    if (words >= 180 && statutoryTriggers.test(answer)) return true;

    return false;
}

/**
 * Reads or compiles the Case Wiki catalog.
 */
function getWikiCatalog(caseDir) {
    const wikiDir = getWikiDir(caseDir);
    if (!wikiDir) return { success: false, error: 'Invalid case directory' };

    const indexPath = path.join(wikiDir, 'INDEX.md');
    if (!fs.existsSync(indexPath)) {
        return recompileWikiCatalog(caseDir);
    }

    try {
        const content = fs.readFileSync(indexPath, 'utf8');
        return {
            success: true,
            indexPath,
            content
        };
    } catch (err) {
        return recompileWikiCatalog(caseDir);
    }
}

module.exports = {
    fileInsight,
    recompileWikiCatalog,
    getWikiCatalog,
    shouldSuggestFiling,
    extractSynopsis
};
