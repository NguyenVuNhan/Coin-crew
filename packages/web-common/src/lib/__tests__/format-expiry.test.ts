import { describe, it, expect } from 'vitest';
import { formatExpiry } from '../time';

describe('formatExpiry', () => {
  it('formats an ISO timestamp as dd/MM in Vietnam time', () => {
    expect(formatExpiry('2026-11-02T18:00:00.000Z')).toBe('03/11');
  });

  it('returns the input timestamp if invalid', () => {
    expect(formatExpiry('not-a-date')).toBe('not-a-date');
  });
});
