const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testSettingsDashboardHtml() {
    console.log('=== Running Settings Dashboard UI & Tabs Structure Tests ===\n');

    const htmlPath = path.join(__dirname, '..', 'lib', 'assets', 'settings-dashboard.html');
    assert(fs.existsSync(htmlPath), 'settings-dashboard.html must exist');
    const content = fs.readFileSync(htmlPath, 'utf8');

    console.log('1. Checking for Universal Settings Search input...');
    assert(content.includes('id="universalSettingsSearch"'), 'Dashboard must contain #universalSettingsSearch input');
    console.log('✓ #universalSettingsSearch found');

    console.log('2. Checking for Display & Typography Nav Pill (#pillDisplay)...');
    assert(content.includes('id="pillDisplay"'), 'Dashboard must contain #pillDisplay navigation button');
    assert(content.includes("switchCockpitTab('display')"), 'Dashboard must handle switchCockpitTab(\'display\')');
    console.log('✓ #pillDisplay found');

    console.log('3. Checking for Display & Typography Tab Panel (#tabPanelDisplay)...');
    assert(content.includes('id="tabPanelDisplay"'), 'Dashboard must contain #tabPanelDisplay container');
    assert(content.includes('id="editorFontSize"'), 'Dashboard must contain #editorFontSize slider/input');
    assert(content.includes('id="editorFontFamily"'), 'Dashboard must contain #editorFontFamily selector');
    assert(content.includes('id="editorLineHeight"'), 'Dashboard must contain #editorLineHeight selector');
    assert(content.includes('id="workbenchTheme"'), 'Dashboard must contain #workbenchTheme selector');
    console.log('✓ #tabPanelDisplay and controls found');

    console.log('4. Checking for URL Hash / Query Parameter Deep-Linking Script...');
    assert(content.includes('function initTabFromUrl()') || content.includes('window.location.hash') || content.includes('tabParam'), 'Dashboard must support deep-linking tab from URL');
    console.log('✓ Tab deep-linking logic found');

    console.log('5. Checking for Webview postMessage dispatchers...');
    assert(content.includes('set-workspace-preference'), 'Dashboard must dispatch set-workspace-preference via postMessage');
    console.log('✓ postMessage dispatcher found');

    console.log('\n=== Settings Dashboard HTML Tests Passed Successfully! ===');
}

try {
    testSettingsDashboardHtml();
} catch (err) {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
}
