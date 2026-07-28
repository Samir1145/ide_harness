/**
 * Skill: timeline-build.js
 * Reconstructs a complete chronological case timeline by scanning all indexed
 * documents for dated events and sorting them temporally.
 *
 * Used by @timeline agent and injected into @nclt, @document for context.
 */

const fs = require('fs');
const path = require('path');
const { ragRetrieve } = require('./rag-retrieve');
const { extractDates } = require('./entity-extract');
const { getChatResponse } = require('../../core/llm-client');

// Months map for date parsing
const MONTHS = {
    january:1, february:2, march:3, april:4, may:5, june:6,
    july:7, august:8, september:9, october:10, november:11, december:12,
    jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12
};

/**
 * Attempt to parse a date string to a sortable timestamp.
 * Returns null if parsing fails.
 * @param {string} raw
 * @returns {Date|null}
 */
function parseDate(raw) {
    try {
        // DD Month YYYY
        const m1 = raw.match(/(\d{1,2})\s+([a-z]+)\.?,?\s+(\d{4})/i);
        if (m1) {
            const mon = MONTHS[m1[2].toLowerCase()];
            if (mon) return new Date(parseInt(m1[3]), mon - 1, parseInt(m1[1]));
        }
        // DD/MM/YYYY or DD-MM-YYYY
        const m2 = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (m2) return new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]));
        // ISO
        const d = new Date(raw);
        if (!isNaN(d)) return d;
        return null;
    } catch { return null; }
}

/**
 * Searches all case documents for dated events using multiple targeted RAG queries.
 * @param {string} caseDir
 * @returns {Promise<Array<{date: string, event: string, source: string, sortKey: Date|null}>>}
 */
async function buildTimeline(caseDir) {
    const queries = [
        'date of default first default payment missed',
        'date of admission NCLT admitted application order',
        'date of CIRP commencement insolvency resolution process commenced',
        'date of appointment IRP RP resolution professional appointed',
        'committee of creditors constituted first meeting',
        'resolution plan submitted approved',
        'corporate debtor incorporated date of incorporation',
        'loan agreement executed sanctioned disbursed',
        'notice demand legal notice sent served',
        'date of filing petition application filed',
        'hearing next date order passed',
        'liquidation order passed liquidator appointed',
        'public announcement made published'
    ];

    const allEvents = [];
    const seen = new Set();

    for (const q of queries) {
        const chunks = await ragRetrieve(caseDir, q, 3);
        for (const chunk of chunks) {
            const dates = extractDates(chunk.content);
            if (dates.length === 0) continue;

            // Use LLM to extract the event description for each date found
            try {
                const prompt = `From this legal document excerpt, extract up to 3 dated events. For each event return JSON array:
[{"date": "DD Month YYYY", "event": "one-line factual description", "source": "${chunk.docName}"}]
Only return events with a clear date. Return ONLY the JSON array.

Excerpt:
"""
${chunk.content.substring(0, 800)}
"""`;

                const raw = await getChatResponse([
                    { role: 'system', content: 'You are a precise timeline extractor. Return only valid JSON array.' },
                    { role: 'user', content: prompt }
                ], { caseDir });

                const arrMatch = raw.match(/\[[\s\S]*?\]/);
                if (arrMatch) {
                    const events = JSON.parse(arrMatch[0]);
                    for (const ev of events) {
                        const key = `${ev.date}::${ev.event}`;
                        if (!seen.has(key) && ev.date && ev.event) {
                            seen.add(key);
                            allEvents.push({
                                date: ev.date,
                                event: ev.event,
                                source: ev.source || chunk.docName,
                                sortKey: parseDate(ev.date)
                            });
                        }
                    }
                }
            } catch (e) {
                // Non-fatal: just skip this chunk
            }
        }
    }

    // Sort chronologically; null dates go to end
    allEvents.sort((a, b) => {
        if (!a.sortKey && !b.sortKey) return 0;
        if (!a.sortKey) return 1;
        if (!b.sortKey) return -1;
        return a.sortKey - b.sortKey;
    });

    return allEvents;
}

/**
 * Writes the timeline to timeline.md in the case directory.
 * @param {string} caseDir
 * @param {Array} events - Output of buildTimeline()
 */
function writeTimelineMarkdown(caseDir, events) {
    const lines = [
        '# Case Timeline\n',
        '| # | Date | Event | Source |',
        '|---|------|-------|--------|',
    ];
    events.forEach((ev, i) => {
        const row = `| ${i + 1} | ${ev.date} | ${ev.event.replace(/\|/g, '\\|')} | ${ev.source} |`;
        lines.push(row);
    });

    const content = lines.join('\n') + '\n';
    const filePath = path.join(caseDir, 'timeline.md');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[Skill:timelineBuild] Written ${events.length} events to timeline.md`);
    return filePath;
}

/**
 * Format timeline as an injection-ready string block for LLM prompts.
 * @param {Array} events
 * @returns {string}
 */
function formatTimelineBlock(events) {
    if (!events || events.length === 0) return '';
    let block = 'Case Chronology:\n';
    events.forEach((ev, i) => {
        block += `${i + 1}. [${ev.date}] ${ev.event} (Source: ${ev.source})\n`;
    });
    return block;
}

module.exports = { buildTimeline, writeTimelineMarkdown, formatTimelineBlock };
