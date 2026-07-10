// IndexedDB wrapper. The extension's source of truth — see docs/THREAT_MODEL.md.
//
// Schema v2 (Stage 2):
//   entries store: auto-incremented id, value typed as Entry, indexed by
//     [host, updatedAt], [host, fieldKey, updatedAt], updatedAt, and
//     [host, fieldKey, textHash] (for dedupe).
//   fields  store: keyed by fieldKey, holds last-seen hints. Lets the popup
//     show a friendly per-field label and bounds rename heuristics later.
//
// Stage 1 used v1 (single entries store, no dedupe, no fields). The upgrade
// path is forward-only — v1 users will start with a `fields` store on their
// next launch.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Entry, FieldMeta } from './types';

const DB_NAME = 'typio-ng';
const DB_VERSION = 2;

interface TypioDB extends DBSchema {
  entries: {
    key: number;
    value: Entry;
    indexes: {
      'by-host': [string, number];
      'by-fieldKey': [string, string, number];
      'by-updatedAt': number;
      'by-dedupe': [string, string, string];
    };
  };
  fields: {
    key: string;
    value: FieldMeta;
    indexes: {
      'by-host': [string, number];
    };
  };
}

let dbPromise: Promise<IDBPDatabase<TypioDB>> | null = null;

function getDb(): Promise<IDBPDatabase<TypioDB>> {
  if (dbPromise) return dbPromise;
  dbPromise = openDB<TypioDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        const store = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
        store.createIndex('by-host', ['host', 'updatedAt']);
        store.createIndex('by-fieldKey', ['host', 'fieldKey', 'updatedAt']);
        store.createIndex('by-updatedAt', 'updatedAt');
      }
      if (oldVersion < 2) {
        // Reuse the upgrade transaction — opening a new one inside upgrade
        // deadlocks against the versionchange that idb already started.
        const entries = tx.objectStore('entries');
        if (!entries.indexNames.contains('by-dedupe')) {
          entries.createIndex('by-dedupe', ['host', 'fieldKey', 'textHash']);
        }
        const fields = db.createObjectStore('fields', { keyPath: 'fieldKey' });
        fields.createIndex('by-host', ['host', 'lastSeen']);
      }
    },
  });
  return dbPromise;
}

/** For tests: close and reset the cached DB connection. */
export async function resetDbForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
}

export interface NewEntry {
  host: string;
  origin?: string | undefined;
  pathname: string;
  fieldKey: string;
  value: string;
  type: Entry['type'];
  textHash: string;
}

export interface PutResult {
  /** Newly inserted id, OR the id of the existing entry whose updatedAt was bumped. */
  id: number;
  /** True if a new row was inserted; false if we bumped an existing duplicate. */
  inserted: boolean;
}

export interface PutLimits {
  maxPerField: number;
  maxPerHost: number;
}

const DEFAULT_LIMITS: PutLimits = { maxPerField: 50, maxPerHost: 1000 };

export async function putEntry(input: NewEntry, limits?: Partial<PutLimits>): Promise<PutResult> {
  const { maxPerField, maxPerHost } = { ...DEFAULT_LIMITS, ...limits };
  const db = await getDb();
  const now = Date.now();

  const tx = db.transaction('entries', 'readwrite');
  const store = tx.store;
  const dedupeIdx = store.index('by-dedupe');
  const fieldIdx = store.index('by-fieldKey');
  const hostIdx = store.index('by-host');

  // Dedupe: if the same fieldKey already holds this exact value (textHash), bump it.
  const dupKey = IDBKeyRange.only([input.host, input.fieldKey, input.textHash]);
  const existing = await dedupeIdx.get(dupKey);
  if (existing) {
    existing.updatedAt = now;
    await store.put(existing);
    await tx.done;
    return { id: existing.id as number, inserted: false };
  }

  const entry: Entry = {
    host: input.host,
    origin: input.origin,
    pathname: input.pathname,
    fieldKey: input.fieldKey,
    value: input.value,
    type: input.type,
    valueLen: input.value.length,
    textHash: input.textHash,
    createdAt: now,
    updatedAt: now,
  };
  const id = (await store.add(entry)) as number;

  // Cap per field — drop oldest entries with the same [host, fieldKey] beyond the cap.
  await trimOldest(
    fieldIdx as unknown as TrimmableIndex,
    IDBKeyRange.bound(
      [input.host, input.fieldKey, -Infinity],
      [input.host, input.fieldKey, Infinity],
    ),
    maxPerField,
    store as unknown as TrimmableStore,
  );

  // Cap per host — defends against runaway sites that mint unique fieldKeys.
  await trimOldest(
    hostIdx as unknown as TrimmableIndex,
    IDBKeyRange.bound([input.host, -Infinity], [input.host, Infinity]),
    maxPerHost,
    store as unknown as TrimmableStore,
  );

  await tx.done;
  return { id, inserted: true };
}

