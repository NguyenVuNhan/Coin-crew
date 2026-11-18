import { describe, it, expect } from 'vitest';
import {
  ASSET_GROUPS,
  MAX_ASSET_DECIMALS,
  MAX_QUANTITY,
  parseQuantity,
  formatQuantity,
  isValidQuantity,
} from '../src/assets';

describe('assets', () => {
  it('exports constants', () => {
    expect(ASSET_GROUPS).toEqual(['Crypto', 'Cổ phiếu', 'ETF', 'Vàng']);
    expect(MAX_ASSET_DECIMALS).toBe(8);
    expect(MAX_QUANTITY).toBe(10 ** 15);
  });

  it('parses vi format quantities', () => {
    expect(parseQuantity('0,5', 8)).toBe(50000000);
    expect(parseQuantity('1,123', 2)).toBeNull();
    expect(parseQuantity('0', 0)).toBeNull();
    expect(parseQuantity('abc', 2)).toBeNull();
    expect(parseQuantity('', 2)).toBeNull();
    expect(parseQuantity('-1', 2)).toBeNull();
    expect(parseQuantity('3', 0)).toBe(3);
    expect(parseQuantity('3,5', 0)).toBeNull();
    expect(parseQuantity('1.000,5', 2)).toBe(100050);
    expect(parseQuantity('1000000000000001', 0)).toBeNull();
  });

  it('formats vi format quantities with trimmed trailing zeros', () => {
    expect(formatQuantity(50000000, 8)).toBe('0,5');
    expect(formatQuantity(150000000, 8)).toBe('1,5');
    expect(formatQuantity(3, 0)).toBe('3');
    expect(formatQuantity(100000000, 8)).toBe('1');
    expect(formatQuantity(123450, 2)).toBe('1.234,5');
  });

  it('validates quantities', () => {
    expect(isValidQuantity(1)).toBe(true);
    expect(isValidQuantity(MAX_QUANTITY)).toBe(true);
    expect(isValidQuantity(0)).toBe(false);
    expect(isValidQuantity(-5)).toBe(false);
    expect(isValidQuantity(1.5)).toBe(false);
    expect(isValidQuantity(MAX_QUANTITY + 1)).toBe(false);
  });
});
