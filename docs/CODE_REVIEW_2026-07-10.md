# Full code review — 2026-07-10

Reviewers: Claude (full source read), Codex (ran lint/tsc/tests — all green),
Antigravity. Every finding below was re-verified against the code; false
positives from the reviewers were dropped. Ordered by severity.

## Resolution (2026-07-10, v1.0.2)

All findings below were fixed the same day, except: finding 9 was kept as
intended behavior (recovering just-deleted text is the product's purpose —
documented in `entrypoints/content.ts`), and the extra URL categories `/reset`
and `/session` were deliberately NOT added to the blacklist (too generic —
`/reset` matches UI-reset endpoints, `/session(s)` matches conference-talk
pages; the specific `password-reset` variants were added instead). Post-fix
verification: 192 unit tests, tsc/eslint/prettier clean, 6/6 Playwright e2e in
real Chromium against a fresh build. Both external reviewers re-reviewed the
diff (mode=result) and their refinements were incorporated: OTP value-check is
context-gated to numeric/security fields to avoid eating benign short numbers,
IBAN detection validates the mod-97 checksum, import runs in a single
IndexedDB transaction with one trim per affected host/field, and
`queryByFieldKey` applies the same origin filter as `queryByHost`.

## Security / Privacy

### 1. Data is keyed by `host`, not `origin` (Codex — confirmed) — MEDIUM/HIGH

`entrypoints/content.ts:99` saves `location.host`; the `entries` store and all
indexes key by `host` (`lib/db.ts`). `http://example.com` and
`https://example.com` share one bucket, so an insecure HTTP page can list and
restore drafts typed on the HTTPS site of the same host (via the in-page
dialog; its `restoreIntoLastFocused` fallback ignores the origin-scoped
fieldKey). Fix: add `origin` to `Entry`, index and query by origin; only allow
the dialog fallback when the entry's origin matches.

### 2. Background trusts message payloads; no sender authorization (Codex + Claude) — MEDIUM

`entrypoints/background.ts:84` — `SAVE_ENTRY` trusts `payload.host/pathname`
instead of deriving them from `sender.tab.url`; `QUERY_ENTRIES` returns entries
for any requested host; privileged ops (`EXPORT_DATA`, `IMPORT_DATA`,
`UPDATE_SETTINGS`, `DELETE_ENTRY`, `CLEAR_DATA_FOR_HOST`) are reachable from
content-script senders. Today the isolated world shields this, but a single
renderer compromise (or future bug) turns it into read/export/delete-all.
Fix: for senders with `sender.tab` set, allow only `SAVE_ENTRY`/`QUERY_ENTRIES`
scoped to `new URL(sender.tab.url).host`; reject privileged types unless the
sender is an extension page (`!sender.tab`).

### 3. `fields` store is never cleaned (Claude) — MEDIUM

