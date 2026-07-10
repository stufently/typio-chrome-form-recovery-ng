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

  // Linked labels. `el.labels` natively covers both `label[for]` and wrapping
  // <label> (and label's `htmlFor` re-association). Fall back to the manual
  // walk only when the DOM implementation lacks `labels` (some test DOMs).
  const labels = el.labels;
  if (labels) {
    for (const label of Array.from(labels)) push(out, label.textContent);
  } else {
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
  }

  return out;
}

// --- Value-based checks (2026-07-10 review, finding 4) -----------------------
//
// Attribute heuristics miss fields like `<input type="tel" name="number">`
// holding a card PAN, or OTP inputs with no maxlength/pattern. These check the
// VALUE about to be saved. Conservative: a match means "do not save".

const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/i;

export interface SensitiveValueContext {
  type?: string;
  fieldKey?: string;
}

/** Returns true if the value itself looks like a secret and must not be saved. */
export function isSensitiveValue(value: string, ctx?: SensitiveValueContext): boolean {
  const compact = value.replace(/[\s-]/g, '');

  // Card PAN: 13-19 digits passing Luhn (allowing space/dash separators).
  if (/^\d{13,19}$/.test(compact) && luhnValid(compact)) return true;

  // IBAN: country code + check digits + BBAN.
  if (IBAN_RE.test(compact) && ibanChecksumValid(compact)) return true;

  // OTP/PIN-like: a short bare digit string has near-zero recovery value and a
  // real chance of being a one-time code — skip it.
  if (/^\d{4,8}$/.test(value.trim())) {
    if (!ctx || isNumericOrSecurityFieldFromContext(ctx.type, ctx.fieldKey)) {
      return true;
    }
  }

  return false;
}

function ibanChecksumValid(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let numeric = '';
  for (let i = 0; i < rearranged.length; i++) {
    const code = rearranged.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      // A-Z
      numeric += String(code - 55);
    } else if (code >= 97 && code <= 122) {
      // a-z
      numeric += String(code - 87);
    } else if (code >= 48 && code <= 57) {
      // 0-9
      numeric += rearranged[i];
    } else {
      return false;
    }
  }
  let checksum = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    const chunk = String(checksum) + numeric.slice(i, i + 7);
    checksum = parseInt(chunk, 10) % 97;
  }
  return checksum === 1;
}

function isNumericOrSecurityFieldFromContext(type?: string, fieldKey?: string): boolean {
  if (type === 'tel' || type === 'number') return true;
  if (!fieldKey) return false;

  const securityKeywords =
    /otp|pin|pass|code|mfa|2fa|totp|security|verification|auth|challenge|secret|token/i;
  const excludeKeywords = /zip|postal|year|qty|quantity|amount|price|count|bill|invoice|order/i;

  return securityKeywords.test(fieldKey) && !excludeKeywords.test(fieldKey);
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
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
