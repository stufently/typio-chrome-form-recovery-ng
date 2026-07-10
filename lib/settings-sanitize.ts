// Shared validation for settings patches. Used by the background
// UPDATE_SETTINGS handler and by import merging, so a malformed message or a
// crafted bundle cannot write NaN retention or zero caps that would break the
// cleanup alarm and per-save trimming (2026-07-10 review, finding 5).

import type { Settings } from './types';

/**
 * Keep only known keys with in-range values; drop everything else. Out-of-range
 * numbers are rejected (caller keeps its current/default value), matching the
 * historical import semantics.
 */
export function sanitizeSettingsPatch(raw: Record<string, unknown>): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (
    typeof raw['retentionDays'] === 'number' &&
    Number.isFinite(raw['retentionDays']) &&
    raw['retentionDays'] >= 1 &&
    raw['retentionDays'] <= 365
  ) {
    out.retentionDays = Math.floor(raw['retentionDays']);
  }
  if (Array.isArray(raw['blocklistHostnames'])) {
    out.blocklistHostnames = (raw['blocklistHostnames'] as unknown[])
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
    out.maxEntriesPerField = Math.min(1000, Math.floor(raw['maxEntriesPerField']));
  }
  if (
    typeof raw['maxEntriesPerHost'] === 'number' &&
    Number.isFinite(raw['maxEntriesPerHost']) &&
    raw['maxEntriesPerHost'] >= 1
  ) {
    out.maxEntriesPerHost = Math.min(100_000, Math.floor(raw['maxEntriesPerHost']));
  }
  return out;
}
