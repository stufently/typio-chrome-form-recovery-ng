// Content script. Watches form fields, debounces input, sends SAVE_ENTRY to
// the service worker. Stage 1 added the plumbing; Stage 2 added sensitive
// detection, hostname blacklist, restricted-page handling, and URL category
// checks. Stage 3 adds the in-page recovery dialog (Shadow DOM), focus
// tracking for the context menu, and the keyboard-command handler.
// v2 (next major) will add iframes and contentEditable.

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
import { renderRecoveryDialog, type RecoveryDialogHandle } from '../components/recovery-dialog';

const DEBOUNCE_MS = 750;
const MIN_VALUE_LEN = 2;
const DIALOG_HOST_ID = '__typio-ng-recovery-host__';

type Editable = HTMLInputElement | HTMLTextAreaElement;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  allFrames: false,
  async main() {
    if (isRestrictedLocation(location)) return;

    let settings: Settings = await getSettings();
    if (isHostnameBlocklisted(location.hostname, settings.blocklistHostnames)) return;
    if (isUrlInSensitiveCategory(location.pathname)) return;

    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes['settings']) {
        const next = changes['settings'].newValue as Partial<Settings> | undefined;
        if (next) settings = { ...settings, ...next };
      }
    });

    const debounce = createDebouncer<string>(DEBOUNCE_MS);
    const seen = new WeakSet<HTMLElement>();
    let lastFocusedEditable: WeakRef<Editable> | null = null;

    const fieldType = (el: Editable): Entry['type'] => {
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

    // Track the most recently focused editable element. The browser's context
    // menu doesn't tell us which element was right-clicked — we have to look at
    // recent focus ourselves (Codex plan review note 6).
    document.addEventListener(
      'focusin',
      (e) => {
        const target = e.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          if (isCandidateField(target)) {
            lastFocusedEditable = new WeakRef(target);
          }
        }
      },
      true,
    );

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

    // Restore via promise return (cross-browser).
    browser.runtime.onMessage.addListener(async (message: unknown) => {
      if (!isMessage(message)) return { ok: false, error: 'malformed-message' };

      switch (message.type) {
        case 'RESTORE_ENTRY': {
          const ok = restoreByFieldKey(message.payload);
          return ok ? { ok: true } : { ok: false, error: 'field-not-found' };
        }
        case 'RESTORE_INTO_LAST_FOCUSED': {
          const ok = restoreIntoLastFocused(message.value);
          return ok ? { ok: true } : { ok: false, error: 'no-focused-editable' };
        }
        case 'OPEN_RECOVERY_DIALOG':
        case 'CONTEXT_MENU_RECOVER': {
          await openDialog();
          return { ok: true };
        }
        default:
          return { ok: false, error: 'unhandled-in-content-' + message.type };
      }
    });

    function restoreByFieldKey(p: RestoreEntryPayload): boolean {
      const all = document.querySelectorAll<Editable>('input, textarea');
      for (const el of all) {
        if (!isCandidateField(el)) continue;
        const key = generateFieldKey({
          origin: location.origin,
          pathname: location.pathname,
          element: el,
        });
        if (key !== p.fieldKey) continue;
        applyValue(el, p.value);
        return true;
      }
      return false;
    }

    function restoreIntoLastFocused(value: string): boolean {
      const target = lastFocusedEditable?.deref();
      if (!target || !target.isConnected) return false;
      if (!isCandidateField(target)) return false;
      applyValue(target, value);
      return true;
    }

    function applyValue(el: Editable, value: string): void {
      const proto =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.focus();
    }

    async function openDialog(): Promise<void> {
      const reply = await sendMessage({
        type: 'QUERY_ENTRIES',
        host: location.host,
        limit: 200,
      });
      const entries: Entry[] = reply.ok
        ? (((reply.data as { entries?: Entry[] } | undefined)?.entries ?? []) as Entry[])
        : [];
      mountDialog(entries);
    }

    let dialogHandle: RecoveryDialogHandle | null = null;

    function mountDialog(entries: Entry[]): void {
      removeDialog();
      const host = document.createElement('div');
      host.id = DIALOG_HOST_ID;
      // `all: initial` walls off inherited page styles. The positioning must be
      // re-applied inline AFTER the reset: it lives on the wrapper host itself
      // now (the dialog is plain DOM in the shadow root, not a nested custom
      // element), and inline styles override the shadow stylesheet's `:host`
      // rule — without this the overlay would render static in normal flow.
      host.style.cssText =
        'all: initial; position: fixed; inset: 0; z-index: 2147483647; display: block;';
      // Closed shadow root — `open` would let page JS read recovered text via
      // host.shadowRoot.textContent. Removing the host node disposes it.
      const shadow = host.attachShadow({ mode: 'closed' });
      // Attach to the document before rendering so the search box can take focus.
      document.documentElement.appendChild(host);
      dialogHandle = renderRecoveryDialog(shadow, {
        entries,
        onRestore: (entry) => {
          if (entry.id !== undefined) {
            const ok = restoreByFieldKey({
              entryId: entry.id,
              fieldKey: entry.fieldKey,
              value: entry.value,
            });
            if (!ok) restoreIntoLastFocused(entry.value);
          }
          removeDialog();
        },
        onClose: () => removeDialog(),
      });
    }

    function removeDialog(): void {
      dialogHandle?.dispose();
      dialogHandle = null;
      const existing = document.getElementById(DIALOG_HOST_ID);
      existing?.remove();
    }
  },
});

function isMessage(value: unknown): value is Message {
  return typeof value === 'object' && value !== null && 'type' in value;
}
