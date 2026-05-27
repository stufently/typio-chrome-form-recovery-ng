import { describe, it, expect, beforeEach } from 'vitest';
import {
  putEntry,
  queryByHost,
  queryByFieldKey,
  deleteEntry,
  deleteByHost,
  deleteOlderThan,
  countEntries,
  resetDbForTests,
  upsertFieldMeta,
  getFieldMeta,
} from '../../lib/db';

const baseEntry = {
  host: 'example.com',
  pathname: '/page',
  fieldKey: 'k1',
  value: 'hello',
  type: 'text' as const,
  textHash: 'h-hello',
};

async function freshDb() {
  await resetDbForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('typio-ng');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

describe('db.entries — basic CRUD', () => {
  beforeEach(async () => {
    await freshDb();
  });

  it('inserts and retrieves by host', async () => {
    const res = await putEntry(baseEntry);
    expect(res.inserted).toBe(true);
    expect(res.id).toBeTypeOf('number');
    const entries = await queryByHost('example.com');
    expect(entries.length).toBe(1);
    expect(entries[0]?.value).toBe('hello');
    expect(entries[0]?.valueLen).toBe(5);
  });

  it('returns empty for a different host', async () => {
    await putEntry(baseEntry);
    expect(await queryByHost('other.com')).toEqual([]);
  });

  it('returns newest first', async () => {
    await putEntry({ ...baseEntry, value: 'first', textHash: 'h-first' });
    await new Promise((r) => setTimeout(r, 5));
    await putEntry({ ...baseEntry, value: 'second', textHash: 'h-second' });
    await new Promise((r) => setTimeout(r, 5));
    await putEntry({ ...baseEntry, value: 'third', textHash: 'h-third' });
    const entries = await queryByHost('example.com');
    expect(entries.map((e) => e.value)).toEqual(['third', 'second', 'first']);
  });

  it('respects the limit option', async () => {
    for (let i = 0; i < 5; i++) {
      await putEntry({ ...baseEntry, value: 'v' + i, textHash: 'h' + i });
      await new Promise((r) => setTimeout(r, 2));
    }
    expect((await queryByHost('example.com', { limit: 2 })).length).toBe(2);
  });

  it('queries by fieldKey scoped to host', async () => {
    await putEntry({ ...baseEntry, fieldKey: 'k1', value: 'a', textHash: 'ha' });
    await putEntry({ ...baseEntry, fieldKey: 'k2', value: 'b', textHash: 'hb' });
    const onlyK1 = await queryByFieldKey('example.com', 'k1');
    expect(onlyK1.length).toBe(1);
    expect(onlyK1[0]?.value).toBe('a');
  });

  it('does not leak across hosts when querying by fieldKey', async () => {
    await putEntry({ ...baseEntry, host: 'a.com', fieldKey: 'shared', textHash: 'h-shared' });
    await putEntry({ ...baseEntry, host: 'b.com', fieldKey: 'shared', textHash: 'h-shared' });
    expect((await queryByFieldKey('a.com', 'shared')).length).toBe(1);
  });

  it('deletes an entry by id', async () => {
    const { id } = await putEntry(baseEntry);
    await deleteEntry(id);
    expect(await countEntries()).toBe(0);
  });

  it('deletes everything for a host', async () => {
    await putEntry({ ...baseEntry, host: 'a.com', textHash: 'ha' });
    await putEntry({ ...baseEntry, host: 'a.com', value: 'two', textHash: 'h2' });
    await putEntry({ ...baseEntry, host: 'b.com', textHash: 'hb' });
    const deleted = await deleteByHost('a.com');
    expect(deleted).toBe(2);
    expect((await queryByHost('a.com')).length).toBe(0);
    expect((await queryByHost('b.com')).length).toBe(1);
  });
});

describe('db.entries — dedupe and cap', () => {
  beforeEach(async () => {
    await freshDb();
  });

  it('does NOT insert a duplicate (same host+fieldKey+textHash), bumps updatedAt instead', async () => {
    const first = await putEntry(baseEntry);
    expect(first.inserted).toBe(true);
    const second = await putEntry(baseEntry);
    expect(second.inserted).toBe(false);
    expect(second.id).toBe(first.id);
    expect(await countEntries()).toBe(1);
  });

  it('a different textHash for the same field is a new row', async () => {
    await putEntry(baseEntry);
    const next = await putEntry({ ...baseEntry, value: 'goodbye', textHash: 'h-bye' });
    expect(next.inserted).toBe(true);
    expect(await countEntries()).toBe(2);
  });

  it('caps entries per field, dropping the oldest', async () => {
    for (let i = 0; i < 5; i++) {
      await putEntry({ ...baseEntry, value: 'v' + i, textHash: 'h' + i });
      await new Promise((r) => setTimeout(r, 2));
    }
    expect(await countEntries()).toBe(5);
    await putEntry({ ...baseEntry, value: 'v5', textHash: 'h5' }, { maxPerField: 3 });
    expect(await countEntries()).toBe(3);
    const remaining = await queryByFieldKey('example.com', 'k1');
    const values = remaining.map((e) => e.value).sort();
    // The newest three (v3, v4, v5) should remain.
    expect(values).toEqual(['v3', 'v4', 'v5']);
  });

  it('cap does not affect entries with a different fieldKey', async () => {
    for (let i = 0; i < 5; i++) {
      await putEntry({
        ...baseEntry,
        fieldKey: 'other',
        value: 'a' + i,
        textHash: 'ha' + i,
      });
      await new Promise((r) => setTimeout(r, 2));
    }
    await putEntry({ ...baseEntry, value: 'k1-only', textHash: 'h-only' }, { maxPerField: 2 });
    expect((await queryByFieldKey('example.com', 'other')).length).toBe(5);
  });

  it('caps entries per host across all fields', async () => {
    // Fill the host with unique fieldKeys — simulates a runaway site.
    for (let i = 0; i < 6; i++) {
      await putEntry({
        ...baseEntry,
        fieldKey: 'k' + i,
        value: 'v' + i,
        textHash: 'h' + i,
      });
      await new Promise((r) => setTimeout(r, 2));
    }
    // Next put with a low per-host cap should trim to the cap.
    await putEntry(
      { ...baseEntry, fieldKey: 'k-new', value: 'v-new', textHash: 'h-new' },
      { maxPerField: 100, maxPerHost: 3 },
    );
    const entries = await queryByHost('example.com', { limit: 50 });
    expect(entries.length).toBe(3);
    // The newest should survive — order is desc.
    expect(entries[0]?.value).toBe('v-new');
  });

  it('per-host cap is scoped to the host', async () => {
    for (let i = 0; i < 5; i++) {
      await putEntry({ ...baseEntry, host: 'a.com', fieldKey: 'f' + i, textHash: 'ha' + i });
      await new Promise((r) => setTimeout(r, 2));
    }
    await putEntry(
      { ...baseEntry, host: 'b.com', fieldKey: 'fb', textHash: 'hb' },
      { maxPerHost: 1 },
    );
    expect((await queryByHost('a.com')).length).toBe(5);
    expect((await queryByHost('b.com')).length).toBe(1);
  });
});

describe('db.entries — retention', () => {
  beforeEach(async () => {
    await freshDb();
  });

  it('prunes entries older than the cutoff', async () => {
    await putEntry(baseEntry);
    await new Promise((r) => setTimeout(r, 10));
    const cutoff = Date.now();
    await new Promise((r) => setTimeout(r, 5));
    await putEntry({ ...baseEntry, value: 'newer', textHash: 'h-newer' });
    const deleted = await deleteOlderThan(cutoff);
    expect(deleted).toBeGreaterThanOrEqual(1);
    const remaining = await queryByHost('example.com');
    expect(remaining.some((e) => e.value === 'newer')).toBe(true);
    expect(remaining.some((e) => e.value === 'hello')).toBe(false);
  });
});

describe('db.fields — metadata', () => {
  beforeEach(async () => {
    await freshDb();
  });

  it('upserts and retrieves field metadata', async () => {
    await upsertFieldMeta({
      fieldKey: 'k1',
      host: 'example.com',
      lastSeen: 123,
      hints: { name: 'email' },
    });
    const got = await getFieldMeta('k1');
    expect(got?.host).toBe('example.com');
    expect(got?.hints.name).toBe('email');
  });

  it('overwrites on second upsert with the same fieldKey', async () => {
    await upsertFieldMeta({ fieldKey: 'k1', host: 'a.com', lastSeen: 1, hints: {} });
    await upsertFieldMeta({ fieldKey: 'k1', host: 'b.com', lastSeen: 2, hints: {} });
    const got = await getFieldMeta('k1');
    expect(got?.host).toBe('b.com');
    expect(got?.lastSeen).toBe(2);
  });
});
