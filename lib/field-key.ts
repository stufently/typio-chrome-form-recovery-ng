// Stable identifier for a form field across DOM re-renders.
//
// Codex flagged this in the plan review: a pure DOM-path approach breaks on
// React/Vue re-renders, A/B blocks, and SPA route changes. Use a scoring
// model built from stable signals — DOM path is only a weak fallback.
//
// Stage 1 ships a basic version that already includes the high-signal
// inputs (origin + pathname + form attrs + field attrs + ordinal). Stage 2
// will extend with linked <label> text, aria descriptions, and a real
// scoring weight per signal.

type Editable = HTMLInputElement | HTMLTextAreaElement;

export interface FieldKeyContext {
  origin: string;
  /** Pathname with trailing slash normalised and query/hash dropped. */
  pathname: string;
  element: Editable;
}

/**
 * Build a stable string identity for the field. Synchronous because we call
 * this on every input event — async would force us to debounce key derivation
 * which complicates the listener.
 */
export function generateFieldKey(ctx: FieldKeyContext): string {
  const parts: string[] = [];
  parts.push('o=' + ctx.origin);
  parts.push('p=' + normalisePathname(ctx.pathname));

  const form = ctx.element.form;
  if (form) {
    parts.push(
      'f=' + nonEmpty(form.name) + '|' + nonEmpty(form.id) + '|' + actionPath(form.action),
    );
  } else {
    parts.push('f=-');
  }

  // Field-level identity. Order matters — these go from most stable to least.
  parts.push('n=' + nonEmpty(ctx.element.name));
  parts.push('i=' + nonEmpty(ctx.element.id));
  parts.push('a=' + nonEmpty(ctx.element.autocomplete));
  parts.push('t=' + tagAndType(ctx.element));
  parts.push('al=' + nonEmpty(ctx.element.getAttribute('aria-label')));
  parts.push('ph=' + nonEmpty(ctx.element.placeholder));

  // Ordinal among eligible fields with the same name/type — weak signal, but
  // helps when forms have duplicate <input name="email"> across sections.
  parts.push('ord=' + ordinalAmongPeers(ctx.element));

  return parts.join('|');
}

function nonEmpty(s: string | null | undefined): string {
  return s && s.length > 0 ? s : '-';
}

function tagAndType(el: Editable): string {
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  return 'input:' + (el.type || 'text');
}

function actionPath(action: string): string {
  try {
    const u = new URL(action, location.origin);
    return u.pathname;
  } catch {
    return '-';
  }
}

export function normalisePathname(pathname: string): string {
  if (!pathname) return '/';
  // Drop trailing slash unless root.
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

/** Count siblings with the same tag+type+name appearing earlier in document order. */
function ordinalAmongPeers(el: Editable): number {
  const selector = peerSelector(el);
  const all = el.ownerDocument?.querySelectorAll(selector);
  if (!all) return 0;
  let n = 0;
  for (const node of all) {
    if (node === el) return n;
    n++;
  }
  return n;
}

function peerSelector(el: Editable): string {
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  const type = el.type || 'text';
  const name = el.name;
  if (name) {
    // CSS escape via attribute selector with quoted value — naive escape is
    // enough for our case (name on real forms is alphanum + dash + underscore).
    const safeName = name.replace(/"/g, '\\"');
    return `input[type="${type}"][name="${safeName}"]`;
  }
  return `input[type="${type}"]`;
}

export const ALLOWED_INPUT_TYPES: ReadonlySet<string> = new Set([
  'text',
  'email',
  'url',
  'search',
  'tel',
  'number',
]);

/** Is this element a candidate for autosave in v1? */
export function isCandidateField(el: Element): el is Editable {
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLInputElement) {
    const t = (el.type || 'text').toLowerCase();
    if (!ALLOWED_INPUT_TYPES.has(t)) return false;
    return !el.disabled && !el.readOnly;
  }
  return false;
}
