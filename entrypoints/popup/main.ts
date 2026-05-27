// Popup. Lists saved entries for the currently active tab and offers
// click-to-restore. Stage 1 implementation — Stage 3 will add search,
// per-entry delete, and copy.

import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import browser from 'webextension-polyfill';
import { sendMessage, sendMessageToTab } from '../../lib/messaging';
import { t } from '../../lib/i18n';
import type { Entry, Message } from '../../lib/types';

@customElement('typio-popup')
export class TypioPopup extends LitElement {
  static override styles = css`
    :host {
      display: block;
      min-width: 360px;
      max-height: 480px;
      font:
        13px/1.4 -apple-system,
        BlinkMacSystemFont,
        'Segoe UI',
        sans-serif;
      color: #1a1a1a;
      background: #fff;
    }
    header {
      padding: 12px 16px;
      border-bottom: 1px solid #eee;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    header h1 {
      font-size: 14px;
      font-weight: 600;
      margin: 0;
    }
    header .host {
      font-size: 11px;
      color: #888;
      font-family: ui-monospace, monospace;
    }
    .empty {
      padding: 32px 16px;
      text-align: center;
      color: #888;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: 380px;
      overflow-y: auto;
    }
    li {
      padding: 10px 16px;
      border-bottom: 1px solid #f4f4f4;
      cursor: pointer;
    }
    li:hover {
      background: #f7f9fc;
    }
    .preview {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 13px;
    }
    .meta {
      margin-top: 4px;
      font-size: 11px;
      color: #888;
      display: flex;
      gap: 8px;
    }
    footer {
      padding: 8px 16px;
      border-top: 1px solid #eee;
      font-size: 11px;
      color: #888;
      display: flex;
      justify-content: space-between;
    }
    a {
      color: #2563eb;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .error {
      padding: 8px 16px;
      background: #fef2f2;
      color: #b91c1c;
      border-top: 1px solid #fecaca;
      font-size: 12px;
    }
    .actions {
      display: flex;
      gap: 8px;
      padding: 10px 16px;
      border-top: 1px solid #eee;
      background: #fafbfc;
    }
    .actions button {
      flex: 1;
      cursor: pointer;
      background: #2563eb;
      color: #fff;
      border: 0;
      padding: 7px 12px;
      border-radius: 6px;
      font: inherit;
      font-size: 12px;
    }
    .actions button.secondary {
      background: #f3f4f6;
      color: #111;
    }
  `;

  @state() private entries: Entry[] = [];
  @state() private host = '';
  @state() private loading = true;

  override async connectedCallback(): Promise<void> {
    super.connectedCallback();
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      this.loading = false;
      return;
    }
    try {
      this.host = new URL(tab.url).host;
    } catch {
      this.loading = false;
      return;
    }
    const msg: Message = { type: 'QUERY_ENTRIES', host: this.host, limit: 100 };
    const reply = await sendMessage(msg);
    if (reply.ok) {
      const data = reply.data as { entries?: Entry[] } | undefined;
      this.entries = data?.entries ?? [];
    }
    this.loading = false;
  }

  @state() private restoreError = '';

  private async openRecoveryDialog(): Promise<void> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await sendMessageToTab(tab.id, { type: 'OPEN_RECOVERY_DIALOG' });
    window.close();
  }

  private async openOptions(): Promise<void> {
    await browser.runtime.openOptionsPage();
    window.close();
  }

  private async restore(entry: Entry): Promise<void> {
    if (entry.id === undefined) return;
    this.restoreError = '';
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      this.restoreError = 'No active tab';
      return;
    }
    const reply = await sendMessageToTab(tab.id, {
      type: 'RESTORE_ENTRY',
      payload: { entryId: entry.id, fieldKey: entry.fieldKey, value: entry.value },
    });
    if (reply.ok) {
      window.close();
    } else {
      this.restoreError = reply.error || 'Could not restore — the field is no longer on the page.';
    }
  }

  override render() {
    return html`
      <header>
        <h1>Typio NG</h1>
        <span class="host">${this.host || nothing}</span>
      </header>
      ${this.loading
        ? html`<div class="empty">Loading…</div>`
        : this.entries.length === 0
          ? html`<div class="empty">
              No saved drafts for this site yet. Start typing in any text field — Typio NG will
              autosave after a short pause.
            </div>`
          : html`<ul>
              ${this.entries.map(
                (e) => html`
                  <li @click=${() => this.restore(e)}>
                    <div class="preview">${e.value.slice(0, 120)}</div>
                    <div class="meta">
                      <span>${e.type}</span>
                      <span>${e.valueLen} chars</span>
                      <span>${formatTime(e.updatedAt)}</span>
                    </div>
                  </li>
                `,
              )}
            </ul>`}
      ${this.restoreError ? html`<div class="error">${this.restoreError}</div>` : nothing}
      <div class="actions">
        <button @click=${this.openRecoveryDialog}>${t('popup_open_recovery')}</button>
        <button class="secondary" @click=${this.openOptions}>${t('popup_open_options')}</button>
      </div>
      <footer>
        <span>Stored locally · no telemetry</span>
        <a
          href="https://github.com/stufently/typio-chrome-form-recovery-ng"
          target="_blank"
          rel="noopener"
          >GitHub</a
        >
      </footer>
    `;
  }
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + 'm ago';
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + 'h ago';
  return Math.floor(diff / 86_400_000) + 'd ago';
}
