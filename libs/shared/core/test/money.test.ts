import { describe, it, expect } from 'vitest';
import { formatVnd, parseVnd } from '../src/money';

describe('formatVnd', () => {
  it('formats with dot groups and ₫', () => {
    expect(formatVnd(1245000)).toBe('1.245.000₫');
    expect(formatVnd(0)).toBe('0₫');
    expect(formatVnd(-385000)).toBe('-385.000₫');
  });
});

describe('parseVnd', () => {
  it.each([
    ['1.245.000', 1245000], ['1 245 000', 1245000], ['1,245,000', 1245000], ['1245000', 1245000],
    ['50k', 50000], ['1,5tr', 1500000], ['1.5tr', 1500000], ['  180.000 ', 180000],
    ['1.200k', 1200000], ['1,500k', 1500000], ['2.500tr', 2500000000], ['1.5k', 1500],
  ])('parses %s', (input, expected) => expect(parseVnd(input)).toBe(expected));

  it.each(['12.5', 'abc', '', '0', '-5000', '10000000001', '1.2.3'])('rejects %s', (input) =>
    expect(parseVnd(input)).toBeNull());
});