export async function importEntries(
  inputs: NewEntry[],
  limits?: Partial<PutLimits>,
): Promise<void> {
  const { maxPerField, maxPerHost } = { ...DEFAULT_LIMITS, ...limits };
  const db = await getDb();
  const now = Date.now();

  const tx = db.transaction('entries', 'readwrite');
  const store = tx.store;
  const dedupeIdx = store.index('by-dedupe');

  const hostsToTrim = new Set<string>();
  const fieldsToTrim = new Set<string>();

  for (const input of inputs) {
    const dupKey = IDBKeyRange.only([input.host, input.fieldKey, input.textHash]);
    const existing = await dedupeIdx.get(dupKey);
    if (existing) {
      existing.updatedAt = now;
      await store.put(existing);
      continue;
    }

    const entry: Entry = {
      host: input.host,
      origin: input.origin,
      pathname: input.pathname,
      fieldKey: input.fieldKey,
      value: input.value,
      type: input.type,
      valueLen: input.value.length,
      textHash: input.textHash,
      createdAt: now,
      updatedAt: now,
    };
    await store.add(entry);

    hostsToTrim.add(input.host);
    fieldsToTrim.add(input.host + '|' + input.fieldKey);
  }

  const fieldIdx = store.index('by-fieldKey');
  for (const item of fieldsToTrim) {
    const idx = item.indexOf('|');
    const host = item.slice(0, idx);
    const fieldKey = item.slice(idx + 1);
    await trimOldest(
      fieldIdx as unknown as TrimmableIndex,
      IDBKeyRange.bound([host, fieldKey, -Infinity], [host, fieldKey, Infinity]),
      maxPerField,
      store as unknown as TrimmableStore,
    );
  }

  const hostIdx = store.index('by-host');
  for (const host of hostsToTrim) {
    await trimOldest(
      hostIdx as unknown as TrimmableIndex,
      IDBKeyRange.bound([host, -Infinity], [host, Infinity]),
      maxPerHost,
      store as unknown as TrimmableStore,
    );
  }

  await tx.done;
}

interface TrimmableIndex {
  count(range: IDBKeyRange): Promise<number>;
  openCursor(
    range: IDBKeyRange,
    direction: IDBCursorDirection,
  ): Promise<{ primaryKey: IDBValidKey; continue(): Promise<unknown> } | null>;
}

interface TrimmableStore {
  delete(key: IDBValidKey): Promise<void>;
}

// Trim an index's contents within a range to at most `cap` rows, deleting the
// oldest. count() first so the common no-overflow case costs one B-tree count
// instead of a full cursor walk on every save (2026-07-10 review, finding 10).
async function trimOldest(
  idx: TrimmableIndex,
  range: IDBKeyRange,
  cap: number,
  store: TrimmableStore,
): Promise<void> {
  const total = await idx.count(range);
  if (total <= cap) return;
  let excess = total - cap;
  let cursor = await idx.openCursor(range, 'next');
  while (cursor && excess > 0) {
    await store.delete(cursor.primaryKey);
    excess--;
    cursor = (await cursor.continue()) as typeof cursor;
  }
}

export interface QueryOptions {
  limit?: number;
  /**
   * When set, only entries saved from this exact origin are returned. Without
   * it http://example.com and https://example.com share a bucket — an insecure
   * page could list drafts typed on the HTTPS site (2026-07-10 review,
   * finding 1).
   */
  origin?: string | undefined;
}

/**
 * Origin an entry was saved from. Rows written before 2026-07 have no `origin`
 * field, but every fieldKey has always started with "o=<origin>|".
 */
export function entryOrigin(entry: Entry): string {
  if (entry.origin) return entry.origin;
  if (entry.fieldKey.startsWith('o=')) {
    const end = entry.fieldKey.indexOf('|');
    if (end > 2) return entry.fieldKey.slice(2, end);
  }
  return '';
}

