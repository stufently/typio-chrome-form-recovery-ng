// Settings live in chrome.storage.local (small key/value). Form drafts live
// in IndexedDB. The split is deliberate — see docs/PERMISSIONS.md.

import browser from 'webextension-polyfill';
import { DEFAULT_SETTINGS, type Settings } from './types';

const KEY = 'settings';

export async function getSettings(): Promise<Settings> {
  const raw = (await browser.storage.local.get(KEY)) as { settings?: Partial<Settings> };
  const stored = raw.settings ?? {};
  return { ...DEFAULT_SETTINGS, ...stored, schemaVersion: 1 };
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = { ...current, ...patch, schemaVersion: 1 };
  await browser.storage.local.set({ [KEY]: next });
  return next;
}

export async function resetSettings(): Promise<Settings> {
  await browser.storage.local.set({ [KEY]: DEFAULT_SETTINGS });
  return DEFAULT_SETTINGS;
}
