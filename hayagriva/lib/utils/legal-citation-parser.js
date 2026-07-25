/**
 * Indian Legal Citation Parser & Metadata Resolver
 * Extracts and structures Indian Supreme Court, High Court, and Tribunal citation formats.
 */

const CITATION_PATTERNS = [
    // Standard SCC format: (2023) 4 SCC 121
    /\((\d{4})\)\s+(\d+)\s+SCC\s+(\d+)/gi,
    // AIR format: AIR 2021 SC 450
    /AIR\s+(\d{4})\s+(SC|Del|Bom|Cal|Mad)\s+(\d+)/gi,
    // INSC neutral citation: [2022] INSC 85 or 2022 INSC 85
    /\[?(\d{4})\]?\s+INSC\s+(\d+)/gi,
    // SCC OnLine format: 2020 SCC OnLine NCLAT 150
    /(\d{4})\s+SCC\s+OnLine\s+(NCLAT|NCLT|SC|Del|Bom)\s+(\d+)/gi,
    // SCR format: (2019) 12 SCR 340
    /\((\d{4})\)\s+(\d+)\s+SCR\s+(\d+)/gi
];

function extractLegalCitations(text) {
    if (!text || typeof text !== 'string') return [];
    
    const results = [];
    const seen = new Set();

    for (const pattern of CITATION_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const raw = match[0];
            if (!seen.has(raw)) {
                seen.add(raw);
                results.push({
                    raw,
                    year: match[1],
                    volumeOrCourt: match[2],
                    pageOrIndex: match[3]
                });
            }
        }
    }

    return results;
}

function formatCitationLinks(text) {
    if (!text || typeof text !== 'string') return text;
    
    const citations = extractLegalCitations(text);
    let formatted = text;

    for (const item of citations) {
        const link = `[source:citation:${encodeURIComponent(item.raw)}](# "Citation: ${item.raw}")`;
        // Replace raw citation with formatted hover preview link if not already linked
        formatted = formatted.replace(new RegExp(escapeRegExp(item.raw), 'g'), item.raw);
    }

    return formatted;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
    extractLegalCitations,
    formatCitationLinks
};
