import { describe, it, expect } from 'vitest';
import { sha256Hex } from '../../lib/hash';

describe('sha256Hex', () => {
  it('matches known SHA-256 for "" (RFC 6234 test vector)', async () => {
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('matches known SHA-256 for "abc"', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is deterministic', async () => {
    const a = await sha256Hex('hello world');
    const b = await sha256Hex('hello world');
    expect(a).toBe(b);
  });

  it('changes when input changes', async () => {
    const a = await sha256Hex('hello world');
    const b = await sha256Hex('hello world.');
    expect(a).not.toBe(b);
  });

  it('returns 64 lowercase hex chars', async () => {
    const h = await sha256Hex('something');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
