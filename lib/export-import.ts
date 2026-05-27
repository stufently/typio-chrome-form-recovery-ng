// Export / import of the user's data as a single JSON bundle.
//
// Codex result review explicitly called for: schema version, hard size limit,
// validation, and a dry-run summary before applying. Implemented here as pure
// functions; the service worker wraps them with IndexedDB read/write.

import type { Entry, ExportBundle, ImportBundle, ImportSummary, Settings } from './types';
import { DEFAULT_SETTINGS } from './types';

export const EXPORT_SCHEMA_VERSION = 1;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMPORT_ENTRIES = 50_000;

const VALID_TYPES: ReadonlySet<Entry['type']> = new Set([
  'text',
  'email',
  'url',
  'search',
  'tel',
  'number',
  'textarea',
]);

export function buildExport(
  settings: Settings,
  entries: Entry[],
  appVersion: string,
): ExportBundle {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: Date.now(),
    appVersion,
    settings,
    entries,
  };
}

export interface ParsedImport {
  ok: true;
  bundle: ExportBundle;
  summary: ImportSummary;
}

export interface FailedImport {
  ok: false;
  reason: string;
  summary: ImportSummary;
}

const EMPTY_SUMMARY = (): ImportSummary => ({
  ok: false,
  entries: { willInsert: 0, willSkipDuplicate: 0, invalid: 0 },
  settings: { willOverwrite: false },
});

export function parseImport(
  raw: ImportBundle,
  existingHashes: ReadonlySet<string>,
  byteSize?: number,
): ParsedImport | FailedImport {
  const summary = EMPTY_SUMMARY();

  if (byteSize !== undefined && byteSize > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      reason: `import too large (${byteSize} bytes, max ${MAX_IMPORT_BYTES})`,
      summary,
    };
  }

  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, reason: 'not-an-object', summary };
  }
  const obj = raw as Record<string, unknown>;

  if (obj['schemaVersion'] !== EXPORT_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `unsupported schemaVersion: ${String(obj['schemaVersion'])}`,
      summary,
    };
  }

  if (!Array.isArray(obj['entries'])) {
    return { ok: false, reason: 'entries-not-array', summary };
  }

  if ((obj['entries'] as unknown[]).length > MAX_IMPORT_ENTRIES) {
    return {
      ok: false,
      reason: `too many entries (${(obj['entries'] as unknown[]).length}, max ${MAX_IMPORT_ENTRIES})`,
      summary,
    };
  }

  // Two collections: insertable goes to apply; duplicates are counted for the
  // dry-run summary but never written. Codex review b7huxswk3 — duplicates
  // were leaking into apply and bumping updatedAt on existing rows.
  const insertable: Entry[] = [];
  const seen = new Set(existingHashes);
  for (const candidate of obj['entries'] as unknown[]) {
    const entry = validateEntry(candidate);
    if (!entry) {
      summary.entries.invalid++;
      continue;
    }
    const key = entry.host + '|' + entry.fieldKey + '|' + entry.textHash;
    if (seen.has(key)) {
      summary.entries.willSkipDuplicate++;
      continue;
    }
    seen.add(key); // dedupe within the import file too
    insertable.push(entry);
    summary.entries.willInsert++;
  }

  const settingsCandidate = obj['settings'];
  let settings: Settings = DEFAULT_SETTINGS;
  if (settingsCandidate && typeof settingsCandidate === 'object') {
    settings = mergeSettings(settingsCandidate as Record<string, unknown>);
    summary.settings.willOverwrite = true;
  }

  summary.ok = true;
  const bundle: ExportBundle = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: typeof obj['exportedAt'] === 'number' ? (obj['exportedAt'] as number) : Date.now(),
    appVersion: typeof obj['appVersion'] === 'string' ? (obj['appVersion'] as string) : 'unknown',
    settings,
    // Only non-duplicate, valid entries land here — apply() can iterate
    // without an extra duplicate check.
    entries: insertable,
  };
  return { ok: true, bundle, summary };
}

function validateEntry(raw: unknown): Entry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['host'] !== 'string' || r['host'].length === 0) return null;
  if (typeof r['pathname'] !== 'string') return null;
  if (typeof r['fieldKey'] !== 'string' || r['fieldKey'].length === 0) return null;
  if (typeof r['value'] !== 'string' || r['value'].length === 0) return null;
  if (typeof r['type'] !== 'string' || !VALID_TYPES.has(r['type'] as Entry['type'])) {
    return null;
  }
  if (typeof r['textHash'] !== 'string' || r['textHash'].length === 0) return null;
  const now = Date.now();
  const createdAt =
    typeof r['createdAt'] === 'number' && Number.isFinite(r['createdAt'])
      ? (r['createdAt'] as number)
      : now;
  const updatedAt =
    typeof r['updatedAt'] === 'number' && Number.isFinite(r['updatedAt'])
      ? (r['updatedAt'] as number)
      : createdAt;

  return {
    host: r['host'],
    pathname: r['pathname'] as string,
    fieldKey: r['fieldKey'] as string,
    value: r['value'] as string,
    type: r['type'] as Entry['type'],
    valueLen: (r['value'] as string).length,
    textHash: r['textHash'] as string,
    createdAt,
    updatedAt,
  };
}

function mergeSettings(raw: Record<string, unknown>): Settings {
  const safe: Settings = { ...DEFAULT_SETTINGS };
  if (
    typeof raw['retentionDays'] === 'number' &&
    raw['retentionDays'] >= 1 &&
    raw['retentionDays'] <= 365
  ) {
    safe.retentionDays = Math.floor(raw['retentionDays'] as number);
  }
  if (Array.isArray(raw['blocklistHostnames'])) {
    safe.blocklistHostnames = (raw['blocklistHostnames'] as unknown[])
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 5000);
  }
  if (
    typeof raw['maxEntriesPerField'] === 'number' &&
    Number.isFinite(raw['maxEntriesPerField']) &&
    raw['maxEntriesPerField'] >= 1
  ) {
    safe.maxEntriesPerField = Math.min(1000, Math.floor(raw['maxEntriesPerField'] as number));
  }
  if (
    typeof raw['maxEntriesPerHost'] === 'number' &&
    Number.isFinite(raw['maxEntriesPerHost']) &&
    raw['maxEntriesPerHost'] >= 1
  ) {
    safe.maxEntriesPerHost = Math.min(100_000, Math.floor(raw['maxEntriesPerHost'] as number));
  }
  return safe;
}

export function exportToBlob(bundle: ExportBundle): Blob {
  return new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
}
