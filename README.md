# Typio Chrome Form Recovery NG

**Auto-save and recover text from web forms.** A modern, MV3, cross-browser spiritual successor to the original [Typio Form Recovery](https://bitbucket.org/nicklassandell/chrome-form-recovery) by Nicklas Sandell — which was removed from the Chrome Web Store in 2025 because of Manifest V2 deprecation.

This extension is **not a fork**. The codebase is written from scratch under the MIT license. The original Typio is under CC BY-NC-ND 4.0 (no derivatives allowed), so we re-implemented the user-visible behaviour, not the source.

[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-success)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Status

🚧 **Pre-alpha — foundation only.** Code not yet shipped. Follow [CHANGELOG.md](CHANGELOG.md) and [issues](https://github.com/stufently/typio-chrome-form-recovery-ng/issues) for progress.

## Goals (v1)

- Auto-save text typed into `<input>` (text/email/url/search/tel/number) and `<textarea>`.
- Recover lost form input after accidental reload, crash, or navigation.
- Cross-browser: Chrome, Firefox (MV3), Edge, Opera.
- **Privacy first:** all data stays in the browser's IndexedDB. No analytics, no telemetry, no servers.
- **Refuses to save sensitive fields:** passwords, credit card numbers, OTP/2FA codes, hidden fields, fields on `/checkout/`, `/auth/`, `/login/` URLs.

## Non-goals (deferred to v2)

- `contentEditable` (rich text editors)
- iframe propagation
- Sync across devices

## Tech

WXT (MV3 cross-browser build framework) · TypeScript strict · Lit 3 (UI components in Shadow DOM) · idb (IndexedDB wrapper) · webextension-polyfill · Vitest + fake-indexeddb (unit) · Playwright (E2E) · Docker `node:22-alpine` (no local installs).

## Build

⚠️ All build commands run in Docker. Do not install Node.js locally.

```bash
make build          # build for all browsers
make build-chrome   # build for Chrome / Edge / Opera (single chrome-mv3 pack)
make build-firefox  # build for Firefox MV3
make test           # unit + E2E
make lint           # eslint + tsc --noEmit
make package        # zipped store-ready artefacts in dist/
```

See [docs/TARGETS.md](docs/TARGETS.md) for the full browser target matrix.

## Documentation

| Document | Purpose |
|----------|---------|
| [PRIVACY.md](PRIVACY.md) | Privacy policy — what we collect (nothing) and where data lives (your browser only) |
| [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) | Threat model, attack surface, data handling rules |
| [docs/PERMISSIONS.md](docs/PERMISSIONS.md) | Every requested permission and its rationale |
| [docs/TARGETS.md](docs/TARGETS.md) | Browser support matrix and build differences |
| [CHANGELOG.md](CHANGELOG.md) | Release history (Keep a Changelog format) |

## Attribution

The original **Typio Form Recovery** was created by [Nicklas Sandell](https://github.com/nicklassandell) and is licensed under [CC BY-NC-ND 4.0](https://bitbucket.org/nicklassandell/chrome-form-recovery/raw/HEAD/license.txt). This extension shares no code with the original — only the *idea* of form auto-save.

Thanks also to [@tsukumijima](https://github.com/tsukumijima) and [@ctsstc](https://github.com/ctsstc) for keeping the spirit of the original alive in their forks.

## License

[MIT](LICENSE) — do whatever you want, no warranty. If you ship this on critical infrastructure, audit the code yourself.
