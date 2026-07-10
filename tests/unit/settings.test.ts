import { describe, it, expect } from 'vitest';
import { getSettings, setSettings, resetSettings } from '../../lib/settings';

describe('settings', () => {
  it('returns defaults on a fresh store', async () => {
    await resetSettings();
    const s = await getSettings();
    expect(s.retentionDays).toBe(30);
    expect(s.blocklistHostnames).toEqual([]);
    expect(s.maxEntriesPerField).toBe(50);
    expect(s.maxEntriesPerHost).toBe(1000);
    expect(s.saveInIncognito).toBe(false);
    expect(s.schemaVersion).toBe(1);
  });

  it('merges partial updates with defaults', async () => {
    await resetSettings();
    await setSettings({ retentionDays: 7 });
    const s = await getSettings();
    expect(s.retentionDays).toBe(7);
    expect(s.maxEntriesPerField).toBe(50);
  });

  it('persists blocklist hostnames', async () => {
    await resetSettings();
    await setSettings({ blocklistHostnames: ['bank.com', 'gov.example'] });
    const s = await getSettings();
    expect(s.blocklistHostnames).toEqual(['bank.com', 'gov.example']);
  });
});

describe('settings — sanitization (2026-07-10 review)', () => {
  it('rejects NaN/out-of-range retentionDays', async () => {
    await resetSettings();
    await setSettings({ retentionDays: NaN });
    expect((await getSettings()).retentionDays).toBe(30);
    await setSettings({ retentionDays: 0 });
    expect((await getSettings()).retentionDays).toBe(30);
    await setSettings({ retentionDays: 99999 });
    expect((await getSettings()).retentionDays).toBe(30);
  });

  it('rejects zero caps that would break trimming', async () => {
    await resetSettings();
    await setSettings({ maxEntriesPerField: 0, maxEntriesPerHost: NaN });
    const s = await getSettings();
    expect(s.maxEntriesPerField).toBe(50);
    expect(s.maxEntriesPerHost).toBe(1000);
  });

  it('drops non-string blocklist entries', async () => {
    await resetSettings();
    await setSettings({
      blocklistHostnames: ['ok.com', 42, null, '  spaced.com  ', ''] as unknown as string[],
    });
    expect((await getSettings()).blocklistHostnames).toEqual(['ok.com', 'spaced.com']);
  });
});
