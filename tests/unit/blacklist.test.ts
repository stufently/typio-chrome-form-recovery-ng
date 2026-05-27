import { describe, it, expect } from 'vitest';
import { isHostnameBlocklisted, isUrlInSensitiveCategory } from '../../lib/blacklist';

describe('isHostnameBlocklisted', () => {
  it('returns false for empty blocklist', () => {
    expect(isHostnameBlocklisted('example.com', [])).toBe(false);
  });

  it('matches exact hostname', () => {
    expect(isHostnameBlocklisted('bank.com', ['bank.com'])).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isHostnameBlocklisted('Bank.COM', ['bank.com'])).toBe(true);
    expect(isHostnameBlocklisted('bank.com', ['BANK.COM'])).toBe(true);
  });

  it('does not match a different host', () => {
    expect(isHostnameBlocklisted('safe.com', ['bank.com'])).toBe(false);
  });

  it('subdomain wildcard ".bank.com" matches bare and sub', () => {
    expect(isHostnameBlocklisted('bank.com', ['.bank.com'])).toBe(true);
    expect(isHostnameBlocklisted('login.bank.com', ['.bank.com'])).toBe(true);
    expect(isHostnameBlocklisted('a.b.bank.com', ['.bank.com'])).toBe(true);
  });

  it('subdomain wildcard does NOT match a different second-level domain', () => {
    expect(isHostnameBlocklisted('evilbank.com', ['.bank.com'])).toBe(false);
    expect(isHostnameBlocklisted('bank.com.evil.com', ['.bank.com'])).toBe(false);
  });

  it('trims whitespace and skips blank entries', () => {
    expect(isHostnameBlocklisted('bank.com', ['  bank.com  ', '', '   '])).toBe(true);
  });
});

describe('isUrlInSensitiveCategory', () => {
  it('matches /login', () => {
    expect(isUrlInSensitiveCategory('/login')).toBe(true);
    expect(isUrlInSensitiveCategory('/login/')).toBe(true);
    expect(isUrlInSensitiveCategory('/login?return=x')).toBe(true);
  });

  it('matches /signin and /sign-in', () => {
    expect(isUrlInSensitiveCategory('/signin')).toBe(true);
    expect(isUrlInSensitiveCategory('/sign-in/')).toBe(true);
  });

  it('matches /auth, /oauth, /sso', () => {
    expect(isUrlInSensitiveCategory('/auth')).toBe(true);
    expect(isUrlInSensitiveCategory('/oauth/authorize')).toBe(true);
    expect(isUrlInSensitiveCategory('/sso/callback')).toBe(true);
  });

  it('matches /register, /signup, /sign-up', () => {
    expect(isUrlInSensitiveCategory('/register')).toBe(true);
    expect(isUrlInSensitiveCategory('/signup')).toBe(true);
    expect(isUrlInSensitiveCategory('/sign-up')).toBe(true);
  });

  it('matches /checkout, /payment, /billing', () => {
    expect(isUrlInSensitiveCategory('/checkout')).toBe(true);
    expect(isUrlInSensitiveCategory('/payment/confirm')).toBe(true);
    expect(isUrlInSensitiveCategory('/billing')).toBe(true);
  });

  it('matches /2fa, /two-factor, /verify', () => {
    expect(isUrlInSensitiveCategory('/2fa')).toBe(true);
    expect(isUrlInSensitiveCategory('/two-factor/setup')).toBe(true);
    expect(isUrlInSensitiveCategory('/verify-email')).toBe(false); // not a path segment
    expect(isUrlInSensitiveCategory('/verify')).toBe(true);
  });

  it('ignores benign paths', () => {
    expect(isUrlInSensitiveCategory('/blog/article-about-login-pages')).toBe(false);
    expect(isUrlInSensitiveCategory('/products/123')).toBe(false);
    expect(isUrlInSensitiveCategory('/')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isUrlInSensitiveCategory('/Login')).toBe(true);
    expect(isUrlInSensitiveCategory('/CHECKOUT')).toBe(true);
  });
});
