const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const bm25 = require('../../core/bm25');
const { splitDocument, extractKeyTopics } = require('../../core/splitter');
const { formatMarkdownWithFrontmatter } = require('../../utils/okf');
const { getSafeFilename, setupConceptsDir, cleanBm25Index, probeLayoutProfile, getConceptsDir } = require('./helper');
const { getChatResponse } = require('../../core/llm-client');

/**
 * Scans existing markdown concept files inside the caseDir concepts root,
 * excluding the current document folder.
 */
function getExistingTopics(caseDir, currentBasename) {
    const conceptsRoot = getConceptsDir(caseDir);
    const topics = [];
    if (!fs.existsSync(conceptsRoot)) return topics;

    const dirs = fs.readdirSync(conceptsRoot).filter(f => {
        const p = path.join(conceptsRoot, f);
        return fs.statSync(p).isDirectory() && f !== currentBasename;
    });

    for (const d of dirs) {
        const files = fs.readdirSync(path.join(conceptsRoot, d)).filter(f => f.endsWith('.md'));
        for (const f of files) {
            const fullPath = path.join(conceptsRoot, d, f);
            try {
                const fileContent = fs.readFileSync(fullPath, 'utf8');
                const fileMatter = matter(fileContent);
                if (fileMatter.data && fileMatter.data.title) {
                    topics.push({
                        title: fileMatter.data.title,
                        path: fullPath,
                        docName: d,
                        content: fileMatter.content || ''
                    });
                }
            } catch (e) {}
        }
    }
    return topics;
}

/**
 * Invokes LLM to check if a new section maps to an existing case topic.
 */
async function resolveTopicMerge(newTitle, newContent, existingTopics) {
    if (existingTopics.length === 0) return { action: 'NEW' };

    const existingTitlesList = existingTopics.map(t => t.title).join(', ');
    const prompt = `
You are an intelligent knowledge base manager.
Decide if the following new section content maps directly to an existing topic, or if it is a new topic.

Existing Topics:
${existingTitlesList}

New Section Title: "${newTitle}"
New Section Content (snippet): "${newContent.substring(0, 1000)}"

If this section strongly relates to an existing topic and should be merged, return a JSON object with schema:
{"action": "MERGE", "targetTitle": "Exact Title of the Existing Topic"}

If it is a distinct new topic, return a JSON object with schema:
{"action": "NEW", "title": "${newTitle.replace(/"/g, '\\"')}"}

Return ONLY valid JSON.
`;

    try {
        const response = await getChatResponse([{ role: 'user', content: prompt }], { model: 'gemini-1.5-flash' });
        const cleaned = response.trim().replace(/^```json/, '').replace(/```$/, '').trim();
        const parsed = JSON.parse(cleaned);
        return parsed;
    } catch (e) {
        console.warn('[Merge Engine] Decision failed, defaulting to NEW:', e.message);
        return { action: 'NEW' };
    }
}

/**
 * Handles text/markdown ingestion: splits text into sections, writes chunk md files, and indexes in BM25.
 * Leverages intelligent append to merge related sections.
 */
