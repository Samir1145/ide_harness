const fs = require('fs');
const path = require('path');
const { getConceptsDir } = require('../../../../../lib/pipeline/common/helper');
const { getChatResponse } = require('../../../../../lib/core/llm-client');
const { ragRetrieve } = require('../../../../../lib/agents/skills/rag-retrieve');
const { extractEntities } = require('../../../../../lib/agents/skills/entity-extract');
const { readAllKV } = require('../../../../../lib/agents/skills/kv-write');
const { appendToMarkdown } = require('../../../../../lib/agents/skills/md-append');
const { buildLiteFallback } = require('../../../../../lib/agents/skills/lite-fallback');

class EntityGraphAgent {
    constructor() {
        this.name = 'EntityGraphAgent';
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Entity Graph Agent] Building entity relationship graph...`);

        // 1. RAG queries covering all entity relationship types
        const entityQueries = [
            'director shareholder promoter company ownership',
            'holding company subsidiary related party affiliate',
            'financial creditor bank lender guarantor',
            'operational creditor supplier vendor',
            'resolution professional IRP RP appointed',
            'corporate debtor company name CIN',
            'personal guarantor guarantee corporate guarantee',
            'committee of creditors CoC members',
        ];

        const nodes = new Map();   // id → { id, label, type, count }
        const edges = [];          // { from, to, relation, source }

        for (const q of entityQueries) {
            const chunks = await ragRetrieve(caseDir, q, 2);
            for (const chunk of chunks) {
                try {
                    const entities = await extractEntities(chunk.content, caseDir);

                    // Add company nodes
                    for (const company of (entities.companies || [])) {
                        const id = company.toLowerCase().replace(/\s+/g, '_');
                        if (!nodes.has(id)) nodes.set(id, { id, label: company, type: 'company', count: 0 });
                        nodes.get(id).count++;
                    }

                    // Add person nodes
                    for (const person of (entities.persons || [])) {
                        const id = person.toLowerCase().replace(/\s+/g, '_');
                        if (!nodes.has(id)) nodes.set(id, { id, label: person, type: 'person', count: 0 });
                        nodes.get(id).count++;
                    }

                    // Add party nodes and edges
                    const parties = entities.parties || [];
                    for (let i = 0; i < parties.length - 1; i++) {
                        const fromId = parties[i].toLowerCase().replace(/\s+/g, '_');
                        const toId   = parties[i+1].toLowerCase().replace(/\s+/g, '_');
                        if (!nodes.has(fromId)) nodes.set(fromId, { id: fromId, label: parties[i], type: 'party', count: 0 });
                        if (!nodes.has(toId))   nodes.set(toId,   { id: toId,   label: parties[i+1], type: 'party', count: 0 });
                        edges.push({ from: fromId, to: toId, relation: 'mentioned_with', source: chunk.docName });
                    }
                } catch (e) { /* non-fatal per chunk */ }
            }
        }

        // 2. Augment with KV dictionary data (known parties)
        const kv = readAllKV(caseDir);
        const knownParties = [
            { key: 'company_name',        type: 'corporate_debtor' },
            { key: 'creditor_name',        type: 'financial_creditor' },
            { key: 'resolution_applicant', type: 'resolution_applicant' },
        ];
        for (const { key, type } of knownParties) {
            if (kv[key]) {
                const id = kv[key].toLowerCase().replace(/\s+/g, '_');
                if (!nodes.has(id)) nodes.set(id, { id, label: kv[key], type, count: 5 });
                else nodes.get(id).type = type; // Upgrade type if known
            }
        }

        const graphData = {
            nodes: Array.from(nodes.values()),
            edges,
            generated_at: new Date().toISOString(),
            case_dir: caseDir,
        };

        // 3. Save entity_graph.json to case concepts folder
        const graphPath = path.join(getConceptsDir(caseDir), 'entity_graph.json');
        fs.mkdirSync(path.dirname(graphPath), { recursive: true });
        fs.writeFileSync(graphPath, JSON.stringify(graphData, null, 2), 'utf8');

        // 4. Write markdown entity list to entity_graph.md
        const nodeList = Array.from(nodes.values())
            .sort((a, b) => b.count - a.count)
            .map(n => `| ${n.label} | ${n.type} | ${n.count} |`)
            .join('\n');

        appendToMarkdown(caseDir, 'entity_graph.md', '## Entity Map',
            `| Entity | Type | References |\n|---|---|---|\n${nodeList}`, this.name);

        // 5. LLM narrative summary
        const messages = [{
            role: 'system',
            content: `You are HAYAGRIVA. You have just mapped the legal entity relationship graph for this case.
Summarise: (1) the key entities and their roles, (2) any significant relationships or ownership structures, 
(3) any potential conflict of interest or related-party flags. The entity_graph.json has been saved and will be visualised in the D3.js Case Graph Viewer.`
        }];
        history.forEach(h => messages.push({ role: h.role, content: h.content }));
        messages.push({
            role: 'user',
            content: `[Entity Graph Built]\n- Nodes: ${graphData.nodes.length}\n- Edges: ${edges.length}\n- Saved: concepts/entity_graph.json\n\nTop entities:\n${Array.from(nodes.values()).sort((a,b) => b.count-a.count).slice(0,10).map(n => `- ${n.label} (${n.type})`).join('\n')}\n\n[User Message]\n${userMessage}`
        });

        try {
            const summary = await getChatResponse(messages, { caseDir });
            return `${summary}\n\n---\n🗺️ **entity_graph.json** saved to case folder (${graphData.nodes.length} nodes, ${edges.length} edges). Open the D3.js Case Graph Viewer to visualise.`;
        } catch (e) {
            if (e.code === 'LITE_MODE' || e.code === 'CONTEXT_EXCEEDED') {
                const topNodes = Array.from(nodes.values())
                    .sort((a, b) => b.count - a.count).slice(0, 15)
                    .map(n => `- **${n.label}** *(${n.type})*`)
                    .join('\n');
                return `> ℹ️ **Lite Mode** — LLM narrative unavailable. Raw entity graph below.\n\n` +
                       `#### 🕸️ Entity Graph — ${graphData.nodes.length} Nodes, ${edges.length} Edges\n\n` +
                       `**Top Entities:**\n${topNodes}\n\n` +
                       `---\n🗺️ **entity_graph.json** saved to case folder. Open the D3.js Case Graph Viewer to visualise.`;
            }
            throw e;
        }

    }
}

module.exports = EntityGraphAgent;
