// Content script. Runs on every page (see manifest matches: <all_urls>).
// Stage 0 placeholder — Stage 1 will add input/textarea listeners, sensitive
// detection, debounce, and SAVE_ENTRY messaging.

import { defineContentScript } from 'wxt/sandbox';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  allFrames: false, // iframes deferred to v2 — see CURRENT_SESSION_TASKS.md
  main() {
    // Restricted-page guard. The browser does inject content scripts into some
    // pages even when matches says <all_urls>; the safe check is to look at the
    // location and bail early.
    const restrictedSchemes = ['chrome:', 'chrome-extension:', 'about:', 'view-source:'];
    if (restrictedSchemes.some((s) => location.protocol === s)) return;
    if (location.hostname === 'chromewebstore.google.com') return;

    // Stage 1: install input/textarea event listeners with debounce.
    // No globals on window. No analytics. No outbound fetch. Ever.
  },
});
