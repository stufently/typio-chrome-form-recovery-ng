// Shared types for Typio Chrome Form Recovery NG.
// Stage 0 placeholder — the real shapes will be filled in during Stage 1
// (vertical slice). Kept here so the file structure compiles.

export interface FieldIdentity {
  /** Site origin, e.g. "https://example.com" */
  origin: string;
  /** Normalised pathname (query stripped) */
  pathname: string;
  /** Stable, score-derived identifier for the input across DOM re-renders */
  fieldKey: string;
  /** Weak hint for human readability — never used as primary key */
  domPathHint?: string;
}

export interface Entry {
  id?: number;
  host: string;
  pathname: string;
  fieldKey: string;
  value: string;
  type: 'text' | 'email' | 'url' | 'search' | 'tel' | 'number' | 'textarea';
  valueLen: number;
  /** Hex SHA-256 of value, used for dedupe */
  textHash: string;
  createdAt: number;
  updatedAt: number;
}

export interface FieldMeta {
  fieldKey: string;
  host: string;
  lastSeen: number;
  hints: {
    name?: string;
    id?: string;
    autocomplete?: string;
    ariaLabel?: string;
    placeholder?: string;
    label?: string;
  };
}

export interface Settings {
  retentionDays: number;
  blocklistHostnames: string[];
  maxEntriesPerField: number;
  maxEntriesPerHost: number;
  saveInIncognito: false; // intentionally a literal — see docs/THREAT_MODEL.md
  schemaVersion: 1;
}

export const DEFAULT_SETTINGS: Settings = {
  retentionDays: 30,
  blocklistHostnames: [],
  maxEntriesPerField: 50,
  maxEntriesPerHost: 1000,
  saveInIncognito: false,
  schemaVersion: 1,
};

// Typed runtime messaging between content / popup / options / service worker.
// See docs/THREAT_MODEL.md — only typed messages cross trust boundaries.

export interface SaveEntryPayload {
  host: string;
  pathname: string;
  fieldKey: string;
  value: string;
  type: Entry['type'];
}

export interface RestoreEntryPayload {
  entryId: number;
  fieldKey: string;
  value: string;
}

export type Message =
  | { type: 'SAVE_ENTRY'; payload: SaveEntryPayload }
  | { type: 'QUERY_ENTRIES'; host: string; fieldKey?: string; limit?: number }
  | { type: 'DELETE_ENTRY'; id: number }
  | { type: 'OPEN_RECOVERY_DIALOG' }
  | { type: 'RESTORE_ENTRY'; payload: RestoreEntryPayload }
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> }
  | { type: 'PING' };

export type MessageResponse<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };
