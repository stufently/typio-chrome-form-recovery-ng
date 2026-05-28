// Options page. Stage 3 — retention slider, blocklist editor, import/export.

import { LitElement, html, css, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { sendMessage } from '../../lib/messaging';
import type { ExportBundle, ImportSummary, Message, Settings } from '../../lib/types';
import { MAX_IMPORT_BYTES, exportToBlob } from '../../lib/export-import';
import { t } from '../../lib/i18n';

const TAG = 'typio-options';

export class TypioOptions extends LitElement {
  static override styles = css`
    :host {
      display: block;
      max-width: 760px;
      margin: 48px auto;
      padding: 0 24px;
      font:
        15px/1.55 -apple-system,
        BlinkMacSystemFont,
        'Segoe UI',
        sans-serif;
      color: #1a1a1a;
    }
    h1 {
      font-size: 22px;
      margin: 0 0 24px;
    }
    section {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 18px 22px;
      margin-bottom: 18px;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 16px;
      font-weight: 600;
    }
    label {
      display: block;
      margin-top: 12px;
      font-size: 14px;
      color: #1f2937;
    }
    input[type='range'] {
      width: 100%;
    }
    textarea {
      width: 100%;
      box-sizing: border-box;
      min-height: 120px;
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font:
        13px/1.4 ui-monospace,
        SFMono-Regular,
        Menlo,
        monospace;
      resize: vertical;
    }
    .help {
      color: #6b7280;
      font-size: 12px;
      margin-top: 4px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    button {
      cursor: pointer;
      background: #2563eb;
      color: #fff;
      border: 0;
      padding: 8px 14px;
      border-radius: 6px;
      font: inherit;
    }
    button.secondary {
      background: #f3f4f6;
      color: #111;
    }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .saved {
      color: #16a34a;
      font-size: 13px;
      margin-left: 8px;
    }
    .summary {
      margin-top: 8px;
      padding: 10px 12px;
      background: #f8fafc;
      border-radius: 6px;
      font-size: 13px;
    }
    .summary.error {
      background: #fef2f2;
      color: #b91c1c;
    }
  `;

  @state() private settings: Settings | null = null;
  @state() private blocklistText = '';
  @state() private savedAt = 0;
  @state() private importSummary: ImportSummary | null = null;
  @state() private pendingImport: unknown = null;
  @state() private pendingByteSize = 0;

  override async connectedCallback(): Promise<void> {
    super.connectedCallback();
    await this.loadSettings();
  }

  private async loadSettings(): Promise<void> {
    const reply = await sendMessage({ type: 'GET_SETTINGS' });
    if (reply.ok) {
      this.settings = reply.data as Settings;
      this.blocklistText = this.settings.blocklistHostnames.join('\n');
    }
  }

  private async save(): Promise<void> {
    if (!this.settings) return;
    const blocklist = this.blocklistText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5000);
    const patch: Partial<Settings> = {
      retentionDays: this.settings.retentionDays,
      blocklistHostnames: blocklist,
    };
    const reply = await sendMessage({ type: 'UPDATE_SETTINGS', settings: patch });
    if (reply.ok) {
      this.settings = reply.data as Settings;
      this.blocklistText = this.settings.blocklistHostnames.join('\n');
      this.savedAt = Date.now();
    }
  }

  private async exportNow(): Promise<void> {
    const msg: Message = { type: 'EXPORT_DATA' };
    const reply = await sendMessage(msg);
    if (!reply.ok) return;
    const bundle = (reply.data as { bundle?: ExportBundle } | undefined)?.bundle;
    if (!bundle) return;
    const blob = exportToBlob(bundle);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'typio-ng-export.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  private async onPickImport(e: Event): Promise<void> {
    this.importSummary = null;
    this.pendingImport = null;
    this.pendingByteSize = 0;
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      this.importSummary = {
        ok: false,
        reason: `file too large (${file.size} bytes, max ${MAX_IMPORT_BYTES})`,
        entries: { willInsert: 0, willSkipDuplicate: 0, invalid: 0 },
        settings: { willOverwrite: false },
      };
      return;
    }
    const text = await file.text();
    this.pendingByteSize = new Blob([text]).size;
    try {
      this.pendingImport = JSON.parse(text);
    } catch (err) {
      this.importSummary = {
        ok: false,
        reason: 'invalid JSON: ' + (err instanceof Error ? err.message : 'parse error'),
        entries: { willInsert: 0, willSkipDuplicate: 0, invalid: 0 },
        settings: { willOverwrite: false },
      };
      return;
    }
    await this.dryRun();
  }

  private async dryRun(): Promise<void> {
    if (this.pendingImport === null) return;
    const reply = await sendMessage({
      type: 'IMPORT_DATA',
      bundle: this.pendingImport,
      dryRun: true,
      byteSize: this.pendingByteSize,
    });
    if (reply.ok) {
      this.importSummary = (reply.data as { summary?: ImportSummary } | undefined)?.summary ?? null;
    }
  }

  private async applyImport(): Promise<void> {
    if (this.pendingImport === null) return;
    if (!this.importSummary?.ok) return;
    const reply = await sendMessage({
      type: 'IMPORT_DATA',
      bundle: this.pendingImport,
      dryRun: false,
      byteSize: this.pendingByteSize,
    });
    if (reply.ok) {
      this.importSummary = (reply.data as { summary?: ImportSummary } | undefined)?.summary ?? null;
      this.pendingImport = null;
      this.pendingByteSize = 0;
      await this.loadSettings();
    }
  }

  override render() {
    if (!this.settings) return html`<p>${t('popup_loading')}</p>`;
    const s = this.settings;
    const justSaved = this.savedAt > 0 && Date.now() - this.savedAt < 4_000;

    return html`
      <h1>${t('options_title')}</h1>

      <section>
        <h2>${t('options_retention')}</h2>
        <label>
          ${t('options_retention_days', String(s.retentionDays))}
          <input
            type="range"
            min="1"
            max="365"
            .value=${String(s.retentionDays)}
            @input=${(e: Event) =>
              (this.settings = {
                ...s,
                retentionDays: Number((e.target as HTMLInputElement).value),
              })}
          />
        </label>
        <div class="row">
          <button @click=${this.save}>Save</button>
          ${justSaved ? html`<span class="saved">${t('options_saved')}</span>` : nothing}
        </div>
      </section>

      <section>
        <h2>${t('options_blocklist')}</h2>
        <textarea
          .value=${this.blocklistText}
          @input=${(e: Event) => (this.blocklistText = (e.target as HTMLTextAreaElement).value)}
          spellcheck="false"
        ></textarea>
        <div class="help">${t('options_blocklist_help')}</div>
        <div class="row" style="margin-top:10px;">
          <button @click=${this.save}>Save</button>
          ${justSaved ? html`<span class="saved">${t('options_saved')}</span>` : nothing}
        </div>
      </section>

      <section>
        <h2>${t('options_export')} / ${t('options_import')}</h2>
        <div class="row">
          <button class="secondary" @click=${this.exportNow}>${t('options_export')}</button>
          <label class="secondary" style="cursor:pointer;">
            <input
              type="file"
              accept="application/json"
              style="display:none;"
              @change=${this.onPickImport}
            />
            <span
              style="display:inline-block;padding:8px 14px;background:#f3f4f6;border-radius:6px;"
              >${t('options_import')}</span
            >
          </label>
        </div>
        ${this.importSummary
          ? html`
              <div class="summary ${this.importSummary.ok ? '' : 'error'}">
                ${this.importSummary.ok
                  ? html`Insert: ${this.importSummary.entries.willInsert}, skip duplicates:
                    ${this.importSummary.entries.willSkipDuplicate}, invalid:
                    ${this.importSummary.entries.invalid}. Settings overwrite:
                    ${this.importSummary.settings.willOverwrite ? 'yes' : 'no'}.`
                  : html`Cannot import: ${this.importSummary.reason}`}
              </div>
              ${this.importSummary.ok
                ? html`<div class="row" style="margin-top:10px;">
                    <button @click=${this.applyImport}>${t('options_import_apply')}</button>
                  </div>`
                : nothing}
            `
          : nothing}
      </section>
    `;
  }
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, TypioOptions);
}
