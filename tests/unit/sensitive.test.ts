import { describe, it, expect, beforeEach } from 'vitest';
import { isSensitive } from '../../lib/sensitive';

function input(attrs: Record<string, string>): HTMLInputElement {
  const el = document.createElement('input');
  el.type = attrs['type'] || 'text';
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'type') continue;
    el.setAttribute(k, v);
  }
  document.body.appendChild(el);
  return el;
}

function textarea(attrs: Record<string, string>): HTMLTextAreaElement {
  const el = document.createElement('textarea');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('isSensitive — type', () => {
  it.each([
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
  ])('rejects type=%s', (t) => {
    expect(isSensitive(input({ type: t }))).toBe(true);
  });

  it('accepts plain text input with no other red flags', () => {
    expect(isSensitive(input({ type: 'text', name: 'comment' }))).toBe(false);
  });
});

describe('isSensitive — autocomplete', () => {
  it.each([
    'cc-number',
    'cc-name',
    'cc-csc',
    'cc-exp',
    'one-time-code',
    'current-password',
    'new-password',
    'webauthn',
  ])('rejects autocomplete=%s', (ac) => {
    expect(isSensitive(input({ autocomplete: ac }))).toBe(true);
  });

  it('rejects autocomplete token-list containing a sensitive token', () => {
    expect(isSensitive(input({ autocomplete: 'section-blue billing cc-number' }))).toBe(true);
    expect(isSensitive(input({ autocomplete: 'username webauthn' }))).toBe(true);
    expect(isSensitive(input({ autocomplete: 'one-time-code webauthn' }))).toBe(true);
  });

  it('accepts harmless autocomplete tokens', () => {
    expect(isSensitive(input({ autocomplete: 'email' }))).toBe(false);
    expect(isSensitive(input({ autocomplete: 'name' }))).toBe(false);
    expect(isSensitive(input({ autocomplete: 'section-blue shipping street-address' }))).toBe(
      false,
    );
  });
});

describe('isSensitive — name-like patterns', () => {
  it.each([
    'card',
    'card-number',
    'cardNumber',
    'credit-card',
    'cc-num',
    'cvv',
    'cvc',
    'csc',
    'pin',
    'passcode',
    'otp',
    'one-time',
    'one_time_code',
    '2fa',
    'mfa',
    'totp',
    'secret',
    'token',
    'ssn',
    'social-security',
    'password',
    'passwd',
    'security-answer',
    'security-question',
    'security-code',
    'verification-code',
    'verification_code',
    'auth-code',
    'auth_code',
    'recovery-code',
    'backup-code',
    'cardholder',
    'iban',
    'routing-number',
    'routingNumber',
    'account-number',
    'accountNumber',
    'sort-code',
    'sort_code',
  ])('rejects name=%s', (n) => {
    expect(isSensitive(input({ name: n }))).toBe(true);
  });

  it('catches via id too', () => {
    expect(isSensitive(input({ id: 'cvv' }))).toBe(true);
  });

  it('catches via aria-label', () => {
    expect(isSensitive(input({ 'aria-label': 'Card CVV' }))).toBe(true);
  });

  it('catches via placeholder', () => {
    expect(isSensitive(input({ placeholder: 'Enter your PIN' }))).toBe(true);
  });

  it('catches via linked <label for>', () => {
    const lbl = document.createElement('label');
    lbl.setAttribute('for', 'pwd');
    lbl.textContent = 'Password';
    document.body.appendChild(lbl);
    const el = input({ id: 'pwd' });
    expect(isSensitive(el)).toBe(true);
  });

  it('resolves aria-labelledby to referenced text', () => {
    const heading = document.createElement('span');
    heading.id = 'h1';
    heading.textContent = 'Enter your verification code';
    document.body.appendChild(heading);
    const el = input({ 'aria-labelledby': 'h1' });
    expect(isSensitive(el)).toBe(true);
  });

  it('resolves multiple aria-labelledby ids', () => {
    const a = document.createElement('span');
    a.id = 'a';
    a.textContent = 'Account';
    const b = document.createElement('span');
    b.id = 'b';
    b.textContent = 'number';
    document.body.appendChild(a);
    document.body.appendChild(b);
    const el = input({ 'aria-labelledby': 'a b' });
    expect(isSensitive(el)).toBe(true);
  });

  it('catches via wrapping <label>', () => {
    const lbl = document.createElement('label');
    lbl.textContent = 'OTP code:';
    const el = document.createElement('input');
    el.type = 'text';
    lbl.appendChild(el);
    document.body.appendChild(lbl);
    expect(isSensitive(el)).toBe(true);
  });

  it('does not flag the substring "carda" or "pinning"', () => {
    expect(isSensitive(input({ name: 'cards-pinning' }))).toBe(false);
  });

  it('does NOT flag innocuous names', () => {
    for (const n of ['email', 'name', 'comment', 'subject', 'message', 'search', 'q']) {
      expect(isSensitive(input({ name: n })), `name=${n}`).toBe(false);
    }
  });
});

describe('isSensitive — pattern attribute', () => {
  it('flags 16-digit pattern (CC PAN)', () => {
    expect(isSensitive(input({ pattern: '\\d{16}' }))).toBe(true);
  });

  it('flags 3-4 digit pattern (CVV)', () => {
    expect(isSensitive(input({ pattern: '\\d{3}' }))).toBe(true);
    expect(isSensitive(input({ pattern: '\\d{4}' }))).toBe(true);
  });

  it('flags 4-8 digit pattern (PIN)', () => {
    expect(isSensitive(input({ pattern: '\\d{4,8}' }))).toBe(true);
  });

  it('accepts patterns that do not look numeric-secret-shaped', () => {
    expect(isSensitive(input({ pattern: '[A-Za-z]+' }))).toBe(false);
  });
});

describe('isSensitive — inputmode + maxlength', () => {
  it('flags numeric inputmode with short maxlength', () => {
    expect(isSensitive(input({ inputmode: 'numeric', maxlength: '6' }))).toBe(true);
    expect(isSensitive(input({ inputmode: 'decimal', maxlength: '4' }))).toBe(true);
  });

  it('does not flag numeric inputmode with long maxlength', () => {
    expect(isSensitive(input({ inputmode: 'numeric', maxlength: '20' }))).toBe(false);
  });

  it('does not flag numeric inputmode with no maxlength', () => {
    expect(isSensitive(input({ inputmode: 'numeric' }))).toBe(false);
  });
});

describe('isSensitive — URL category context', () => {
  it('flags any text field on /login', () => {
    const el = input({ name: 'email' });
    expect(isSensitive(el, { pathname: '/login' })).toBe(true);
  });

  it('flags any field on /checkout', () => {
    const el = input({ name: 'address' });
    expect(isSensitive(el, { pathname: '/checkout/step-2' })).toBe(true);
  });

  it('does not flag fields on benign pathnames', () => {
    expect(isSensitive(input({ name: 'comment' }), { pathname: '/blog/post' })).toBe(false);
  });
});

describe('isSensitive — form action URL', () => {
  it('flags fields whose form posts to /login', () => {
    const form = document.createElement('form');
    form.action = '/login';
    const el = document.createElement('input');
    el.type = 'text';
    el.name = 'email';
    form.appendChild(el);
    document.body.appendChild(form);
    expect(isSensitive(el)).toBe(true);
  });
});

describe('isSensitive — textareas', () => {
  it('flags textarea on /login', () => {
    expect(isSensitive(textarea({}), { pathname: '/login' })).toBe(true);
  });

  it('does not flag textarea anywhere benign', () => {
    expect(isSensitive(textarea({ name: 'comment' }))).toBe(false);
  });
});
