# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] — 2026-07-10

Released to the Chrome Web Store (upload accepted, pending store review).
The exact `typio-chrome-form-recovery-ng-chrome.zip` attached to the GitHub
release — the same artifact uploaded to CWS — was additionally loaded into
real Chromium and passed the smoke flow: autosave → reload → recover, and
refusal to save password/credit-card fields. This is the functionality whose
breakage caused the 2026-06-22 store removal.

### Security & fixes — apply the 2026-07-10 review findings

- **Origin scoping.** Entries now record their `origin`; host queries filter by
  it (legacy rows resolve origin from the `fieldKey` prefix). Drafts typed on
  `https://site` are no longer visible/restorable from `http://site`.
- **Sender authorization in the service worker.** Web-page senders (content
  scripts) may only `SAVE_ENTRY`/`QUERY_ENTRIES`/`PING`, with host, origin and
  pathname derived from `sender.url` instead of the payload, plus a
  fieldKey-origin consistency check. Export/import/settings/deletion are
  reserved for extension pages (detected by `runtime.getURL` prefix — popup and
  options run in tabs, so `sender.tab` is not the discriminator).
- **`fields` metadata cleanup.** "Clear data for host" now also removes that
  host's field metadata, and the daily cleanup prunes metadata older than the
  retention window — previously it was kept forever.
- **Value-based sensitive detection.** Card PANs (Luhn), IBANs (mod-97
  checksum) and OTP/PIN-like short digit strings (context-gated to
  numeric/security fields) are refused at save time even when field attributes
  look innocent. Blacklist gained password-reset/mfa/otp/passcode/challenge
  URL categories.
- **Settings validation.** `UPDATE_SETTINGS` and import share one sanitizer;
  NaN retention or zero caps can no longer break cleanup/trimming.
- **Field-key stability.** Ordinal computation no longer uses CSS attribute
  selectors (type-less inputs collided; exotic names threw) and is scoped to
  the owning form.
- **Performance.** Per-save trimming is count-based instead of a full cursor
  walk; import writes all entries in a single transaction and trims once per
  affected host/field; saved values are capped at 200k chars; query limit
  clamped to 500.
- Misc: restricted-host re-check in SAVE, caught `tabs.sendMessage` rejections,
  deferred `revokeObjectURL`, native `el.labels` for label lookup.
- Verified: 192 unit tests (+22), 6/6 e2e in real Chromium (autosave → reload →
  restore, sensitive-field refusal, store screenshots), tsc/eslint/prettier
  clean. Reviewed post-implementation by Codex and Antigravity.

### Added — full code-review report (2026-07-10)

- `docs/CODE_REVIEW_2026-07-10.md`: three-way review (Claude + Codex +
  Antigravity) of the whole codebase. 11 verified findings — headline items:
  data keyed by `host` instead of `origin` (http/https drafts mix), message
  handlers trust payloads without sender authorization, `fields` store never
  cleaned by clear/retention, sensitive-field detection lacks value-based
  checks (Luhn/OTP), `trimOldest` is O(n) per save and import is O(n²).
  No XSS found. Fixes intentionally not applied in this change.

### Fixed — content script crash disabled all autosave (2026-06-24)

