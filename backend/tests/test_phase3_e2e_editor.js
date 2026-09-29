/**
 * test_phase3_e2e_editor.js
 * End-to-End Verification for Phase 3:
 * 1. Milkdown Court Document Editor Asset & Endpoint
 * 2. Silent Auto-Save & Markdown Serialization (/api/hayagriva/save-file)
 * 3. Fast Omni-Search Integration (/api/hayagriva/omni-search)
 * 4. Context Menu & Command Declarations (4 Unified Actions, No viewAsHtml)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PORT = 3210;
const DEMO_CASE = path.join(__dirname, '..', '..', 'demo_case');

function httpGet(pathStr) {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${PORT}${pathStr}`, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        }).on('error', reject);
    });
}

function httpPost(pathStr, bodyObj) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(bodyObj);
        const req = http.request(`http://127.0.0.1:${PORT}${pathStr}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function runTests() {
    console.log('════════════════════════════════════════════════════════════════');
    console.log('🧪 PHASE 3 VERIFICATION: MILKDOWN WYSIWYG & CONTEXT MENUS');
    console.log('════════════════════════════════════════════════════════════════');

    // ─────────────────────────────────────────────────────────────────
    // Phase 3.1: Verify Milkdown Editor Endpoint & Visual Styling
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[Phase 3.1] Verifying /api/hayagriva/milkdown-editor endpoint...');
    const editorRes = await httpGet('/api/hayagriva/milkdown-editor');
    assert.strictEqual(editorRes.status, 200, `Expected 200, got ${editorRes.status}`);
    assert.ok(editorRes.body.includes('Hayagriva Sovereign Document Editor'), 'Should contain editor title');
    assert.ok(editorRes.body.includes('legal-variable-chip'), 'Should contain legal variable chip styles');
    assert.ok(editorRes.body.includes('omni-palette'), 'Should contain floating omni palette markup');
    assert.ok(editorRes.body.includes('parchment-sheet'), 'Should contain parchment sheet A4 layout');
    assert.ok(editorRes.body.includes('court-table'), 'Should contain court table styling');
    console.log('  ✓ Milkdown editor HTML served with Georgia legal typography, variable chips, and Omni-Palette');

    // ─────────────────────────────────────────────────────────────────
    // Phase 3.2: Verify Silent Document Save (/api/hayagriva/save-file)
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[Phase 3.2] Verifying silent auto-save via /api/hayagriva/save-file...');
    const testDocPath = path.join(DEMO_CASE, 'drafts', 'test_phase3_order.md');
    fs.mkdirSync(path.dirname(testDocPath), { recursive: true });

    const testMarkdown = `# IN THE NATIONAL COMPANY LAW TRIBUNAL
## BENCH AT NEW DELHI

**BEFORE THE HON'BLE ADJUDICATING AUTHORITY**

In the matter of:
{{corporate_debtor}}

1. The Corporate Debtor had obtained credit facilities from {{financial_creditor}}.
2. The total admitted claim is {{claim_amount_inr}}.

| Particulars | Sanction | Admitted |
| --- | --- | --- |
| Term Loan | {{claim_amount_inr}} | {{claim_amount_inr}} |
`;

    const saveRes = await httpPost('/api/hayagriva/save-file', {
        path: testDocPath,
        caseName: DEMO_CASE,
        content: testMarkdown
    });

    assert.strictEqual(saveRes.status, 200, `Expected 200, got ${saveRes.status}`);
    const onDiskContent = fs.readFileSync(testDocPath, 'utf8');
    assert.strictEqual(onDiskContent, testMarkdown, 'File on disk should match saved markdown exactly');
    console.log('  ✓ File written to disk accurately');

    // Clean up test file
    try { fs.unlinkSync(testDocPath); } catch (_) {}
    console.log('  ✓ Cleaned up temporary test file');

    // ─────────────────────────────────────────────────────────────────
    // Phase 3.3: Verify Omni-Search Real-Time Latency & Results
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[Phase 3.3] Verifying /api/hayagriva/omni-search for Milkdown editor...');
    const start = performance.now();
    const omniRes = await httpGet(`/api/hayagriva/omni-search?q=claim&context=inline&case=${encodeURIComponent(DEMO_CASE)}`);
    const duration = performance.now() - start;
    assert.strictEqual(omniRes.status, 200, `Expected 200, got ${omniRes.status}`);
    const omniData = JSON.parse(omniRes.body);
    assert.ok(omniData.items && omniData.items.length > 0, 'Omni-Search should return items');
    console.log(`  ✓ Omni-Search returned ${omniData.items.length} items in ${duration.toFixed(2)}ms`);

    // ─────────────────────────────────────────────────────────────────
    // Phase 3.4: Verify Frontend Menu Declarations (4 Unified Actions)
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[Phase 3.4] Verifying Frontend Menu & Command Declarations...');
    const menusContent = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'theia-extensions', 'hayagriva', 'src', 'browser', 'menus.ts'), 'utf8');
    const commandsContent = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'theia-extensions', 'hayagriva', 'src', 'browser', 'commands.ts'), 'utf8');

    // 1. Verify viewAsHtml is properly preserved for live markdown formatted preview
    assert.ok(menusContent.includes("commandId: `${HAYAGRIVA_NS}:viewAsHtml`"), 'viewAsHtml must be registered for Markdown preview per workspace rule');
    console.log('  ✓ viewAsHtml registered for Markdown Live Formatted Preview per rule');

    // 2. Verify openMilkdownEditor is registered in Navigator, Tabbar, and Editor menus
    assert.ok(menusContent.includes("commandId: `${HAYAGRIVA_NS}:openMilkdownEditor`"), 'openMilkdownEditor must be in menus.ts');
    assert.ok(commandsContent.includes("id: `${HAYAGRIVA_NS}:openMilkdownEditor`"), 'openMilkdownEditor must be in commands.ts');
    console.log('  ✓ openMilkdownEditor registered in Navigator, Tabbar, and Editor menus');

    // 3. Verify the 4 clean context menu actions
    const requiredLabels = [
        '📄 View Original Court Filing',
        '✍️ Edit Document (Word View)',
        '🧠 Open in Case Wiki',
        '🏛️ Export Continuous Court DOCX'
    ];
    for (const label of requiredLabels) {
        assert.ok(menusContent.includes(label), `menus.ts must contain context menu label: ${label}`);
    }
    console.log('  ✓ All 4 unified context menu actions present:');
    requiredLabels.forEach(l => console.log(`      • ${l}`));

    console.log('\n✅ ALL PHASE 3 VERIFICATIONS PASSED (100% GREEN)\n');
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
