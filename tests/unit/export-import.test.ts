import { describe, it, expect } from 'vitest';
import {
  buildExport,
  parseImport,
  exportToBlob,
  EXPORT_SCHEMA_VERSION,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ENTRIES,
} from '../../lib/export-import';
import { DEFAULT_SETTINGS, type Entry, type Settings } from '../../lib/types';

const entry = (over: Partial<Entry> = {}): Entry => ({
  host: 'example.com',
  pathname: '/p',
  fieldKey: 'k1',
  value: 'hello world',
  type: 'text',
  valueLen: 11,
  textHash: 'abc',
  createdAt: 1,
  updatedAt: 2,
  ...over,
});

describe('buildExport', () => {
  it('produces the current schema version', () => {
    const bundle = buildExport(DEFAULT_SETTINGS, [entry()], '1.0.0');
    expect(bundle.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(bundle.appVersion).toBe('1.0.0');
    expect(bundle.entries.length).toBe(1);
  });
});

describe('exportToBlob', () => {
  it('serialises to JSON blob', async () => {
    const blob = exportToBlob(buildExport(DEFAULT_SETTINGS, [entry()], '1.0.0'));
    expect(blob.type).toBe('application/json');
    const text = await blob.text();
    const parsed = JSON.parse(text);
    expect(parsed.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
  });
});

describe('parseImport — happy path', () => {
  it('accepts a freshly-built export with the same schema', () => {
    const bundle = buildExport(DEFAULT_SETTINGS, [entry()], '1.0.0');
    const result = parseImport(bundle, new Set());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary.entries.willInsert).toBe(1);
      expect(result.summary.entries.willSkipDuplicate).toBe(0);
      expect(result.summary.entries.invalid).toBe(0);
      expect(result.summary.settings.willOverwrite).toBe(true);
    }
  });

  it('marks duplicates by [host, fieldKey, textHash] and excludes them from bundle.entries', () => {
    const e = entry({ textHash: 'dup' });
    const bundle = buildExport(DEFAULT_SETTINGS, [e], '1.0.0');
    const result = parseImport(bundle, new Set(['example.com|k1|dup']));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary.entries.willInsert).toBe(0);
      expect(result.summary.entries.willSkipDuplicate).toBe(1);
      // The duplicate must not leak into the bundle that apply() will iterate.
      expect(result.bundle.entries).toEqual([]);
    }
  });

  it('dedupes within the import file itself', () => {
    const bundle = buildExport(
      DEFAULT_SETTINGS,
      [
        entry({ textHash: 'h1' }),
        entry({ textHash: 'h1' }), // same host+fieldKey+textHash → duplicate of the first
        entry({ textHash: 'h2' }),
      ],
      '1.0.0',
    );
    const result = parseImport(bundle, new Set());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary.entries.willInsert).toBe(2);
      expect(result.summary.entries.willSkipDuplicate).toBe(1);
      expect(result.bundle.entries.length).toBe(2);
    }
  });

  it('counts invalid entries without failing the whole import', () => {
    const bundle = buildExport(DEFAULT_SETTINGS, [], '1.0.0');
    (bundle as unknown as { entries: unknown[] }).entries = [
      entry(),
      { broken: true },
      { host: '', pathname: '', fieldKey: '', value: '', type: 'text', textHash: 'x' },
    ];
    const result = parseImport(bundle, new Set());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary.entries.invalid).toBe(2);
      expect(result.summary.entries.willInsert).toBe(1);
    }
  });
});

describe('parseImport — rejection', () => {
  it('rejects non-object payloads', () => {
    const out = parseImport(null, new Set());
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('not-an-object');
  });

  it('rejects wrong schemaVersion', () => {
    const out = parseImport({ schemaVersion: 99, entries: [] }, new Set());
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/schemaVersion/);
  });

  it('rejects entries not being an array', () => {
    const out = parseImport({ schemaVersion: EXPORT_SCHEMA_VERSION, entries: 'oops' }, new Set());
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('entries-not-array');
  });

  it('rejects byte-size overflow', () => {
    const out = parseImport(
      { schemaVersion: EXPORT_SCHEMA_VERSION, entries: [] },
      new Set(),
      MAX_IMPORT_BYTES + 1,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/too large/);
  });

  it('rejects entries-count overflow', () => {
    const huge = new Array(MAX_IMPORT_ENTRIES + 1).fill(entry());
    const out = parseImport({ schemaVersion: EXPORT_SCHEMA_VERSION, entries: huge }, new Set());
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/too many entries/);
  });
});

describe('parseImport — settings merge', () => {
  it('clamps weird settings values to defaults', () => {
    const bundle = {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      entries: [],
      settings: {
        retentionDays: 99999,
        blocklistHostnames: ['ok.com', '', '   ', 1, 'also.ok'],
        maxEntriesPerField: -1,
        maxEntriesPerHost: 0,
      },
    };
    const out = parseImport(bundle, new Set());
    expect(out.ok).toBe(true);
    if (out.ok) {
      // retentionDays clamped — outside [1,365] falls back to default.
      expect(out.bundle.settings.retentionDays).toBe(DEFAULT_SETTINGS.retentionDays);
      // blocklist filtered to strings.
      expect(out.bundle.settings.blocklistHostnames).toEqual(['ok.com', 'also.ok']);
      // negative caps fall back to default.
      expect(out.bundle.settings.maxEntriesPerField).toBe(DEFAULT_SETTINGS.maxEntriesPerField);
      expect(out.bundle.settings.maxEntriesPerHost).toBe(DEFAULT_SETTINGS.maxEntriesPerHost);
    }
  });

  it('accepts valid settings unchanged', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      retentionDays: 7,
      blocklistHostnames: ['bank.com'],
      maxEntriesPerField: 100,
      maxEntriesPerHost: 2000,
    };
    const out = parseImport(
      { schemaVersion: EXPORT_SCHEMA_VERSION, entries: [], settings },
      new Set(),
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.bundle.settings.retentionDays).toBe(7);
      expect(out.bundle.settings.blocklistHostnames).toEqual(['bank.com']);
      expect(out.bundle.settings.maxEntriesPerField).toBe(100);
      expect(out.bundle.settings.maxEntriesPerHost).toBe(2000);
    }
  });
});
