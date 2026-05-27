// Options page entry — Stage 0 placeholder.
// Stage 3 will add blocklist editor, retention slider, import/export.

import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('typio-options')
export class TypioOptions extends LitElement {
  static override styles = css`
    :host {
      display: block;
      max-width: 720px;
      margin: 48px auto;
      padding: 0 24px;
      font:
        15px/1.5 -apple-system,
        BlinkMacSystemFont,
        'Segoe UI',
        sans-serif;
      color: #222;
    }
    h1 {
      font-size: 22px;
      margin: 0 0 16px 0;
    }
    .note {
      padding: 12px 16px;
      background: #fafafa;
      border: 1px solid #eee;
      border-radius: 4px;
      color: #666;
    }
  `;

  override render() {
    return html`
      <h1>Typio Chrome Form Recovery NG</h1>
      <p class="note">Options will land in Stage 3 — blocklist, retention period, import/export.</p>
    `;
  }
}
