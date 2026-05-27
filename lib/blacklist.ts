// Hostname blocklist + URL category check.
//
// Hostname matching supports plain hostnames (exact) and leading-dot wildcards
// (".bank.com" matches any subdomain of bank.com).
//
// URL category check looks for auth/payment/checkout markers in the pathname —
// these are pages where the user is entering high-value transient secrets even
// if the input element itself looks innocent (e.g. an email field on a sign-in
// form that we have no reason to remember).

const URL_CATEGORY_PATTERNS: ReadonlyArray<RegExp> = [
  /\/login(?:[/?]|$)/i,
  /\/signin(?:[/?]|$)/i,
  /\/sign-in(?:[/?]|$)/i,
  /\/log-?in(?:[/?]|$)/i,
  /\/auth(?:[/?]|$)/i,
  /\/oauth(?:[/?]|$)/i,
  /\/sso(?:[/?]|$)/i,
  /\/register(?:[/?]|$)/i,
  /\/signup(?:[/?]|$)/i,
  /\/sign-up(?:[/?]|$)/i,
  /\/checkout(?:[/?]|$)/i,
  /\/payment(?:[/?]|$)/i,
  /\/billing(?:[/?]|$)/i,
  /\/two-factor(?:[/?]|$)/i,
  /\/2fa(?:[/?]|$)/i,
  /\/verify(?:[/?]|$)/i,
];

export function isUrlInSensitiveCategory(pathname: string): boolean {
  for (const re of URL_CATEGORY_PATTERNS) {
    if (re.test(pathname)) return true;
  }
  return false;
}

export function isHostnameBlocklisted(hostname: string, blocklist: readonly string[]): boolean {
  const host = hostname.toLowerCase();
  for (const entry of blocklist) {
    const e = entry.trim().toLowerCase();
    if (!e) continue;
    if (e.startsWith('.')) {
      // Wildcard subdomain: ".bank.com" matches "bank.com" or "anything.bank.com"
      const bare = e.slice(1);
      if (host === bare || host.endsWith('.' + bare)) return true;
    } else if (host === e) {
      return true;
    }
  }
  return false;
}
