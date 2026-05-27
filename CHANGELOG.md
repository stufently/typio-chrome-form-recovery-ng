# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
