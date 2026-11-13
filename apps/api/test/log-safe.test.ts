import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { safeError, scrubText, type SafeError } from '@cc/api-util/logSafe';
import { getDb } from '@cc/api-db/client';
import { bankDetails } from '@cc/api-db/schema';

describe('safeError', () => {
  it('drops the bound values a failed Drizzle write carries', async () => {
    let caught: unknown;
    try {
      // Missing required columns: the insert fails and Drizzle puts the account number in its message.
      await getDb(env).insert(bankDetails).values({ accountNumber: '19031234565678' } as never);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const text = JSON.stringify(safeError(caught));
    expect(text).not.toContain('19031234565678');
    expect(text).toContain('Failed query');
  });

  it('masks long digit runs and keeps the cause chain', () => {
    const err = new Error('outer', { cause: new Error('account 1903 1234 5656 78 rejected') });
    const out = safeError(err) as SafeError;
    expect((out.cause as SafeError).message).toBe('account [redacted] rejected');
    expect(scrubText('Failed query: insert into x\nparams: 0123456789,NGUYEN')).toBe('Failed query: insert into x\nparams: [redacted]');
  });

  it('keeps short numbers and copes with non-errors', () => {
    expect(scrubText('status 500 after 3 tries')).toBe('status 500 after 3 tries');
    expect(safeError('plain 12345678')).toBe('plain [redacted]');
  });
});
