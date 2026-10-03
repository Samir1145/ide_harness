const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

const profileManager = require('../lib/core/profile-manager');

async function makeRequest(method, urlPath, body = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const options = {
            hostname: '127.0.0.1',
            port: 3210,
            path: urlPath,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = data ? JSON.parse(data) : {};
                    resolve({ status: res.statusCode, data: parsed, raw: data });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function runE2ETests() {
    console.log('=== Running Unified Settings Cockpit End-to-End Test Suite ===\n');

    // 1. Validate REST API & Persistence Engine
    console.log('Phase 1: Validating Display & Profile REST Endpoints...');
    const initialGet = await makeRequest('GET', '/api/hayagriva/settings/display');
    assert.strictEqual(initialGet.status, 200, 'GET /api/hayagriva/settings/display should return 200');
    assert(initialGet.data.display, 'Response must include display preferences object');

    const testPayload = {
        display: {
            fontFamily: "'Times New Roman', Times, serif",
            fontSize: 16,
            lineHeight: 1.8,
            theme: 'dark',
            wordWrap: 'wordWrapColumn',
            minimap: false
        }
    };

    const postRes = await makeRequest('POST', '/api/hayagriva/settings/display', testPayload);
    assert.strictEqual(postRes.status, 200, 'POST /api/hayagriva/settings/display should return 200');
    assert.strictEqual(postRes.data.display.fontSize, 16, 'fontSize should be saved as 16');
    assert.strictEqual(postRes.data.display.lineHeight, 1.8, 'lineHeight should be saved as 1.8');
    assert.strictEqual(postRes.data.display.wordWrap, 'wordWrapColumn', 'wordWrap should be saved as wordWrapColumn');
    console.log('✓ Phase 1: REST API persistence verified.');

    // 2. Validate Settings Dashboard HTML Structure
    console.log('\nPhase 2: Validating Settings Dashboard UI & 3 Pillars...');
    const htmlPath = path.join(__dirname, '..', 'lib', 'assets', 'settings-dashboard.html');
    assert(fs.existsSync(htmlPath), 'settings-dashboard.html must exist');
    const html = fs.readFileSync(htmlPath, 'utf8');

    assert(html.includes('id="universalSettingsSearch"'), 'Universal search bar must exist');
    assert(html.includes('id="pillDisplay"'), 'Display & Typography pill must exist');
    assert(html.includes('id="tabPanelDisplay"'), 'Display tab panel must exist');
    assert(html.includes('id="editorFontFamily"'), 'Font family selector must exist');
    assert(html.includes('id="editorFontSize"'), 'Font size slider must exist');
    assert(html.includes('id="editorLineHeight"'), 'Line height selector must exist');
    assert(html.includes('id="workbenchTheme"'), 'Theme selector must exist');
    assert(html.includes('set-workspace-preference'), 'set-workspace-preference postMessage bridge must exist');
    console.log('✓ Phase 2: HTML markup and UI controls verified.');

    // 3. Validate Frontend Command & Menu Interceptions
    console.log('\nPhase 3: Validating Frontend Command & Menu Overrides...');
    const commandsPath = path.join(__dirname, '..', '..', 'frontend', 'theia-extensions', 'hayagriva', 'src', 'browser', 'commands.ts');
    const menusPath = path.join(__dirname, '..', '..', 'frontend', 'theia-extensions', 'hayagriva', 'src', 'browser', 'menus.ts');
    const profileWidgetPath = path.join(__dirname, '..', '..', 'frontend', 'theia-extensions', 'hayagriva', 'src', 'browser', 'profile-widget.ts');

    const commandsContent = fs.readFileSync(commandsPath, 'utf8');
    const menusContent = fs.readFileSync(menusPath, 'utf8');
    const profileWidgetContent = fs.readFileSync(profileWidgetPath, 'utf8');

    assert(commandsContent.includes('preferences:open'), 'commands.ts must intercept preferences:open');
    assert(commandsContent.includes(':openDisplaySettings'), 'commands.ts must register openDisplaySettings');
    assert(commandsContent.includes(':openIdentitySettings'), 'commands.ts must register openIdentitySettings');
    assert(commandsContent.includes(':openVaultsSettings'), 'commands.ts must register openVaultsSettings');

    assert(menusContent.includes('openDisplaySettings'), 'menus.ts must register openDisplaySettings in SETTINGS_MAIN_MENU');
    assert(menusContent.includes('openIdentitySettings'), 'menus.ts must register openIdentitySettings in SETTINGS_MAIN_MENU');
    assert(menusContent.includes('openVaultsSettings'), 'menus.ts must register openVaultsSettings in SETTINGS_MAIN_MENU');

    assert(profileWidgetContent.includes('hayagriva:openIdentitySettings'), 'profile-widget.ts must execute hayagriva:openIdentitySettings on Manage CTA');
    console.log('✓ Phase 3: Frontend commands, menus, and profile widget wiring verified.');

    console.log('\n=== Unified Settings Cockpit End-to-End Validation Succeeded! (100% Passed) ===');
}

runE2ETests().catch(err => {
    console.error('❌ E2E Test Suite Failed:', err);
    process.exit(1);
});