- **Critical: the core autosave feature never ran.** `components/recovery-dialog.ts`
  was a Lit custom element whose module-level `customElements.get(...)`/`define(...)`
  executed at content-script import time. In a content script's _isolated world_
  Chromium exposes `window.customElements` as `null`, so that call threw and the
  entire content script crashed on startup ("The content script crashed on
  startup!"). Input listeners were never attached → nothing was ever saved → the
  in-page recovery dialog never opened. This is why the Chrome Web Store flagged
  the item "Inaccurate Description — Non functional" and removed it: the described
  "auto-saves text … and lets you recover it after a reload" did not work.
- Rewrote the recovery dialog as **plain DOM** (`renderRecoveryDialog`) rendered
  into the same closed Shadow DOM. No `customElements`, no Lit, in the content
  script — Lit stays only in the extension pages (popup/options), where it works.
  User text is assigned via `textContent` only (no `innerHTML`), preserving the
  no-markup-injection guarantee.
- Hardened the E2E smoke test: it now serves the fixture over **HTTP** (the old
  `file://` fixture had an empty `location.host`, so the service worker dropped
  every save and the test stayed green while the product was broken) and waits
  for the content script to attach before typing. Verified end-to-end in real
  Chromium: type → reload → recover via popup, and the in-page recovery dialog
  renders without error.

### Added — Stage 2 (safety + storage hardening, 2026-05-27)

- `lib/sensitive.ts` — seven-layer field check: type, autocomplete (token-list aware), name-like regex across `name`/`id`/`aria-label`/`aria-labelledby` (resolved)/`placeholder`/linked-`<label>`/wrapping-`<label>`/`class`/`data-*`, `pattern` attribute red flags, `inputmode` + short `maxlength`, URL category (page + form action). 22 name patterns including `card`, `cvv`, `pin`, `otp`, `mfa`, `totp`, `verification_code`, `auth_code`, `recovery_code`, `backup_code`, `cardholder`, `iban`, `routing/account number`, `sort_code`. Patterns tolerate space / dash / underscore separators.
- `lib/blacklist.ts` — hostname blocklist (exact + leading-dot wildcards `.bank.com`) and URL category check for 15 auth/payment/checkout paths.
- `lib/restricted-pages.ts` — refuse to attach on `chrome:`, `about:`, `view-source:`, `data:`, `blob:`, and the major extension-store hosts.
- DB schema v2 — `entries` gets the `by-dedupe` index; new `fields` store for per-field metadata.
- `putEntry` dedupes by `[host, fieldKey, textHash]`, caps per field, caps per host (defends against runaway sites minting unique field keys).
- `deleteByHost`, `upsertFieldMeta`, `getFieldMeta` helpers.
- Content script: live sensitive re-check on every input event, blocklist refresh on `storage.onChanged`, restricted-page guard.
- Service worker: defense-in-depth blocklist + URL category check before persisting, incognito skip.
- Manifest: `"incognito": "not_allowed"` — extension disabled in private browsing by default.
- 134 new unit tests across `sensitive`, `blacklist`, `restricted-pages`, and DB cap/dedupe paths.

### Added — Stage 1 (vertical slice, 2026-05-27)

- `lib/hash.ts` — SHA-256 hex via `crypto.subtle` for dedupe.
- `lib/debounce.ts` — per-key debouncer with `schedule` / `flush` / `cancel` / `clear`.
- `lib/messaging.ts` — typed `sendMessage` / `sendMessageToTab` / `onMessage` wrappers over `webextension-polyfill`.
- `lib/db.ts` — `idb` wrapper, schema v1 (entries store with compound indexes by host and field key).
- `lib/field-key.ts` — stable field identifier from `origin + pathname + form attrs + field attrs + aria + placeholder + ordinal`. DOM path is intentionally _not_ used as the primary key.
- `lib/settings.ts` — `chrome.storage.local` settings with default merging.
- `lib/types.ts` — typed `Entry`, `FieldMeta`, `Settings`, and discriminated-union `Message` types.
- Content script — `MutationObserver`, 750 ms debounce, save eligible inputs to the service worker.
- Service worker — message router for `SAVE_ENTRY` / `QUERY_ENTRIES` / `DELETE_ENTRY` / `RESTORE_ENTRY` / `GET_SETTINGS` / `UPDATE_SETTINGS`, daily cleanup alarm.
- Popup (Lit) — fetches and renders entries for the active tab; click an entry to restore via the content script. Shows an inline error if the original field is gone.
- Vitest + happy-dom + fake-indexeddb test setup; 154 unit tests across 9 files.
- Playwright config + smoke E2E scaffolding (runs against the bundled Chromium with the unpacked Chrome build).

### Added — Stage 0 (foundation, 2026-05-27)

- Project scaffolding: repo, MIT license, README, PRIVACY, threat model, permission rationale, browser target matrix.
- WXT config, TypeScript strict, Lit 3, idb, webextension-polyfill, Vitest + fake-indexeddb, Playwright dependencies.
- Docker build (`node:22-alpine`) and `Makefile` targets.
- Placeholder entrypoints for background, content, popup, options.
- Skeleton i18n (en, ru).
- GitHub Actions CI matrix (lint + unit + build chrome/firefox/edge + Playwright on bundled Chromium).

### Notes

This release is **not** functional yet — Stages 0–2 land the engine, storage layer, and safety net. Stage 3 will land the UX (recovery dialog, options page, import/export, context menu, keyboard shortcut), Stage 4 hardens cross-browser packaging, and Stage 5 wires CI publishing. v1.0.0 will be the first user-facing release.
