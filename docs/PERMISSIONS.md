# Permissions — Typio Chrome Form Recovery NG

Every permission we request, why we need it, and what we **don't** do with it.

## Manifest V3 permissions

### `storage`

**Used for:** small extension settings via `chrome.storage.local` (retention period, blocklist, UI preferences).

The actual form drafts live in **IndexedDB**, not `chrome.storage`. We use IndexedDB because `chrome.storage.local` has a 10 MB quota and a synchronous API that does not handle large blobs well.

**What we don't do:** sync, cloud upload, cross-device.

### `alarms`

**Used for:** a single daily alarm `cleanup` that prunes IndexedDB entries older than `retentionDays`.

Why not `setInterval`? MV3 service workers are event-driven and can be terminated at any time. `chrome.alarms` is the only persistent timer in MV3.

**What we don't do:** poll any remote endpoint.

### `contextMenus`

**Used for:** a single right-click menu entry "Recover text in this field", shown only on `editable` targets. When clicked, it sends a message to the content script which opens the in-page recovery dialog targeting the last-focused field.

**What we don't do:** scrape page content from the menu.

### `commands` (keyboard shortcuts)

**Used for:** the default shortcut `Alt+Shift+Z` to open the recovery dialog on the active tab.

Users can change or remove the shortcut from `chrome://extensions/shortcuts`.

### `activeTab`

**Used for:** when the user clicks the extension icon or invokes the keyboard shortcut, we grant ourselves temporary access to that single tab to inject the recovery dialog.

**Why not `<all_urls>`?** `<all_urls>` is broader than we need for one-off interactions. We use `activeTab` for explicit user-invoked actions, and the static content script for passive form-listening.

## Host permissions

### `content_scripts.matches: ["<all_urls>"]`

**Used for:** the static content script that listens for form input across all sites. Without `<all_urls>` we cannot do auto-save on the sites you visit — that is the core feature.

**Mitigation:**
- The content script runs in MV3's **isolated world**: it cannot read website JavaScript variables, only the DOM.
- It writes nothing to `window`.
- It skips restricted schemes: `chrome://*`, `about:*`, `chromewebstore.google.com`, the browser's PDF viewer, the extension's own pages.
- It skips pages in incognito mode by default.
- It refuses to save sensitive fields — see [THREAT_MODEL.md § Sensitive field exclusion rules](THREAT_MODEL.md#sensitive-field-exclusion-rules).
- It makes zero outgoing HTTP requests. CSP `connect-src 'none'`.

If you want to limit further, add hostnames to the in-extension blocklist (Options page).

### `host_permissions: []`

**Empty.** We do not request `host_permissions` at the manifest level beyond `content_scripts.matches`. This means we cannot make `fetch` to arbitrary origins, which is what users want from a tool that should never call home.

## What we deliberately do NOT request

| Permission | Why we don't |
|------------|--------------|
| `tabs` | We only need tab info via `activeTab` and `sender.tab`. Full `tabs` permission lets you read every tab's URL and title — too much. |
| `cookies` | Never. |
| `webRequest` / `declarativeNetRequest` | We do not block, modify, or read network traffic. |
| `notifications` | v1 has no notifications. |
| `downloads` | Export goes through `<a download>`, not the API. |
| `clipboardRead` / `clipboardWrite` | Recovery dialog uses the user-gesture clipboard API, which does not require permissions. |
| `unlimitedStorage` | IndexedDB is unlimited per-origin within reason for extensions. We will revisit if we hit a real quota in production. |
| `identity` / `oauth` | No accounts. |
| `geolocation` | No. |
| `nativeMessaging` | No native host. |
| `scripting` | We use static `content_scripts` declared in manifest, not dynamic injection. If we add the recovery dialog as a programmatic injection in a future version, we will add `scripting` with a clear rationale and update this document. |

## Cross-browser deltas

| Browser | Notes |
|---------|-------|
| Chrome | All permissions above as documented. |
| Edge | Same as Chrome (Chromium-based, MV3 identical). |
| Opera | Same as Chrome. |
| Firefox MV3 | `background.scripts` instead of `service_worker` — WXT handles this at build time. `commands` works but the default shortcut may collide with a Firefox global; users may need to rebind. |
| Safari | Out of scope for v1 — Safari MV3 has its own host-permission flow. |

## Review

This document must be updated and re-reviewed before every release that adds, removes, or broadens any permission.