`CLEAR_DATA_FOR_HOST` and the retention alarm delete only from `entries`
(`lib/db.ts:231-261`); `fields` keeps `fieldKey` + `host` + `lastSeen` forever
(`upsertFieldMeta` on every save, `entrypoints/background.ts:109`). After the
user clears a site's data, metadata about which sites/fields they typed into
remains — a privacy promise violation ("clear" doesn't clear) and unbounded
growth. Fix: delete matching `fields` rows in `deleteByHost` and prune stale
rows (by `lastSeen`) in the cleanup alarm.

### 4. Sensitive detection has value-blind false negatives (Codex — confirmed) — MEDIUM

`lib/sensitive.ts` checks only attributes/labels/URL. A field like
`<input type="tel" name="number">` holding a card PAN, or an OTP field without
`maxlength`/`pattern`, gets saved. Fix: add value-based checks at save time —
Luhn test for 13–19 digit strings, short all-digit values in numeric-looking
fields, IBAN shapes; widen `lib/blacklist.ts` URL categories
(`/password-reset`, `/reset`, `/mfa`, `/challenge`, `/session`, `/otp`).

### 5. `UPDATE_SETTINGS` is not validated (Codex — confirmed) — LOW

`entrypoints/background.ts:137` + `lib/settings.ts:15` write any
`Partial<Settings>` as-is. `retentionDays: NaN` makes the cleanup range throw;
`maxEntriesPerField: 0` makes `trimOldest` delete the just-saved entry. The
options UI bounds its inputs, but the message layer doesn't. Fix: run patches
through the same clamping used by `mergeSettings` in `lib/export-import.ts:171`.

### 6. Background doesn't re-check restricted hosts (agy — partial) — LOW

`SAVE_ENTRY` re-checks blocklist and URL category but not
`isRestrictedHost(host)` (`entrypoints/background.ts:93`). Content scripts
never run there, so this is defense-in-depth only; add the check for symmetry.

## Bugs

### 7. `peerSelector` misses type-less inputs and unescaped backslashes (Claude + Codex/agy) — LOW/MEDIUM

`lib/field-key.ts:95`: the CSS selector `input[type="text"]` does NOT match
`<input>` with no `type` attribute (attribute selectors match attributes, not
the reflected property). For type-less inputs `ordinalAmongPeers` never finds
the element and returns the total count — two same-name type-less inputs get
the same ordinal, so their fieldKeys collide and restores can hit the wrong
field. Also `name` escapes only `"`, not `\` — a name ending in a backslash
makes `querySelectorAll` throw inside the input handler. Fix: drop the selector
approach; iterate `document.querySelectorAll('input, textarea')` and compare
`el.type`/`el.name` properties directly.

### 8. Ordinal is computed over the whole document (agy — confirmed) — LOW

`ordinalAmongPeers` scans `ownerDocument`, so any unrelated widget with a
matching input shifts ordinals and breaks fieldKey stability. Scope the peer
search to `el.form ?? document`.

### 9. Pending debounced save fires after the user clears the field (agy — by design?) — INFO

`entrypoints/content.ts:92`: clearing the field below `MIN_VALUE_LEN` doesn't
cancel the pending save, so the pre-deletion text persists. For a recovery
tool this is arguably the feature (recover accidentally deleted text). Decide
and document; if unwanted, `debounce.cancel(key)` on empty value.

## Performance

### 10. `trimOldest` walks the full range on every save; import is O(n²) (Codex + agy — confirmed) — MEDIUM

`lib/db.ts:168` collects every primary key under the `[host]` range (up to
`maxPerHost` = 1000 cursor steps) twice per save, and `IMPORT_DATA`
(`entrypoints/background.ts:164`) calls `putEntry` per imported entry — up to
50k × 1000 cursor steps. Fix: `idx.count(range)` first; only open a cursor for
the overflow (`count - cap` oldest keys), and batch import inserts in one
transaction, trimming once at the end.

### 11. No cap on saved value length (Claude) — LOW

`SAVE_ENTRY` accepts values of any size; a huge paste into a textarea is
SHA-256-hashed and rewritten to IndexedDB on every debounce tick. Add a
`MAX_VALUE_LEN` (e.g. 256 KB) cut in the content script and background.

## Simplifications / polish

- `lib/sensitive.ts:159-188`: use the native `el.labels` instead of the manual
  `label[for=…]` + ancestor walk (agy).
- `entrypoints/options/main.ts:161`: `URL.revokeObjectURL` immediately after
  `a.click()` is racy in some browsers — revoke in a `setTimeout(0)`.
- `entrypoints/background.ts:118`: clamp `msg.limit` (e.g. `min(limit, 500)`).
- `browser.tabs.sendMessage` in the command/context-menu handlers rejects
  noisily on pages without the content script — catch and ignore.

## What's already good

- No XSS surface found: all user text rendered via `textContent`
  (`components/recovery-dialog.ts`) or Lit interpolation (popup/options);
  closed shadow root keeps page JS away from recovered text.
- Minimal permissions (`storage`, `alarms`, `contextMenus`, `activeTab`), no
  host_permissions, `incognito: not_allowed`.
- Import pipeline validates schema/size/entries and recomputes `textHash`
  on apply (poison-proof dedupe).
- 170 unit tests + 2 e2e smoke tests; lint/tsc/prettier all green (verified by
  Codex during this review).
