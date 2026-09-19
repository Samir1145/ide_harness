import { _electron as electron, test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('Hayagriva E2E Smoke Tests', () => {
  let electronApp: any;
  let window: any;

  test.beforeAll(async () => {
    test.setTimeout(60000);

    const isPackaged = process.env.TEST_PACKAGED === 'true';
    if (isPackaged) {
      console.log('Testing packaged app: /Applications/Hayagriva.app');
      electronApp = await electron.launch({
        executablePath: '/Applications/Hayagriva.app/Contents/MacOS/Hayagriva',
        args: ['--no-sandbox']
      });
    } else {
      const electronPath = require('electron');
      const mainScript = path.resolve(__dirname, '../scripts/theia-electron-main.js');
      console.log('Testing local electron with mainScript:', mainScript);
      electronApp = await electron.launch({
        executablePath: electronPath,
        args: [mainScript, '--no-sandbox', '--plugins=local-dir:../../plugins']
      });
    }

    window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('Hayagriva application shell renders cleanly', async () => {
    // Wait for the main Theia shell to mount
    await window.waitForSelector('#theia-app-shell', { timeout: 30000 });
    const isShellVisible = await window.isVisible('#theia-app-shell');
    expect(isShellVisible).toBe(true);
  });

  test('Status bar is visible with Hayagriva items mounted', async () => {
    // Status bar container (Theia uses camelCase #theia-statusBar)
    await window.waitForSelector('#theia-statusBar', { timeout: 20000 });
    expect(await window.isVisible('#theia-statusBar')).toBe(true);

    // Verify Hayagriva custom status bar items are mounted
    const modeItem = window.locator('#theia-statusBar').getByText('Lite Mode');
    await expect(modeItem).toBeVisible({ timeout: 15000 });

    const licenseItem = window.locator('#theia-statusBar').getByText('Local AI');
    await expect(licenseItem).toBeVisible({ timeout: 15000 });
  });

  test('Backend server is Online and no offline error popup is triggered', async () => {
    // Wait for the status indicator to show Online
    const onlineIndicator = window.locator('#theia-statusBar').getByText('Hayagriva Server: Online');
    await expect(onlineIndicator).toBeVisible({ timeout: 25000 });

    // Verify that the offline error toast notification is NOT displayed
    const offlineToast = window.locator('.theia-notification-message', {
      hasText: 'Hayagriva backend server is offline'
    });
    const hasOfflineToast = await offlineToast.isVisible();
    expect(hasOfflineToast).toBe(false);
  });
});
