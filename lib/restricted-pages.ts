// Pages where the extension should not autosave at all.
// Stage 2 — applied in content script and double-checked in the service worker.

const RESTRICTED_SCHEMES = new Set([
  'chrome:',
  'chrome-extension:',
  'edge:',
  'opera:',
  'about:',
  'view-source:',
  'devtools:',
  'data:',
  'blob:',
]);

const RESTRICTED_HOSTS = new Set([
  'chromewebstore.google.com',
  'chrome.google.com',
  'microsoftedge.microsoft.com',
  'addons.mozilla.org',
  'addons.opera.com',
]);

/** A protocol like 'https:' (with trailing colon, matching window.location.protocol). */
export function isRestrictedScheme(protocol: string): boolean {
  return RESTRICTED_SCHEMES.has(protocol.toLowerCase());
}

/** Bare hostname like 'example.com'. */
export function isRestrictedHost(hostname: string): boolean {
  return RESTRICTED_HOSTS.has(hostname.toLowerCase());
}

export function isRestrictedLocation(loc: { protocol: string; hostname: string }): boolean {
  return isRestrictedScheme(loc.protocol) || isRestrictedHost(loc.hostname);
}