async function ingestText(caseDir, filePath, bm25Index, bm25IndexFile) {
    const ext = path.extname(filePath).toLowerCase();
    const relative = path.relative(caseDir, filePath);
    const basename = path.basename(filePath, ext);
    const subfolder = path.dirname(relative);
    const safeSubfolder = subfolder === '.' ? '' : subfolder.replace(/^conversions[\\/]?/, '');

    console.log(`[Text Ingestion] Slicing text/markdown file: ${relative}`);

    // Setup folder structures
    const conceptsDir = setupConceptsDir(caseDir, basename);
    cleanBm25Index(bm25Index, basename);

    const rawContent = fs.readFileSync(filePath, 'utf8');
    let markdown = rawContent;

    // Load any frontmatter tags
    let priority = 5;
    let documentDate = null;
    try {
        const fileMatter = matter(rawContent);
        if (fileMatter.data) {
            if (fileMatter.data.priority !== undefined) priority = fileMatter.data.priority;
            if (fileMatter.data.documentDate !== undefined) documentDate = fileMatter.data.documentDate;
            if (fileMatter.content) {
                markdown = fileMatter.content;
            }
        }
    } catch (err) {
        console.error('[Text Ingestion] Failed to parse gray-matter:', err.message);
    }

    // Profile heading regex
    const layoutRegex = await probeLayoutProfile(filePath, markdown);

    // Split text into section chunks
    const sections = splitDocument(markdown, filePath, 'default', 'option_1', '', layoutRegex);

    const shadowDocuments = [];
    const sectionTitles = [];

    // Scan existing topics for potential merge
    const apiKey = process.env.GEMINI_API_KEY;
    const existingTopics = apiKey ? getExistingTopics(caseDir, basename) : [];

    const allConceptTitles = new Set();
    const conceptTitleMap = {};
    for (const t of existingTopics) {
        const key = t.title.toLowerCase().trim();
        allConceptTitles.add(key);
        conceptTitleMap[key] = t.title;
    }
    for (const s of sections) {
        const key = s.title.toLowerCase().trim();
        allConceptTitles.add(key);
        conceptTitleMap[key] = s.title;
    }

    const pathStack = [{ title: basename, level: 0 }];
    for (const sec of sections) {
        const level = sec.level || 2;
        while (pathStack.length > 1 && pathStack[pathStack.length - 1].level >= level) {
            pathStack.pop();
        }
        const ancestors = pathStack.map(p => p.title);
        const parentPath = pathStack.map(p => p.title).join(' > ');
        pathStack.push({ title: sec.title, level });

        const safeTitle = getSafeFilename(sec.title);
        const mdPath = path.join(conceptsDir, `${safeTitle}.md`);
        const autoTopics = extractKeyTopics(sec.content);
        const tags = [safeSubfolder, basename, 'section'].concat(autoTopics).filter(Boolean);

        let body = sec.content.startsWith('#') ? sec.content : `# ${sec.title}\n\n${sec.content}`;
        
        // Extract internal links from MD section block
        const links = [];
        const linkRegex = /\[\[([^\]]+)\]\]/g;
        let match;
        while ((match = linkRegex.exec(body)) !== null) {
            links.push(match[1]);
        }
        const uniqueLinks = Array.from(new Set(links));

        // Auto-Concept Linking
        const autoLinks = [];
        for (const titleKey of allConceptTitles) {
            if (titleKey === sec.title.toLowerCase().trim()) continue;
            const escaped = titleKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const rx = new RegExp(`\\b${escaped}\\b`, 'i');
            if (rx.test(body)) {
                const originalTitle = conceptTitleMap[titleKey] || titleKey;
                autoLinks.push(originalTitle);
            }
        }
        const finalLinks = Array.from(new Set(uniqueLinks.concat(autoLinks)));

        let mergedTopicPath = null;
        let isMerged = false;

        if (existingTopics.length > 0) {
            const decision = await resolveTopicMerge(sec.title, sec.content, existingTopics);
            if (decision.action === 'MERGE') {
                const target = existingTopics.find(t => t.title === decision.targetTitle);
                if (target) {
                    mergedTopicPath = target.path;
                    isMerged = true;
                    console.log(`[Text Ingestion] Merging section "${sec.title}" into existing topic "${decision.targetTitle}"`);
                }
            }
        }

        if (isMerged && mergedTopicPath) {
            // Append content to existing file
            const appendText = `\n\n## Appended from: ${basename}\n\n${body}\n`;
            fs.appendFileSync(mergedTopicPath, appendText, 'utf8');
            shadowDocuments.push({ path: mergedTopicPath, title: sec.title, tags, links: finalLinks });
            sectionTitles.push(sec.title);

            // Re-index target file in BM25
            const updatedContent = fs.readFileSync(mergedTopicPath, 'utf8');
            const targetDocName = path.basename(path.dirname(mergedTopicPath));
            bm25.addDocument(bm25Index, {
                id: `${targetDocName}::${sec.title}`,
                text: `[Path: ${sec.title}]\n\n${updatedContent}`
            });
        } else {
            // Write standard new concept card
            const mdContent = formatMarkdownWithFrontmatter({
                title: sec.title,
                docName: basename,
                tags,
                links: finalLinks,
                content: body,
                pageIndex: sec.pageIndex || null,
                pageEnd: sec.pageEnd || null,
                sourceDocument: basename,
                priority,
                documentDate,
                ancestors
            });

            fs.writeFileSync(mdPath, mdContent, 'utf8');
            shadowDocuments.push({ path: mdPath, title: sec.title, tags, links: finalLinks });
            sectionTitles.push(sec.title);

            if (body.length > 3000) {
                const subChunks = chunkText(body, 3000, 1);
                subChunks.forEach((chunk, k) => {
                    bm25.addDocument(bm25Index, {
                        id: `${basename}::${sec.title}::${k}`,
                        text: `[Section: ${parentPath} > ${sec.title} (Part ${k + 1})]\n\n${chunk}`
                    });
                });
            } else {
                const indexedText = `[Path: ${parentPath} > ${sec.title}]\n\n${body}`;
                bm25.addDocument(bm25Index, {
                    id: `${basename}::${sec.title}`,
                    text: indexedText
                });
            }
        }
    }

    bm25.saveIndex(bm25Index, bm25IndexFile);

    return {
        sections,
        conceptsDir,
        shadowDocuments,
        sectionTitles,
        basename,
        safeSubfolder,
        relative,
        ext,
        priority,
        documentDate,
        markdown
    };
}

/**
 * Splits text into paragraph blocks with overlap.
 */
function chunkText(text, maxChars = 3000, overlapParas = 1) {
    const paras = text.split(/\n\s*\n/).filter(p => p.trim());
    const chunks = [];
    let currentChunk = [];
    let currentLen = 0;
    
    for (let i = 0; i < paras.length; i++) {
        const p = paras[i];
        currentChunk.push(p);
        currentLen += p.length;
        
        if (currentLen >= maxChars || i === paras.length - 1) {
            chunks.push(currentChunk.join('\n\n'));
            if (overlapParas > 0 && i < paras.length - 1) {
                currentChunk = currentChunk.slice(-overlapParas);
                currentLen = currentChunk.reduce((acc, c) => acc + c.length, 0);
            } else {
                currentChunk = [];
                currentLen = 0;
            }
        }
    }
    return chunks;
}

module.exports = { ingestText };
