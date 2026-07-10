// MV3 service worker (Chrome / Edge) or event page (Firefox MV3).
// All persistent state lives in IndexedDB — see docs/THREAT_MODEL.md.

import { defineBackground } from 'wxt/sandbox';
import browser from 'webextension-polyfill';
import { onMessage } from '../lib/messaging';
import {
  putEntry,
  importEntries,
  queryByHost,
  queryByFieldKey,
  deleteEntry,
  deleteByHost,
  deleteOlderThan,
  pruneFieldMetaOlderThan,
  upsertFieldMeta,
  dumpAllEntries,
} from '../lib/db';
import { sha256Hex } from '../lib/hash';
import { getSettings, setSettings } from '../lib/settings';
import { isHostnameBlocklisted, isUrlInSensitiveCategory } from '../lib/blacklist';
import { isRestrictedHost } from '../lib/restricted-pages';
import { isSensitiveValue } from '../lib/sensitive';
import { buildExport, parseImport } from '../lib/export-import';
import type { Message, MessageResponse, ImportSummary } from '../lib/types';

const CLEANUP_ALARM = 'cleanup';
const CONTEXT_MENU_ID = 'typio-ng-recover';
const MAX_VALUE_LEN = 200_000;
const MAX_QUERY_LIMIT = 500;

// Content scripts (senders whose URL is a web page, not one of our extension
// pages) may only save and read drafts scoped to their own page. Everything
// else — export, import, settings, deletion — is reserved for extension pages.
// This keeps a single compromised renderer from reading or wiping the whole
// store (2026-07-10 review, finding 2). NOTE: popup/options can run inside a
// tab (options_ui.open_in_tab), so "has sender.tab" is NOT the right
// discriminator — the sender URL scheme+origin is.
const WEB_SENDER_ALLOWED: ReadonlySet<Message['type']> = new Set([
  'PING',
  'SAVE_ENTRY',
  'QUERY_ENTRIES',
]);

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
    // Pages without our content script (chrome://, PDF viewer) reject — fine.
    void browser.tabs.sendMessage(tab.id, { type: 'CONTEXT_MENU_RECOVER' }).catch(() => {});
  });

  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'open-recovery-dialog') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await browser.tabs.sendMessage(tab.id, { type: 'OPEN_RECOVERY_DIALOG' }).catch(() => {});
  });

  async function runCleanup(): Promise<void> {
    const settings = await getSettings();
    const cutoff = Date.now() - settings.retentionDays * 86_400_000;
    try {
      await deleteOlderThan(cutoff);
      await pruneFieldMetaOlderThan(cutoff);
    } catch (e) {
      console.error('typio-ng cleanup failed', e);
    }
  }

  onMessage(async (msg, sender): Promise<MessageResponse> => {
    const senderIsExtensionPage = (sender.url ?? '').startsWith(browser.runtime.getURL(''));
    if (!senderIsExtensionPage && !WEB_SENDER_ALLOWED.has(msg.type)) {
      return { ok: false, error: 'not-allowed-from-content-script' };
    }

    // For content-script senders, derive the page identity from the sender
    // itself rather than trusting the payload — sender.url is set by the
    // browser.
    let senderUrl: URL | null = null;
    if (!senderIsExtensionPage) {
      try {
        senderUrl = new URL(sender.url ?? sender.tab?.url ?? '');
      } catch {
        return { ok: false, error: 'unknown-sender-url' };
      }
    }

    if (!senderIsExtensionPage && sender.tab?.incognito) {
      if (msg.type === 'SAVE_ENTRY') return { ok: true };
      if (msg.type === 'QUERY_ENTRIES') return { ok: true, data: { entries: [] } };
    }

    switch (msg.type) {
      case 'PING':
        return { ok: true, data: 'pong' };

      case 'SAVE_ENTRY': {
        const { fieldKey, value, type } = msg.payload;
        const host = senderUrl ? senderUrl.host : msg.payload.host;
        const origin = senderUrl ? senderUrl.origin : msg.payload.origin;
        const pathname = senderUrl ? senderUrl.pathname : msg.payload.pathname;
        if (!host || !fieldKey || value.length < 2 || value.length > MAX_VALUE_LEN) {
          return { ok: true };
        }
        if (senderUrl && !fieldKey.startsWith('o=' + senderUrl.origin + '|')) {
          return { ok: true };
        }

        const settings = await getSettings();
        if (isRestrictedHost(host)) return { ok: true };
        if (isHostnameBlocklisted(host, settings.blocklistHostnames)) return { ok: true };
        if (isUrlInSensitiveCategory(pathname)) return { ok: true };
        if (isSensitiveValue(value, { type, fieldKey })) return { ok: true };

        const textHash = await sha256Hex(value);
        const result = await putEntry(
          { host, origin, pathname, fieldKey, value, type, textHash },
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
        const host = senderUrl ? senderUrl.host : msg.host;
        const origin = senderUrl ? senderUrl.origin : msg.origin;
        if (senderUrl && msg.fieldKey && !msg.fieldKey.startsWith('o=' + senderUrl.origin + '|')) {
          return { ok: true, data: { entries: [] } };
        }
        const limit = Math.min(msg.limit ?? (msg.fieldKey ? 50 : 100), MAX_QUERY_LIMIT);
        const entries = msg.fieldKey
          ? await queryByFieldKey(host, msg.fieldKey, { limit, origin })
          : await queryByHost(host, { limit, origin });
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
        const toImport = [];
        for (const entry of parsed.bundle.entries) {
          const trustedHash = await sha256Hex(entry.value);
          toImport.push({
            host: entry.host,
            origin: entry.origin,
            pathname: entry.pathname,
            fieldKey: entry.fieldKey,
            value: entry.value,
            type: entry.type,
            textHash: trustedHash,
          });
        }
        await importEntries(toImport, {
          maxPerField: parsed.bundle.settings.maxEntriesPerField,
          maxPerHost: parsed.bundle.settings.maxEntriesPerHost,
        });
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
