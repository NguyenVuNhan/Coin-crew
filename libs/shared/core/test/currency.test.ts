import { describe, it, expect } from 'vitest';
import {
  CURRENCIES,
  CURRENCY_CODES,
  isCurrencyCode,
  isValidAmount,
  formatMoney,
  parseMoney,
  type CurrencyCode,
} from '../src/currency';

describe('CURRENCIES and isCurrencyCode', () => {
  it('defines VND, USD, USDT with expected decimals, symbols, and limits', () => {
    expect(CURRENCY_CODES).toEqual(['VND', 'USD', 'USDT']);
    expect(CURRENCIES.VND).toEqual({ decimals: 0, symbol: '₫', max: 1_000_000_000_000 });
    expect(CURRENCIES.USD).toEqual({ decimals: 2, symbol: '$', max: 10_000_000_000 });
    expect(CURRENCIES.USDT).toEqual({ decimals: 2, symbol: 'USDT', max: 10_000_000_000 });
  });

  it('validates currency codes', () => {
    expect(isCurrencyCode('VND')).toBe(true);
    expect(isCurrencyCode('USD')).toBe(true);
    expect(isCurrencyCode('USDT')).toBe(true);
    expect(isCurrencyCode('EUR')).toBe(false);
    expect(isCurrencyCode(null)).toBe(false);
    expect(isCurrencyCode(123)).toBe(false);
  });
});

describe('formatMoney', () => {
  it.each([
    [1234567, 'VND', '1.234.567₫'],
    [-5000, 'VND', '-5.000₫'],
    [123456, 'USD', '1.234,56 $'],
    [5, 'USDT', '0,05 USDT'],
    [-100, 'USD', '-1,00 $'],
  ])('%d %s → %s', (m, c, out) => expect(formatMoney(m, c as CurrencyCode)).toBe(out));
});

describe('parseMoney', () => {
  it.each([
    ['50k', 'VND', 50000], ['1.234.567', 'VND', 1234567], ['2tr', 'VND', 2000000],
    ['12', 'USD', 1200], ['12,5', 'USD', 1250], ['12.50', 'USD', 1250], ['1.234,56', 'USD', 123456],
    ['0,01', 'USDT', 1],
    ['1.234.567', 'USD', 123456700], ['1.234.567,89', 'USDT', 123456789],
  ])('%s %s → %d', (s, c, v) => expect(parseMoney(s, c as CurrencyCode)).toBe(v));

  it.each([
    ['12,345', 'USD'], ['50k', 'USD'], ['0', 'VND'], ['-5', 'VND'], ['abc', 'USDT'],
    ['100000001', 'USD'], ['1000000000001', 'VND'],
    ['1.234', 'USD'], ['1,234.56', 'USD'], ['0,00', 'USDT'],
  ])('%s %s → null', (s, c) => expect(parseMoney(s, c as CurrencyCode)).toBeNull());
});

describe('isValidAmount', () => {
  it('rejects floats, zero and over-max by default', () => {
    expect(isValidAmount(1.5, 'USD')).toBe(false);
    expect(isValidAmount(0, 'VND')).toBe(false);
    expect(isValidAmount(10_000_000_001, 'USDT')).toBe(false);
    expect(isValidAmount(-10, 'VND', { allowNegative: true, allowZero: true })).toBe(true);
  });

  it('respects allowZero, allowNegative, and negative max bounds', () => {
    expect(isValidAmount(0, 'VND', { allowZero: true })).toBe(true);
    expect(isValidAmount(-10, 'VND')).toBe(false);
    expect(isValidAmount(-10_000_000_001, 'USD', { allowNegative: true })).toBe(false);
    expect(isValidAmount(1_000_000_000_000, 'VND')).toBe(true);
    expect(isValidAmount(1_000_000_000_001, 'VND')).toBe(false);
  });
});
