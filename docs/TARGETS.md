# Browser Target Matrix — Typio Chrome Form Recovery NG

## v1 targets

| Browser           | Manifest     | Background                                                           | Build command                                                   | Store                                                              |
| ----------------- | ------------ | -------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Chrome** ≥ 120  | MV3          | `service_worker` (module)                                            | `wxt build -b chrome`                                           | [Chrome Web Store](https://chromewebstore.google.com/)             |
| **Edge** ≥ 120    | MV3          | `service_worker` (module)                                            | `wxt build -b edge` (same as Chrome)                            | [Edge Add-ons](https://microsoftedge.microsoft.com/addons)         |
| **Opera** ≥ 106   | MV3          | `service_worker` (module)                                            | `wxt build -b chrome` (Opera installs Chromium-format packages) | [Opera Add-ons](https://addons.opera.com/) (manual upload, no API) |
| **Firefox** ≥ 121 | MV3 (forced) | `background.scripts` (Firefox MV3 does NOT support `service_worker`) | `wxt build -b firefox --mv3`                                    | [Firefox AMO](https://addons.mozilla.org/)                         |

## Why these minimum versions

- **Chrome 120** — `chrome.alarms` minimum period dropped to 30 seconds; `chrome.action` API stable; service worker lifecycle simplified ([Chrome changelog](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle?hl=en)).
- **Firefox 121** — first stable with MV3 default-on; `background.scripts` event-page pattern works reliably ([Mozilla blog](https://blog.mozilla.org/addons/2023/12/12/firefox-121-mv3/)).
- **Edge 120** — Chromium parity baseline.
- **Opera 106** — Chromium 120 base.

## Out of scope for v1

- **Safari** — MV3 host-permission UX is materially different; requires Xcode bundle wrapper. Defer to v1.1 if there is demand.
- **Brave / Vivaldi / Arc** — Chromium-based; the Chrome build works but we don't list them as supported until we run smoke tests.
- **Firefox ESR** — depends on which ESR is current at our release date.

## Build deltas (WXT handles automatically)

### Chrome / Edge / Opera

```json
{
  "manifest_version": 3,
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [{ "matches": ["<all_urls>"], "js": ["content.js"] }],
  "minimum_chrome_version": "120"
}
```

### Firefox

```json
{
  "manifest_version": 3,
  "background": {
    "scripts": ["background.js"],
    "type": "module"
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "typio-ng@stufently.github.io",
      "strict_min_version": "121.0"
    }
  }
}
```

Firefox does NOT support `background.service_worker` as of 2026-05. WXT's `--mv3` flag for Firefox emits `background.scripts` automatically. We do not maintain hand-written manifest variants — they live in `wxt.config.ts`.

## Acceptance criteria per target

A release is _not_ shipped until **all** of the following pass for **each** target browser:

- `wxt build -b <browser>` succeeds without warnings
- `web-ext lint dist/<browser>/` returns zero errors (Firefox especially)
- Unit tests pass (`vitest run`)
- Playwright smoke test passes in the bundled Chromium for that build (Playwright extension tests only run in bundled Chromium, [docs](https://playwright.dev/docs/chrome-extensions))
- Manual smoke checklist (see `tests/e2e/MANUAL.md` — TBD)
- Manifest is reviewed against `docs/PERMISSIONS.md` for drift

## Firefox-specific risks

1. `background.scripts` event page is shut down more aggressively than Chrome's SW. We must keep state in IndexedDB, not memory. Already enforced as an MV3 rule.
2. `commands.default` may collide with a Firefox global shortcut. We will document the manual rebind path in `README.md` once we know the actual collisions.
3. AMO review is human and can take a week. Source code must be submitted for review (matches public repo).
4. `webextension-polyfill` is critical for Firefox — Chrome `browser.*` namespace is still not native.

## CI matrix

```yaml
matrix:
  browser: [chrome, firefox, edge]
  os: [ubuntu-latest]
```

Each matrix cell runs lint + unit + Playwright smoke for that browser's build. Release tag also publishes via:

- Chrome Web Store API v2 (`upload` + `publish`) — `chrome` build
- `web-ext sign --channel listed` (AMO) — `firefox` build
- Edge Add-ons Partner Center "Update REST API" — `edge` build (same artefact as chrome). First submission of a new add-on must go through the Partner Center UI; updates can be automated via the API.
- Opera — Opera Add-ons does not expose a publish API; we upload manually and link the release notes.
