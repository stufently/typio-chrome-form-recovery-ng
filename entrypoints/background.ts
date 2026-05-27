// MV3 service worker (Chrome / Edge) or event page (Firefox MV3).
// Stage 0 placeholder — Stage 1 (vertical slice) will wire SAVE_ENTRY / QUERY
// handlers and the cleanup alarm.

import { defineBackground } from 'wxt/sandbox';

export default defineBackground(() => {
  // No global state. IndexedDB is the source of truth — see docs/THREAT_MODEL.md.

  // Recreate alarms on every cold start: install AND startup. MV3 service workers
  // are event-driven and can be terminated between events.
  const ensureCleanupAlarm = async () => {
    const browser = await import('webextension-polyfill').then((m) => m.default);
    await browser.alarms.create('cleanup', { periodInMinutes: 60 * 24 });
  };

  chrome.runtime.onInstalled.addListener(() => {
    void ensureCleanupAlarm();
  });

  chrome.runtime.onStartup.addListener(() => {
    void ensureCleanupAlarm();
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'cleanup') {
      // Stage 2: prune entries older than settings.retentionDays.
      // Intentionally no-op in Stage 0.
    }
  });

  chrome.runtime.onMessage.addListener((_msg, _sender, _sendResponse) => {
    // Stage 1 will route SAVE_ENTRY / QUERY_ENTRIES / DELETE_ENTRY.
    // Returning `true` is required to keep the channel open for async responses
    // in Chrome (Firefox supports promise return, but we use the polyfill).
    return false;
  });
});
