// In-page recovery dialog, rendered with plain DOM into a closed Shadow DOM so
// page CSS does not leak into our UI and our CSS does not leak into the page.
//
// IMPORTANT: this runs in the content script's ISOLATED world, where
// `window.customElements` is `null` (a Chromium limitation — custom elements
// cannot be registered from an isolated-world content script). The previous
// implementation was a Lit custom element; importing it crashed the entire
// content script on startup (`customElements.get(...)` on a null registry),
// which silently disabled autosave. We therefore use plain DOM here and keep
// Lit only in the extension pages (popup/options), where it works fine.
//
// Mounted by entrypoints/content.ts when it receives an OPEN_RECOVERY_DIALOG or
// CONTEXT_MENU_RECOVER message. Calls back through props so it doesn't depend on
// extension globals — easier to test.

import type { Entry } from '../lib/types';
import { t, formatRelativeTime } from '../lib/i18n';

export interface RecoveryDialogOptions {
  entries: Entry[];
  onRestore: (entry: Entry) => void;
  onClose: () => void;
}

export interface RecoveryDialogHandle {
  /** Detach document-level listeners. Call before removing the host node. */
  dispose(): void;
}

// Keep this in sync with tests/e2e/fixture/dialog-preview.html, which mirrors
// the dialog for the store-screenshot pipeline.
export const RECOVERY_DIALOG_CSS = `
  :host {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #111;
  }
  * { box-sizing: border-box; }
  .scrim { position: absolute; inset: 0; background: rgba(15, 23, 42, 0.55); }
  .panel {
    position: absolute;
    top: 5vh;
    left: 50%;
    transform: translateX(-50%);
    width: min(680px, 92vw);
    max-height: 84vh;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  header { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid #eef2f7; }
  header h1 { margin: 0; font-size: 15px; font-weight: 600; flex: 1; }
  header button { background: transparent; border: 0; cursor: pointer; font-size: 14px; color: #475569; }
  .search { padding: 12px 18px; border-bottom: 1px solid #eef2f7; }
  .search input { width: 100%; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; }
  .list { flex: 1; overflow-y: auto; padding: 6px 0; }
  .item { padding: 12px 18px; border-bottom: 1px solid #f4f6fa; cursor: pointer; }
  .item:hover { background: #f8fafc; }
  .preview {
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 4.5em;
    overflow: hidden;
    mask-image: linear-gradient(to bottom, #000 70%, transparent);
    -webkit-mask-image: linear-gradient(to bottom, #000 70%, transparent);
  }
  .meta { margin-top: 6px; font-size: 12px; color: #64748b; display: flex; gap: 10px; }
  .empty { padding: 32px 18px; text-align: center; color: #64748b; }
  footer {
    padding: 10px 18px;
    border-top: 1px solid #eef2f7;
    font-size: 12px;
    color: #64748b;
    display: flex;
    justify-content: space-between;
  }
`;

/**
 * Render the recovery dialog into `root` (a ShadowRoot or any container) using
 * plain DOM. User-supplied text is only ever assigned via `textContent`, never
 * `innerHTML`, so a hostile draft cannot inject markup into our UI.
 */
export function renderRecoveryDialog(
  root: ShadowRoot | HTMLElement,
  opts: RecoveryDialogOptions,
): RecoveryDialogHandle {
  const { entries, onRestore, onClose } = opts;

  const style = document.createElement('style');
  style.textContent = RECOVERY_DIALOG_CSS;
  root.appendChild(style);

  const el = (tag: string, className?: string, text?: string): HTMLElement => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const scrim = el('div', 'scrim');
  scrim.addEventListener('click', () => onClose());

  const panel = el('div', 'panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', t('recovery_title'));

  const header = el('header');
  header.appendChild(el('h1', undefined, t('recovery_title')));
  const closeBtn = el('button', undefined, t('recovery_close')) as HTMLButtonElement;
  closeBtn.type = 'button';
  closeBtn.addEventListener('click', () => onClose());
  header.appendChild(closeBtn);

  const search = el('div', 'search');
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = t('recovery_search');
  input.setAttribute('autofocus', '');
  search.appendChild(input);

  const list = el('div', 'list');

  const footer = el('footer');
  const footerPrivacy = el('span', undefined, t('popup_footer_privacy'));
  const footerCount = el('span');
  footer.appendChild(footerPrivacy);
  footer.appendChild(footerCount);

  const renderList = (query: string): void => {
    const q = query.trim().toLowerCase();
    const items = q ? entries.filter((e) => e.value.toLowerCase().includes(q)) : entries;

    list.replaceChildren();
    if (items.length === 0) {
      list.appendChild(el('div', 'empty', t('recovery_empty')));
    } else {
      for (const entry of items) {
        const item = el('div', 'item');
        item.appendChild(el('div', 'preview', entry.value.slice(0, 800)));
        const meta = el('div', 'meta');
        meta.appendChild(el('span', undefined, entry.type));
        meta.appendChild(el('span', undefined, `${entry.valueLen} chars`));
        meta.appendChild(el('span', undefined, formatRelativeTime(entry.updatedAt)));
        item.appendChild(meta);
        item.addEventListener('click', () => onRestore(entry));
        list.appendChild(item);
      }
    }
    footerCount.textContent = `${items.length} / ${entries.length}`;
  };

  input.addEventListener('input', () => renderList(input.value));
  renderList('');

  panel.appendChild(header);
  panel.appendChild(search);
  panel.appendChild(list);
  panel.appendChild(footer);

  root.appendChild(scrim);
  root.appendChild(panel);

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };
  document.addEventListener('keydown', onKey, true);

  // Focus the search box once the dialog is in the DOM.
  input.focus();

  return {
    dispose() {
      document.removeEventListener('keydown', onKey, true);
    },
  };
}
