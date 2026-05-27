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
  deleteOlderThan,
  upsertFieldMeta,
} from '../lib/db';
import { sha256Hex } from '../lib/hash';
import { getSettings, setSettings } from '../lib/settings';
import { isHostnameBlocklisted, isUrlInSensitiveCategory } from '../lib/blacklist';
import type { MessageResponse } from '../lib/types';

export default defineBackground(() => {
  const CLEANUP_ALARM = 'cleanup';

  const ensureAlarms = async (): Promise<void> => {
    await browser.alarms.create(CLEANUP_ALARM, { periodInMinutes: 60 * 24 });
  };

  browser.runtime.onInstalled.addListener(() => {
    void ensureAlarms();
  });

  browser.runtime.onStartup.addListener(() => {
    void ensureAlarms();
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CLEANUP_ALARM) {
      void runCleanup();
    }
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
    // Incognito tabs: refuse silently. PRIVACY.md promises this.
    if (msg.type === 'SAVE_ENTRY' && sender.tab?.incognito) {
      return { ok: true };
    }

    switch (msg.type) {
      case 'PING':
        return { ok: true, data: 'pong' };

      case 'SAVE_ENTRY': {
        const { host, pathname, fieldKey, value, type } = msg.payload;
        if (!host || !fieldKey || value.length < 2) return { ok: true };

        // Defense in depth: even though the content script also checks these,
        // the service worker is the last line before writing to disk.
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

      case 'GET_SETTINGS':
        return { ok: true, data: await getSettings() };

      case 'UPDATE_SETTINGS':
        return { ok: true, data: await setSettings(msg.settings) };

      // Forwarded to active tab — handled by content script.
      case 'OPEN_RECOVERY_DIALOG':
      case 'RESTORE_ENTRY':
        return { ok: false, error: 'message-must-go-to-tab' };

      default: {
        const exhaustive: never = msg;
        return { ok: false, error: 'unknown-message: ' + JSON.stringify(exhaustive) };
      }
    }
  });
});
