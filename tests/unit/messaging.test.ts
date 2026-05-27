import { describe, it, expect } from 'vitest';
import { sendMessage } from '../../lib/messaging';

describe('sendMessage', () => {
  it('returns a structured error when runtime returns nothing', async () => {
    const reply = await sendMessage({ type: 'PING' });
    expect(reply.ok).toBe(false);
    if (!reply.ok) expect(reply.error).toMatch(/empty/);
  });
});
