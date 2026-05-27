// Vitest setup. Patches global IndexedDB with fake-indexeddb so storage
// tests can run in Node without a real browser, and stubs the minimal slice
// of webextension-polyfill we touch.

import 'fake-indexeddb/auto';

// Minimal browser API stub. Only the bits exercised by unit tests.
// Component-level tests (popup, options) run in Playwright with a real browser.
const storage = new Map<string, unknown>();

const browserStub = {
  runtime: {
    sendMessage: async () => undefined,
    onMessage: { addListener: () => {}, removeListener: () => {} },
    onInstalled: { addListener: () => {} },
    onStartup: { addListener: () => {} },
    getManifest: () => ({ version: '0.0.0-test' }),
  },
  i18n: {
    // Default to "no message" so unit code falls back to the key — overridable
    // per-test by replacing this fn.
    getMessage: (_key: string, _subs?: string | string[]) => '',
  },
  alarms: {
    create: async () => undefined,
    onAlarm: { addListener: () => {} },
  },
  contextMenus: {
    create: () => 'menu-id',
    remove: async () => undefined,
    onClicked: { addListener: () => {} },
  },
  commands: {
    onCommand: { addListener: () => {} },
  },
  tabs: {
    query: async () => [],
    sendMessage: async () => undefined,
  },
  storage: {
    local: {
      get: async (key?: string | string[]) => {
        if (typeof key === 'string') {
          const v = storage.get(key);
          return v === undefined ? {} : { [key]: v };
        }
        if (Array.isArray(key)) {
          const out: Record<string, unknown> = {};
          for (const k of key) {
            const v = storage.get(k);
            if (v !== undefined) out[k] = v;
          }
          return out;
        }
        const out: Record<string, unknown> = {};
        for (const [k, v] of storage.entries()) out[k] = v;
        return out;
      },
      set: async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) storage.set(k, v);
      },
      remove: async (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        for (const k of keys) storage.delete(k);
      },
      clear: async () => storage.clear(),
    },
  },
};

// Some modules import the default export (`import browser from 'webextension-polyfill'`).
// Vitest does not run wxt's auto-imports, so we provide a virtual module.
import { vi } from 'vitest';
vi.mock('webextension-polyfill', () => ({ default: browserStub }));

// chrome.* is the same shape under the hood; tests can reach for either.
(globalThis as unknown as { chrome: typeof browserStub }).chrome = browserStub;