export async function queryByHost(host: string, opts: QueryOptions = {}): Promise<Entry[]> {
  const limit = opts.limit ?? 100;
  const db = await getDb();
  const tx = db.transaction('entries', 'readonly');
  const idx = tx.store.index('by-host');
  const range = IDBKeyRange.bound([host, -Infinity], [host, Infinity]);
  const out: Entry[] = [];
  let cursor = await idx.openCursor(range, 'prev');
  while (cursor && out.length < limit) {
    if (!opts.origin || entryOrigin(cursor.value) === opts.origin) {
      out.push(cursor.value);
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return out;
}

export async function queryByFieldKey(
  host: string,
  fieldKey: string,
  opts: QueryOptions = {},
): Promise<Entry[]> {
  const limit = opts.limit ?? 50;
  const db = await getDb();
  const tx = db.transaction('entries', 'readonly');
  const idx = tx.store.index('by-fieldKey');
  const range = IDBKeyRange.bound([host, fieldKey, -Infinity], [host, fieldKey, Infinity]);
  const out: Entry[] = [];
  let cursor = await idx.openCursor(range, 'prev');
  while (cursor && out.length < limit) {
    if (!opts.origin || entryOrigin(cursor.value) === opts.origin) {
      out.push(cursor.value);
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return out;
}

export async function deleteEntry(id: number): Promise<void> {
  const db = await getDb();
  await db.delete('entries', id);
}

export async function deleteOlderThan(cutoffMs: number): Promise<number> {
  const db = await getDb();
  const tx = db.transaction('entries', 'readwrite');
  const idx = tx.store.index('by-updatedAt');
  const range = IDBKeyRange.upperBound(cutoffMs, true);
  let deleted = 0;
  let cursor = await idx.openCursor(range);
  while (cursor) {
    await cursor.delete();
    deleted++;
    cursor = await cursor.continue();
  }
  await tx.done;
  return deleted;
}

export async function deleteByHost(host: string): Promise<number> {
  const db = await getDb();
  // Clear BOTH stores — leaving `fields` rows behind would retain metadata
  // about which sites/fields the user typed into after they asked us to
  // forget the site (2026-07-10 review, finding 3).
  const tx = db.transaction(['entries', 'fields'], 'readwrite');
  const idx = tx.objectStore('entries').index('by-host');
  const range = IDBKeyRange.bound([host, -Infinity], [host, Infinity]);
  let deleted = 0;
  let cursor = await idx.openCursor(range);
  while (cursor) {
    await cursor.delete();
    deleted++;
    cursor = await cursor.continue();
  }
  const fieldsIdx = tx.objectStore('fields').index('by-host');
  let fieldsCursor = await fieldsIdx.openCursor(range);
  while (fieldsCursor) {
    await fieldsCursor.delete();
    fieldsCursor = await fieldsCursor.continue();
  }
  await tx.done;
  return deleted;
}

/**
 * Drop field metadata not seen since the cutoff. The fields store has no
 * standalone lastSeen index, so this walks the store — it runs once per day
 * from the cleanup alarm, where a full scan is fine.
 */
export async function pruneFieldMetaOlderThan(cutoffMs: number): Promise<number> {
  const db = await getDb();
  const tx = db.transaction('fields', 'readwrite');
  let deleted = 0;
  let cursor = await tx.store.openCursor();
  while (cursor) {
    if (cursor.value.lastSeen < cutoffMs) {
      await cursor.delete();
      deleted++;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return deleted;
}

export async function countEntries(): Promise<number> {
  const db = await getDb();
  return db.count('entries');
}

/**
 * Walks every stored entry. Used only for export and for dedupe lookups during
 * import — UI flows should always query by host/fieldKey instead.
 */
export async function dumpAllEntries(): Promise<Entry[]> {
  const db = await getDb();
  const tx = db.transaction('entries', 'readonly');
  const idx = tx.store.index('by-updatedAt');
  const out: Entry[] = [];
  let cursor = await idx.openCursor(null, 'prev');
  while (cursor) {
    out.push(cursor.value);
    cursor = await cursor.continue();
  }
  await tx.done;
  return out;
}

export async function upsertFieldMeta(meta: FieldMeta): Promise<void> {
  const db = await getDb();
  await db.put('fields', meta);
}

export async function getFieldMeta(fieldKey: string): Promise<FieldMeta | undefined> {
  const db = await getDb();
  return db.get('fields', fieldKey);
}
