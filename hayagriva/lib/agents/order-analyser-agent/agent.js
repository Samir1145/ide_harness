const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../core/llm-client');
const { ragRetrieve, formatContextBlock } = require('../skills/rag-retrieve');
const { extractDates } = require('../skills/entity-extract');
const { writeCaseKV } = require('../skills/kv-write');
const { appendTableRow, appendToMarkdown } = require('../skills/md-append');

class OrderAnalyserAgent {
    constructor() {
        this.name = 'OrderAnalyserAgent';
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Order Analyser Agent] Analysing tribunal order...`);

        // 1. Find the most recently indexed order document
        const orderQueries = [
            'order passed judgment tribunal court NCLT NCLAT',
            'direction liberty granted compliance within',
            'operative paragraph ordered directed',
            'matter adjourned next date listed for',
            'petitioner respondent counsel submissions heard',
        ];

        let orderChunks = [];
        for (const q of orderQueries) {
            const chunks = await ragRetrieve(caseDir, q, 2);
            orderChunks = orderChunks.concat(chunks);
        }
        // Deduplicate
        const seen = new Set();
        orderChunks = orderChunks.filter(c => {
            const k = `${c.docName}::${c.title}`;
            if (seen.has(k)) return false;
            seen.add(k); return true;
        });

        const orderText = orderChunks.map(c => c.content).join('\n\n');

        // 2. LLM structured extraction of order components
        const extractionPrompt = `You are a legal order decoder for Indian insolvency proceedings. 
Analyse the following tribunal order excerpts and extract:

Return ONLY valid JSON with this structure:
{
  "court": "NCLT/NCLAT/SC/HC/Other",
  "case_number": "case number if visible",
  "order_date": "date of order",
  "findings": ["finding 1", "finding 2"],
  "directions": [{"action": "what must be done", "party": "who must do it", "deadline": "by when or null"}],
  "liberty": ["liberty clause 1"],
  "next_date": "next hearing date or null",
  "compliance_items": [{"item": "compliance action", "deadline": "date or null", "party": "who"}]
}

Order excerpts:
"""
${orderText.substring(0, 2000)}
"""`;

        let orderData = { findings: [], directions: [], liberty: [], compliance_items: [], next_date: null };
        try {
            const raw = await getChatResponse([
                { role: 'system', content: 'You are a precise legal order decoder. Return only valid JSON.' },
                { role: 'user', content: extractionPrompt }
            ], { caseDir });
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) orderData = JSON.parse(jsonMatch[0]);
        } catch (e) {
            console.error(`[Order Analyser] LLM extraction failed:`, e.message);
        }

        // 3. Write compliance items to litigation_tracker.md
        for (const item of (orderData.compliance_items || [])) {
            appendTableRow(
                caseDir,
                'litigation_tracker.md',
                ['Action', 'Party Responsible', 'Deadline', 'Source Order'],
                [item.item || '—', item.party || '—', item.deadline || 'Not specified', orderChunks[0]?.docName || 'Order'],
                this.name
            );
        }

        // Write next hearing date to KV
        if (orderData.next_date) {
            writeCaseKV(caseDir, 'next_hearing_date', orderData.next_date, orderChunks[0]?.docName || 'Order', this.name);
        }
        if (orderData.order_date) {
            writeCaseKV(caseDir, 'last_order_date', orderData.order_date, orderChunks[0]?.docName || 'Order', this.name);
        }

        // 4. Build formatted summary block
        const directionsText = (orderData.directions || []).map((d, i) =>
            `${i+1}. **${d.action}** — Party: ${d.party || '—'} | Deadline: ${d.deadline || 'Not specified'}`
        ).join('\n');

        const findingsText = (orderData.findings || []).slice(0, 5).map((f, i) => `${i+1}. ${f}`).join('\n');

        const summaryBlock = `[Order Analysis]
Court: ${orderData.court || 'Unknown'} | Case No: ${orderData.case_number || '—'} | Date: ${orderData.order_date || '—'}

Findings (${(orderData.findings || []).length}):
${findingsText || 'None extracted'}

Directions (${(orderData.directions || []).length}):
${directionsText || 'None extracted'}

Next Date: ${orderData.next_date || 'Not mentioned'}
Compliance items written to litigation_tracker.md: ${(orderData.compliance_items || []).length}`;

        const messages = [{
            role: 'system',
            content: `You are HAYAGRIVA, a legal AI. You have decoded a tribunal order. 
Summarise: (1) the key findings and what they mean for the case, (2) every direction that requires action and its urgency, 
(3) any compliance deadlines that must not be missed (contempt risk). Be precise and actionable.`
        }];
        history.forEach(h => messages.push({ role: h.role, content: h.content }));
        messages.push({
            role: 'user',
            content: `${summaryBlock}\n\n${formatContextBlock(orderChunks.slice(0, 2), 'Order Document Excerpts')}\n\n[User Message]\n${userMessage}`
        });

        return await getChatResponse(messages, { caseDir });
    }
}

module.exports = OrderAnalyserAgent;
