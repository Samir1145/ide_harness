const assert = require('assert');
const fs = require('fs');
const path = require('path');
const routesModule = require('../lib/routes');

const docsRoot = path.join(__dirname, '..', '..');

async function run() {
    console.log('[Case Graph Viewer Unit Tests]');

    const caseName = 'Case_UnitTest_Graph';
    const caseDir = path.join(docsRoot, caseName);
    const conceptsDir = path.join(caseDir, 'concepts');
    const docName = 'services_doc';
    const docConceptsDir = path.join(conceptsDir, docName);
    const wikiDir = path.join(caseDir, 'wiki');

    // Create folder structures
    if (!fs.existsSync(docConceptsDir)) {
        fs.mkdirSync(docConceptsDir, { recursive: true });
    }
    if (!fs.existsSync(wikiDir)) {
        fs.mkdirSync(wikiDir, { recursive: true });
    }

    // Write a mock concept card with links and ancestors
    const mockConceptPath = path.join(docConceptsDir, 'Scope.md');
    fs.writeFileSync(mockConceptPath, `---
title: Scope of Work
ancestors: [services_doc, Services Agreement]
links: [Payment Terms, Indemnity]
---
# Scope
This contract details the scope of work.`, 'utf8');

    // Write a second mock concept card to resolve a link
    const mockConcept2Path = path.join(docConceptsDir, 'Payment.md');
    fs.writeFileSync(mockConcept2Path, `---
title: Payment Terms
ancestors: [services_doc, Services Agreement]
links: []
---
# Payment Terms
Details on fees and timeline.`, 'utf8');

    // Write a mock wiki card
    const mockWikiPath = path.join(wikiDir, 'Research_Notes.md');
    fs.writeFileSync(mockWikiPath, `---
title: Research Notes
links: [Scope of Work]
---
# Research Notes
Mock case law summaries.`, 'utf8');

    console.log('  -> Created mock case, concepts, and wiki cards.');

    try {
        console.log('  -> Querying /api/hayagriva/case-graph in-process...');
        const handler = routesModule['GET']['/api/hayagriva/case-graph'];
        assert.ok(typeof handler === 'function', 'Case-graph route handler should exist');

        let responseStatus = 0;
        let responseBody = '';
        const mockRes = {
            writeHead(status) {
                responseStatus = status;
            },
            end(data) {
                responseBody = data;
            }
        };
        const mockParsedUrl = {
            query: { case: caseName }
        };

        handler(null, mockRes, mockParsedUrl, docsRoot);

        assert.strictEqual(responseStatus, 200, 'HTTP response status should be 200');
        const parsed = JSON.parse(responseBody);
        
        assert.ok(parsed && parsed.nodes && parsed.links, 'Response must contain nodes and links');
        console.log(`     Compiled ${parsed.nodes.length} nodes and ${parsed.links.length} edges`);

        // Check node types
        const docNode = parsed.nodes.find(n => n.type === 'document' && n.name === docName);
        const conceptNode = parsed.nodes.find(n => n.type === 'concept' && n.name === 'Scope of Work');
        const wikiNode = parsed.nodes.find(n => n.type === 'wiki' && n.name === 'Research Notes');

        assert.ok(docNode, 'Should include parent document node');
        assert.ok(conceptNode, 'Should include concept card node');
        assert.ok(wikiNode, 'Should include wiki card node');

        // Check edge resolving (hierarchy parent-child)
        const hierarchyLink = parsed.links.find(l => l.source === docNode.id && l.target === conceptNode.id);
        assert.ok(hierarchyLink, 'Should establish parent-child relationship edge');
        assert.strictEqual(hierarchyLink.type, 'hierarchy', 'Parent-child links should be marked hierarchy');

        // Check reference link resolution (Scope of Work linking to Payment Terms)
        const paymentNode = parsed.nodes.find(n => n.name === 'Payment Terms');
        assert.ok(paymentNode, 'Payment Terms concept node should exist');
        
        const referenceLink = parsed.links.find(l => l.source === conceptNode.id && l.target === paymentNode.id);
        assert.ok(referenceLink, 'Should resolve internal cross-references to edges');
        assert.strictEqual(referenceLink.type, 'reference', 'Cross-references should be marked reference');

        // Check wiki reference link resolution (Research Notes linking to Scope of Work)
        const wikiReference = parsed.links.find(l => l.source === wikiNode.id && l.target === conceptNode.id);
        assert.ok(wikiReference, 'Wiki notes links should resolve to concept card edges');

        console.log('     ✓ In-process case-graph builder succeeded.');

    } finally {
        // Cleanup all mock files
        if (fs.existsSync(mockConceptPath)) fs.unlinkSync(mockConceptPath);
        if (fs.existsSync(mockConcept2Path)) fs.unlinkSync(mockConcept2Path);
        if (fs.existsSync(mockWikiPath)) fs.unlinkSync(mockWikiPath);
        if (fs.existsSync(docConceptsDir)) fs.rmdirSync(docConceptsDir);
        if (fs.existsSync(conceptsDir)) fs.rmdirSync(conceptsDir);
        if (fs.existsSync(wikiDir)) fs.rmdirSync(wikiDir);
        if (fs.existsSync(caseDir)) {
            fs.rmdirSync(caseDir);
            console.log('  -> Cleaned up mock case directories.');
        }
    }

    console.log('  ✓ SUCCESS: Case Graph Viewer validations completed!');
}

module.exports = { run };
