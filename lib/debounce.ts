// Generic per-key debounce. We need per-key because different form fields
// debounce independently — a fast user typing in field A should not delay
// the autosave for field B.

export interface DebouncedRunner<K> {
  /** Schedule fn to run after `wait` ms, replacing any pending call for the same key. */
  schedule(key: K, fn: () => void | Promise<void>): void;
  /** Run any pending callback for this key immediately. */
  flush(key: K): void;
  /** Drop any pending callback for this key without running it. */
  cancel(key: K): void;
  /** Cancel everything. */
  clear(): void;
  /** Number of pending callbacks (useful in tests). */
  size(): number;
}

export function createDebouncer<K>(waitMs: number): DebouncedRunner<K> {
  const pending = new Map<
    K,
    { timer: ReturnType<typeof setTimeout>; fn: () => void | Promise<void> }
  >();

  return {
    schedule(key, fn) {
      const existing = pending.get(key);
      if (existing) clearTimeout(existing.timer);
      const timer = setTimeout(() => {
        pending.delete(key);
        void fn();
      }, waitMs);
      pending.set(key, { timer, fn });
    },

    flush(key) {
      const slot = pending.get(key);
      if (!slot) return;
      clearTimeout(slot.timer);
      pending.delete(key);
      void slot.fn();
    },

    cancel(key) {
      const slot = pending.get(key);
      if (!slot) return;
      clearTimeout(slot.timer);
      pending.delete(key);
    },

    clear() {
      for (const { timer } of pending.values()) clearTimeout(timer);
      pending.clear();
    },

    size() {
      return pending.size;
    },
  };
}
