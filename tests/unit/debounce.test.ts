import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDebouncer } from '../../lib/debounce';

describe('createDebouncer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs the callback after the wait window', () => {
    const d = createDebouncer<string>(100);
    const fn = vi.fn();
    d.schedule('a', fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('replaces a pending call when scheduled again with the same key', () => {
    const d = createDebouncer<string>(100);
    const a = vi.fn();
    const b = vi.fn();
    d.schedule('k', a);
    vi.advanceTimersByTime(50);
    d.schedule('k', b);
    vi.advanceTimersByTime(100);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('debounces keys independently', () => {
    const d = createDebouncer<string>(100);
    const a = vi.fn();
    const b = vi.fn();
    d.schedule('a', a);
    d.schedule('b', b);
    expect(d.size()).toBe(2);
    vi.advanceTimersByTime(100);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(d.size()).toBe(0);
  });

  it('flush runs pending immediately', () => {
    const d = createDebouncer<string>(100);
    const fn = vi.fn();
    d.schedule('k', fn);
    d.flush('k');
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel drops without running', () => {
    const d = createDebouncer<string>(100);
    const fn = vi.fn();
    d.schedule('k', fn);
    d.cancel('k');
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });

  it('clear drops everything', () => {
    const d = createDebouncer<string>(100);
    const a = vi.fn();
    const b = vi.fn();
    d.schedule('a', a);
    d.schedule('b', b);
    d.clear();
    expect(d.size()).toBe(0);
    vi.advanceTimersByTime(200);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });
});
