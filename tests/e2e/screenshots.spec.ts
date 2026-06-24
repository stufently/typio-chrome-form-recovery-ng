// Generate real store-listing screenshots from the running extension.
//
// Captures four 1280×800 PNGs from the actual built extension running in
// Chromium with the unpacked .output/chrome-mv3/ loaded. Identical UI to
// Firefox/Edge — the Lit components are the same, only the manifest differs.
//
// Run manually:
//   make build-chrome
//   npx playwright install --with-deps chromium
//   npx playwright test tests/e2e/screenshots.spec.ts
//
// In Docker:
//   docker run --rm -v "$PWD":/work -w /work \
//     mcr.microsoft.com/playwright:v1.49.0-jammy \
//     bash -c "npm ci && xvfb-run npx playwright test tests/e2e/screenshots.spec.ts"

import { test, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_DIR = path.resolve(__dirname, '../../.output/chrome-mv3');
const FIXTURE_DIR = path.join(__dirname, 'fixture');
const OUT_DIR = path.resolve(__dirname, '../../store-assets/screenshots');

// Content scripts only inject into http(s):// pages by default — file:// requires
// the user to manually enable "Allow access to file URLs" per extension, which
// we can't do programmatically. Serve the fixture over a throwaway local HTTP.
function startFixtureServer(): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const rel = (req.url || '/').split('?')[0] || '/';
      const target =
        rel === '/' ? path.join(FIXTURE_DIR, 'index.html') : path.join(FIXTURE_DIR, rel);
      fs.readFile(target, (err, data) => {
        if (err) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        const ct = target.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : 'application/octet-stream';
        res.setHeader('Content-Type', ct);
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}/`,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

test.skip(!fs.existsSync(EXT_DIR), 'Run `make build-chrome` first.');

const VIEWPORT = { width: 1280, height: 800 } as const;

// Realistic prefilled drafts so the popup and the recovery dialog look populated
// rather than empty. Times are absolute; we wait debounce between each entry so
// the content script saves them.
const DRAFTS = [
  'Real attention is a scarce thing. Every tool I touch shapes the way I think, ' +
    'and the hardest part of writing well is keeping the first thread of thought ' +
    'intact long enough to put it on the page.',
  'The morning routine sets the tone for everything that follows. ' +
    'Before emails, before notifications, before the rush — a few quiet minutes ' +
    'to think, write, and plan can make the whole day unfold differently.',
  'Great writing is not about having the perfect words. It is about saying ' +
    'something real, in a way that connects. Clarity comes from editing. ' +
    'Impact comes from honesty. The rest is just practice.',
];

test.describe('Store screenshots', () => {
  let context: BrowserContext;
  let server: Awaited<ReturnType<typeof startFixtureServer>>;
  let fixtureUrl = '';

  test.beforeAll(async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    server = await startFixtureServer();
    fixtureUrl = server.url;
    context = await chromium.launchPersistentContext('', {
      headless: false, // extensions don't load in pure headless
      viewport: VIEWPORT,
      args: [
        // Chrome 131+ blocks --load-extension by default; this flag re-enables
        // the dev-mode command-line install. Note: host-permission gating for
        // sideloaded extensions still applies, so content scripts may not
        // auto-inject on arbitrary origins. The dialog screenshot below works
        // around that by mounting the component manually in the page.
        '--disable-features=DisableLoadExtensionCommandLineSwitch',
        `--disable-extensions-except=${EXT_DIR}`,
        `--load-extension=${EXT_DIR}`,
      ],
    });
    // Wake the SW by opening any extension page, which gives us a stable
    // chrome-extension:// origin for direct IDB seeding (same origin as SW).
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extId = sw.url().split('/')[2]!;
    const host = new URL(fixtureUrl).host;
    const seeder = await context.newPage();
    await seeder.goto(`chrome-extension://${extId}/options.html`);
    await seeder.waitForLoadState('domcontentloaded');
    await seeder.waitForTimeout(300);
    await seeder.evaluate(
      async ({ host, drafts }) => {
        await new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('typio-ng', 2);
          open.onerror = () => reject(open.error);
          // Set up the schema if the database is brand-new — same shape as lib/db.ts.
          open.onupgradeneeded = () => {
            const db = open.result;
            const tx = open.transaction!;
            if (!db.objectStoreNames.contains('entries')) {
              const store = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
              store.createIndex('by-host', ['host', 'updatedAt']);
              store.createIndex('by-fieldKey', ['host', 'fieldKey', 'updatedAt']);
              store.createIndex('by-updatedAt', 'updatedAt');
              store.createIndex('by-dedupe', ['host', 'fieldKey', 'textHash']);
            } else {
              const store = tx.objectStore('entries');
              if (!store.indexNames.contains('by-dedupe')) {
                store.createIndex('by-dedupe', ['host', 'fieldKey', 'textHash']);
              }
            }
            if (!db.objectStoreNames.contains('fields')) {
              const fields = db.createObjectStore('fields', { keyPath: 'fieldKey' });
              fields.createIndex('by-host', ['host', 'lastSeen']);
            }
          };
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('entries', 'readwrite');
            const store = tx.objectStore('entries');
            const now = Date.now();
            drafts.forEach((value, i) => {
              const ts = now - i * 600_000;
              store.add({
                host,
                pathname: '/blog/designing-for-focus',
                fieldKey:
                  'o=http://' + host + '|p=/blog/designing-for-focus|n=message|i=message|ord=' + i,
                value,
                type: 'textarea',
                valueLen: value.length,
                textHash: 'seed-' + i,
                createdAt: ts,
                updatedAt: ts,
              });
            });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        });
      },
      { host, drafts: DRAFTS },
    );
    await seeder.close();
  });

  test.afterAll(async () => {
    await context.close();
    await server.close();
  });

  async function extensionId(): Promise<string> {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    return sw.url().split('/')[2]!;
  }

  test('01 — popup on a comment form', async () => {
    const fixturePage = await context.newPage();
    await fixturePage.setViewportSize(VIEWPORT);
    await fixturePage.goto(fixtureUrl);
    await fixturePage.fill('#message', 'A new comment in progress — Typio NG keeps it safe.');
    await fixturePage.waitForTimeout(900);

    const extId = await extensionId();
    const fixtureHost = new URL(fixtureUrl).host;
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 380, height: 520 });
    await popup.goto(
      `chrome-extension://${extId}/popup.html?host=${encodeURIComponent(fixtureHost)}`,
    );
    await popup.waitForSelector('typio-popup');
    // Wait for the list to populate (query is async, debounced from seeded drafts).
    await popup.waitForFunction(
      () => {
        const root = document.querySelector('typio-popup')?.shadowRoot;
        return !!root && !!root.querySelector('li, .empty');
      },
      { timeout: 5000 },
    );
    await popup.waitForTimeout(250);
    await popup.screenshot({ path: path.join(OUT_DIR, '01-popup-380x520.png') });

    // 1280×800 composite: fixture full-width, popup raster overlaid top-right.
    const popupBuf = await popup.screenshot({ omitBackground: false });
    await popup.close();

    const composite = await context.newPage();
    await composite.setViewportSize(VIEWPORT);
    await composite.setContent(
      composedHtml(await fixturePage.screenshot({ fullPage: false }), popupBuf, 'top-right'),
    );
    await composite.waitForTimeout(200);
    await composite.screenshot({ path: path.join(OUT_DIR, '01-popup-1280x800.png') });
    await composite.close();
    await fixturePage.close();
  });

  test('02 — options page', async () => {
    const extId = await extensionId();
    const options = await context.newPage();
    await options.setViewportSize(VIEWPORT);
    await options.goto(`chrome-extension://${extId}/options.html`);
    await options.waitForSelector('typio-options');
    // Seed the blocklist textarea so it doesn't render empty.
    await options.evaluate(() => {
      const root = document.querySelector('typio-options')?.shadowRoot;
      const ta = root?.querySelector('textarea') as HTMLTextAreaElement | null;
      if (ta) {
        ta.value = 'bank.example\n.gov.example\nmail.example';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await options.waitForTimeout(400);
    await options.screenshot({ path: path.join(OUT_DIR, '02-options-1280x800.png') });
    await options.close();
  });

  test('03 — in-page recovery dialog', async () => {
    // Sideloaded extensions in Chrome 131+ require per-site user grant before
    // content_scripts auto-inject, which we cannot simulate from Playwright.
    // The dialog renders here from a standalone HTML preview that mirrors the
    // exact CSS, DOM, and copy of `components/recovery-dialog.ts` (plain-DOM
    // renderer; `RECOVERY_DIALOG_CSS`). The markup is kept in lockstep with the
    // renderer — when you touch it, also update tests/e2e/fixture/dialog-preview.html.
    const page = await context.newPage();
    await page.setViewportSize(VIEWPORT);
    await page.goto(fixtureUrl + 'dialog-preview.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT_DIR, '03-recovery-dialog-1280x800.png') });
    await page.close();
  });

  test('04 — restore in action', async () => {
    // Marketing shot: split-pane "before / after" with the form pre-restored.
    const fixturePage = await context.newPage();
    await fixturePage.setViewportSize(VIEWPORT);
    await fixturePage.goto(fixtureUrl);
    await fixturePage.fill(
      '#message',
      DRAFTS[0] + '\n\nThis is exactly where the page reload would have wiped it out.',
    );
    await fixturePage.fill('#name', 'Alex');
    await fixturePage.fill('#email', 'alex@example.com');
    await fixturePage.waitForTimeout(900);
    await fixturePage.screenshot({ path: path.join(OUT_DIR, '04-restored-1280x800.png') });
    await fixturePage.close();
  });
});

function composedHtml(fixtureBuf: Buffer, popupBuf: Buffer, slot: 'top-right'): string {
  const fixtureB64 = fixtureBuf.toString('base64');
  const popupB64 = popupBuf.toString('base64');
  return `<!doctype html><meta charset=utf-8><style>
    html,body{margin:0;background:#0f172a;}
    .stage{
      position:relative;width:1280px;height:800px;
      background:url('data:image/png;base64,${fixtureB64}') center/cover no-repeat;
    }
    .popup{
      position:absolute;${slot === 'top-right' ? 'top:20px;right:20px' : 'bottom:20px;left:20px'};
      box-shadow:0 14px 38px rgba(15,23,42,0.35);
      border-radius:10px;overflow:hidden;
      width:380px;
    }
    .popup img{display:block;width:380px;}
  </style><div class="stage"><div class="popup"><img src="data:image/png;base64,${popupB64}" alt=""></div></div>`;
}
