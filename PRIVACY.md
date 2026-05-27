# Privacy Policy — Typio Chrome Form Recovery NG

**Last updated:** 2026-05-27
**Effective:** when the extension is first installed

## Plain-English summary

This extension auto-saves text you type into web forms so you can recover it if your browser crashes or you accidentally navigate away. **All saved text stays inside your own browser.** Nothing is sent anywhere. There are no analytics, no telemetry, no servers, no cookies, no fingerprinting.

If we ever change this, we will bump the major version and update this file before publishing.

## What is stored

When you type into a regular text field (`<input type="text|email|url|search|tel|number">` or `<textarea>`), after a short pause the extension writes the current value to your browser's local IndexedDB database, together with:

- the page's hostname and pathname
- a stable identifier for the field (built from its `name`, `id`, `autocomplete`, ARIA label, associated `<label>`, form attributes, and ordinal position)
- the length of the value
- a SHA-256 hash of the value (used internally for deduplication)
- timestamps (created, last updated)

The full text value is stored as plain text in IndexedDB. The browser scopes this database to the extension itself — other websites cannot read it.

## What is NOT stored

The extension will **refuse to save** any of the following, even if you type into them:

- `<input type="password">`
- `<input type="hidden">`
- `<input type="file">`, `submit`, `reset`, `button`, `checkbox`, `radio`
- Fields with `autocomplete="cc-*"` (credit card data) or `autocomplete="one-time-code"` (OTP / 2FA)
- Fields whose `name`, `id`, `aria-label`, `placeholder`, or surrounding `<label>` matches `card`, `cvv`, `cvc`, `pin`, `otp`, `ssn` (case-insensitive)
- Fields on URLs containing `/checkout`, `/payment`, `/auth`, `/login`, `/signin`, `/register`
- Any page in incognito / private browsing mode (by default)
- Hostnames you have added to the blocklist in Options
- Restricted browser pages: `chrome://*`, `chromewebstore.google.com`, `about:*`, PDF viewer, the extension's own pages

This is enforced before the value ever leaves the page context.

## Retention

By default, entries older than **30 days** are deleted automatically. You can change this in Options (between 1 and 365 days). You can also delete entries manually:

- Per-entry from the popup
- All entries from a host: Options → "Clear data for this host"
- Everything: Options → "Reset extension"

When you uninstall the extension, your browser deletes its IndexedDB database.

## Sharing

We do not share data with anyone. We cannot — your data never leaves your browser. There is no backend that we control.

## Permissions

See [docs/PERMISSIONS.md](docs/PERMISSIONS.md) for the full list of browser permissions the extension requests and why each one is needed.

## Open source

The full source code is available at https://github.com/stufently/typio-chrome-form-recovery-ng under the MIT license. You can verify these claims by reading the code.

## Limited Use disclosure (Chrome Web Store)

In compliance with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data/), this extension's use of any user data is limited as follows:

- Data Typio NG observes (text typed into form fields) is used **only** to provide the auto-save and recovery functionality the user installed the extension for.
- Data is **not** transferred to third parties.
- Data is **not** used or transferred for purposes unrelated to the user-facing feature.
- Data is **not** used or transferred to determine creditworthiness or for lending purposes.
- Data is **not** sold.
- The extension does **not** use remote code; no `eval`, no `Function()`, no remotely-hosted scripts.

## Contact

Questions or concerns: open an issue at https://github.com/stufently/typio-chrome-form-recovery-ng/issues
