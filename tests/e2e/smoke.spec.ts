// End-to-end smoke test for the Chrome MV3 build.
// Runs in Playwright's bundled Chromium with the unpacked extension loaded.
//
// Prerequisites (CI workflow handles this automatically):
//   npm run build:chrome   → writes .output/chrome-mv3/
//
// Local manual run:
//   make build-chrome && npx playwright install --with-deps chromium
//   npx playwright test

import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../.output/chrome-mv3');
const FIXTURE_URL = pathToFileURL(path.join(__dirname, 'fixture/index.html')).href;

const extensionBuilt = fs.existsSync(EXTENSION_PATH);

test.describe('Typio NG smoke', () => {
  test.skip(
    !extensionBuilt,
    'No Chrome build at .output/chrome-mv3/. Run `make build-chrome` first.',
  );

  let context: BrowserContext;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: true,
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('autosaves textarea and recovers it after reload', async () => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);

    const draft = 'this is a draft that survives a reload';
    await page.fill('#message', draft);
    // Debounce window in content script is 750ms; give it some slack.
    await page.waitForTimeout(1500);

    await page.reload();
    await expect(page.locator('#message')).toHaveValue('');

    // Open the extension popup. Service worker is the easy way to find the
    // extension id, then we navigate the page to the popup URL and read state.
    const swPromise = context.waitForEvent('serviceworker');
    const allWorkers = context.serviceWorkers();
    const sw = allWorkers[0] ?? (await swPromise);
    const extensionId = sw.url().split('/')[2]!;
    const popupUrl = `chrome-extension://${extensionId}/popup.html`;
    const popup = await context.newPage();
    await popup.goto(popupUrl);

    // Wait for the entry list to render.
    await expect(popup.locator('typio-popup').locator('li').first()).toContainText(draft, {
      timeout: 5_000,
    });
  });

  test('refuses to save password and credit-card fields', async () => {
    // Stage 2 will harden this — for now we assert no entry surfaces for the
    // password field. We do this indirectly via the popup query.
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);

    await page.fill('#password', 'hunter2-should-never-save');
    await page.fill('#card', '4111 1111 1111 1111');
    await page.waitForTimeout(1500);

    const sw = context.serviceWorkers()[0]!;
    const extensionId = sw.url().split('/')[2]!;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    const text = await popup.locator('typio-popup').innerText();
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('4111');
  });
});
