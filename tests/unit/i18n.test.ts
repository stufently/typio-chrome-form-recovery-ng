import { describe, it, expect } from 'vitest';

// The tests/setup.ts mock points webextension-polyfill.default.i18n.getMessage
// at a function we can override here per-test.

describe('t()', () => {
  it('returns the key as fallback when getMessage yields empty', async () => {
    const { default: browser } = await import('webextension-polyfill');
    (browser as unknown as { i18n: { getMessage: (k: string) => string } }).i18n.getMessage = () =>
      '';

    const { t } = await import('../../lib/i18n');
    expect(t('options_saved')).toBe('options_saved');
  });

  it('returns the message when getMessage yields a string', async () => {
    const { default: browser } = await import('webextension-polyfill');
    (browser as unknown as { i18n: { getMessage: (k: string) => string } }).i18n.getMessage = (
      key,
    ) => (key === 'options_saved' ? 'Saved.' : '');

    const { t } = await import('../../lib/i18n');
    expect(t('options_saved')).toBe('Saved.');
  });

  it('uses substitution arg in placeholder messages', async () => {
    const { default: browser } = await import('webextension-polyfill');
    (
      browser as unknown as {
        i18n: { getMessage: (k: string, s?: string | string[]) => string };
      }
    ).i18n.getMessage = (_key, s) => `Keep ${Array.isArray(s) ? (s[0] ?? '') : (s ?? '')} days`;

    const { t } = await import('../../lib/i18n');
    expect(t('options_retention_days', '14')).toBe('Keep 14 days');
  });
});
