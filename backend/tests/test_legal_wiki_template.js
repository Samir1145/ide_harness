'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { generateTiddlyWikiHtml, buildTiddlersFromChunks } = require('../lib/pipeline/wiki/tiddlywiki-template');

async function runTests() {
  console.log('🧪 Starting Phase 1: Minimalist Legal TiddlyWiki Template Unit Tests...\n');

  // Test 1: Basic Generation & Backward Compatibility
  console.log('Test 1: Verifying HTML generation & backward compatibility...');
  const sampleTiddlers = [
    {
      title: '01_Parties_and_Jurisdiction',
      tags: 'Pleading CommercialCourt',
      text: '### Parties to the Suit\n1. That the Plaintiffs are lawful co-owners of SCO No. 123-124, Sector 17, Chandigarh.'
    },
    {
      title: '02_Tenancy_Terms',
      tags: 'Pleading LeaseAgreement Exhibit',
      text: '2. That vide registered Lease Deed dated 15.01.2018, the premises was demised to Defendant No. 1. Photocopy of Lease Deed is marked as Ex P-1.'
    },
    {
      title: '03_Rent_Arrears_Table',
      tags: 'Pleading Arrears Table Financial',
      text: '10. That the Defendants are in default of rent as per the statement below:\n\n' +
            '| Period | Months | Monthly Rent | Rent Due |\n' +
            '| --- | --- | --- | --- |\n' +
            '| Oct-23 to Aug-24 | 11 | 14,58,608 | 70,93,422 |\n' +
            '| Sep-24 to Jul-25 | 11 | 15,31,538 | 78,95,656 |\n' +
            '| **Total Due** | | | **1,49,89,078** |\n'
    }
  ];

  const html = generateTiddlyWikiHtml(
    'Commercial Court - Rent Recovery Suit',
    sampleTiddlers,
    3210,
    'Commercial Court',
    'recovery_suit.wiki.html'
  );

  assert(typeof html === 'string', 'Should return a string');
  assert(html.includes('<!doctype html>'), 'Must start with valid DOCTYPE');
  assert(html.includes('Commercial Court - Rent Recovery Suit'), 'Must contain wiki title');
  assert(html.includes('class="tiddlywiki-tiddler-store"'), 'Must maintain TiddlyWiki JSON store script tag');
  console.log('  ✓ Basic structure and JSON store verified.');

  // Test 2: Curated Legal Styling & Dual Perspective Switch
  console.log('Test 2: Verifying Legal Chamber styling & Dual Perspective controls...');
  assert(html.includes('btn-mode-cards'), 'Must include Atomic Fact Cards mode button');
  assert(html.includes('btn-mode-plaint'), 'Must include Continuous Plaint mode button');
  assert(html.includes('switchPerspective'), 'Must include perspective switching logic');
  assert(html.includes('cards-view') && html.includes('plaint-view'), 'Must provide both view containers');
  console.log('  ✓ Dual perspective containers and controls present.');

  // Test 3: Collapsible Right Panel & Legal Tabs
  console.log('Test 3: Verifying Collapsible Legal Outline & Curated Tabs...');
  assert(html.includes('sidebar-toc') || html.includes('legal-sidebar'), 'Must include sidebar container');
  assert(html.includes('Table of Contents') || html.includes('Outline'), 'Must have Table of Contents tab');
  assert(html.includes('Exhibits') || html.includes('Citations'), 'Must have Exhibits / Citations tab');
  assert(html.includes('toggleSidebar'), 'Must include toggleSidebar function for right panel');
  console.log('  ✓ Curated legal outline with tabs and toggle controls verified.');

  // Test 4: Interactive Table Parser & In-Card Visual Editing
  console.log('Test 4: Verifying Markdown Table Parsing and In-Card Visual Table Editor...');
  assert(html.includes('court-table') || html.includes('legal-table'), 'Must include table styling class');
  assert(html.includes('contenteditable'), 'Must render editable cells for table editing');
  assert(html.includes('serializeTableToMarkdown') || html.includes('tableToMarkdown'), 'Must include table serialization back to Markdown');
  assert(html.includes('Oct-23 to Aug-24'), 'Must contain sample table text in store or rendered body');
  console.log('  ✓ Interactive visual table editing and markdown serialization verified.');

  // Test 5: Monaco Code Trigger Hook & DOCX Export Hook
  console.log('Test 5: Verifying In-Card Monaco Trigger Hook & Court DOCX Export Hook...');
  assert(html.includes('open_in_monaco') || html.includes('openCardInMonaco') || html.includes('toggleCodeMode'), 'Must include Monaco / Code trigger');
  assert(html.includes('exportCourtDocx') || html.includes('export-court-docx'), 'Must include Court DOCX export trigger');
  // Test 6: Preserving buildTiddlersFromChunks compatibility
  console.log('Test 6: Verifying buildTiddlersFromChunks helper...');
  const chunks = [
    { section_title: 'Intro', content: 'Intro text', page_number: 1 },
    { section_title: 'Facts', content: 'Facts text', page_number: 2 }
  ];
  const builtTiddlers = buildTiddlersFromChunks(chunks, 'TestDoc');
  assert(Array.isArray(builtTiddlers), 'Should return array');
  assert(builtTiddlers.length === 3, 'Should include master index + 2 sections');
  assert(builtTiddlers[0].title.includes('Index'), 'First item should be master index');
  console.log('  ✓ buildTiddlersFromChunks backward compatibility confirmed.');

  // Test 7: Functional Table Parsing and Markdown Round-Trip
  console.log('Test 7: Functional VM Execution of Table Parser & Markdown Round-Trip...');
  const vm = require('vm');
  // Extract the client-side script from the generated HTML
  const scriptMatch = html.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/);
  assert(scriptMatch && scriptMatch[1], 'Must find main client script');
  
  // Create mock DOM environment for VM
  const mockScript = `
    ${scriptMatch[1]}
    // Expose internal functions for unit verification
    globalThis.__parseMarkdownToHtml = parseMarkdownToHtml;
    globalThis.__renderHtmlTable = renderHtmlTable;
  `;
  
  const sandbox = {
    console,
    document: {
      querySelector: () => null,
      getElementById: () => null
    },
    window: { parent: { postMessage: () => {} } },
    navigator: { clipboard: { writeText: () => {} } }
  };
  vm.createContext(sandbox);
  vm.runInContext(mockScript, sandbox);

  const testTableMarkdown = [
    '| Period | Months | Monthly Rent | Rent Due |',
    '| --- | --- | --- | --- |',
    '| Oct-23 to Aug-24 | 11 | 14,58,608 | 70,93,422 |',
    '| Sep-24 to Jul-25 | 11 | 15,31,538 | 78,95,656 |',
    '| **Total Due** | | | **1,49,89,078** |'
  ].join('\n');

  const renderedHtml = sandbox.__parseMarkdownToHtml(testTableMarkdown, 'TestCard');
  assert(renderedHtml.includes('<table class="court-table"'), 'Must contain court-table element');
  assert(renderedHtml.includes('contenteditable="true"'), 'Must contain contenteditable cells');
  assert(renderedHtml.includes('70,93,422'), 'Must preserve numeric figure 70,93,422');
  assert(renderedHtml.includes('total-row'), 'Must detect and tag total-row');
  assert(!renderedHtml.includes('<td>---</td>'), 'Must not render separator dashes as data rows');
  console.log('  ✓ Table parsing in VM produced valid interactive court table with editable cells and totals.');

  console.log('\n🎉 ALL PHASE 1 TEMPLATE TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
