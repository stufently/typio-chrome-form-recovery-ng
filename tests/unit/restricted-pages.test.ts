import { describe, it, expect } from 'vitest';
import {
  isRestrictedScheme,
  isRestrictedHost,
  isRestrictedLocation,
} from '../../lib/restricted-pages';

describe('isRestrictedScheme', () => {
  it('flags browser-internal protocols', () => {
    expect(isRestrictedScheme('chrome:')).toBe(true);
    expect(isRestrictedScheme('chrome-extension:')).toBe(true);
    expect(isRestrictedScheme('about:')).toBe(true);
    expect(isRestrictedScheme('view-source:')).toBe(true);
    expect(isRestrictedScheme('devtools:')).toBe(true);
    expect(isRestrictedScheme('data:')).toBe(true);
    expect(isRestrictedScheme('blob:')).toBe(true);
  });

  it('allows http and https', () => {
    expect(isRestrictedScheme('http:')).toBe(false);
    expect(isRestrictedScheme('https:')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isRestrictedScheme('CHROME:')).toBe(true);
  });
});

describe('isRestrictedHost', () => {
  it('flags extension store hosts', () => {
    expect(isRestrictedHost('chromewebstore.google.com')).toBe(true);
    expect(isRestrictedHost('addons.mozilla.org')).toBe(true);
    expect(isRestrictedHost('microsoftedge.microsoft.com')).toBe(true);
    expect(isRestrictedHost('addons.opera.com')).toBe(true);
  });

  it('allows normal hosts', () => {
    expect(isRestrictedHost('example.com')).toBe(false);
    expect(isRestrictedHost('github.com')).toBe(false);
  });
});

describe('isRestrictedLocation', () => {
  it('flags either scheme or host', () => {
    expect(isRestrictedLocation({ protocol: 'chrome:', hostname: 'newtab' })).toBe(true);
    expect(
      isRestrictedLocation({ protocol: 'https:', hostname: 'chromewebstore.google.com' }),
    ).toBe(true);
    expect(isRestrictedLocation({ protocol: 'https:', hostname: 'example.com' })).toBe(false);
  });
});
