// In-page recovery dialog injected via Shadow DOM (open) so page CSS does not
// leak into our UI and our CSS does not leak into the page.
//
// Mounted by entrypoints/content.ts when it receives an OPEN_RECOVERY_DIALOG
// or CONTEXT_MENU_RECOVER message. Calls back through props so it doesn't
// depend on extension globals — easier to test.

import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import type { Entry } from '../lib/types';
import { t } from '../lib/i18n';

// Idempotent registration. The `@customElement` decorator throws on a second
// call against the same CustomElementRegistry — and WXT's zip pipeline imports
// content.ts twice in vite-node which triggered exactly that. Manual define
// with a presence check is the safe path.
const TAG = 'typio-recovery-dialog';

export class TypioRecoveryDialog extends LitElement {
  @property({ attribute: false }) entries: Entry[] = [];
  @property({ attribute: false }) onRestore?: (entry: Entry) => void;
  @property({ attribute: false }) onClose?: () => void;

  @state() private query = '';

  static override styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      font:
        14px/1.5 -apple-system,
        BlinkMacSystemFont,
        'Segoe UI',
        sans-serif;
      color: #111;
    }
    .scrim {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.55);
    }
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
    header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 18px;
      border-bottom: 1px solid #eef2f7;
    }
    header h1 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      flex: 1;
    }
    header button {
      background: transparent;
      border: 0;
      cursor: pointer;
      font-size: 14px;
      color: #475569;
    }
    .search {
      padding: 12px 18px;
      border-bottom: 1px solid #eef2f7;
    }
    .search input {
      width: 100%;
      box-sizing: border-box;
      padding: 9px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font: inherit;
    }
    .list {
      flex: 1;
      overflow-y: auto;
      padding: 6px 0;
    }
    .item {
      padding: 12px 18px;
      border-bottom: 1px solid #f4f6fa;
      cursor: pointer;
    }
    .item:hover {
      background: #f8fafc;
    }
    .preview {
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 4.5em;
      overflow: hidden;
      mask-image: linear-gradient(to bottom, #000 70%, transparent);
      -webkit-mask-image: linear-gradient(to bottom, #000 70%, transparent);
    }
    .meta {
      margin-top: 6px;
      font-size: 12px;
      color: #64748b;
      display: flex;
      gap: 10px;
    }
    .empty {
      padding: 32px 18px;
      text-align: center;
      color: #64748b;
    }
    footer {
      padding: 10px 18px;
      border-top: 1px solid #eef2f7;
      font-size: 12px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
    }
  `;

  private close = () => {
    this.onClose?.();
  };

  private restore = (entry: Entry) => {
    this.onRestore?.(entry);
  };

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('keydown', this.onKey);
  }

  override disconnectedCallback(): void {
    document.removeEventListener('keydown', this.onKey);
    super.disconnectedCallback();
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.close();
    }
  };

  private filtered(): Entry[] {
    const q = this.query.trim().toLowerCase();
    if (!q) return this.entries;
    return this.entries.filter((e) => e.value.toLowerCase().includes(q));
  }

  override render() {
    const items = this.filtered();
    return html`
      <div class="scrim" @click=${this.close}></div>
      <div class="panel" role="dialog" aria-modal="true" aria-label=${t('recovery_title')}>
        <header>
          <h1>${t('recovery_title')}</h1>
          <button type="button" @click=${this.close}>${t('recovery_close')}</button>
        </header>
        <div class="search">
          <input
            type="search"
            .value=${this.query}
            @input=${(e: Event) => (this.query = (e.target as HTMLInputElement).value)}
            placeholder=${t('recovery_search')}
            autofocus
          />
        </div>
        <div class="list">
          ${items.length === 0
            ? html`<div class="empty">${t('recovery_empty')}</div>`
            : repeat(
                items,
                (e) => e.id ?? `${e.fieldKey}-${e.updatedAt}`,
                (e) => html`
                  <div class="item" @click=${() => this.restore(e)}>
                    <div class="preview">${e.value.slice(0, 800)}</div>
                    <div class="meta">
                      <span>${e.type}</span>
                      <span>${e.valueLen} chars</span>
                      <span>${formatTime(e.updatedAt)}</span>
                    </div>
                  </div>
                `,
              )}
        </div>
        <footer>
          <span>Stored locally · no telemetry</span>
          <span>${items.length} / ${this.entries.length}</span>
        </footer>
        ${nothing}
      </div>
    `;
  }
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, TypioRecoveryDialog);
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + 'm ago';
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + 'h ago';
  return Math.floor(diff / 86_400_000) + 'd ago';
}
