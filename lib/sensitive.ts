// Sensitive-field detection.
//
// Conservative by design: when in doubt, mark sensitive and DO NOT save.
// False negatives in this function leak user secrets to IndexedDB.
//
// Codex review (b2ospvvmu, bhgz42czc) explicitly required this to consider
// id / autocomplete / aria-label / placeholder / linked <label> / form action /
// inputmode / maxlength / pattern / classes / URL category — not just `name`.

import { isUrlInSensitiveCategory } from './blacklist';

type Editable = HTMLInputElement | HTMLTextAreaElement;

const TYPE_BLOCKLIST: ReadonlySet<string> = new Set([
  'password',
  'hidden',
  'file',
  'submit',
  'reset',
  'button',
  'checkbox',
  'radio',
  'color',
  'range',
  'image',
]);

// Autocomplete is a token list per the HTML spec — e.g. "section-blue billing cc-number".
// We match per-token, not the whole attribute.
const AUTOCOMPLETE_TOKEN_BLOCKLIST: ReadonlyArray<RegExp> = [
  /^cc-/i,
  /^one-time-code$/i,
  /^current-password$/i,
  /^new-password$/i,
  /^webauthn$/i,
];

const NAME_LIKE_PATTERNS: ReadonlyArray<RegExp> = [
  /\bcard(?:[-_\s]?(?:num(?:ber)?|no))?\b/i,
  /\bcredit[-_\s]?card\b/i,
  /\bcc[-_\s]?(?:num(?:ber)?|no)\b/i,
  /\bcvv\b/i,
  /\bcvc\b/i,
  /\bcsc\b/i,
  /\bpin\b/i,
  /\bpasscode\b/i,
  /\botp\b/i,
  /\bone[-_\s]?time(?:[-_\s]?code)?\b/i,
  /\b2fa\b/i,
  /\bmfa\b/i,
  /\btotp\b/i,
  /\bsecret\b/i,
  /\btoken\b/i,
  /\bssn\b/i,
  /\bsocial[-_\s]?security\b/i,
  /\bpass(?:wd|word)\b/i,
  /\bsecurity[-_\s]?(?:answer|question|code)\b/i,
  /\bverification[-_\s]?code\b/i,
  /\bauth[-_\s]?code\b/i,
  /\brecovery[-_\s]?code\b/i,
  /\bbackup[-_\s]?code\b/i,
  /\bcardholder\b/i,
  /\biban\b/i,
  /\brouting[-_\s]?(?:number|num|no)\b/i,
  /\baccount[-_\s]?(?:number|num|no)\b/i,
  /\bsort[-_\s]?code\b/i,
];

const PATTERN_ATTR_RED_FLAGS: ReadonlyArray<RegExp> = [
  /\\d\{?16\}?/, // CC PAN
  /\\d\{?(?:3|4)\}?/, // CVV/CVC
  /\\d\{4,8\}/, // PIN-like
];

export interface SensitiveContext {
  pathname?: string;
}

/**
 * Returns true if the field must not be saved.
 *
 * NOTE: this does NOT replicate `isCandidateField` (which filters out the
 * obviously-not-text inputs early). Call both — the candidate check rejects
 * non-savable shapes (checkboxes, file pickers, …), and isSensitive rejects
 * fields that *look* like text but contain secrets.
 */
export function isSensitive(el: Editable, ctx: SensitiveContext = {}): boolean {
  // 1. Type — fast reject of obvious secret carriers.
  if (el instanceof HTMLInputElement) {
    const t = (el.type || 'text').toLowerCase();
    if (TYPE_BLOCKLIST.has(t)) return true;
  }

  // 2. Autocomplete is a space-separated token list per HTML spec — match per-token.
  const ac = (el.autocomplete || '').toLowerCase();
  if (ac) {
    for (const token of ac.split(/\s+/)) {
      if (!token) continue;
      for (const re of AUTOCOMPLETE_TOKEN_BLOCKLIST) {
        if (re.test(token)) return true;
      }
    }
  }

  // 3. Name-like signals across many attributes and the linked label.
  const haystacks = collectNameHaystacks(el);
  for (const h of haystacks) {
    for (const re of NAME_LIKE_PATTERNS) {
      if (re.test(h)) return true;
    }
  }

  // 4. Pattern attribute hints at numeric secrets.
  if (el instanceof HTMLInputElement) {
    const pat = el.getAttribute('pattern');
    if (pat) {
      for (const re of PATTERN_ATTR_RED_FLAGS) {
        if (re.test(pat)) return true;
      }
    }
  }

  // 5. Numeric inputmode with short maxlength looks like a PIN/OTP.
  const inputmode = (el.getAttribute('inputmode') || '').toLowerCase();
  if (inputmode === 'numeric' || inputmode === 'decimal') {
    const ml = parseInt(el.getAttribute('maxlength') || '0', 10);
    if (ml > 0 && ml <= 8) return true;
  }

  // 6. URL category — auth/payment/checkout etc.
  const path = ctx.pathname ?? getOwnerPathname(el);
  if (path && isUrlInSensitiveCategory(path)) return true;

  // 7. Form action URL category — covers single-page apps that route on submit.
  const form = el.form;
  if (form && form.action) {
    try {
      const u = new URL(form.action, location.origin);
      if (isUrlInSensitiveCategory(u.pathname)) return true;
    } catch {
      // ignore
    }
  }

  return false;
}

function collectNameHaystacks(el: Editable): string[] {
  const out: string[] = [];
  push(out, el.name);
  push(out, el.id);
  push(out, el.getAttribute('aria-label'));
  push(out, el.placeholder);
  push(out, el.className);
  push(out, el.getAttribute('data-testid'));
  push(out, el.getAttribute('data-test'));
  push(out, el.getAttribute('data-qa'));

  // aria-labelledby is a space-separated list of element ids whose text content,
  // concatenated, forms the accessible name. We push the joined text so multi-id
  // labels like ["Account", "number"] match patterns like /account[-_\s]?number/.
  const doc = el.ownerDocument;
  const labelledBy = el.getAttribute('aria-labelledby');
  if (doc && labelledBy) {
    const parts: string[] = [];
    for (const id of labelledBy.split(/\s+/)) {
      if (!id) continue;
      const refd = doc.getElementById(id);
      if (refd?.textContent) parts.push(refd.textContent.trim());
    }
    if (parts.length > 0) push(out, parts.join(' '));
  }

  // Linked <label> by `for` or wrapping the input.
  if (doc && el.id) {
    const label = doc.querySelector(`label[for="${cssEscape(el.id)}"]`);
    if (label) push(out, label.textContent);
  }
  let parent: HTMLElement | null = el.parentElement;
  while (parent) {
    if (parent.tagName === 'LABEL') {
      push(out, parent.textContent);
      break;
    }
    parent = parent.parentElement;
  }

  return out;
}

function push(out: string[], v: string | null | undefined): void {
  if (v && v.length > 0) out.push(v);
}

function cssEscape(s: string): string {
  // CSS.escape would be ideal but it lives on Window, not always in workers.
  // For our purposes we sanitize the quotes and backslashes which is what the
  // attribute selector cares about.
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getOwnerPathname(el: Editable): string {
  return el.ownerDocument?.location?.pathname ?? '';
}
