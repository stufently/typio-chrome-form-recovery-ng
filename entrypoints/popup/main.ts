// Popup entry — Stage 0 placeholder.
// Stage 1 will fetch entries for the active tab and render a Lit list.

import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('typio-popup')
export class TypioPopup extends LitElement {
  static override styles = css`
    :host {
      display: block;
      font: 14px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-width: 320px;
      padding: 16px;
      color: #222;
    }
    h1 {
      font-size: 16px;
      margin: 0 0 8px 0;
    }
    p {
      margin: 0;
      color: #666;
    }
  `;

  override render() {
    return html`
      <h1>Typio NG</h1>
      <p>Foundation only — Stage 1 implementation in progress.</p>
    `;
  }
}
