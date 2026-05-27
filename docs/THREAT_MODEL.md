# Threat Model — Typio Chrome Form Recovery NG

## Assets

| Asset | Sensitivity | Where it lives |
|-------|-------------|----------------|
| User-typed text from regular form fields | Personal data, can include drafts, comments, search history | Browser-local IndexedDB only |
| Hostname + URL pathname + field identifier | Browsing history fragments | Browser-local IndexedDB only |
| Extension settings (blocklist, retention) | Low | Browser-local IndexedDB only |
| Passwords, credit-card data, OTP codes | High | **NEVER stored** — see "Sensitive field exclusion" |

## Adversaries

1. **Malicious websites** trying to read what the user typed elsewhere or trick the extension into exfiltrating data.
2. **Other extensions** running in the same browser.
3. **A local attacker with file-system access** (e.g. a roommate at an unlocked laptop).
4. **A network attacker** between the browser and any website.
5. **The extension publisher (us)** — users must be able to verify we're not lying about no-telemetry.
6. **Browser-store reviewers** — false positives in sensitive detection look like spying.

## Trust boundaries

```
┌─ Untrusted ─────────────────────────────┐  ┌─ Trusted ────────────────────┐
│ Website JS, DOM, postMessage, BroadcastChannel │  │ Extension code (MV3 isolated world) │
│                                          │  │   ↓                            │
│  Form fields  ─── input event ──→──────┐ │  │   debounce  → field-scanner    │
│                                        ▼ │  │   → sensitive check            │
│                                   ┌─────────────────────────┐                │
│                                   │  content script         │                │
│                                   │  (isolated world)       │                │
│                                   └──────── ↓ runtime msg ──┘                │
│                                            ▼                                  │
│                                   ┌─────────────────────────┐                │
│                                   │  service worker         │                │
│                                   │  (extension origin)     │                │
│                                   │     ↓ idb.put           │                │
│                                   │  IndexedDB (extension origin)            │
│                                   └─────────────────────────┘                │
└──────────────────────────────────────────┘  └──────────────────────────────┘
```

Network arrow: **none.** The extension makes no outgoing HTTP requests. CSP `connect-src 'none'` is enforced in the bundled manifest.

## Mitigations by adversary

### 1. Malicious website

| Risk | Mitigation |
|------|------------|
| Website reads `window.typio` or similar | Content script lives in isolated world; no globals are set on `window` |
| Website injects fake form to trick auto-save | Sensitive detection runs on every field; `<input type="password">` etc. are always excluded; URL category check skips `/auth`, `/checkout`, etc. |
| Website tries to overflow IndexedDB | Per-field cap (50 entries), per-host cap, dedupe by `fieldKey + textHash`, retention cleanup alarm |
| Website hooks `IndexedDB` to read extension store | Cannot — extension origin is `chrome-extension://*`, websites cannot open that database |
| Website fingerprints via timing of `chrome.runtime.onMessage` | All extension API calls happen async after debounce; no observable side effect on the page |
| Website opens a closed shadow root or uses `<iframe>` to bypass | Closed shadow roots are unsupported (will not be observed). iframes are deferred to v2. We document this explicitly. |

### 2. Other extensions

Manifest V3 isolates each extension to its own origin. Our IndexedDB is at the extension's `chrome-extension://<id>` origin. Other extensions cannot read it without their own host permissions + scripting, which is itself a high-privilege thing the user would have approved.

### 3. Local attacker with disk access

This extension does **not** encrypt data at rest. Encryption-at-rest is mostly theatre for browser extensions: the same browser profile that holds the key would be unlocked by the same attacker. Users who need this should use OS-level disk encryption.

Documented in PRIVACY.md.

### 4. Network attacker

There is no network traffic from the extension. There is nothing to MITM.

### 5. Untrusted publisher

- 100% open source (MIT). Every line on GitHub.
- Reproducible builds via `make package` in Docker `node:22-alpine` with pinned `package-lock.json`.
- No remote code loading. No `eval`, no `Function()`, no remote `<script>`. CSP forbids them in MV3 by default.
- No analytics, no Plausible, no Sentry. Period. (We explicitly rejected even opt-in telemetry — see [Codex review b2ospvvmu](../../../.claude/projects/-home-deploy-dailywork/a66cd754-cade-4c2b-8411-04cd7dd52270/tool-results/b2ospvvmu.txt).)

### 6. Store reviewers

- Conservative sensitive-field detection: when in doubt, do NOT save. False negative is worse than false positive for a privacy tool.
- Clear permission rationale in `docs/PERMISSIONS.md` and the store listing.
- No `<all_urls>` with any tab access we don't strictly need. We use `activeTab` where possible.

## Sensitive field exclusion rules

Field is excluded from saving if **any** of the following match:

| Layer | Rule |
|-------|------|
| Type | `password`, `hidden`, `file`, `submit`, `reset`, `button`, `checkbox`, `radio`, `color`, `range`, `image` |
| Autocomplete | `cc-*`, `one-time-code`, `current-password`, `new-password` |
| Name / id (case-insensitive, regex on word boundary) | `card`, `cvv`, `cvc`, `pin`, `otp`, `ssn`, `passwd`, `password` |
| `aria-label` / `placeholder` / linked `<label>` text | Same regex as name/id |
| `inputmode` | `numeric` AND (`maxlength<=8` OR matches PIN-like pattern) |
| `pattern` attribute | regex looks like CC/CVV/PIN (`\d{16}`, `\d{3,4}`, `\d{4,8}`) |
| Form `action` URL | `/login`, `/signin`, `/auth`, `/oauth`, `/checkout`, `/payment`, `/billing`, `/register`, `/signup` |
| Page URL pathname | Same patterns as form action |
| Hostname blocklist (user-defined) | Exact match or wildcard |
| Incognito tab | Always skip |
| Restricted scheme | `chrome://`, `chrome-extension://`, `chromewebstore.google.com`, `about:`, `view-source:`, `file://` (configurable) |

Implementation: see `lib/sensitive.ts` and `lib/blacklist.ts` (TBD). Unit tests in `tests/unit/sensitive.test.ts` will cover 80+ patterns.

## Data minimization

- Empty values are not stored.
- Values shorter than 2 characters are not stored (likely typos).
- Dedupe key: `fieldKey + sha256(value)` — typing the same draft twice does not double-store.
- Pruning: alarm runs daily, deletes entries older than `retentionDays`.
- Per-field cap: 50 entries; on overflow, oldest is dropped.

## What we explicitly do NOT promise

- We cannot guarantee no data leaks if a malicious extension with full host permissions is installed.
- We cannot decrypt your saved drafts if your browser profile is lost.
- We do not synchronize across devices.
- We do not back up to the cloud.
- We do not handle DOM with closed shadow roots.

## Review cadence

This document is reviewed before each minor release and whenever a permission is added or removed.
