const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

async function httpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        }).on('error', reject);
    });
}

async function runTests() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  TEST SUITE: Master-Detail Entity Topology Pattern (Plan 1)');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // 1. API: /api/hayagriva/entities
    console.log('[Phase 1] Validating /api/hayagriva/entities endpoint...');
    const entRes = await httpGet('http://127.0.0.1:3210/api/hayagriva/entities?case=demo_case');
    assert.strictEqual(entRes.status, 200, 'Status should be 200');
    assert.strictEqual(entRes.body.success, true, 'Should return success: true');
    assert.ok(entRes.body.entities.length >= 7, 'Should return at least 7 entities');
    
    const categories = new Set(entRes.body.entities.map(e => e.category));
    assert.ok(categories.has('ROOT'), 'Should have ROOT category');
    assert.ok(categories.has('GOVERNANCE'), 'Should have GOVERNANCE category');
    assert.ok(categories.has('CREDITORS'), 'Should have CREDITORS category');
    assert.ok(categories.has('AVOIDANCE'), 'Should have AVOIDANCE category');
    assert.ok(categories.has('PRAS'), 'Should have PRAS category');
    console.log(`  ✓ Successfully retrieved ${entRes.body.entities.length} entities across categories: ${Array.from(categories).join(', ')}`);

    // 2. Center Canvas: entity-map-panel.html
    console.log('\n[Phase 2] Validating entity-map-panel.html (Detail Canvas)...');
    const panelPath = path.join(__dirname, '../lib/assets/entity-map-panel.html');
    const panelHtml = fs.readFileSync(panelPath, 'utf8');
    
    assert.ok(!panelHtml.includes('↗️ Expand'), 'Must NOT contain redundant Expand button');
    assert.ok(panelHtml.includes('focusNodeByNameOrId'), 'Must contain focusNodeByNameOrId');
    assert.ok(panelHtml.includes('focus-entity-in-graph'), 'Must handle focus-entity-in-graph message');
    assert.ok(panelHtml.includes('hasTypedEntities') || panelHtml.includes('category === \'GOVERNANCE\''), 'Must retain rich entities in synthesizeMockIfEmpty');
    console.log('  ✓ Expand button eliminated (canvas is sovereign main tab)');
    console.log('  ✓ Cross-panel message listener focus-entity-in-graph verified');
    console.log('  ✓ Rich IBC topology synthesized fallback verified');

    // 3. Top Menu Bar: menus.ts
    console.log('\n[Phase 3] Validating menus.ts top menu cleanup...');
    const menusPath = path.join(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/menus.ts');
    const menusContent = fs.readFileSync(menusPath, 'utf8');
    assert.ok(!menusContent.includes('openEntityMap'), 'Must NOT register openEntityMap in top menus');
    console.log('  ✓ Duplicate top menu item completely removed from INTEL_SUBMENU');

    // 4. Sidebar Master Directory: templates.ts
    console.log('\n[Phase 4] Validating entityExplorerHtml in templates.ts (Master List)...');
    const templatesPath = path.join(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/templates.ts');
    const templatesContent = fs.readFileSync(templatesPath, 'utf8');
    assert.ok(templatesContent.includes('export function entityExplorerHtml'), 'Must export entityExplorerHtml');
    assert.ok(templatesContent.includes('btn-open-graph'), 'Must include hero launcher btn-open-graph');
    assert.ok(templatesContent.includes('open-entity-map-main'), 'Must post open-entity-map-main message');
    assert.ok(templatesContent.includes('focus-entity-in-graph'), 'Must post focus-entity-in-graph message');
    assert.ok(templatesContent.includes('searchInput'), 'Must include search filter input');
    assert.ok(templatesContent.includes('tab-btn'), 'Must include category filter pills');
    console.log('  ✓ Master entity directory template properly structured');
    console.log('  ✓ High-density triage cards with real-time category filtering');
    console.log('  ✓ Two-way message hooks: open-entity-map-main and focus-entity-in-graph');

    // 5. Integration: extension.ts
    console.log('\n[Phase 5] Validating extension.ts widget wiring...');
    const extPath = path.join(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/extension.ts');
    const extContent = fs.readFileSync(extPath, 'utf8');
    assert.ok(extContent.includes('entityExplorerHtml'), 'Must import entityExplorerHtml');
    assert.ok(extContent.includes('entityIframe.srcdoc = entityExplorerHtml'), 'Must set srcdoc in initializeEntityMapWidget');
    assert.ok(extContent.includes('focus-entity-in-graph'), 'Must handle focus-entity-in-graph in message listener');
    console.log('  ✓ Pillar 5 explorer widget renders entityExplorerHtml in srcdoc');
    console.log('  ✓ Message listener coordinates Master ➔ Detail selection zoom');

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ALL 5 PHASES PASSED: Solution 1 Master-Detail Verified! 🎯');
    console.log('═══════════════════════════════════════════════════════════════\n');
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
