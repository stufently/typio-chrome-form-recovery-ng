// Content script. Watches form fields, debounces input, sends SAVE_ENTRY to
// the service worker. Stage 1 added the plumbing; Stage 2 added sensitive
// detection, hostname blacklist, restricted-page handling, and URL category
// checks. v2 (next major) will add iframes and contentEditable.

import { defineContentScript } from 'wxt/sandbox';
import browser from 'webextension-polyfill';
import { createDebouncer } from '../lib/debounce';
import { generateFieldKey, isCandidateField } from '../lib/field-key';
import { isSensitive } from '../lib/sensitive';
import { isHostnameBlocklisted, isUrlInSensitiveCategory } from '../lib/blacklist';
import { isRestrictedLocation } from '../lib/restricted-pages';
import { sendMessage } from '../lib/messaging';
import { getSettings } from '../lib/settings';
import type { Entry, Message, RestoreEntryPayload, Settings } from '../lib/types';

const DEBOUNCE_MS = 750;
const MIN_VALUE_LEN = 2;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  allFrames: false,
  async main() {
    if (isRestrictedLocation(location)) return;

    let settings: Settings = await getSettings();
    if (isHostnameBlocklisted(location.hostname, settings.blocklistHostnames)) return;
    if (isUrlInSensitiveCategory(location.pathname)) return;

    // Refresh settings on storage change so blocklist edits take effect without reload.
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes['settings']) {
        const next = changes['settings'].newValue as Partial<Settings> | undefined;
        if (next) settings = { ...settings, ...next };
      }
    });

    const debounce = createDebouncer<string>(DEBOUNCE_MS);
    const seen = new WeakSet<HTMLElement>();

    const fieldType = (el: HTMLInputElement | HTMLTextAreaElement): Entry['type'] => {
      if (el instanceof HTMLTextAreaElement) return 'textarea';
      const t = (el.type || 'text').toLowerCase();
      switch (t) {
        case 'email':
        case 'url':
        case 'search':
        case 'tel':
        case 'number':
          return t;
        default:
          return 'text';
      }
    };

    const attach = (el: HTMLElement) => {
      if (seen.has(el)) return;
      if (!isCandidateField(el)) return;
      if (isSensitive(el, { pathname: location.pathname })) return;
      seen.add(el);

      const computeKey = () =>
        generateFieldKey({
          origin: location.origin,
          pathname: location.pathname,
          element: el,
        });

      const onInput = () => {
        const value = el.value;
        if (value.length < MIN_VALUE_LEN) return;
        // Live re-check: an SPA may have mutated the field's attrs since we
        // attached, turning it into a sensitive one.
        if (isSensitive(el, { pathname: location.pathname })) return;
        if (isHostnameBlocklisted(location.hostname, settings.blocklistHostnames)) return;
        const fieldKey = computeKey();
        const payload = {
          host: location.host,
          pathname: location.pathname,
          fieldKey,
          value,
          type: fieldType(el),
        };
        debounce.schedule(fieldKey, async () => {
          const msg: Message = { type: 'SAVE_ENTRY', payload };
          const reply = await sendMessage(msg);
          if (!reply.ok) console.warn('typio-ng SAVE_ENTRY failed:', reply.error);
        });
      };

      const onBlur = () => {
        if (el.value.length < MIN_VALUE_LEN) return;
        debounce.flush(computeKey());
      };

      el.addEventListener('input', onInput, { passive: true });
      el.addEventListener('blur', onBlur, { passive: true });
    };

    const scan = (root: ParentNode) => {
      const nodes = root.querySelectorAll<HTMLElement>('input, textarea');
      for (const n of nodes) attach(n);
    };

    scan(document);

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLElement) {
            if (node.matches?.('input, textarea')) attach(node);
            else scan(node);
          }
        }
      }
    });
    observer.observe(document.documentElement, { subtree: true, childList: true });

    // Restore: SW or popup → tab message. Promise return is the cross-browser
    // way to send an async reply (webextension-polyfill normalises it).
    browser.runtime.onMessage.addListener(async (message: unknown) => {
      if (!isMessage(message)) {
        return { ok: false, error: 'malformed-message' };
      }
      if (message.type === 'RESTORE_ENTRY') {
        const ok = applyRestore(message.payload);
        return ok ? { ok: true } : { ok: false, error: 'field-not-found' };
      }
      // OPEN_RECOVERY_DIALOG handler lands in Stage 3.
      return { ok: false, error: 'unhandled-in-content-' + message.type };
    });

    function applyRestore(p: RestoreEntryPayload): boolean {
      const all = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        'input, textarea',
      );
      for (const el of all) {
        if (!isCandidateField(el)) continue;
        const key = generateFieldKey({
          origin: location.origin,
          pathname: location.pathname,
          element: el,
        });
        if (key !== p.fieldKey) continue;
        const proto =
          el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        // Native setter bypasses React/Vue controlled-input state.
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter?.call(el, p.value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.focus();
        return true;
      }
      return false;
    }
  },
});

function isMessage(value: unknown): value is Message {
  return typeof value === 'object' && value !== null && 'type' in value;
}
