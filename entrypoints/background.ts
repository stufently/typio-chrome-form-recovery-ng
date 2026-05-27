// MV3 service worker (Chrome / Edge) or event page (Firefox MV3).
// All persistent state lives in IndexedDB — see docs/THREAT_MODEL.md.

import { defineBackground } from 'wxt/sandbox';
import browser from 'webextension-polyfill';
import { onMessage } from '../lib/messaging';
import {
  putEntry,
  queryByHost,
  queryByFieldKey,
  deleteEntry,
  deleteByHost,
  deleteOlderThan,
  upsertFieldMeta,
  dumpAllEntries,
} from '../lib/db';
import { sha256Hex } from '../lib/hash';
import { getSettings, setSettings } from '../lib/settings';
import { isHostnameBlocklisted, isUrlInSensitiveCategory } from '../lib/blacklist';
import { buildExport, parseImport } from '../lib/export-import';
import type { MessageResponse, ImportSummary } from '../lib/types';

const CLEANUP_ALARM = 'cleanup';
const CONTEXT_MENU_ID = 'typio-ng-recover';

export default defineBackground(() => {
  const ensureAlarms = async (): Promise<void> => {
    await browser.alarms.create(CLEANUP_ALARM, { periodInMinutes: 60 * 24 });
  };

  const ensureContextMenu = async (): Promise<void> => {
    // Remove first so we don't fight ourselves on extension reload.
    try {
      await browser.contextMenus.remove(CONTEXT_MENU_ID);
    } catch {
      // wasn't there yet
    }
    browser.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: browser.i18n.getMessage('context_menu_recover') || 'Recover text in this field',
      contexts: ['editable'],
    });
  };

  browser.runtime.onInstalled.addListener(() => {
    void ensureAlarms();
    void ensureContextMenu();
  });

  browser.runtime.onStartup.addListener(() => {
    void ensureAlarms();
    void ensureContextMenu();
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CLEANUP_ALARM) {
      void runCleanup();
    }
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID) return;
    if (!tab?.id) return;
    void browser.tabs.sendMessage(tab.id, { type: 'CONTEXT_MENU_RECOVER' });
  });

  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'open-recovery-dialog') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await browser.tabs.sendMessage(tab.id, { type: 'OPEN_RECOVERY_DIALOG' });
  });

  async function runCleanup(): Promise<void> {
    const settings = await getSettings();
    const cutoff = Date.now() - settings.retentionDays * 86_400_000;
    try {
      await deleteOlderThan(cutoff);
    } catch (e) {
      console.error('typio-ng cleanup failed', e);
    }
  }

  onMessage(async (msg, sender): Promise<MessageResponse> => {
    if (msg.type === 'SAVE_ENTRY' && sender.tab?.incognito) {
      return { ok: true };
    }

    switch (msg.type) {
      case 'PING':
        return { ok: true, data: 'pong' };

      case 'SAVE_ENTRY': {
        const { host, pathname, fieldKey, value, type } = msg.payload;
        if (!host || !fieldKey || value.length < 2) return { ok: true };

        const settings = await getSettings();
        if (isHostnameBlocklisted(host, settings.blocklistHostnames)) return { ok: true };
        if (isUrlInSensitiveCategory(pathname)) return { ok: true };

        const textHash = await sha256Hex(value);
        const result = await putEntry(
          { host, pathname, fieldKey, value, type, textHash },
          {
            maxPerField: settings.maxEntriesPerField,
            maxPerHost: settings.maxEntriesPerHost,
          },
        );
        await upsertFieldMeta({
          fieldKey,
          host,
          lastSeen: Date.now(),
          hints: {},
        });
        return { ok: true, data: { id: result.id, inserted: result.inserted } };
      }

      case 'QUERY_ENTRIES': {
        const entries = msg.fieldKey
          ? await queryByFieldKey(msg.host, msg.fieldKey, { limit: msg.limit ?? 50 })
          : await queryByHost(msg.host, { limit: msg.limit ?? 100 });
        return { ok: true, data: { entries } };
      }

      case 'DELETE_ENTRY':
        await deleteEntry(msg.id);
        return { ok: true };

      case 'CLEAR_DATA_FOR_HOST': {
        const removed = await deleteByHost(msg.host);
        return { ok: true, data: { removed } };
      }

      case 'GET_SETTINGS':
        return { ok: true, data: await getSettings() };

      case 'UPDATE_SETTINGS':
        return { ok: true, data: await setSettings(msg.settings) };

      case 'EXPORT_DATA': {
        const settings = await getSettings();
        const all = await dumpAllEntries();
        const bundle = buildExport(settings, all, browser.runtime.getManifest().version);
        return { ok: true, data: { bundle } };
      }

      case 'IMPORT_DATA': {
        const existing = await dumpAllEntries();
        const seen = new Set<string>(
          existing.map((e) => e.host + '|' + e.fieldKey + '|' + e.textHash),
        );
        const parsed = parseImport(msg.bundle, seen, msg.byteSize);
        if (!parsed.ok) {
          const summary: ImportSummary = { ...parsed.summary, ok: false, reason: parsed.reason };
          return { ok: true, data: { summary } };
        }
        if (msg.dryRun) {
          return { ok: true, data: { summary: parsed.summary } };
        }
        await setSettings(parsed.bundle.settings);
        // parseImport now hands us only insertable, non-duplicate entries.
        // Recompute textHash on apply rather than trusting the import — a
        // crafted bundle could otherwise poison future dedupe lookups.
        for (const entry of parsed.bundle.entries) {
          const trustedHash = await sha256Hex(entry.value);
          await putEntry(
            {
              host: entry.host,
              pathname: entry.pathname,
              fieldKey: entry.fieldKey,
              value: entry.value,
              type: entry.type,
              textHash: trustedHash,
            },
            {
              maxPerField: parsed.bundle.settings.maxEntriesPerField,
              maxPerHost: parsed.bundle.settings.maxEntriesPerHost,
            },
          );
        }
        return { ok: true, data: { summary: parsed.summary } };
      }

      case 'OPEN_RECOVERY_DIALOG':
      case 'CONTEXT_MENU_RECOVER':
      case 'RESTORE_ENTRY':
      case 'RESTORE_INTO_LAST_FOCUSED':
        return { ok: false, error: 'message-must-go-to-tab' };

      default: {
        const exhaustive: never = msg;
        return { ok: false, error: 'unknown-message: ' + JSON.stringify(exhaustive) };
      }
    }
  });
});
