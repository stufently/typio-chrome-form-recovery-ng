// End-to-end smoke test for the Chrome MV3 build.
// Runs in Playwright's bundled Chromium with the unpacked extension loaded.
//
// Prerequisites (CI workflow handles this automatically):
//   npm run build:chrome   → writes .output/chrome-mv3/
//
// Local manual run:
//   make build-chrome && npx playwright install --with-deps chromium
//   npx playwright test
//
// IMPORTANT: the fixture is served over HTTP, not file://. On file:// pages
// `location.host` is empty, the service worker rejects empty-host saves, and the
// whole autosave path silently no-ops — which would make this test green while
// the product is broken (exactly the regression that got the extension pulled
// from the Chrome Web Store). Serving over HTTP exercises the real path.

import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../.output/chrome-mv3');
const FIXTURE_HTML = fs.readFileSync(path.join(__dirname, 'fixture/index.html'), 'utf8');

const extensionBuilt = fs.existsSync(EXTENSION_PATH);

test.describe('Typio NG smoke', () => {
  test.skip(
    !extensionBuilt,
    'No Chrome build at .output/chrome-mv3/. Run `make build-chrome` first.',
  );

  let context: BrowserContext;
  let server: http.Server;
  let origin: string;
  let host: string;

  test.beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(FIXTURE_HTML);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    host = `127.0.0.1:${port}`;
    origin = `http://${host}`;

    context = await chromium.launchPersistentContext('', {
      headless: true,
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });
  });

  test.afterAll(async () => {
    await context.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function extensionId(): string {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('extension service worker not found');
    return sw.url().split('/')[2]!;
  }

  interface StoredEntry {
    id?: number;
    fieldKey: string;
    value: string;
  }

  // Reopen the popup (it queries entries once on connect) until the expected
  // draft surfaces, so we don't depend on content-script attach / debounce
  // timing. Returns the matching stored entry for restore assertions.
  async function expectDraftInPopup(draft: string): Promise<StoredEntry> {
    const popup = await context.newPage();
    let entry: StoredEntry | undefined;
    await expect(async () => {
      await popup.goto(
        `chrome-extension://${extensionId()}/popup.html?host=${encodeURIComponent(host)}`,
      );
      await expect(popup.locator('typio-popup li').first()).toContainText(draft, {
        timeout: 2_000,
      });
      const entries = (await popup.evaluate(async (h) => {
        const r = (await chrome.runtime.sendMessage({
          type: 'QUERY_ENTRIES',
          host: h,
          limit: 100,
        })) as { ok: boolean; data?: { entries?: StoredEntry[] } };
        return r.ok ? (r.data?.entries ?? []) : [];
      }, host)) as StoredEntry[];
      entry = entries.find((e) => e.value === draft);
      expect(entry, 'stored entry for draft').toBeTruthy();
    }).toPass({ timeout: 15_000 });
    await popup.close();
    return entry!;
  }

  test('autosaves textarea and recovers it after reload', async () => {
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    // Content script attaches its listeners at document_idle — a real user types
    // after the page settles, so give the script a beat before typing.
    await page.waitForTimeout(1_000);

    const draft = 'this is a draft that survives a reload';
    await page.fill('#message', draft);
    // Blur flushes the debounce immediately (onBlur → debounce.flush).
    await page.locator('#message').blur();
    await page.waitForTimeout(300);

    await page.reload();
    await expect(page.locator('#message')).toHaveValue('');

    const entry = await expectDraftInPopup(draft);

    // Actually restore into the page. The popup's own restore button targets the
    // active tab (which, in this harness, is the popup), so we drive the same
    // RESTORE_ENTRY message the content script handles — exercising
    // restoreByFieldKey + applyValue — by broadcasting from the service worker.
    const sw = context.serviceWorkers()[0]!;
    const restored = await sw.evaluate(async (e: { id?: number; fieldKey: string; value: string }) => {
      const tabs = await chrome.tabs.query({});
      let ok = false;
      for (const tab of tabs) {
        if (tab.id === undefined) continue;
        try {
          const r = (await chrome.tabs.sendMessage(tab.id, {
            type: 'RESTORE_ENTRY',
            payload: { entryId: e.id, fieldKey: e.fieldKey, value: e.value },
          })) as { ok?: boolean };
          if (r?.ok) ok = true;
        } catch {
          // tab has no content script (extension pages) — ignore
        }
      }
      return ok;
    }, entry);
    expect(restored, 'a content script accepted RESTORE_ENTRY').toBe(true);
    await expect(page.locator('#message')).toHaveValue(draft);
    await page.close();
  });

  test('refuses to save password and credit-card fields', async () => {
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    await page.waitForTimeout(1_000);

    await page.fill('#password', 'hunter2-should-never-save');
    await page.fill('#card', '4111 1111 1111 1111');
    await page.locator('#card').blur();
    await page.waitForTimeout(800);

    const popup = await context.newPage();
    await popup.goto(
      `chrome-extension://${extensionId()}/popup.html?host=${encodeURIComponent(host)}`,
    );
    await popup.waitForTimeout(500);
    const text = await popup.locator('typio-popup').innerText();
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('4111');
    await popup.close();
    await page.close();
  });
});
