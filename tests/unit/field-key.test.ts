import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateFieldKey,
  isCandidateField,
  normalisePathname,
  ALLOWED_INPUT_TYPES,
} from '../../lib/field-key';

function ctx(el: HTMLInputElement | HTMLTextAreaElement) {
  return {
    origin: 'https://example.com',
    pathname: '/page',
    element: el,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('normalisePathname', () => {
  it('keeps "/"', () => expect(normalisePathname('/')).toBe('/'));
  it('strips trailing slash', () => expect(normalisePathname('/foo/')).toBe('/foo'));
  it('returns "/" for empty', () => expect(normalisePathname('')).toBe('/'));
});

describe('isCandidateField', () => {
  it('accepts text input', () => {
    const i = document.createElement('input');
    i.type = 'text';
    expect(isCandidateField(i)).toBe(true);
  });
  it('accepts textarea', () => {
    const t = document.createElement('textarea');
    expect(isCandidateField(t)).toBe(true);
  });
  it('rejects password (stage 1 — see THREAT_MODEL)', () => {
    const i = document.createElement('input');
    i.type = 'password';
    expect(isCandidateField(i)).toBe(false);
  });
  it('rejects checkbox / radio / button / hidden / file', () => {
    for (const t of ['checkbox', 'radio', 'button', 'submit', 'reset', 'hidden', 'file']) {
      const i = document.createElement('input');
      i.type = t;
      expect(isCandidateField(i), `type=${t}`).toBe(false);
    }
  });
  it('accepts email/url/search/tel/number', () => {
    for (const t of ['email', 'url', 'search', 'tel', 'number']) {
      const i = document.createElement('input');
      i.type = t;
      expect(isCandidateField(i), `type=${t}`).toBe(true);
    }
  });
  it('rejects disabled / readonly', () => {
    const i = document.createElement('input');
    i.type = 'text';
    i.disabled = true;
    expect(isCandidateField(i)).toBe(false);
    const r = document.createElement('input');
    r.type = 'text';
    r.readOnly = true;
    expect(isCandidateField(r)).toBe(false);
  });
  it('ALLOWED_INPUT_TYPES contains exactly the v1 types', () => {
    expect([...ALLOWED_INPUT_TYPES].sort()).toEqual(
      ['email', 'number', 'search', 'tel', 'text', 'url'].sort(),
    );
  });
});

describe('generateFieldKey', () => {
  it('is deterministic for the same input', () => {
    const i = document.createElement('input');
    i.type = 'text';
    i.name = 'email';
    document.body.appendChild(i);
    expect(generateFieldKey(ctx(i))).toBe(generateFieldKey(ctx(i)));
  });

  it('differs when name changes', () => {
    const a = document.createElement('input');
    a.type = 'text';
    a.name = 'email';
    const b = document.createElement('input');
    b.type = 'text';
    b.name = 'username';
    document.body.appendChild(a);
    document.body.appendChild(b);
    expect(generateFieldKey(ctx(a))).not.toBe(generateFieldKey(ctx(b)));
  });

  it('includes origin and pathname', () => {
    const i = document.createElement('input');
    i.type = 'text';
    i.name = 'q';
    document.body.appendChild(i);
    const k = generateFieldKey(ctx(i));
    expect(k).toContain('o=https://example.com');
    expect(k).toContain('p=/page');
  });

  it('differs when origin differs', () => {
    const i = document.createElement('input');
    i.type = 'text';
    i.name = 'q';
    document.body.appendChild(i);
    const a = generateFieldKey({ ...ctx(i), origin: 'https://a.com' });
    const b = generateFieldKey({ ...ctx(i), origin: 'https://b.com' });
    expect(a).not.toBe(b);
  });

  it('separates two anonymous inputs of the same type by ordinal', () => {
    const a = document.createElement('input');
    a.type = 'text';
    const b = document.createElement('input');
    b.type = 'text';
    document.body.appendChild(a);
    document.body.appendChild(b);
    expect(generateFieldKey(ctx(a))).not.toBe(generateFieldKey(ctx(b)));
  });

  it('reflects form-level attributes (action, id, name)', () => {
    const f1 = document.createElement('form');
    f1.id = 'login';
    f1.action = '/login';
    const i1 = document.createElement('input');
    i1.type = 'text';
    i1.name = 'username';
    f1.appendChild(i1);
    document.body.appendChild(f1);

    const f2 = document.createElement('form');
    f2.id = 'register';
    f2.action = '/register';
    const i2 = document.createElement('input');
    i2.type = 'text';
    i2.name = 'username';
    f2.appendChild(i2);
    document.body.appendChild(f2);

    expect(generateFieldKey(ctx(i1))).not.toBe(generateFieldKey(ctx(i2)));
  });

  it('captures aria-label and placeholder', () => {
    const i = document.createElement('input');
    i.type = 'text';
    i.setAttribute('aria-label', 'Search the docs');
    i.placeholder = 'Search…';
    document.body.appendChild(i);
    const k = generateFieldKey(ctx(i));
    expect(k).toContain('al=Search the docs');
    expect(k).toContain('ph=Search…');
  });

  it('treats textarea distinct from text input even with same name', () => {
    const i = document.createElement('input');
    i.type = 'text';
    i.name = 'note';
    const t = document.createElement('textarea');
    t.name = 'note';
    document.body.appendChild(i);
    document.body.appendChild(t);
    expect(generateFieldKey(ctx(i))).not.toBe(generateFieldKey(ctx(t)));
  });
});
