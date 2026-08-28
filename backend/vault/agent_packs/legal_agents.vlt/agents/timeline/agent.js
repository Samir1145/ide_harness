const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../../../../lib/core/llm-client');
const { buildTimeline, writeTimelineMarkdown, formatTimelineBlock } = require('../../../../../lib/agents/skills/timeline-build');
const { writeCaseKV } = require('../../../../../lib/agents/skills/kv-write');
const { buildLiteFallback } = require('../../../../../lib/agents/skills/lite-fallback');

class TimelineAgent {
    constructor() {
        this.name = 'TimelineAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        this.instructions = fs.readFileSync(instructionsPath, 'utf8');
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Timeline Agent] Reconstructing case chronology...`);

        // 1. Build timeline from all case documents
        const events = await buildTimeline(caseDir);

        // 2. Write timeline.md to case folder
        const filePath = writeTimelineMarkdown(caseDir, events);

        // 3. Extract and persist key legal dates to KV dictionary
        const dateKeywords = {
            'date_of_default': ['default', 'first default', 'payment missed', 'npa'],
            'date_of_admission': ['admitted', 'admission', 'nclt admitted', 'application admitted'],
            'date_of_cirp_commencement': ['cirp commencement', 'insolvency resolution process commenced', 'cirp commenced'],
            'date_of_irp_appointment': ['irp appointed', 'interim resolution professional appointed'],
            'date_of_rp_appointment': ['rp appointed', 'resolution professional appointed'],
            'date_of_coc_constitution': ['committee of creditors constituted', 'coc constituted', 'first coc meeting'],
            'date_of_resolution_plan': ['resolution plan submitted', 'resolution plan approved'],
            'date_of_liquidation': ['liquidation ordered', 'liquidation commenced', 'liquidator appointed'],
        };

        let kvWritten = 0;
        for (const event of events) {
            const evLower = event.event.toLowerCase();
            for (const [kvKey, keywords] of Object.entries(dateKeywords)) {
                if (keywords.some(kw => evLower.includes(kw))) {
                    writeCaseKV(caseDir, kvKey, event.date, event.source, this.name);
                    kvWritten++;
                    break;
                }
            }
        }

        // 4. Build LLM summary of the timeline
        const timelineBlock = formatTimelineBlock(events);
        const messages = [
            {
                role: 'system',
                content: `You are HAYAGRIVA, a legal AI. You have just reconstructed a case chronology. 
Present a clear, concise narrative summary of the key events in the case timeline. 
Highlight: date of default, CIRP commencement, key milestones, and any unusual gaps or sequences.`
            }
        ];
        history.forEach(h => messages.push({ role: h.role, content: h.content }));
        messages.push({
            role: 'user',
            content: `[Reconstructed Timeline — ${events.length} events found]\n${timelineBlock}\n\n[Key Dates Written to Case Dictionary: ${kvWritten}]\n\n[User Message]\n${userMessage}`
        });

        try {
            const summary = await getChatResponse(messages, { caseDir });
            return `${summary}\n\n---\n📄 **timeline.md** written to case folder (${events.length} events). ${kvWritten} key dates saved to case dictionary.`;
        } catch (e) {
            if (e.code === 'LITE_MODE' || e.code === 'CONTEXT_EXCEEDED') {
                return `> ℹ️ **Lite Mode** — LLM narrative unavailable. Raw reconstructed timeline below.\n\n` +
                       `**${events.length} events reconstructed. ${kvWritten} key dates saved to case dictionary.**\n\n` +
                       timelineBlock +
                       `\n\n---\n📄 **timeline.md** written to case folder.`;
            }
            throw e;
        }

    }
}

module.exports = TimelineAgent;
