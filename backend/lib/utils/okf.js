const matter = require('gray-matter');

function formatMarkdownWithFrontmatter({ title, docName, tags = [], links = [], content, pageIndex, pageEnd, sourceDocument, ancestors = [], ...customData }) {
    const data = {
        title,
        tags,
        links,
        timestamp: new Date().toISOString(),
        okf_version: '0.1',
        ...customData
    };
    if (ancestors && ancestors.length > 0) {
        data.ancestors = ancestors;
    }
    if (docName !== undefined && docName !== null) {
        data.doc = docName;
    }
    if (pageIndex !== undefined && pageIndex !== null) {
        data.pageIndex = pageIndex;
    }
    if (pageEnd !== undefined && pageEnd !== null) {
        data.pageEnd = pageEnd;
    }
    if (sourceDocument) {
        data.sourceDocument = sourceDocument;
    }
    return matter.stringify(content, data);
}

function parseMarkdownWithFrontmatter(text) {
    const parsed = matter(text);
    return { frontmatter: parsed.data, body: parsed.content };
}

module.exports = { formatMarkdownWithFrontmatter, parseMarkdownWithFrontmatter };
