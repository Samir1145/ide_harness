const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Phase 1 / Task 2 Test: Header Notifications Chip & Inbox Drawer ---');

const extensionTsPath = path.resolve(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/extension.ts');
const extContent = fs.readFileSync(extensionTsPath, 'utf8');

// 1. Verify notification center is omitted from left activity bar dock
assert.strictEqual(
  extContent.includes("this.shell.addWidget(this.notificationWidget, { area: 'left'"),
  false,
  'FAIL: Notification center is still docked in the left activity bar!'
);

// 2. Verify top-panel notification chip mounting
assert.strictEqual(
  extContent.includes('hayagriva-header-notif-chip'),
  true,
  'FAIL: Header notification chip (#hayagriva-header-notif-chip) is missing from extension.ts!'
);

// 3. Verify polling or fetching unread count from /api/hayagriva/inbox
assert.strictEqual(
  extContent.includes('/api/hayagriva/inbox'),
  true,
  'FAIL: /api/hayagriva/inbox endpoint call is missing from header notification chip in extension.ts!'
);

// 4. Verify slide-down drawer trigger on click
assert.strictEqual(
  extContent.includes('hayagriva-inbox-drawer'),
  true,
  'FAIL: Inbox slide-down drawer handler is missing from extension.ts!'
);

console.log('✅ Header Notifications test PASSED.');
